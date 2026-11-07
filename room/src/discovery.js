import * as T from 'three';
import {icon} from './icons.js';

export function createDiscovery(world,interact){
  const layer=document.createElement('div');layer.id='interaction-markers';layer.setAttribute('aria-label','小屋里的互动入口');document.querySelector('#scene-wrap').append(layer);
  const entries=[
    {action:'computer-screen',name:'打开电脑',icon:'monitor',mode:'interior',item:'desk',local:[0,2.35,-.3]},
    {action:'music',name:'听听钢琴',icon:'music',mode:'interior',item:'shelf',local:[.52,2.62,.12]},
    {action:'feed',name:'喂喂小鱼',icon:'fish',mode:'interior',item:'aquarium',local:[0,1.75,0]},
    {action:'water',name:'浇一浇水',icon:'leaf',mode:'interior',item:'plant',local:[0,1.85,0]},
    {action:'heater',name:'调一调暖气',icon:'thermo',mode:'interior',point:[-4.65,1.95,.4]},
    {action:'chime',name:'轻碰风铃',icon:'bell',mode:'interior',point:[5.1,3.4,-.65]},
    {action:'enter',name:'回到小屋',icon:'door',mode:'exterior',point:[3.45,2.3,4.32]},
    {action:'mailbox',name:'读一封信',icon:'book',mode:'exterior',point:[5.2,1.3,6.8]},
    {action:'loft-read',name:'读一页书',icon:'book',mode:'attic',point:[-2.6,5.55,-1.8]},
    {action:'telescope',name:'看海与真实星空',icon:'sea',mode:'attic',point:[2.8,5.8,-2.55]},
    {action:'souvenir',name:'海边收藏',icon:'box',mode:'attic',point:[3.5,5.35,2.5]},
    {action:'fridge',name:'打开小冰箱',icon:'fridge',mode:'attic',point:[1.05,6.05,-3.2]},
    {action:'cook',name:'做点好吃的',icon:'pot',mode:'attic',point:[-1.25,5.9,-3.1]},
    {action:'table',name:'摆好餐具',icon:'plate',mode:'attic',point:[0,5.5,.3]}
  ];
  entries.forEach(e=>{const button=document.createElement('button');button.type='button';button.className='interaction-marker';button.dataset.hotspot=e.action;button.innerHTML=icon(e.icon)+`<span>${e.name}</span>`;button.addEventListener('click',()=>interact(e.action));button.hidden=true;layer.append(button);e.button=button});
  const toggle=document.querySelector('#explore-button');let enabled=false,last=0;
  toggle.addEventListener('click',()=>{enabled=!enabled;toggle.setAttribute('aria-pressed',String(enabled));toggle.querySelector('span:last-child').textContent=enabled?'收起提示':'发现互动';if(!enabled)entries.forEach(e=>e.button.hidden=true)});
  return{get enabled(){return enabled},update(time,suppressed=false){if(time-last<.035)return;last=time;const placed=[];for(const e of entries){const node=e.item?world.furniture.get(e.item):null;let visible=enabled&&!suppressed&&e.mode===world.viewMode&&(!node||node.visible);if(!visible){e.button.hidden=true;continue}
      const position=e.point?new T.Vector3(...e.point):node.localToWorld(new T.Vector3(...e.local));const p=world.project(position.x,position.y,position.z);let y=p.y-10;for(const prior of placed)if(Math.abs(prior.x-p.x)<105&&Math.abs(prior.y-y)<36)y=prior.y-42;
      visible=p.x>45&&p.x<world.width-45&&y>165&&y<world.height-110;e.button.hidden=!visible;if(visible){e.button.style.left=p.x+'px';e.button.style.top=y+'px';placed.push({x:p.x,y})}
    }}};
}
