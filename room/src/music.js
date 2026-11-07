import {roomStorage} from './persistence.js';
import {icon} from './icons.js';

const PREF_KEY='dayu.piano.preferences.v1';
export const TRACKS=[
  {id:'tide',name:'午后的潮汐',description:'温暖钢琴 · 慢慢靠岸',bpm:64,key:0,chords:[[48,55,59,64],[45,52,55,59],[41,48,52,57],[43,50,57,62]],melody:[[76,74],[72,71],[69,72],[74,null],[76,79],[76,72],[69,67],[71,74],[76,74],[72,67],[69,72],[74,71],[72,76],[71,69],[67,69],[71,null]]},
  {id:'window',name:'窗边微光',description:'轻柔钢琴 · 一页午后',bpm:60,key:5,chords:[[48,55,59,64],[43,50,55,59],[45,52,55,60],[41,48,52,57]],melody:[[67,72],[71,69],[67,64],[65,null],[69,72],[71,67],[64,67],[69,65],[67,72],[74,71],[72,69],[65,null],[69,67],[71,74],[72,67],[65,null]]},
  {id:'moon',name:'月亮来信',description:'安静钢琴 · 睡前的一封信',bpm:56,key:2,chords:[[48,55,60,64],[45,52,59,64],[41,48,55,60],[43,50,57,62]],melody:[[72,null],[71,67],[69,null],[67,62],[64,67],[71,null],[69,65],[67,null],[72,76],[71,null],[69,72],[74,null],[72,67],[64,null],[65,69],[67,null]]}
];

// Original scores and a softly decaying, slightly detuned piano timbre. No remote audio.
export function pianoBuffer(context,midi){
  const rate=22050,length=Math.round(rate*4.6),buffer=context.createBuffer(1,length,rate),data=buffer.getChannelData(0),frequency=440*2**((midi-69)/12),harmonics=[.64,.28,.13,.065,.028,.012];
  for(let i=0;i<length;i++){const t=i/rate,attack=1-Math.exp(-t/ .009);let value=0;
    for(let k=0;k<harmonics.length;k++){const f=frequency*(k+1)*(1+.00006*k*k);value+=harmonics[k]*Math.exp(-t*(.65+k*.38))*Math.sin(2*Math.PI*f*t)*(.82+.18*Math.cos(2*Math.PI*f*.0012*t))}
    data[i]=value*attack*.62*Math.min(1,(length-i)/(rate*.06));
  }
  return buffer;
}
export function scoreEvents(track){
  const beat=60/track.bpm,events=[];
  track.melody.forEach((melody,bar)=>{
    const chord=track.chords[bar%4],base=bar*4;
    [[0,0,.31],[.75,2,.20],[1.5,1,.18],[2.5,3,.18]].forEach(([offset,n,velocity])=>events.push({at:(base+offset)*beat,midi:chord[n]+track.key,velocity}));
    melody.forEach((note,i)=>{if(note!==null)events.push({at:(base+.25+i*2)*beat,midi:note+track.key,velocity:i?.36:.42})});
  });
  return{events:events.sort((a,b)=>a.at-b.at),duration:track.melody.length*4*beat};
}
export function pianoBus(context,destination){
  const input=context.createGain(),filter=context.createBiquadFilter(),dry=context.createGain(),wet=context.createGain(),reverb=context.createConvolver(),compressor=context.createDynamicsCompressor();
  filter.type='lowpass';filter.frequency.value=3900;filter.Q.value=.35;dry.gain.value=.88;wet.gain.value=.22;
  const impulse=context.createBuffer(2,Math.round(context.sampleRate*2.4),context.sampleRate);let seed=27;
  for(let channel=0;channel<2;channel++){const data=impulse.getChannelData(channel);let smooth=0;for(let i=0;i<data.length;i++){seed=seed*16807%2147483647;smooth=smooth*.7+((seed/2147483647)*2-1)*.3;data[i]=smooth*Math.exp(-i/context.sampleRate*2.8)*.8}}
  reverb.buffer=impulse;compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=2;compressor.attack.value=.02;compressor.release.value=.4;
  input.connect(filter);filter.connect(dry);dry.connect(compressor);filter.connect(reverb);reverb.connect(wet);wet.connect(compressor);compressor.connect(destination);return input;
}

