import {roomStorage} from './persistence.js';
import {icon} from './icons.js';
import {musicMarkup,bindMusicControls} from './music.js';
import {memoryPanelMarkup,bindMemoryPanel} from './memory-panel.js';
const NOTE_KEY='dayu.computer.note.v1',PREF_KEY='dayu.computer.preferences.v1',SCORE_KEY='dayu.computer.fish.best.v1';
const TIMES={morning:'07:30',afternoon:'14:20',sunset:'18:10',night:'22:00'},WEATHER={sunny:'晴朗',cloudy:'多云',rainy:'小雨',snowy:'飘雪'};

export function createComputer(onScreen,options={}){
  const dialog=document.createElement('dialog');dialog.id='computer-dialog';dialog.className='computer-dialog';dialog.setAttribute('aria-label','大肥鱼的小电脑');
  dialog.innerHTML=`<div class="computer-top"><span>${icon('monitor')}<b>DAYU OS</b><small>小屋里的另一扇窗</small></span><div><button class="icon-button" id="computer-power" aria-label="关闭电脑电源" title="电脑电源">${icon('power')}</button><button class="icon-button" data-close aria-label="收起电脑界面">${icon('close')}</button></div></div>
    <div class="computer-desktop"><nav class="computer-sidebar" aria-label="电脑应用"><button data-app="home" class="chosen">${icon('home')}桌面</button><button data-app="memory">${icon('sparkle')}记忆面板</button><button data-app="album">${icon('camera')}海边相册</button><button data-app="note">${icon('book')}小小便签</button><button data-app="game">${icon('whale')}接住小鱼</button><button data-app="music">${icon('music')}钢琴时光</button></nav>
    <section class="computer-content">
      <div data-screen="home" class="computer-home"><div class="desktop-clock"><span class="eyebrow">A SLOW DAY BY THE SEA</span><strong id="computer-clock">14:20</strong><span id="computer-weather">晴朗 · 24°C</span></div><div class="desktop-greeting"><h2>今天也要慢慢来。</h2><p>听一首钢琴曲，看看今天的记忆。<br/>屏幕里的小世界，和窗外一起呼吸。</p></div><div class="desktop-launchers"><button data-app="memory">${icon('sparkle')}记忆面板</button><button data-app="album">${icon('camera')}看海</button><button data-app="note">${icon('book')}写便签</button><button data-app="game">${icon('whale')}玩一局</button><button data-app="music">${icon('music')}听钢琴</button></div></div>
      <div data-screen="memory" class="computer-memory" hidden>${memoryPanelMarkup()}</div>
      <div data-screen="album" hidden><div class="computer-section-title"><h2>把海装进口袋</h2><button id="album-capture" class="soft-button">${icon('camera')}拍下小屋</button></div><img id="album-photo" class="album-photo" src="./assets/anime-coast.png" alt="动漫海岸、云朵与灯塔"/><div class="album-filters"><button data-filter="day" aria-pressed="true">海湾晴日</button><button data-filter="sunset" aria-pressed="false">橘色黄昏</button><button data-filter="night" aria-pressed="false">蓝色夜航</button><button id="album-back" hidden>回到海湾</button></div><p class="computer-muted" id="album-caption">同一片海，也有不一样的心情。</p></div>
      <div data-screen="note" hidden><h2>留一点小心事</h2><label for="computer-note">今天想记住什么？</label><textarea id="computer-note" maxlength="600" placeholder="今天的海很蓝，大肥鱼也很开心……"></textarea><div class="note-footer"><span id="note-state" role="status">保存在这个记忆空间里</span><span id="note-count">0 / 600</span></div></div>
      <div data-screen="game" hidden><div class="game-title"><h2>接住小鱼</h2><span>已接住 <b id="fish-score">0</b> 条 · 最佳 <b id="fish-best">0</b></span></div><canvas id="fish-game" width="640" height="380" tabindex="0" aria-label="接小鱼小游戏，左右方向键或手指移动鲸鱼"></canvas><div class="game-controls"><button id="game-start" class="primary-button">开始一局</button><span id="game-message" role="status">移动鼠标 / 手指 / ← →，接住落下的小鱼。</span></div></div>
      <div data-screen="music" class="computer-music" hidden>${musicMarkup()}</div>
      <div data-screen="off" class="computer-off" hidden>${icon('moon')}<h2>小电脑休息啦。</h2><p>屋里的屏幕也熄灭了。想玩的时候，随时再点亮。</p><button class="primary-button" id="computer-boot">${icon('power')}打开电脑</button></div>
    </section></div><footer class="computer-footer"><span id="computer-connection">● 与屋内屏幕同步</span><span>关掉窗口后，屏幕会保留当前内容。</span></footer>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s);
  let app='home',power=true,playing=false,score=0,best=0,remaining=30,fish=[],x=320,last=0,spawn=0,raf=0,keys=new Set(),filter='day',revision=0,lastRefresh=-1,lastMirror=0;
  try{const pref=JSON.parse(roomStorage.getItem(PREF_KEY));if(typeof pref?.power==='boolean')power=pref.power;if(['home','memory','album','note','game','music'].includes(pref?.app))app=pref.app;best=Math.max(0,Math.min(999,Number(roomStorage.getItem(SCORE_KEY))||0))}catch{}
  const canvas=$('#fish-game'),ctx=canvas.getContext('2d'),note=$('#computer-note'),mirror=document.createElement('canvas');mirror.width=768;mirror.height=432;const mc=mirror.getContext('2d');
  const memoryPanel=bindMemoryPanel($('[data-screen="memory"]'),()=>{if(app==='memory')paintMirror()},{getUrl:options.getMemoryPanelUrl});
  const art=new Image();art.src='./assets/anime-coast.png';art.onload=()=>paintMirror();let photo=art;
  try{note.value=(roomStorage.getItem(NOTE_KEY)||'').slice(0,600)}catch{}$('#note-count').textContent=note.value.length+' / 600';$('#fish-best').textContent=best;
  const preferences=()=>{try{roomStorage.setItem(PREF_KEY,JSON.stringify({power,app}))}catch{}};
  function environment(){const state=options.getEnvironment?.()||{time:'afternoon',weather:'sunny',temperature:24};return{...state,clock:state.realTime?new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(new Date()):TIMES[state.time],weatherLabel:WEATHER[state.weather]}}
  function text(value,x,y,size=22,color='#426b83'){mc.fillStyle=color;mc.font=`${size}px "Microsoft YaHei",sans-serif`;mc.fillText(value,x,y)}
  function rect(x,y,w,h,color,r=16){mc.fillStyle=color;mc.beginPath();mc.roundRect(x,y,w,h,r);mc.fill()}
  function wrap(value,max=33){const rows=[];for(const line of value.split('\n')){if(!line)rows.push('');for(let i=0;i<line.length;i+=max)rows.push(line.slice(i,i+max))}return rows}
  function paintMirror(){
    const env=environment();mc.clearRect(0,0,768,432);
    if(!power){mc.fillStyle='#182f42';mc.fillRect(0,0,768,432);text('DAYU',307,209,40,'#527182');text('晚安，小电脑',299,249,24,'#4d697a')}
    else{
      const gradient=mc.createLinearGradient(0,0,768,432);gradient.addColorStop(0,'#d8edf0');gradient.addColorStop(1,'#90becb');mc.fillStyle=gradient;mc.fillRect(0,0,768,432);rect(0,0,768,39,'#f1f8f5',0);text('DAYU OS',20,27,18);text(env.clock+'  ·  '+env.weatherLabel,596,27,17);
      if(app==='home'){
        text(env.clock,40,157,74);text(env.weatherLabel+'  '+env.temperature+'°C  /  海风刚刚好',45,198,23);text('今天，也慢慢来。',45,257,29);
        ['记忆面板','海边相册','小小便签','接住小鱼','钢琴时光'].forEach((label,i)=>{rect(25+i*146,310,134,75,'#f8fbefdf');text(['MEMORY','SEA','NOTE','PLAY','PIANO'][i],39+i*146,340,16);text(label,39+i*146,369,19)});
        mc.fillStyle='#ffefc9';mc.beginPath();mc.arc(638,144,50,0,7);mc.fill();mc.fillStyle='#77b2c3';mc.beginPath();mc.ellipse(592,245,120,38,-.12,0,7);mc.fill();
      }else if(app==='memory'){
        rect(28,60,712,135,'#fff6e2');text('每一件记住的小事',54,112,32);text('从小屋，走进你的记忆面板。',55,157,23,'#7a968b');
        ['今日动态','记忆分层','词语联想'].forEach((label,i)=>{rect(28+i*243,215,225,76,'#f6faf0');text(label,55+i*243,263,24,'#6b908c')});
        rect(28,314,712,79,'#658e91');text(memoryPanel.configured?'打开我的记忆面板  →':'添加插件面板入口  →',55,363,27,'#fffdf1');
      }else if(app==='album'){
        mc.save();mc.filter=filter==='sunset'?'sepia(.35) saturate(.8) hue-rotate(328deg)':filter==='night'?'brightness(.5) saturate(.65) hue-rotate(12deg)':'none';if(photo.complete&&photo.naturalWidth)mc.drawImage(photo,18,53,732,324);mc.restore();text(photo===art?'把海装进口袋':'此刻的小屋',28,412,22);
      }else if(app==='note'){
        rect(30,58,708,342,'#fffdf1');text('留一点小心事',56,102,26);const rows=wrap(note.value||'今天的海很蓝……\n写一件想记住的小事吧。');rows.slice(0,8).forEach((line,i)=>text(line,58,143+i*30,21,'#647d88'));text(note.value.length+' / 600',628,390,14,'#8da0a4');
      }else if(app==='game'){
        mc.drawImage(canvas,0,40,768,392);rect(12,48,212,37,'#fff8e2dd',8);text('小鱼 '+score+'  ·  '+(playing?'正在玩':remaining<=0?'完成啦':'已暂停'),24,74,20);
      }else if(app==='music'){
        const player=options.music;mc.fillStyle='#36576d';mc.beginPath();mc.arc(198,230,126,0,7);mc.fill();for(let r=40;r<120;r+=18){mc.strokeStyle='#6e93a466';mc.beginPath();mc.arc(198,230,r,0,7);mc.stroke()}mc.fillStyle='#efd9ac';mc.beginPath();mc.arc(198,230,30,0,7);mc.fill();text('小屋的钢琴时光',367,151,25);text(player?.track.name||'午后的潮汐',367,216,35);text(player?.enabled?'轻轻播放中 ♫':'暂停一会儿',367,262,23);text('音量 '+Math.round((player?.volume??.28)*100)+'%',367,309,20);
      }
    }
    revision++;onScreen({canvas:mirror,power,app,revision});
  }
  function refresh(){const env=environment();$('#computer-clock').textContent=env.clock;$('#computer-weather').textContent=env.weatherLabel+' · '+env.temperature+'°C · 窗外的海';paintMirror()}
  function screen(name){if(!['home','memory','album','note','game','music'].includes(name))name='home';if(name!=='game')stop();app=name;dialog.querySelectorAll('[data-screen]').forEach(s=>s.hidden=s.dataset.screen!==(power?app:'off'));dialog.querySelectorAll('.computer-sidebar [data-app]').forEach(b=>{b.classList.toggle('chosen',power&&b.dataset.app===app);b.disabled=!power});$('#computer-power').setAttribute('aria-label',power?'关闭电脑电源':'打开电脑电源');$('#computer-connection').textContent=power?'● 与屋内屏幕同步':'○ 电脑已关闭';if(name==='game')draw();preferences();refresh()}
  function togglePower(){power=!power;if(!power)stop();screen(app);options.onPower?.(power);return power}
  note.addEventListener('input',()=>{$('#note-count').textContent=note.value.length+' / 600';try{roomStorage.setItem(NOTE_KEY,note.value);$('#note-state').textContent='已经记住啦'}catch{$('#note-state').textContent='保存暂未确认，请先复制这段文字'}paintMirror()});
  dialog.addEventListener('click',e=>{const button=e.target.closest('[data-app]');if(button&&!button.disabled)screen(button.dataset.app)});
  $('[data-close]').addEventListener('click',()=>{stop();dialog.close();paintMirror()});dialog.addEventListener('close',()=>{stop();paintMirror()});
  $('#computer-power').addEventListener('click',togglePower);$('#computer-boot').addEventListener('click',togglePower);
  dialog.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$('#album-photo').dataset.filter=filter;dialog.querySelectorAll('[data-filter]').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));paintMirror()}));
  $('#album-capture').addEventListener('click',()=>{if(!options.capture)return;const capture=new Image();capture.onload=()=>{photo=capture;$('#album-photo').src=capture.src;$('#album-photo').alt='刚刚拍下的大肥鱼小屋';$('#album-caption').textContent='刚刚拍下的小屋 · 本次打开期间保留';$('#album-back').hidden=false;paintMirror()};capture.src=options.capture()});
  $('#album-back').addEventListener('click',()=>{photo=art;$('#album-photo').src=art.src;$('#album-back').hidden=true;$('#album-caption').textContent='同一片海，也有不一样的心情。';paintMirror()});
  if(options.music){bindMusicControls($('[data-screen="music"]'),options.music,options.toast||(()=>{}));options.music.subscribe(()=>{if(app==='music')paintMirror()})}
  function stop(){playing=false;cancelAnimationFrame(raf);keys.clear();$('#game-start').textContent=score?'再玩一局':'开始一局'}
  function draw(){
    const gradient=ctx.createLinearGradient(0,0,0,380);gradient.addColorStop(0,'#cee9ef');gradient.addColorStop(1,'#7fbed0');ctx.fillStyle=gradient;ctx.fillRect(0,0,640,380);ctx.fillStyle='#edf7ed88';for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(70+i*140,30+i%2*35,50,12,0,0,7);ctx.fill()}ctx.fillStyle='#365a71';ctx.font='16px sans-serif';ctx.fillText(`剩余 ${Math.max(0,Math.ceil(remaining))} 秒`,490,28);
    for(const f of fish){ctx.fillStyle=f.gold?'#efc574':'#f5f4e5';ctx.beginPath();ctx.ellipse(f.x,f.y,11,7,-.2,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(f.x+9,f.y);ctx.lineTo(f.x+18,f.y-7);ctx.lineTo(f.x+18,f.y+7);ctx.fill();ctx.fillStyle='#587991';ctx.beginPath();ctx.arc(f.x-5,f.y-1,1.5,0,7);ctx.fill()}
    ctx.fillStyle='#4f7d9e';ctx.beginPath();ctx.ellipse(x,332,44,25,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(x+30,335);ctx.quadraticCurveTo(x+80,330,x+65,301);ctx.lineTo(x+54,314);ctx.lineTo(x+72,315);ctx.quadraticCurveTo(x+63,353,x+20,347);ctx.fill();ctx.fillStyle='#f3f3df';ctx.beginPath();ctx.ellipse(x-8,343,28,10,0,0,7);ctx.fill();ctx.fillStyle='#183e5d';ctx.beginPath();ctx.arc(x-22,326,3,0,7);ctx.fill();
    const now=performance.now();if(now-lastMirror>80||!playing){lastMirror=now;paintMirror()}
  }
  function tick(now){if(!playing)return;const dt=Math.min((now-last)/1000,.06);last=now;remaining-=dt;if(keys.has('ArrowLeft'))x-=dt*330;if(keys.has('ArrowRight'))x+=dt*330;x=Math.max(45,Math.min(580,x));spawn+=dt;if(spawn>.48){spawn=0;fish.push({x:35+Math.random()*570,y:-10,speed:80+Math.random()*65,gold:Math.random()>.8})}for(const f of fish)f.y+=f.speed*dt;fish=fish.filter(f=>{if(f.y>307&&f.y<355&&Math.abs(f.x-x)<49){score+=f.gold?2:1;$('#fish-score').textContent=score;return false}return f.y<390});draw();if(remaining<=0){remaining=0;stop();best=Math.max(best,score);try{roomStorage.setItem(SCORE_KEY,String(best))}catch{}$('#fish-best').textContent=best;$('#game-message').textContent=`收获 ${score} 条小鱼！小鲸鱼说：谢谢款待。`;paintMirror();return}raf=requestAnimationFrame(tick)}
  $('#game-start').addEventListener('click',()=>{stop();playing=true;score=0;remaining=30;fish=[];spawn=0;$('#fish-score').textContent='0';$('#game-start').textContent='重新开始';$('#game-message').textContent='让小鲸鱼接住落下的小鱼吧。';last=performance.now();canvas.focus();raf=requestAnimationFrame(tick)});
  function pointer(e){const r=canvas.getBoundingClientRect();x=Math.max(45,Math.min(580,(e.clientX-r.left)/r.width*640));if(!playing)draw()}
  canvas.addEventListener('pointermove',pointer);canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);canvas.focus();pointer(e)});canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();keys.add(e.key)}});canvas.addEventListener('keyup',e=>keys.delete(e.key));canvas.addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stop();$('#game-message').textContent='休息一下，再开始一局吧。';paintMirror()}});
  draw();screen(app);
  return{setNote(text){note.value=text.slice(0,600);$('#note-count').textContent=note.value.length+' / 600';roomStorage.setItem(NOTE_KEY,note.value);paintMirror()},open(name){if(!power){power=true;options.onPower?.(true)}screen(name||app);if(!dialog.open)dialog.showModal()},close(){stop();dialog.close();paintMirror()},togglePower,refresh,update(time){if(time-lastRefresh>=1){lastRefresh=time;refresh()}},get canvas(){return mirror},get app(){return app},get power(){return power},get revision(){return revision},get score(){return score},get playing(){return playing}};
}
