import * as T from 'three';
import {group,box,ellipsoid,rod,mesh,mat,canvasTexture} from './objects.js';
import {groundHeight} from './coast.js';

export function createAmbience(scene,house){
  const flowers=[];
  for(const[cx,width]of[[-2.6,3.48],[.85,1.7]]){
    const planter=group(house.exterior,cx,.78,4.43);box(planter,width,.22,.34,0,0,0,'#cfbd9e',.025);box(planter,width-.10,.03,.25,0,.12,0,'#8a8266');
    for(const xx of[-width*.32,width*.32]){box(planter,.055,.25,.04,xx,-.18,-.10,'#849d9d');box(planter,.055,.045,.29,xx,-.27,.02,'#849d9d')}
    for(let i=0;i<Math.round(width*4);i++){const stem=group(planter,-width/2+.15+i*.24,.13,0);rod(stem,[0,0,0],[.02,.19,0],.008,'#89a68b');ellipsoid(stem,-.035,.08,0,.065,.025,.035,'#9fb498');ellipsoid(stem,.04,.12,0,.06,.025,.035,'#80a895');for(let j=0;j<4;j++){const a=j*Math.PI/2;ellipsoid(stem,Math.sin(a)*.032,.20+Math.cos(a)*.022,0,.032,.027,.028,['#e8c6ca','#f6e4b1','#d5d0e4'][i%3])}flowers.push(stem)}
  }
  const matTexture=canvasTexture((c,w,h)=>{c.fillStyle='#94b5bc';c.fillRect(0,0,w,h);c.strokeStyle='#f1ead4';c.lineWidth=9;c.strokeRect(12,12,w-24,h-24);c.fillStyle='#eef1df';c.textAlign='center';c.font='22px Georgia';c.fillText('WELCOME HOME',w/2,h*.6)},256,128);
  const welcome=mesh(house.exterior,new T.PlaneGeometry(1.35,.65),mat('#fff',{map:matTexture}),3.45,.169,5.0);welcome.rotation.x=-Math.PI/2;welcome.castShadow=false;
  const chair=group(house.yard,12.55,groundHeight(12.55,2.0),2.0);for(const xx of[-.31,.31]){rod(chair,[xx,0,.45],[xx,.55,-.45],.025,'#d3c1a2');rod(chair,[xx,0,-.4],[xx,.55,.48],.025,'#d3c1a2');rod(chair,[xx,.3,.35],[xx,1.0,-.72],.03,'#dfceb0')}
  const textile=box(chair,.55,.045,.8,0,.57,-.15,'#bacfd0',.02);textile.rotation.x=.55;for(let i=0;i<5;i++){const stripe=box(textile,.05,.008,.77,-.22+i*.11,.026,0,'#f3ead3',.003)}
  const birds=[];for(let i=0;i<3;i++){
    const bird=group(scene);const body=ellipsoid(bird,0,0,0,.065,.035,.14,'#eef0e2');body.castShadow=false;const wings=[];
    for(const side of[-1,1]){const wing=group(bird,side*.045,0,0);const shape=new T.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(side*.18,.03,side*.39,-.08);shape.lineTo(side*.13,-.12);shape.closePath();const m=mesh(wing,new T.ShapeGeometry(shape),mat('#f6f4e8',{side:T.DoubleSide}));m.rotation.x=-Math.PI/2;m.castShadow=false;wings.push(wing)}
    birds.push({bird,wings});
  }
  return{birds,update(time){birds.forEach(({bird,wings},i)=>{const a=time*.09+i*2.1;bird.position.set(2+Math.sin(a)*5,3.7+Math.sin(a*.8+i)*.35,-14+Math.cos(a)*1.6);bird.rotation.y=Math.atan2(Math.cos(a)*5,-Math.sin(a)*1.6);wings.forEach((w,j)=>w.rotation.z=Math.sin(time*2.8+i)*.18*(j?1:-1))});flowers.forEach((g,i)=>g.rotation.z=Math.sin(time*.9+i)*.025)}};
}
