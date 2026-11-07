import * as T from 'three';
import {group,box,cylinder,rod,mesh,mat,canvasTexture} from './objects.js';

import {advanceTemperature} from './heating-data.js';

export function makeHeater(parent){
  const root=group(parent,-4.91,.24,.4);root.rotation.y=Math.PI/2;
  box(root,1.48,.83,.12,0,.64,0,'#e9dfc7',.06);
  for(let i=0;i<11;i++)box(root,.102,.77,.19,-.63+i*.126,.64,.055,'#faf4df',.045);
  for(const x of[-.73,.73]){rod(root,[x,.31,0],[x,.95,0],.035,'#dac7a2');rod(root,[x,.31,0],[x,.06,-.11],.025,'#c8b78f')}
  const valve=cylinder(root,.085,.085,.1,.82,.91,0,'#b49d77');valve.rotation.z=Math.PI/2;
  const control=box(root,.32,.34,.1,.67,1.33,.04,'#f3ead5',.035);
  const screen=mesh(root,new T.PlaneGeometry(.24,.17),new T.MeshBasicMaterial({color:'#fff'}),.67,1.36,.096);screen.castShadow=false;
  const led=mesh(root,new T.SphereGeometry(.025,10,6),new T.MeshBasicMaterial({color:'#b4bec0'}),.67,1.23,.102);
  const glow=new T.PointLight('#ffd59b',0,2.4,2);glow.position.set(0,1,.2);root.add(glow);
  const waves=group(root,0,1.12,.12);for(let k=0;k<4;k++){const pts=[];for(let i=0;i<=20;i++)pts.push(new T.Vector3((k-1.5)*.27+Math.sin(i*.4+k)*.025,i*.026,0));const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:'#ffe6b5',transparent:true,opacity:.2,depthWrite:false}));waves.add(line)}
  root.traverse(o=>{if(o.isMesh)o.userData.interaction='heater'});
  let label='';return{root,control,screen,led,glow,waves,update(state,temp,time){const on=state.heaterOn;glow.intensity=on?.42:0;led.material.color.set(on?'#f2b96c':'#9fadb0');waves.visible=on&&temp<state.heaterTarget-.2;waves.children.forEach((line,i)=>{line.position.y=(time*.12+i*.09)%.35;line.material.opacity=.12+Math.sin(time*1.4+i)*.05});const text=on?state.heaterTarget+'°':'OFF';if(text!==label){label=text;screen.material.map?.dispose();screen.material.map=canvasTexture((c,w,h)=>{c.fillStyle=on?'#e6dab7':'#d7e1dd';c.fillRect(0,0,w,h);c.fillStyle='#657b73';c.font='bold 50px monospace';c.textAlign='center';c.fillText(text,w/2,61)},128,85);screen.material.needsUpdate=true}}};
}
export function createHeating(world,state,save,toast){
  const card=document.querySelector('#heating-card'),toggle=document.querySelector('#heater-toggle'),slider=document.querySelector('#heater-target');let room=20,lastUI=0;
  function sync(){toggle.checked=state.heaterOn;slider.value=state.heaterTarget;document.querySelector('#heater-target-value').textContent=state.heaterTarget+' °C';card.classList.toggle('heating-on',state.heaterOn);save()}
  toggle.addEventListener('change',()=>{state.heaterOn=toggle.checked;sync();toast(state.heaterOn?'暖气打开了，慢慢把小屋暖起来。':'暖气关好了，余温还会留一会儿。')});slider.addEventListener('input',()=>{state.heaterTarget=Number(slider.value);sync()});sync();
  return{get temperature(){return room},focus(){card.scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('#control-panel').classList.add('mobile-open');toggle.focus();card.classList.remove('heater-highlight');requestAnimationFrame(()=>card.classList.add('heater-highlight'))},update(dt,time){room=advanceTemperature(room,state.temperature,state.heaterTarget,state.heaterOn,state.balcony,dt);world.heater.update(state,room,time);if(time-lastUI<.5)return;lastUI=time;document.querySelector('#room-temperature').textContent=room.toFixed(1)+'°';document.querySelector('#heater-status').textContent=!state.heaterOn?'已关闭 · 室温随环境缓慢变化':room<state.heaterTarget-.3?(state.balcony?'开着阳台 · 海风带走一些暖意':'升温中 · 被窝也暖暖的'):'舒适保温 · 今天也慢慢来'}};
}
