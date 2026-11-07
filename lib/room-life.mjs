import {randomUUID} from 'node:crypto';
export const DEFAULT_LIFE = Object.freeze({enabled:false,sessionId:null,intervalMinutes:30,dailyLimit:12,nextAt:0,day:'',attempts:0,lastAt:0,lastStatus:'尚未开启',history:[]});
export const localDay = time => {const d=new Date(time);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export function validateLifeSettings(body) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['enabled','intervalMinutes','dailyLimit','confirmCosts'].includes(k)))throw new Error('自主生活设置无效');
  if(typeof body.enabled!=='boolean')throw new Error('enabled 必须为布尔值');
  if(body.enabled&&body.confirmCosts!==true)throw new Error('开启前请确认会调用自己的模型并消耗额度');
  const intervalMinutes=body.intervalMinutes??30,dailyLimit=body.dailyLimit??12;
  if(!Number.isInteger(intervalMinutes)||intervalMinutes<15||intervalMinutes>240)throw new Error('自主活动间隔须为 15–240 分钟');
  if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>24)throw new Error('每日主动唤醒上限须为 1–24 次');
  return {enabled:body.enabled,intervalMinutes,dailyLimit};
}
export function createRoomLife({rooms,listSpaces,resolveSpace,getBridge,clock=Date.now,log=()=>{}}) {
  let stopped=false,ticking=false;
  const runs=new Map();
  function availability(){const bridge=getBridge();const available=!!bridge?.getAgent&&typeof bridge?.createMessage==='function';return {available,reason:available?'':'当前宿主未提供自主活动接口；普通记忆和手动小屋仍可用'}}
  function status(space){const settings=rooms.settings(space),life=settings.life;return {...settings,life:{...life,attempts:life.day===localDay(clock())?life.attempts:0},...availability()};}
  function configure(space,session,body){const prefs=validateLifeSettings(body);if(prefs.enabled&&!availability().available)throw new Error('宿主自主活动接口未就绪，暂不能开启');if(resolveSpace(session)!==space)throw new Error('当前会话与空间不匹配');return rooms.configureLife(space,session,prefs);}
  function block(space,reason){rooms.lifeStatus(space,reason);}
  async function tick(){
    if(stopped||ticking)return;ticking=true;
    try{for(const space of listSpaces()){
      const settings=rooms.settings(space),life=settings.life;
      if(!life.enabled)continue;
      if(resolveSpace(life.sessionId)!==space){rooms.configureLife(space,life.sessionId,{enabled:false,intervalMinutes:life.intervalMinutes,dailyLimit:life.dailyLimit});block(space,'会话归属已变化，已停用');continue;}
      if(!settings.interfaceEnabled){block(space,'小屋界面已关闭，暂停唤醒');continue;}
      const room=rooms.current(space);
      if(!room.connected||room.runtime?.visible!==true){block(space,'等待小屋页面打开并可见');continue;}
      if(room.commands.some(c=>['queued','running'].includes(c.status))){block(space,'等待上一个动作完成');continue;}
      if(life.day===localDay(clock())&&life.attempts>=life.dailyLimit){block(space,'今日唤醒次数已达上限');continue;}
      if(clock()<life.nextAt)continue;
      const bridge=getBridge();if(!bridge?.getAgent||!bridge?.createMessage){block(space,'宿主自主活动接口未就绪');continue;}
      const agent=bridge.getAgent(life.sessionId);
      if(!agent||agent.id!==life.sessionId||typeof agent.followup!=='function'){block(space,'等待这只鱼的 DSH 会话上线');continue;}
      if(agent.status!=='idle'){block(space,'会话正在忙，稍后再试');continue;}
      const runId=randomUUID();
      const today=localDay(clock()),usedToday=life.day===today?life.attempts:0;
      const prompt=['【小屋自主生活 · 插件定时触发】本次 runId='+runId+'。这不是用户发来的新聊天。',
        '电脑本地时间：'+new Date(clock()).toLocaleString('zh-CN',{hour12:false})+'。今日第 '+(usedToday+1)+' 次唤醒，上限 '+life.dailyLimit+' 次。',
        usedToday===0?'这是今日首次自主唤醒：先结合记忆和剩余次数，在本次回复中简短列出今天余下的虚拟生活安排（最多四项），随后只执行其中一件。':'接着当前 DSH 会话中今天的生活计划挑选下一件；若历史里没有计划，先简短补一份。计划是意向，尚未执行不能说成完成。',
        '用户已开启此空间的自主生活。先调用 hp_room_life 核对是否仍开启，再查看 hp_room_state；已关闭、页面不可用或归属变化就结束。',
        '结合当前记忆和房间状态，只安排一件轻量的虚拟活动。必要时先用 hp_room_catalog 查询编号。',
        'vector=[楼层,活动,事项]；[1,1,1]看海，[1,2,1]休息，[1,3,1]喝茶，[2,2,1]制作莓果酸奶杯。',
        '调用 hp_room_action 时必须带 runId='+runId+'，每轮最多安排一个动作。',
        'queued 不等于完成，按实际回执说明状态；不要高频轮询、创建新定时任务、改变开启状态或额度、联系他人或执行房间之外的操作。',
        '普通走动不写长期记忆；如需留言，仅通过小屋工具。最后简短说明，随后结束本轮。'].join('\n');
      const message=bridge.createMessage({content:[{type:'text',text:prompt}],source:{kind:'hippocampus-room',runId}});
      // Reserve durably before handing work to the host; never retry a possibly delivered turn.
      rooms.reserveLife(space,runId);
      runs.set(life.sessionId,{space,runId,messageId:message.id,expiresAt:clock()+120000,claimed:false,used:false});
      try{agent.followup(message);rooms.lifeStatus(space,'已唤醒 AI，等待本轮决定');}
      catch(error){runs.delete(life.sessionId);rooms.lifeStatus(space,'唤醒失败：'+String(error.message).slice(0,160));log(error.message);}
    }}catch(error){log('自主生活暂停本次检查：'+error.message)}finally{ticking=false;}
  }
  return {status,configure,tick,
    claimed(agentId,message){const run=runs.get(agentId);if(run){if(message?.id===run.messageId)run.claimed=true;else runs.delete(agentId)}},
    authorizeAction(session,space,runId){
      const run=runs.get(session);
      if(!runId&&!run?.claimed)return;
      if(!run||runId!==run.runId||run.space!==space||clock()>run.expiresAt||run.used)throw new Error('自主活动许可已失效或本轮动作已使用，请结束本轮');
      const settings=rooms.settings(space);
      if(stopped||!settings.life.enabled||settings.life.sessionId!==session||!settings.interfaceEnabled||resolveSpace(session)!==space)throw new Error('自主生活已关闭或会话归属已变化，请结束本轮');
      const room=rooms.current(space);
      if(!room.connected||room.runtime?.visible!==true)throw new Error('小屋页面已不可见，请结束本轮');
      run.used=true;
    },
    close(){stopped=true;},
  };
}