export class PianoPlayer{
  constructor(){
    this.context=null;this.enabled=false;this.trackId='tide';this.volume=.28;this.cache=new Map();this.voices=new Set();this.listeners=new Set();this.timer=null;this.offset=0;this.eventIndex=0;this.generation=0;
    try{const p=JSON.parse(roomStorage.getItem(PREF_KEY));if(TRACKS.some(t=>t.id===p?.track))this.trackId=p.track;if(Number.isFinite(p?.volume))this.volume=Math.min(1,Math.max(0,p.volume))}catch{}
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.resumeOnVisible=this.enabled;this.pause()}else if(this.resumeOnVisible){this.resumeOnVisible=false;this.play().catch(()=>{})}});
  }
  get track(){return TRACKS.find(t=>t.id===this.trackId)}
  get elapsed(){return this.enabled?(this.context.currentTime-this.startedAt)%this.score.duration:this.offset}
  subscribe(fn){this.listeners.add(fn);fn(this);return()=>this.listeners.delete(fn)}
  notify(){for(const fn of this.listeners)fn(this)}
  save(){try{roomStorage.setItem(PREF_KEY,JSON.stringify({track:this.trackId,volume:this.volume}))}catch{}}
  async init(){
    if(!this.context){const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw Error('当前浏览器无法播放音乐');this.context=new AudioCtx();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);this.input=pianoBus(this.context,this.master);this.effect=this.context.createGain();this.effect.gain.value=.065;this.effect.connect(this.context.destination)}
    await this.context.resume();
  }
  async play(){
    const generation=++this.generation;await this.init();if(generation!==this.generation)return;if(this.enabled)return;
    this.enabled=true;this.score=scoreEvents(this.track);this.offset=Math.max(0,this.offset%this.score.duration);this.startedAt=this.context.currentTime-this.offset+.04;this.cycleStart=this.startedAt;this.eventIndex=this.score.events.findIndex(e=>e.at>=this.offset);if(this.eventIndex<0){this.eventIndex=0;this.cycleStart+=this.score.duration}
    this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setTargetAtTime(this.volume*.55,this.context.currentTime,.45);this.schedule();this.timer=setInterval(()=>this.schedule(),80);this.notify();
  }
  schedule(){
    if(!this.enabled)return;const now=this.context.currentTime;
    // Resume from the present rather than enqueueing a burst after a throttled tab.
    if(now-this.cycleStart>this.score.duration){this.cycleStart+=Math.floor((now-this.cycleStart)/this.score.duration)*this.score.duration;this.eventIndex=0}
    while(this.cycleStart+this.score.events[this.eventIndex].at<now+.24){const event=this.score.events[this.eventIndex],when=this.cycleStart+event.at;if(when>=now-.03)this.note(event.midi,event.velocity,Math.max(when,now));this.eventIndex++;if(this.eventIndex===this.score.events.length){this.eventIndex=0;this.cycleStart+=this.score.duration}}
  }
  note(midi,velocity,when){
    if(!this.cache.has(midi))this.cache.set(midi,pianoBuffer(this.context,midi));const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.cache.get(midi);gain.gain.value=velocity;source.connect(gain);gain.connect(this.input);source.start(when);const voice={source,gain};this.voices.add(voice);source.onended=()=>{source.disconnect();gain.disconnect();this.voices.delete(voice)};
  }
  pause(){
    this.generation++;if(this.enabled)this.offset=Math.max(0,this.elapsed);this.enabled=false;clearInterval(this.timer);this.timer=null;
    if(this.context){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setTargetAtTime(0,now,.12);for(const v of this.voices){v.gain.gain.setTargetAtTime(0,now,.06);try{v.source.stop(now+.35)}catch{}}}
    this.notify();
  }
  async toggle(){this.resumeOnVisible=false;if(this.enabled)this.pause();else await this.play();return this.enabled}
  async select(id){if(!TRACKS.some(t=>t.id===id))return;this.pause();this.trackId=id;this.offset=0;this.save();this.notify();await this.play()}
  setVolume(value){this.volume=Math.min(1,Math.max(0,value));if(this.enabled)this.master.gain.setTargetAtTime(this.volume*.55,this.context.currentTime,.15);this.save();this.notify()}
  async chime(){await this.init();const now=this.context.currentTime;[880,1174.66,1318.51].forEach((frequency,i)=>{const tone=this.context.createOscillator(),gain=this.context.createGain();tone.type='sine';tone.frequency.value=frequency;gain.gain.setValueAtTime(0,now+i*.16);gain.gain.linearRampToValueAtTime(.3,now+i*.16+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.16+1.4);tone.connect(gain);gain.connect(this.effect);tone.start(now+i*.16);tone.stop(now+i*.16+1.5);tone.onended=()=>{tone.disconnect();gain.disconnect()}})}
}

