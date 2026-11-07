import {roomConnection,roomRequest,flushRoomStorage} from './persistence.js';
export function attachRoom(adapter){
  const badge=document.createElement('aside');badge.className='room-connection';badge.innerHTML='<strong></strong><span role="status"></span>';document.body.append(badge);
  badge.querySelector('strong').textContent=roomConnection.space;
  const label=badge.querySelector('span'),setStatus=text=>{label.textContent=text};setStatus('小屋已连接 · AI 可以安排活动');
  let active=null,busy=false,stopped=false;
  async function finish(status,detail){if(!active)return;const id=active.id;active=null;try{await flushRoomStorage();const result=await roomRequest('result',{clientId:roomConnection.clientId,id,status,detail,runtime:adapter.runtime()});setStatus(result.status===status?(detail||'动作已完成'):'此动作已超时或取消，请重新查看结果')}catch(e){setStatus('结果尚未确认：'+e.message)}}
  async function claim(){if(stopped||busy||active||document.hidden||!roomConnection.interfaceEnabled)return;busy=true;try{
    const {command}=await roomRequest('claim',{clientId:roomConnection.clientId});if(!command)return;active=command;
    const outcome=adapter.execute(command);if(outcome===false){await finish('failed','无法到达目标或家具位置无效');return}
    setStatus('AI 已安排活动 · 正在执行');if(outcome==='done')await finish('completed','已完成并保存');
  }catch(e){if(active)await finish('failed',e.message);else setStatus(e.message)}finally{busy=false}}
  function manual(event){if(!event.isTrusted||!active)return;adapter.cancel();void finish('cancelled','用户手动操作，已取消 AI 动作')}
  document.addEventListener('pointerdown',manual,true);document.addEventListener('keydown',manual,true);
  window.addEventListener('room-save-error',e=>setStatus('保存未确认：'+e.detail));
  roomConnection.runtimeProvider=adapter.runtime;
  window.addEventListener('room-disconnected',e=>{stopped=true;adapter.cancel();setStatus(e.detail+' · 请重新打开小屋')});
  window.addEventListener('room-interface-changed',()=>{badge.hidden=!roomConnection.interfaceEnabled;if(!roomConnection.interfaceEnabled){adapter.cancel();void finish('cancelled','小屋界面已关闭')}else void claim()});
  window.addEventListener('room-state-updated',()=>void claim());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void claim()});
  void claim();
  return{tick(){if(!active)return;if(Date.now()>active.expiresAt){adapter.cancel();void finish('failed','动作超时，已停止');return}try{if(adapter.done())void finish('completed','已到达并完成活动')}catch(e){adapter.cancel();void finish('failed',e.message)}},dashboard:()=>roomRequest('dashboard'),get space(){return roomConnection.space},get busy(){return!!active||busy}};
}
