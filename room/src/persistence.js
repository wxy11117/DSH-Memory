// All room modules share this adapter; no per-origin localStorage is used.
const hash=new URLSearchParams(location.hash.slice(1));
let token=hash.get('access');
const ticketKey='dsh.room.ticket:'+location.pathname;
try{if(token){sessionStorage.setItem(ticketKey,token)}else token=sessionStorage.getItem(ticketKey)}catch{}
history.replaceState(null,'',location.pathname);
let boot,error;
export async function roomRequest(route,body){
  const encoded=body?JSON.stringify(body):null;
  const response=await fetch('/api/room/'+route,{method:body?'POST':'GET',headers:{'x-room-access':token||'','Content-Type':'application/json'},...(body?{body:encoded,keepalive:encoded.length<20000}:{})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'小屋服务暂不可用');return data;
}
try{boot=await roomRequest('connect',{})}catch(e){error=e}
if(error){document.body.innerHTML='<main style="max-width:600px;margin:15vh auto;padding:30px;font:18px/1.8 system-ui;color:#476977"><h1>小屋暂未连接</h1><p id="room-error"></p><p>请在 DSH 中调用 hp_room，使用返回的完整链接重新打开。</p></main>';document.querySelector('#room-error').textContent=error.message;throw error}
export const roomConnection={space:boot.space,clientId:boot.id,runtime:boot.runtime,settings:boot.settings,interfaceEnabled:boot.settings?.interfaceEnabled!==false,openSettings:hash.get('settings')==='1',ready:false};
const values={...boot.storage};let pending={},timer,inFlight=null;
export function flushRoomStorage(){
  clearTimeout(timer);if(inFlight)return inFlight;
  inFlight=(async()=>{while(Object.keys(pending).length){const changes=pending;pending={};
    try{await roomRequest('save',{clientId:boot.id,changes});window.dispatchEvent(new Event('room-saved'))}
    catch(e){pending={...changes,...pending};window.dispatchEvent(new CustomEvent('room-save-error',{detail:e.message}));throw e}
  }})().finally(()=>{inFlight=null});return inFlight;
}
export const roomStorage={getItem(key){return Object.hasOwn(values,key)?values[key]:null},setItem(key,value){value=String(value);values[key]=value;pending[key]=value;clearTimeout(timer);timer=setTimeout(()=>{flushRoomStorage().catch(()=>{})},250)}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushRoomStorage().catch(()=>{})});
export async function roomEvents(changed,disconnected){
  while(true){try{
    const response=await fetch('/api/room/events',{headers:{'x-room-access':token||''}});if(!response.ok)throw new Error('房间连接已失效，请重新调用 hp_room');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let index;while((index=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,index);buffer=buffer.slice(index+2);if(event.startsWith('data:'))changed()}}
  }catch(e){disconnected(e.message)}await new Promise(resolve=>setTimeout(resolve,3000))}
}