export function musicMarkup(){return `<div class="music-cover" aria-hidden="true"><span class="record-disc"><i></i></span><span>SEA SIDE<br/>PIANO NOTES</span></div><div class="music-now"><span class="eyebrow">小屋的钢琴时光</span><h3 data-music-title>午后的潮汐</h3><p data-music-status>轻轻按下播放，让旋律陪海风坐一会儿。</p></div><button class="primary-button music-play" data-music-toggle aria-pressed="false">${icon('play')}播放轻音乐</button><div class="music-tracks">${TRACKS.map(t=>`<button data-track="${t.id}" aria-pressed="false"><span>${icon('music')}<b>${t.name}</b><small>${t.description}</small></span><i>${t.bpm} BPM</i></button>`).join('')}</div><label class="music-volume">${icon('sound')}音乐音量<input data-music-volume type="range" min="0" max="100" value="28" aria-label="钢琴音乐音量"/><output data-music-output>28%</output></label><p class="music-note">钢琴与海浪声可以分别开关。每首会轻轻循环。</p>`}
export function bindMusicControls(container,player,onError){
  container.addEventListener('click',e=>{const track=e.target.closest('[data-track]'),toggle=e.target.closest('[data-music-toggle]');const result=track?player.select(track.dataset.track):toggle?player.toggle():null;if(result)result.catch(()=>onError('音乐暂时无法播放，请检查浏览器声音设置。'))});
  container.querySelector('[data-music-volume]').addEventListener('input',e=>player.setVolume(Number(e.target.value)/100));
  return player.subscribe(p=>{container.classList.toggle('music-playing',p.enabled);container.querySelector('[data-music-title]').textContent=p.track.name;container.querySelector('[data-music-status]').textContent=p.enabled?'钢琴轻轻响着，今天不用赶时间。':'轻轻按下播放，让旋律陪海风坐一会儿。';const button=container.querySelector('[data-music-toggle]');button.innerHTML=icon(p.enabled?'pause':'play')+(p.enabled?'暂停音乐':'播放轻音乐');button.setAttribute('aria-pressed',String(p.enabled));container.querySelectorAll('[data-track]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.track===p.trackId)));container.querySelector('[data-music-volume]').value=Math.round(p.volume*100);container.querySelector('[data-music-output]').textContent=Math.round(p.volume*100)+'%'});
}
export function createMusicPanel(player,onError){const dialog=document.createElement('dialog');dialog.id='music-dialog';dialog.className='music-dialog';dialog.setAttribute('aria-label','小屋轻音乐');dialog.innerHTML=`<button class="icon-button music-close" aria-label="收起音乐播放器">${icon('close')}</button>${musicMarkup()}`;document.body.append(dialog);bindMusicControls(dialog,player,onError);dialog.querySelector('.music-close').addEventListener('click',()=>dialog.close());return{open(){if(!dialog.open)dialog.showModal()},close(){dialog.close()}}}
