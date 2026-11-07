import {attachRoom} from './room-client.js';
import {roomConnection,roomRequest} from './persistence.js';
import {roomStorage} from './persistence.js';
import {RoomWorld} from './world.js';
import {CATALOG,STORAGE_KEY,freshState,validateSave,findPath,walkable,canPlace,interactionPoint,localPoint} from './core.js';
import {icon,fillIcons} from './icons.js';
import {OceanAudio} from './audio.js';
import {ATTIC_ITEMS,ATTIC_Y} from './house.js';
import {createComputer} from './computer.js';
import {smoothPath,advanceWalk} from './motion.js';
import {PianoPlayer,createMusicPanel} from './music.js';
import {createDiscovery} from './discovery.js';
import {createKitchen} from './kitchen.js';
import {FOODS,KITCHEN_SPOTS} from './kitchen-data.js';
import {createHeating} from './heating.js';
import {createTelescope} from './telescope.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];fillIcons();
let state;try{state=validateSave(JSON.parse(roomStorage.getItem(STORAGE_KEY)))}catch{state=freshState()}
let world;let toastTimer,speechUntil=0,selectedId=null,editing=false,immersive=false,saving=true;
let computer,musicPanel,discovery,kitchen,heating,telescope,roomControl;const music=new PianoPlayer();const floorPositions={interior:{x:.2,z:.7},attic:{x:.2,z:1.4}};
const activeItems=()=>world?.viewMode==='attic'?ATTIC_ITEMS:state.furniture;
const activeBalcony=()=>world?.viewMode!=='attic'&&state.balcony;
const actorY=()=>world?.viewMode==='attic'?ATTIC_Y:actor.x>4.8?.29:.23;
const audio=new OceanAudio();const weatherNames={sunny:'晴朗',cloudy:'多云',rainy:'小雨',snowy:'飘雪'},weatherIcons={sunny:'sun',cloudy:'cloud',rainy:'rain',snowy:'snow'};
const timeLabels={morning:'07:30',afternoon:'14:20',sunset:'18:10',night:'22:00'};
const actor={x:.2,z:.7,speed:0,walkDistance:0,headingX:1,headingZ:0,action:'idle',path:[],onArrival:null,lastActivity:0,lastManual:0,energy:84};
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3500)}
function save(){try{roomStorage.setItem(STORAGE_KEY,JSON.stringify({...state,sound:false}));saving=true}catch{saving=false;$('#save-note').textContent='小屋保存失败，请保持页面打开并检查连接'}}
function say(message,seconds=4.6){$('#speech-text').textContent=message;speechUntil=performance.now()+seconds*1000;$('#speech').classList.remove('hidden')}
function syncEnvironment(){
  $$('[data-weather]').forEach(b=>{const on=b.dataset.weather===state.weather;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});$$('[data-time]').forEach(b=>{const on=b.dataset.time===state.time;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  $('#top-weather').textContent=weatherNames[state.weather];$('#weather-mini-icon').innerHTML=icon(weatherIcons[state.weather]);$('#top-temp').textContent=state.temperature+'°';$('#temperature').value=state.temperature;$('#temp-output').innerHTML=state.temperature+' <small>°C</small>';
  $('#curtain-label').textContent=state.curtainsOpen?'拉上窗帘':'拉开窗帘';$('#top-clock').textContent=state.realTime?realClock():timeLabels[state.time];$('#real-time').checked=state.realTime;$('#lamp-toggle').checked=state.lamps;$('#auto-toggle').checked=state.auto;$('#balcony-label').textContent=state.balcony?'关上阳台门':'打开阳台';$('#balcony-description').textContent=state.balcony?'海风进来了，小船正在慢慢经过。':'打开阳台，看看慢悠悠的小船。';$('#balcony-toggle').setAttribute('aria-expanded',String(state.balcony));
  const captions={sunny:'阳光刚好，海风也刚好。',cloudy:'云朵慢慢走，今天也不着急。',rainy:'雨声轻轻落，小屋暖暖的。',snowy:'落雪的海边，藏着一份安静。'};$('#scene-caption').textContent=state.time==='night'?'灯亮着，海也睡得很安静。':state.time==='sunset'?'把夕阳和今天的好心情一起收藏。':captions[state.weather];document.body.classList.toggle('night',state.time==='night');world?.setEnvironment(state);computer?.refresh();save();
}
function realClock(){return new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(new Date())}
function syncClock(){if(!state.realTime)return;const hour=Number(realClock().split(':')[0]);const time=hour<6||hour>=20?'night':hour<11?'morning':hour<17?'afternoon':'sunset';if(state.time!==time){state.time=time;state.lamps=['night','sunset'].includes(time);syncEnvironment()}else $('#top-clock').textContent=realClock()}
function safeSpot(preferred){if(walkable(preferred.x,preferred.z,activeItems(),activeBalcony()))return preferred;for(let radius=.4;radius<12;radius+=.4)for(let angle=0;angle<Math.PI*2;angle+=.4){const p={x:preferred.x+Math.cos(angle)*radius,z:preferred.z+Math.sin(angle)*radius};if(walkable(p.x,p.z,activeItems(),activeBalcony()))return p}return null}
function wake(keepMomentum=false){
  kitchen?.cancelPending();
  const wasMoving=actor.path.length>0;actor.path=[];actor.onArrival=null;if(!keepMomentum)actor.speed=0;
  if(!wasMoving&&world?.viewMode==='interior'&&['sleep','computer','tea'].includes(actor.action)){const id={sleep:'bed',computer:'desk',tea:'pouf'}[actor.action];const f=state.furniture.find(i=>i.id===id);const p=safeSpot(f&&!f.stored?interactionPoint(f):{x:0,z:0});if(p){actor.x=p.x;actor.z=p.z}}
  actor.action='idle';world?.setCharacter(actor.x,actor.z,actorY());world?.setPose('idle');updateStatus();
}
function updateStatus(){const statuses={idle:'在家发呆也很幸福',walk:'啪嗒啪嗒，去那边看看',sleep:'抱着小鲸鱼，做个蓝色的梦',computer:'正在认真地玩电脑',tea:'喝一口热茶，歇一会儿',sea:'听海风，等一艘小船经过',feed:'小鱼吃得很开心，咕噜咕噜'};$('#character-status').textContent=actor.path.length?'啪嗒啪嗒，正在走过去':statuses[actor.action]||statuses.idle;$$('[data-action]').forEach(b=>{const on=b.dataset.action===actor.action||(actor.action==='walk'&&b.dataset.action==='idle');b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))})}
function moveTo(point,onArrival=null,action='walk'){
  const path=findPath({x:actor.x,z:actor.z},point,activeItems(),activeBalcony());if(!path){toast('那里暂时走不过去，换一块空地试试吧。');return false}
  const route=smoothPath({x:actor.x,z:actor.z},path,activeItems(),activeBalcony());if(!route){toast('这里转身有点挤，换一块空地试试吧。');return false}
  actor.path=route;if(actor.speed<.03)actor.walkDistance=0;actor.action=action;actor.onArrival=onArrival;world.setPose('walk');world.moveMarker(point.x,point.z);
  if(!route.length){actor.onArrival=null;actor.action='idle';actor.speed=0;world.setPose('idle');if(onArrival)onArrival()}
  updateStatus();return true;
}
function doAction(action,automatic=false){
  if(world.viewMode!=='interior')setViewMode('interior');if(editing)setTab('life');if(!automatic)actor.lastManual=performance.now();wake();actor.lastActivity=performance.now();
  if(action==='computer'&&computer&&!computer.power)computer.togglePower();
  if(action==='idle'){say('去哪儿逛逛好呢？点一块空地吧。');return true}
  if(action==='sea'){
    state.balcony=true;syncEnvironment();say('去看看今天的大海！');return moveTo({x:6.2,z:-1.35},()=>{world.setPose('idle');actor.action='sea';say(state.weather==='rainy'?'在阳台听雨，也很舒服。':'那艘小船，会去哪里呢？',6);updateStatus()},'sea');
  }
  const id={sleep:'bed',computer:'desk',tea:'pouf'}[action];const item=state.furniture.find(i=>i.id===id);
  if(!item||item.stored){toast(`先从布置面板取出${item?.name||'家具'}吧。`);return false}
  let destination=interactionPoint(item);if(!walkable(destination.x,destination.z,state.furniture,state.balcony)){destination=safeSpot(destination);if(!destination){toast('家具旁边需要留一点空间。');return false}}
  say({sleep:'困了，和小鲸鱼一起睡一觉。',computer:'电脑开好了，快乐加载中！',tea:'今天的任务：认真放松。'}[action]);
  return moveTo(destination,()=>{const p=localPoint(item,0,action==='computer'?1.02:action==='sleep'?-.6:.12);actor.x=p.x;actor.z=p.z;world.setCharacter(p.x,p.z,action==='sleep'?1.16:action==='computer'?.98:.76);world.setPose(action);actor.action=action;updateStatus();if(action==='sleep')say('呼……海浪味道的梦。',3)},action);
}
function setTab(tab){
  if(!world)return;if(tab==='decor'&&world.viewMode!=='interior')setViewMode('interior');if(tab==='decor'&&!editing)wake();editing=tab==='decor';$$('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));$('#panel-life').hidden=editing;$('#panel-decor').hidden=!editing;$('#scene-hint').innerHTML=editing?'<span class="hint-dot"></span>选择家具后拖动或点击空地放置<span>·</span>R 旋转':'<span class="hint-dot"></span>点击地面走动<span>·</span>拖动旋转<span>·</span>滚轮缩放';if(!editing)selectFurniture(null);renderFurniture();
}
const furnitureIcons={bed:'bed',desk:'monitor',shelf:'book',nightstand:'lamp',rug:'grid',pouf:'chair',plant:'leaf',whale:'whale',basket:'box',aquarium:'fish'};
function renderFurniture(){
  $('#furniture-count').textContent=state.furniture.filter(i=>!i.stored).length+' 件在房间';$('#furniture-list').innerHTML=state.furniture.map(i=>`<button class="furniture-item ${i.stored?'stored':''} ${i.id===selectedId?'selected':''}" data-furniture="${i.id}" aria-pressed="${i.id===selectedId}">${icon(furnitureIcons[i.kind])}<span>${i.name}</span><small>${i.stored?'已收纳 · 点击取出':i.id===selectedId?'拖动或点击地面放置':'在房间里'}</small></button>`).join('');
  $('#selected-furniture').classList.toggle('hidden',!selectedId);if(selectedId)$('#selected-name').textContent=state.furniture.find(i=>i.id===selectedId).name;
}
function selectFurniture(id){selectedId=id;world?.select(id);renderFurniture();$('#scene').style.cursor=id?'grab':'default'}
function restoreFurniture(id){const item=state.furniture.find(i=>i.id===id);let candidate={...item,stored:false};if(!canPlace(candidate,state.furniture)){let found=false;for(let z=-2.6;z<3.2&&!found;z+=.3)for(let x=-3.8;x<4&&!found;x+=.3){candidate={...candidate,x,z};if(canPlace(candidate,state.furniture))found=true}if(!found){toast('房间暂时放不下，先腾出一点空间吧。');return false}}
  Object.assign(item,candidate);world.syncFurniture();ensureActor();save();selectFurniture(id);toast(`${item.name}回到房间啦。`);return true;
}
function ensureActor(){if(!walkable(actor.x,actor.z,state.furniture,state.balcony)){const p=safeSpot({x:actor.x,z:actor.z});if(p){actor.x=p.x;actor.z=p.z;world.setCharacter(p.x,p.z)}}}
function placeFurniture(x,z,rotation=null){if(!selectedId)return false;const item=state.furniture.find(i=>i.id===selectedId);const candidate={...item,x:Math.round(x*20)/20,z:Math.round(z*20)/20,rotation:rotation??item.rotation};if(!canPlace(candidate,state.furniture)){toast('这个位置放不下，请留出家具间距和阳台通道。');return false}Object.assign(item,candidate);world.syncFurniture();ensureActor();save();return true}
function toggleBalcony(){if(world.viewMode==='interior'&&state.balcony&&(actor.x>4.55||actor.action==='sea'||actor.path.some(p=>p.x>4.55))){wake();const p=safeSpot({x:3.8,z:-.8});if(p){actor.x=p.x;actor.z=p.z;world.setCharacter(p.x,p.z)}say('关好门，我们回屋里啦。')}state.balcony=!state.balcony;syncEnvironment();toast(state.balcony?'阳台门打开了，点击「去看海」一起吹吹风。':'阳台门关好了。')}

function setViewMode(mode){
  if(!world||!['interior','exterior','attic'].includes(mode))return;
  if(editing)setTab('life');const previous=world.viewMode;
  if(previous!=='exterior'){wake();floorPositions[previous]={x:actor.x,z:actor.z}}
  actor.path=[];actor.onArrival=null;actor.action='idle';actor.lastManual=performance.now();speechUntil=0;world.marker.visible=false;
  world.setView(mode);
  if(mode!=='exterior'){const p=floorPositions[mode];actor.x=p.x;actor.z=p.z;world.setCharacter(p.x,p.z,actorY());world.setPose('idle')}
  $('#house-view-toggle').setAttribute('aria-pressed',String(mode==='exterior'));$('#house-view-label').textContent=mode==='exterior'?'回到屋内':'看看整座小屋';
  $('#attic-view').setAttribute('aria-pressed',String(mode==='attic'));$('#attic-view span:last-child').textContent=mode==='attic'?'回到一楼':'去阁楼';
  $('#view-location').textContent={interior:'1F · 海风房间',exterior:'海岸边 · 大肥鱼的小屋',attic:'2F · 云朵阁楼与小厨房'}[mode];
  $('#scene-hint').innerHTML=mode==='exterior'?'拖动环看小屋 · 点击蓝色门回家':mode==='attic'?'冰箱与小厨房 · 点击望远镜看海、看真实星空':'<span class="hint-dot"></span>点击地面走动<span>·</span>拖动旋转<span>·</span>滚轮缩放';
  updateStatus();
}
function showStory(title,content){$('#story-title').textContent=title;$('#story-content').textContent=content;$('#story-dialog').showModal()}
function interact(name){
  actor.lastManual=performance.now();
  if(['fridge','cook','table','sink'].includes(name)||name.startsWith('food:')){if(world.viewMode!=='attic')setViewMode('attic');if(name==='sink'){world.house.kitchen.rinse();say('把碗碟洗干净，等下一顿好吃的。');return}kitchen.open(name==='cook'?'cook':name==='table'?'table':'fridge',name.startsWith('food:')?name.slice(5):undefined);return}
  if(name==='enter'||name==='downstairs'){setViewMode('interior');return}
  if(name==='upstairs'){setViewMode('attic');return}
  if(name==='computer-power'){computer.togglePower();say(computer.power?'小电脑醒来啦，点屏幕就能打开应用。':'让小电脑也休息一会儿。');return}
  if(name==='feed'){
    const item=state.furniture.find(i=>i.id==='aquarium');if(item.stored){toast('先从布置面板取出小鱼的玻璃屋吧。');return}if(world.furniture.get('aquarium').userData.aquarium.feeding>0){say('等小鱼吃完这一口，我们再陪它玩。');return}
    if(world.viewMode!=='interior')setViewMode('interior');if(editing)setTab('life');wake();const destination=safeSpot(interactionPoint(item));if(!destination){toast('鱼缸旁需要留一点活动空间。');return}
    say('给小鱼送一点点心去。');moveTo(destination,()=>{if(world.feedFish()){state.feedCount++;save();$('#fish-care-label').textContent='已经一起喂过 '+state.feedCount+' 次';say('小鱼游过来啦，咕噜咕噜。',6)}actor.action='feed';world.setPose('idle');updateStatus()},'feed');return;
  }
  if(name==='music'){musicPanel.open();return}
  if(name==='chime'){world.ringChime();music.chime().catch(()=>toast('风铃声音暂时无法开启。'));say('叮——海风把一句晚安留在这里。');return}
  if(name==='computer-screen'){if(doAction('computer'))computer.open();return}
  if(name==='curtains'){state.curtainsOpen=!state.curtainsOpen;syncEnvironment();say(state.curtainsOpen?'把阳光和海风一起请进来。':'窗帘拉好啦，给小屋留一点安静。');return}
  if(name==='lamp'){state.lamps=!state.lamps;syncEnvironment();return}
  if(name==='water'){const item=state.furniture.find(i=>i.id==='plant');if(item.stored){toast('先把海岛绿植从收纳箱取出来吧。');return}if(world.viewMode!=='interior')setViewMode('interior');world.waterPlant(item);state.careCount++;save();say('咕嘟咕嘟，小绿植喝饱啦。');return}
  if(name==='hug'){world.hugWhale();say('小鲸鱼软乎乎的，今天也一起晒太阳吧。');return}
  if(name==='read'||name==='loft-read'){showStory('海风寄来的一页','小船慢慢驶过海湾，云朵在屋顶停了一会儿。\n\n大肥鱼把书翻到下一页，发现今天最重要的事情，是让自己过得舒服一点。\n\n窗外的海，没有催促任何人。');return}
  if(name==='heater'){if(world.viewMode!=='interior')setViewMode('interior');heating.focus();return}
  if(name==='telescope'){if(world.viewMode!=='attic')setViewMode('attic');telescope.open();return}
  if(name==='souvenir'){showStory('来自海边的收藏','一枚粉色的小贝壳、一张旧船票，\n还有昨天傍晚收集的一点点金色阳光。\n\n下一次去海边，会遇见什么呢？');return}
  if(name==='mailbox')showStory('一封写给你的信','亲爱的你：\n\n欢迎来到这座海边小屋。\n不论今天过得怎样，这里总有一盏为你亮着的灯。\n\n—— 大肥鱼');
}
const interactionNames={'computer-power':'电脑电源 · 开启 / 关闭',feed:'小鱼的玻璃屋 · 喂喂小鱼','computer-screen':'电脑屏幕 · 点击打开',curtains:'窗帘 · 拉开 / 拉上',lamp:'小灯 · 点击开关',water:'绿植 · 浇一浇水',read:'书架 · 读一页小书',hug:'鲸鱼抱枕',upstairs:'木梯 · 去阁楼',downstairs:'楼梯口 · 回到一楼',enter:'蓝色小门 · 回家','loft-read':'阁楼书角 · 读一页小书',telescope:'望远镜 · 看海与真实星空',heater:'卧室暖气 · 开关与调温',souvenir:'收藏箱 · 看看贝壳',mailbox:'信箱 · 读一封信',music:'小音箱 · 选择轻柔钢琴',chime:'风铃 · 轻碰一下'};
Object.assign(interactionNames,{fridge:'小冰箱 · 打开看看',cook:'料理台 · 做一份简餐',table:'小餐桌 · 摆放与收好餐具',sink:'水槽 · 轻轻打开水龙头'},Object.fromEntries(FOODS.map(f=>['food:'+f.id,f.name+' · 看看冰箱清单'])));

try{
  world=new RoomWorld($('#scene'),state);await world.ready();ensureActor();$('#loading').classList.add('hidden');
}catch(error){console.error('Room initialization failed',error);$('#loading').classList.add('hidden');$('#render-error').classList.remove('hidden');throw error}
computer=createComputer(source=>world.setScreen(source),{getEnvironment:()=>state,music,toast,getMemoryPanelUrl:()=>roomRequest('dashboard'),capture:()=>world.capture(),onPower:power=>{if(!power&&actor.action==='computer')wake()}});musicPanel=createMusicPanel(music,toast);discovery=createDiscovery(world,interact);
kitchen=createKitchen(world.house.kitchen,{say,toast,onFocus:name=>world.focusKitchen(name),onBlur:keep=>world.restoreKitchenView(keep),onChange:s=>{$('#kitchen-summary').textContent=s.meals?'已经一起做过 '+s.meals+' 份简餐':'十二种食物 · 三份暖心食谱'},goTo:(name,done)=>{if(world.viewMode!=='attic')setViewMode('attic');wake();return moveTo(KITCHEN_SPOTS[name],()=>{actor.action='idle';world.setPose('idle');updateStatus();queueMicrotask(done)})}});
heating=createHeating(world,state,save,toast);telescope=createTelescope(world,toast);
let commandTarget=null,feedBefore=0,kitchenBefore=null;
roomControl=attachRoom({
  runtime:()=>({x:actor.x,z:actor.z,action:actor.path.length?'walk':actor.action,view:world.viewMode,visible:!document.hidden&&roomConnection.interfaceEnabled}),
  cancel:()=>{commandTarget=null;kitchenBefore=null;kitchen.cancelAll();wake()},
  done:()=>{
    if(actor.path.length)return false;
    if(kitchenBefore){if(kitchen.busy)return false;const after=kitchen.state;if(after.meals<=kitchenBefore.meals&&after.snacks<=kitchenBefore.snacks)throw new Error('厨房活动没有完成');kitchenBefore=null;return true}
    if(commandTarget==='feed'&&state.feedCount<=feedBefore)throw new Error('小鱼没有吃到食物，请稍后再试');
    if(commandTarget&&!['feed','water'].includes(commandTarget)&&actor.action!==commandTarget)throw new Error('动作被中断，未到达预期位置');
    commandTarget=null;return true;
  },
  execute(command){
    commandTarget=null;kitchenBefore=null;actor.lastManual=performance.now();
    if(command.vector){const view=command.vector[0]===2?'attic':'interior';if(world.viewMode!==view)setViewMode(view)}
    if(command.action==='view'){setViewMode(command.value);return 'done'}
    if(command.action==='observe'){setViewMode('attic');telescope.open(command.value);return 'done'}
    if(command.action==='kitchen'){if(world.viewMode!=='attic')setViewMode('attic');const before=kitchen.state;const result=kitchen.execute(command.value);if(result==='moving')kitchenBefore=before;return result}
    if(command.action==='light'){state.lamps=command.on;syncEnvironment();return 'done'}
    if(command.action==='curtains'){state.curtainsOpen=command.on;syncEnvironment();return 'done'}
    if(command.action==='weather'){state.weather=command.value;state.temperature={sunny:24,cloudy:21,rainy:18,snowy:-2}[state.weather];syncEnvironment();return 'done'}
    if(command.action==='time'){state.time=command.value;state.realTime=false;state.lamps=['night','sunset'].includes(state.time);syncEnvironment();return 'done'}
    if(command.action==='note'){computer.setNote(command.text);return 'done'}
    if(command.action==='say'){say(command.text,8);return 'done'}
    if(command.action==='furniture'){
      const item=state.furniture.find(i=>i.id===command.item);if(!item||item.stored)return false;
      if(world.viewMode!=='interior')setViewMode('interior');wake();selectFurniture(item.id);
      const placed=placeFurniture(command.x,command.z,command.rotation);selectFurniture(null);return placed?'done':false;
    }
    if(command.action==='activity'){
      commandTarget=command.value;
      if(command.value==='feed'){
        const item=state.furniture.find(i=>i.id==='aquarium');if(!item||item.stored)return false;
        feedBefore=state.feedCount;interact('feed');return actor.path.length||state.feedCount>feedBefore?'moving':false;
      }
      if(command.value==='water'){
        const item=state.furniture.find(i=>i.id==='plant');if(!item||item.stored)return false;
        interact('water');commandTarget=null;return 'done';
      }
      return doAction(command.value)?'moving':false;
    }
    throw new Error('不支持的动作');
  }
});
// Restore the last acknowledged location, without replaying an unfinished action.
if(roomConnection.runtime){const r=roomConnection.runtime;if(['interior','attic'].includes(r.view))setViewMode(r.view);const p=safeSpot({x:r.x,z:r.z});if(p){actor.x=p.x;actor.z=p.z;world.setCharacter(p.x,p.z,actorY())}}
window.addEventListener('room-saved',()=>{$('#save-note').textContent='已保存在 '+roomConnection.space});
window.addEventListener('room-save-error',()=>{$('#save-note').textContent='保存尚未确认，请检查小屋连接'});
music.subscribe(player=>{world.setMusicPlaying(player.enabled);$('#music-button').setAttribute('aria-pressed',String(player.enabled));$('#music-button').title=player.enabled?'正在播放：'+player.track.name:'柔和的钢琴轻音乐';$('#music-current').textContent=player.enabled?player.track.name+' · 轻轻播放中':'三首钢琴 · 等你轻轻按下播放'});
$('#fish-care-label').textContent=state.feedCount?'已经一起喂过 '+state.feedCount+' 次':'三条小鱼，等一口小点心';
syncEnvironment();syncClock();setInterval(syncClock,30000);renderFurniture();say('欢迎回家！今天也要慢慢来呀。',7);
$('#house-view-toggle').addEventListener('click',()=>setViewMode(world.viewMode==='exterior'?'interior':'exterior'));
$('#attic-view').addEventListener('click',()=>setViewMode(world.viewMode==='attic'?'interior':'attic'));
$$('[data-interact]').forEach(b=>b.addEventListener('click',()=>interact(b.dataset.interact)));$$('.story-close').forEach(b=>b.addEventListener('click',()=>$('#story-dialog').close()));
$$('[data-weather]').forEach(b=>b.addEventListener('click',()=>{state.weather=b.dataset.weather;state.temperature={sunny:24,cloudy:21,rainy:18,snowy:-2}[state.weather];syncEnvironment();say({sunny:'阳光晒得尾巴都暖洋洋的。',cloudy:'云朵像一只只软乎乎的小鲸鱼。',rainy:'下雨了，待在家里也很幸福。',snowy:'大海边也下雪啦，记得保暖哦。'}[state.weather])}));
$$('[data-time]').forEach(b=>b.addEventListener('click',()=>{state.time=b.dataset.time;state.lamps=['night','sunset'].includes(state.time);state.realTime=false;syncEnvironment()}));
$('#temperature').addEventListener('input',e=>{state.temperature=Number(e.target.value);syncEnvironment()});$('#temperature').addEventListener('change',()=>{if(state.temperature<10)say('有点凉，想抱紧小鲸鱼。');else if(state.temperature>29)say('有点热，去阳台吹吹风吧。');else say('这个温度，适合舒舒服服地发呆。')});
$('#real-time').addEventListener('change',e=>{state.realTime=e.target.checked;syncClock();syncEnvironment()});$('#lamp-toggle').addEventListener('change',e=>{state.lamps=e.target.checked;syncEnvironment()});$('#auto-toggle').addEventListener('change',e=>{state.auto=e.target.checked;actor.lastActivity=performance.now();actor.lastManual=0;save();toast(state.auto?'大肥鱼会自己散步和休息，你也可以随时叫她。':'大肥鱼在等你安排今天的小日常。')});$('#balcony-toggle').addEventListener('click',toggleBalcony);
$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$$('[data-action]').forEach(b=>b.addEventListener('click',()=>doAction(b.dataset.action)));
$('#finish-decor').addEventListener('click',()=>{setTab('life');toast('布置好了，好喜欢这个小窝。')});$('#furniture-list').addEventListener('click',e=>{const button=e.target.closest('[data-furniture]');if(!button)return;const item=state.furniture.find(i=>i.id===button.dataset.furniture);if(item.stored)restoreFurniture(item.id);else selectFurniture(item.id)});
$('#rotate-furniture').addEventListener('click',()=>{if(!selectedId)return;const i=state.furniture.find(i=>i.id===selectedId);placeFurniture(i.x,i.z,(i.rotation+Math.PI/2)%(Math.PI*2))});$('#store-furniture').addEventListener('click',()=>{const item=state.furniture.find(i=>i.id===selectedId);if(!item)return;item.stored=true;world.syncFurniture();selectFurniture(null);save();toast(`${item.name}已放进收纳箱，随时可以取出。`)});
$$('[data-nudge]').forEach(b=>b.addEventListener('click',()=>{if(!selectedId)return;const i=state.furniture.find(i=>i.id===selectedId),dir=b.dataset.nudge;placeFurniture(i.x+(dir==='left'?-.2:dir==='right'?.2:0),i.z+(dir==='back'?-.2:dir==='front'?.2:0))}));
let resetArmed=false;$('#reset-layout').addEventListener('click',()=>{if(!resetArmed){resetArmed=true;$('#reset-layout').innerHTML=icon('reset')+'再点一次，恢复所有家具';setTimeout(()=>{resetArmed=false;$('#reset-layout').innerHTML=icon('reset')+'恢复初始布置'},5000);return}state.furniture=CATALOG.map(i=>({...i}));world.syncFurniture();ensureActor();selectFurniture(null);save();resetArmed=false;$('#reset-layout').innerHTML=icon('reset')+'恢复初始布置';toast('家具已经回到最初的位置。')});
$('#weather-pill').addEventListener('click',()=>{if(innerWidth<=820)$('#control-panel').classList.toggle('mobile-open');setTab('life')});
$('#sound-button').addEventListener('click',async()=>{try{const on=await audio.toggle();$('#sound-button').innerHTML=icon(on?'sound':'mute');$('#sound-button').setAttribute('aria-pressed',String(on));$('#sound-button').setAttribute('aria-label',on?'关闭海浪声':'开启海浪声');$('#sound-button').title=on?'关闭海浪声':'开启海浪声';toast(on?'海浪声已开启。':'海浪声已关闭。')}catch{toast('环境音暂时无法开启，请检查浏览器声音权限。')}});
$('#photo-button').addEventListener('click',()=>{try{const a=document.createElement('a');a.download=`大肥鱼的房间-${state.time}-${state.weather}.png`;a.href=world.capture();a.click();toast('把这一刻的小屋，收藏起来。')}catch{toast('照片保存失败，请尝试浏览器截图。')}});
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$$('.dialog-close').forEach(b=>b.addEventListener('click',()=>$('#help-dialog').close()));$('#help-dialog').addEventListener('click',e=>{if(e.target===$('#help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$('#reset-camera').addEventListener('click',()=>world.resetCamera());$('#brand-home').addEventListener('click',e=>{e.preventDefault();world.resetCamera()});$('#zoom-in').addEventListener('click',()=>{world.camera.zoom=Math.min(world.controls.maxZoom,world.camera.zoom+.15);world.camera.updateProjectionMatrix()});$('#zoom-out').addEventListener('click',()=>{world.camera.zoom=Math.max(world.controls.minZoom,world.camera.zoom-.15);world.camera.updateProjectionMatrix()});
function setImmersive(value){immersive=value;document.body.classList.toggle('immersive',value);$('#exit-immersive').classList.toggle('hidden',!value);world.resize()}$('#immersive-button').addEventListener('click',()=>setImmersive(true));$('#exit-immersive').addEventListener('click',()=>setImmersive(false));

const canvas=$('#scene');let down=null,drag=null;
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;down={x:e.clientX,y:e.clientY,at:performance.now()};const hit=world.pick(e.clientX,e.clientY);
  if(editing){if(hit.itemId)selectFurniture(hit.itemId);if(selectedId){world.controls.enabled=false;const item=state.furniture.find(i=>i.id===selectedId);drag={original:{...item},offsetX:hit.itemId&&hit.point?item.x-hit.point.x:0,offsetZ:hit.itemId&&hit.point?item.z-hit.point.z:0,moved:false};canvas.setPointerCapture(e.pointerId)}}
},true);
canvas.addEventListener('pointermove',e=>{
  const hit=world.pick(e.clientX,e.clientY);if(drag&&down&&hit.point&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){drag.moved=true;const item=state.furniture.find(i=>i.id===selectedId);item.x=Math.round((hit.point.x+drag.offsetX)*10)/10;item.z=Math.round((hit.point.z+drag.offsetZ)*10)/10;world.syncFurniture();world.select(selectedId,canPlace(item,state.furniture));canvas.style.cursor='grabbing';return}
  if(e.pointerType==='touch')return;const target=hit.itemId?state.furniture.find(i=>i.id===hit.itemId):null;if(target||hit.door||(!editing&&hit.interaction)){$('#tooltip').textContent=!editing&&hit.interaction?interactionNames[hit.interaction]:hit.door?'阳台门 · 点击开关':editing?target.name+' · 拖动布置':{bed:'云朵小床 · 睡个好觉',desk:'海景电脑桌 · 玩电脑',pouf:'软软懒人椅 · 歇一会儿'}[target.kind]||target.name;const rect=canvas.getBoundingClientRect();$('#tooltip').style.left=e.clientX-rect.left+14+'px';$('#tooltip').style.top=e.clientY-rect.top-30+'px';$('#tooltip').classList.remove('hidden');canvas.style.cursor=editing?'grab':'pointer'}else{$('#tooltip').classList.add('hidden');canvas.style.cursor=editing&&selectedId?'grab':'default'}
});
canvas.addEventListener('pointerleave',()=>$('#tooltip').classList.add('hidden'));
canvas.addEventListener('pointerup',e=>{
  if(!down)return;const distance=Math.hypot(e.clientX-down.x,e.clientY-down.y),hit=world.pick(e.clientX,e.clientY);
  if(drag){const item=state.furniture.find(i=>i.id===selectedId);if(drag.moved){if(!canPlace(item,state.furniture)){Object.assign(item,drag.original);toast('这个位置会挡住家具或通道，已放回原处。')}world.syncFurniture();ensureActor();save()}else if(!hit.itemId&&hit.point)placeFurniture(hit.point.x,hit.point.z);drag=null;world.controls.enabled=true;canvas.style.cursor='grab';down=null;return}
  if(distance<6&&performance.now()-down.at<650){actor.lastManual=performance.now();if(editing){if(hit.itemId)selectFurniture(hit.itemId)}else if(hit.interaction)interact(hit.interaction);else if(hit.door)toggleBalcony();else if(hit.itemId&&['bed','desk','pouf'].includes(hit.itemId))doAction({bed:'sleep',desk:'computer',pouf:'tea'}[hit.itemId]);else if(hit.point&&world.viewMode!=='exterior'){wake(true);moveTo(hit.point,()=>{actor.action='idle';world.setPose('idle');updateStatus()})}}
  down=null;
});
canvas.addEventListener('pointercancel',()=>{if(drag&&selectedId){Object.assign(state.furniture.find(i=>i.id===selectedId),drag.original);world.syncFurniture()}drag=null;down=null;world.controls.enabled=true});
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Escape'){if(immersive)setImmersive(false);else if(selectedId)selectFurniture(null);else $('#control-panel').classList.remove('mobile-open')}if(e.key.toLowerCase()==='r'&&editing&&selectedId){e.preventDefault();$('#rotate-furniture').click()}});
new ResizeObserver(()=>world.resize()).observe($('#scene-wrap'));
let last=performance.now(),elapsed=0;
function animate(now){requestAnimationFrame(animate);const activityDt=Math.max(0,Math.min((now-last)/1000,1)),dt=Math.min(activityDt,.05);last=now;if(document.hidden||!roomConnection.interfaceEnabled)return;elapsed+=dt;
  if(actor.path.length){const step=advanceWalk(actor,activityDt);if(step.distance>.00001){const length=Math.hypot(step.dx,step.dz),k=1-Math.exp(-dt*11);actor.headingX+=(step.dx/length-actor.headingX)*k;actor.headingZ+=(step.dz/length-actor.headingZ)*k;const before=world.project(actor.x,actorY(),actor.z),after=world.project(actor.x+actor.headingX,actorY(),actor.z+actor.headingZ);if(Math.abs(after.x-before.x)>3)world.charFacing=after.x<before.x?1:-1}world.gaitDistance=actor.walkDistance;world.gaitSpeed=actor.speed;world.setCharacter(actor.x,actor.z,actorY());if(step.arrived){const done=actor.onArrival;actor.onArrival=null;world.setPose('idle');if(done)done();else{actor.action='idle';updateStatus()}actor.lastActivity=now}}
  roomControl?.tick();computer.update(elapsed);kitchen.update(activityDt);heating.update(dt,elapsed);world.frame(dt,elapsed,!!actor.path.length);telescope.update(dt,elapsed);audio.update(elapsed,state.balcony);discovery.update(elapsed,editing||immersive||!!document.querySelector('dialog[open]'));
  if(now<speechUntil&&world.viewMode!=='exterior'){const pos=world.project(world.character.position.x,world.character.position.y+world.baseCharScale+.12,world.character.position.z);$('#speech').style.left=Math.max(80,Math.min(world.width-100,pos.x))+'px';$('#speech').style.top=Math.max(95,pos.y)+'px'}else $('#speech').classList.add('hidden');
  actor.energy=Math.max(25,Math.min(100,actor.energy+dt*(actor.action==='sleep'?.4:actor.action==='tea'?.08:-.003)));$('#energy-bar').style.width=actor.energy+'%';$('#energy-label').textContent=actor.action==='sleep'?'正在充电':actor.energy>65?'心情很好':'休息一下';
  if(state.auto&&!roomControl?.busy&&world.viewMode==='interior'&&!document.querySelector('dialog[open]')&&!editing&&!actor.path.length&&now-actor.lastActivity>18000&&now-actor.lastManual>30000){actor.lastActivity=now;const options=['sleep','computer','tea','sea'];doAction(options[Math.floor(Math.random()*options.length)],true)}
}
window.addEventListener('room-interface-changed',()=>{
  if(roomConnection.interfaceEnabled){world.resize();return}
  music.resumeOnVisible=false;music.pause();audio.enabled=false;
  if(audio.master&&audio.context)audio.master.gain.setTargetAtTime(0,audio.context.currentTime,.1);
  document.querySelectorAll('dialog[open]').forEach(d=>{if(d.id!=='room-settings')d.close()});
});
requestAnimationFrame(animate);
// A small development hook supports repeatable browser acceptance checks.
window.__DAYU__={get state(){return structuredClone(state)},get actor(){return{...actor,path:[...actor.path],onArrival:!!actor.onArrival}},get world(){return world},doAction,setViewMode,interact,computer,selectFurniture,setTab,placeFurniture,music,discovery,kitchen,heating,telescope,findPath:(a,b)=>findPath(a,b,state.furniture,state.balcony),ready:true};
