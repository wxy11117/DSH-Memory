import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicWriteJson} from './store.js';
import {spaceKey} from './spaces.mjs';
import {resolveVector} from '../room/src/action-catalog.js';
import {DEFAULT_LIFE,localDay} from './room-life.mjs';
const terminal=new Set(['completed','failed','cancelled','interrupted']);
export function validateAction(input){
  input=resolveVector(input||{});
  const a={action:input?.action};
  if(['light','curtains'].includes(a.action)){if(typeof input.on!=='boolean')throw new Error('on 必须为布尔值');a.on=input.on}
  else if(a.action==='weather'){if(!['sunny','cloudy','rainy','snowy'].includes(input.value))throw new Error('天气值无效');a.value=input.value}
  else if(a.action==='time'){if(!['morning','afternoon','sunset','night'].includes(input.value))throw new Error('时段值无效');a.value=input.value}
  else if(['note','say'].includes(a.action)){if(typeof input.text!=='string'||input.text.length>(a.action==='note'?600:300))throw new Error('文字过长或无效');a.text=input.text}
  else if(a.action==='activity'){if(!['idle','sea','sleep','tea','computer','feed','water'].includes(input.value))throw new Error('活动值无效');a.value=input.value}
  else if(a.action==='view'){if(!['interior','attic'].includes(input.value))throw new Error('楼层无效');a.value=input.value}
  else if(a.action==='observe'){if(!['sea','sky'].includes(input.value))throw new Error('观察目标无效');a.value=input.value}
  else if(a.action==='kitchen'){if(!['fridge','restock','snack-milk','snack-apple','cook-berry','cook-omelette','cook-soup','table-set','table-clear','rinse'].includes(input.value))throw new Error('厨房事项无效');a.value=input.value}
  else if(a.action==='furniture'){
    if(!['bed','desk','shelf','nightstand','rug','pouf','plant','whale','basket','aquarium'].includes(input.item))throw new Error('家具不存在');a.item=input.item;
    for(const k of ['x','z','rotation']){const v=input[k];if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>20)throw new Error('家具坐标无效');a[k]=v}
  }else throw new Error('不支持的房间动作');
  if(input.vector){a.vector=[...input.vector];a.vectorVersion=input.vectorVersion}
  return a;
}
export function createRoomState(dir,{clock=Date.now}={}){
  const file=path.join(dir,'rooms.json');let doc={version:1,spaces:{}};
  try{doc=JSON.parse(fs.readFileSync(file,'utf8'));if(doc.version!==1||!doc.spaces)throw new Error('房间存档格式无效')}catch(e){if(e.code!=='ENOENT')throw e}
  const clients=new Map(),listeners=new Set();
  function commit(next){atomicWriteJson(file,next);doc=next}
  function update(space,fn){spaceKey(space);const next=structuredClone(doc);if(!Object.hasOwn(next.spaces,space))next.spaces[space]={storage:{},commands:[],runtime:null};const result=fn(next.spaces[space]);commit(next);for(const cb of listeners){try{cb(space)}catch{}}return result}
  const room=space=>Object.hasOwn(doc.spaces,space)?doc.spaces[space]:{storage:{},commands:[],runtime:null};
  const settings=space=>({interfaceEnabled:room(space).interfaceEnabled!==false,life:{...structuredClone(DEFAULT_LIFE),...structuredClone(room(space).life||{})}});
  function expire(space){const commands=room(space).commands;if(commands.some(c=>!terminal.has(c.status)&&clock()>c.expiresAt))update(space,r=>{for(const c of r.commands)if(!terminal.has(c.status)&&clock()>c.expiresAt){c.status='failed';c.detail='页面未及时完成动作，请重新打开房间后再试';c.finishedAt=clock()}})}
  for(const space of Object.keys(doc.spaces)){spaceKey(space);if(room(space).commands.some(c=>!terminal.has(c.status)))update(space,r=>{for(const c of r.commands)if(!terminal.has(c.status)){c.status='interrupted';c.detail='服务重启，动作未自动重播';c.finishedAt=clock()}})}
  function client(space,id){const c=clients.get(space);if(!c||c.id!==id||clock()-c.at>35000)throw Object.assign(new Error('房间已断开或由另一标签页接管，请重新打开'),{status:409});return c}
  return{
    settings(space){spaceKey(space);return settings(space)},
    setInterface(space,enabled){if(typeof enabled!=='boolean')throw new Error('界面开关必须为布尔值');update(space,r=>{r.interfaceEnabled=enabled;if(!enabled)for(const c of r.commands)if(!terminal.has(c.status)){c.status='cancelled';c.detail='小屋界面已关闭';c.finishedAt=clock()}});return settings(space)},
    configureLife(space,session,prefs){update(space,r=>{const previous=settings(space).life;r.life={...previous,...prefs,sessionId:session,nextAt:prefs.enabled?Math.max(clock(),previous.lastAt+prefs.intervalMinutes*60000):previous.nextAt,lastStatus:prefs.enabled?'已开启，等待页面可见和会话空闲':'已关闭；不再触发新一轮'}});return settings(space)},
    lifeStatus(space,text){if(settings(space).life.lastStatus!==text)update(space,r=>{r.life={...settings(space).life,lastStatus:text}})},
    reserveLife(space,runId){const life=settings(space).life,day=localDay(clock()),count=life.day===day?life.attempts:0;if(!life.enabled||count>=life.dailyLimit)throw new Error('自主生活未开启或次数已用完');update(space,r=>{r.life={...life,day,attempts:count+1,lastAt:clock(),nextAt:clock()+life.intervalMinutes*60000,history:[...(life.history||[]),{at:clock(),runId}].slice(-30)}})},
    snapshot(space){expire(space);const c=clients.get(space);return{space,...structuredClone(room(space)),settings:settings(space),connected:!!c&&clock()-c.at<=35000}},
    connect(space){update(space,r=>{for(const c of r.commands)if(!terminal.has(c.status)){c.status='cancelled';c.detail='新页面接管，旧动作已取消';c.finishedAt=clock()}});const id=randomUUID();clients.set(space,{id,at:clock(),runtime:cleanRuntime({...room(space).runtime,visible:false})});return{id,...this.snapshot(space)}},
    heartbeat(space,id,runtime){const c=client(space,id);c.at=clock();if(runtime&&typeof runtime==='object')c.runtime=cleanRuntime(runtime);return{ok:true}},
    patch(space,id,changes){client(space,id);if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).length>24)throw new Error('存档变更无效');for(const [key,value]of Object.entries(changes)){if(!/^dayu\.[a-z0-9.]{1,70}$/.test(key)||typeof value!=='string'||value.length>64000)throw new Error('存档字段无效')}
      update(space,r=>Object.assign(r.storage,changes));return{ok:true}},
    enqueue(space,input){expire(space);const action=validateAction(input);const c=clients.get(space);if(!c||clock()-c.at>35000)return{ok:false,code:'ROOM_CLOSED',error:'请先打开该空间的小屋页面，再安排动作'};
      if(!settings(space).interfaceEnabled)return{ok:false,code:'ROOM_INTERFACE_CLOSED',error:'小屋界面已关闭，请用户先开启'};
      const pending=room(space).commands.filter(c=>!terminal.has(c.status));if(pending.length)return{ok:false,code:'ROOM_BUSY',command:structuredClone(pending[0]),error:'上一个动作尚未结束，请先查看结果'};
      const command={id:randomUUID(),...action,status:'queued',createdAt:clock(),expiresAt:clock()+45000};update(space,r=>{r.commands.push(command);r.commands=r.commands.slice(-80)});return{ok:true,command:structuredClone(command)}},
    claim(space,id){client(space,id);expire(space);const next=room(space).commands.find(c=>c.status==='queued');if(!next)return{command:null};update(space,r=>{const c=r.commands.find(c=>c.id===next.id);c.status='running';c.clientId=id;c.startedAt=clock()});return{command:structuredClone(room(space).commands.find(c=>c.id===next.id))}},
    ack(space,id,commandId,status,detail,runtime){client(space,id);expire(space);if(!['completed','failed','cancelled'].includes(status))throw new Error('动作结果无效');const found=room(space).commands.find(c=>c.id===commandId);if(!found||found.clientId!==id)throw new Error('动作不属于当前页面');if(terminal.has(found.status))return{ok:true,status:found.status};
      const cleaned=cleanRuntime(runtime);if(cleaned)clients.get(space).runtime=cleaned;
      update(space,r=>{const c=r.commands.find(c=>c.id===commandId);c.status=status;c.detail=String(detail||'').slice(0,300);c.finishedAt=clock();r.runtime=cleaned});return{ok:true,status}},
    current(space){const snap=this.snapshot(space);const active=clients.get(space);return{space,connected:snap.connected,settings:snap.settings,runtime:active?.runtime||snap.runtime,storage:snap.storage,commands:snap.commands.slice(-8).map(({clientId,...c})=>c)}},
    subscribe(cb){listeners.add(cb);return()=>listeners.delete(cb)},
    shutdown(){for(const s of clients.keys())update(s,r=>{r.runtime=clients.get(s)?.runtime||r.runtime;for(const c of r.commands)if(!terminal.has(c.status)){c.status='interrupted';c.detail='插件已停止';c.finishedAt=clock()}});clients.clear()},
  };
}
function cleanRuntime(value){if(!value||typeof value!=='object')return null;return{x:Number.isFinite(value.x)?value.x:0,z:Number.isFinite(value.z)?value.z:0,action:String(value.action||'idle').slice(0,30),view:['interior','attic','exterior'].includes(value.view)?value.view:'interior',visible:value.visible===true}}
