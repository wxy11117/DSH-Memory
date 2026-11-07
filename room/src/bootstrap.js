import {roomConnection as connection,roomRequest,roomEvents,flushRoomStorage} from './persistence.js';
const app=document.querySelector('#app');
const shell=document.createElement('div');
shell.innerHTML='<nav class="room-options" aria-label="小屋选项"><button id="room-options-button">小屋设置</button><button id="room-interface-button">关闭小屋界面</button></nav><main id="room-closed" class="room-closed" hidden><span>SEA SIDE · 随时回来</span><h1>小屋先休息一会儿。</h1><p>布置和便签都已留下，记忆插件继续工作。<br>界面关闭期间，不会触发新的 AI 自主活动。</p><button id="room-reopen">打开小屋界面</button><button id="room-panel">查看记忆面板</button><p id="room-closed-status" role="status"></p></main><dialog id="room-settings"><form method="dialog"><button class="room-settings-close" aria-label="关闭设置">×</button></form><span class="room-settings-eyebrow">YOUR LITTLE SEASIDE HOME</span><h2>按自己的节奏生活</h2><p id="room-space-label"></p><label class="room-setting-row"><span><b>显示小屋界面</b><small>关闭后暂停三维画面与声音，保留存档。</small></span><input id="room-interface-check" type="checkbox"></label><form id="room-life-form"><label class="room-setting-row"><span><b>AI 自主生活</b><small>默认关闭。开启后，即使你不说话，也可定时请这只鱼安排一件事。</small></span><input id="room-life-enabled" type="checkbox"></label><div class="room-settings-grid"><label>活动间隔（分钟）<input id="room-life-interval" type="number" min="15" max="240" step="1" value="30" required></label><label>每日最多唤醒（次）<input id="room-life-limit" type="number" min="1" max="24" step="1" value="12" required></label></div><p class="room-settings-note">仅在小屋页面可见、这只鱼的 DSH 会话在线且空闲时触发。首次开启满足条件后即可能触发，随后按间隔运行；不会补跑错过的轮次。</p><label class="room-cost-confirm"><input id="room-life-costs" type="checkbox"><span>我了解：AI 思考会使用我在 DSH 配置的模型，可能消耗 Token 或产生费用。这是唤醒次数上限，不是金额或 Token 硬上限。</span></label><div class="room-settings-actions"><button type="submit" id="room-life-save">保存自主生活设置</button><button type="button" id="room-life-stop">关闭自主生活</button></div></form><p id="room-life-summary" class="room-life-summary" role="status"></p><p id="room-settings-status" role="status"></p><p class="room-settings-note">关闭后不再发起新一轮，已交给模型的任务仍可能完成并计费。普通画面、动作动画和记忆面板刷新不调用模型。这里关闭的是小屋画面，浏览器标签页可自行关闭。</p><details><summary>动作编号怎么读？</summary><p>[楼层, 活动, 事项]：1 是一楼，2 是阁楼。<br>[1,1,1] 看海 · [1,4,2] 写便签<br>[2,1,3] 取牛奶 · [2,2,1] 做莓果酸奶杯<br>AI 可调用 hp_room_catalog 查询完整目录。</p></details></dialog>';
document.body.append(shell);
const $=id=>document.getElementById(id),dialog=$('room-settings');
let settings=connection.settings,loadingApp=null,heartBusy=false,failed=false,refreshing=false,refreshAgain=false;
const message=text=>$('room-settings-status').textContent=text;
function summary(){
  const life=settings?.life;if(!life)return;
  $('room-space-label').textContent='当前记忆空间：'+connection.space;
  $('room-life-summary').textContent=(life.enabled?'自主生活已开启':'自主生活已关闭')+' · 今日已唤醒 '+life.attempts+' / '+life.dailyLimit+' 次。'+(settings.available===false?settings.reason:life.lastStatus||'');
}
async function applyInterface(enabled){
  const changed=connection.interfaceEnabled!==enabled;connection.interfaceEnabled=enabled;
  app.hidden=!enabled;$('room-closed').hidden=enabled;
  $('room-interface-button').textContent=enabled?'关闭小屋界面':'打开小屋界面';$('room-interface-check').checked=enabled;
  if(changed)window.dispatchEvent(new Event('room-interface-changed'));
  if(enabled&&!loadingApp){
    loadingApp=import('./app.js').then(()=>{connection.ready=true;window.dispatchEvent(new Event('room-state-updated'));return heartbeat()}).catch(error=>{connection.ready=false;message('画面未加载：'+error.message);$('room-closed-status').textContent='三维画面未能加载，可以继续查看记忆面板或关闭界面。'});
  }
}
async function refreshSettings(){
  if(refreshing){refreshAgain=true;return}refreshing=true;
  try{do{refreshAgain=false;settings=await roomRequest('settings');connection.settings=settings;await applyInterface(settings.interfaceEnabled);summary();window.dispatchEvent(new Event('room-state-updated'))}while(refreshAgain)}
  catch(e){message(e.message)}finally{refreshing=false}
}
async function heartbeat(){
  if(failed||heartBusy)return;heartBusy=true;
  try{const runtime=connection.runtimeProvider?.()||connection.runtime||{};await roomRequest('heartbeat',{clientId:connection.clientId,runtime:{...runtime,visible:!document.hidden&&connection.interfaceEnabled&&connection.ready}})}
  catch(e){failed=true;window.dispatchEvent(new CustomEvent('room-disconnected',{detail:e.message}));message(e.message+'。请重新从 DSH 获取链接。')}
  finally{heartBusy=false}
}
async function setInterface(enabled){try{if(!enabled)await flushRoomStorage();await roomRequest('interface',{enabled});await refreshSettings();await heartbeat()}catch(e){message(e.message);$('room-closed-status').textContent=e.message}}
async function openSettings(){await refreshSettings();const life=settings?.life||{};$('room-life-enabled').checked=!!life.enabled;$('room-life-interval').value=life.intervalMinutes||30;$('room-life-limit').value=life.dailyLimit||12;$('room-life-costs').checked=false;message('');if(!dialog.open)dialog.showModal()}
$('room-options-button').onclick=openSettings;
$('room-interface-button').onclick=()=>setInterface(!connection.interfaceEnabled);
$('room-interface-check').onchange=e=>setInterface(e.target.checked);
$('room-reopen').onclick=()=>setInterface(true);
$('room-panel').onclick=async()=>{try{const {url}=await roomRequest('dashboard');location.assign(url)}catch(e){$('room-closed-status').textContent=e.message}};
$('room-life-form').onsubmit=async e=>{
  e.preventDefault();const enabled=$('room-life-enabled').checked;
  if(enabled&&!$('room-life-costs').checked){message('请先确认模型用量与费用，再开启或调整自主生活。');return}
  try{await roomRequest('life',{enabled,intervalMinutes:Number($('room-life-interval').value),dailyLimit:Number($('room-life-limit').value),confirmCosts:$('room-life-costs').checked});await refreshSettings();$('room-life-costs').checked=false;message(enabled?'已保存。首次满足运行条件后即可触发。':'已关闭，不再发起新的自主轮次。')}
  catch(e){message(e.message)}
};
$('room-life-stop').onclick=async()=>{try{await roomRequest('life',{enabled:false,intervalMinutes:settings.life.intervalMinutes,dailyLimit:settings.life.dailyLimit});$('room-life-enabled').checked=false;await refreshSettings();message('已关闭；已发出的模型任务仍可能完成。')}catch(e){message(e.message)}};
document.addEventListener('visibilitychange',()=>{void heartbeat();if(!document.hidden)void refreshSettings()});
setInterval(()=>void heartbeat(),10000);
setInterval(()=>{if(dialog.open)void refreshSettings()},60000);
await applyInterface(connection.interfaceEnabled);await refreshSettings();await heartbeat();
void roomEvents(()=>void refreshSettings(),text=>message(text));
if(connection.openSettings)void openSettings();
