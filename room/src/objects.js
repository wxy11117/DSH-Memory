import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/RoundedBoxGeometry.js';
import {wallWithOpenings,cottageWindow,slidingDoor} from './joinery.js';

const palette={white:'#f7f5ec',blue:'#83a9c8',navy:'#526a93',wood:'#d6bc98',lightwood:'#e6d2b1',green:'#6d9d8d',cream:'#eee5d2',dark:'#455c6e'};
const materials=new Map();
export function mat(color,opts={}){const key=color+JSON.stringify(opts);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:.82,metalness:0,...opts}));return materials.get(key)}
export function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
export function box(parent,w,h,d,x,y,z,color=palette.white,r=.04){return mesh(parent,r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new T.BoxGeometry(w,h,d),typeof color==='string'?mat(color):color,x,y,z)}
export function ellipsoid(parent,x,y,z,sx,sy,sz,color=palette.white){const m=mesh(parent,new T.SphereGeometry(1,24,16),typeof color==='string'?mat(color):color,x,y,z);m.scale.set(sx,sy,sz);return m}
export function cylinder(parent,top,bottom,height,x,y,z,color=palette.white,sides=24){return mesh(parent,new T.CylinderGeometry(top,bottom,height,sides),typeof color==='string'?mat(color):color,x,y,z)}
export function rod(parent,a,b,r,color){const pa=new T.Vector3(...a),pb=new T.Vector3(...b);const o=cylinder(parent,r,r,pa.distanceTo(pb),0,0,0,color,10);o.position.copy(pa).add(pb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),pb.sub(pa).normalize());return o}
export function group(parent,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g}
export function canvasTexture(draw,w=512,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;return texture}
function rng(seed=12345){return()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646}}
export function woodTexture(){return canvasTexture((c,w,h)=>{const rand=rng(8);c.fillStyle='#cdd6db';c.fillRect(0,0,w,h);for(let row=0;row<16;row++){const yy=row*h/16;c.fillStyle=['#dce2e4','#d6dee2','#d2dce1','#e1e5e4'][row%4];c.fillRect(0,yy,w,h/16-1);for(let k=0;k<22;k++){c.strokeStyle=`rgba(127,153,164,${rand()*.14})`;c.beginPath();let y=yy+rand()*h/16;c.moveTo(0,y);c.bezierCurveTo(w*.25,y+rand()*5,w*.7,y-3,w,y+2);c.stroke()}c.fillStyle='#b8c9d04d';c.fillRect((row%2)*w/2+w*.23,yy,1,h/16)}})}
function whale2d(c,x,y,size,color='#8caec8'){
  c.save();c.translate(x,y);c.scale(size,size);c.fillStyle=color;c.beginPath();c.ellipse(0,0,1.0,.55,-.12,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(.65,.15);c.quadraticCurveTo(1.6,.15,1.45,-.8);c.quadraticCurveTo(1.15,-.7,1.22,-.28);c.quadraticCurveTo(1.9,-.65,2,-.28);c.quadraticCurveTo(1.9,.2,1.4,.15);c.quadraticCurveTo(1.1,.75,.3,.5);c.fill();c.fillStyle='#f3f4e9';c.beginPath();c.ellipse(-.18,.24,.7,.19,0,0,Math.PI*2);c.fill();c.fillStyle='#506b82';c.beginPath();c.arc(-.5,-.07,.06,0,Math.PI*2);c.fill();c.restore();
}
function artTexture(kind){return canvasTexture((c,w,h)=>{
  const grad=c.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#c3e0ed');grad.addColorStop(1,'#edf3ef');c.fillStyle=grad;c.fillRect(0,0,w,h);
  if(kind==='whale'){whale2d(c,w*.43,h*.53,w*.22,'#678eae');for(let i=0;i<5;i++){c.strokeStyle='#ffffffb0';c.lineWidth=5;c.beginPath();c.arc(w*.28+i*32,h*.8,130,3.9,5.5);c.stroke()}}
  else{c.fillStyle='#f8efcd';c.beginPath();c.arc(w*.73,h*.25,w*.12,0,7);c.fill();for(let i=0;i<5;i++){c.fillStyle=['#bddbe4','#9fc7d9','#80b0cb','#6c9bb6','#6189a7'][i];c.beginPath();c.moveTo(0,h);c.lineTo(0,h*(.4+i*.1));c.bezierCurveTo(w*.35,h*(.55+i*.1),w*.6,h*(.2+i*.13),w,h*(.5+i*.1));c.lineTo(w,h);c.fill()}}
})}
export function frame(parent,x,y,z,w,h,kind='whale',rotate=0){const g=group(parent,x,y,z);g.rotation.y=rotate;box(g,w+.12,h+.12,.09,0,0,0,'#e8d9be',.01);box(g,w+.04,h+.04,.01,0,0,.051,'#fffcef',0);const texture=artTexture(kind);mesh(g,new T.PlaneGeometry(w,h),mat('#fff',{map:texture}),0,0,.06);return g}
export function plant(parent,x,y,z,size=1,pot='#f3eee1'){
  const g=group(parent,x,y,z);g.scale.setScalar(size);cylinder(g,.23,.16,.42,0,.21,0,pot);cylinder(g,.205,.205,.025,0,.425,0,'#796b58');
  for(let i=0;i<9;i++){const angle=i*2.4,hh=.63+(i%3)*.22;const xx=Math.sin(angle)*.27,zz=Math.cos(angle)*.27;rod(g,[0,.4,0],[xx,hh+.18,zz],.015,'#73947a');const leaf=ellipsoid(g,xx,hh,zz,.18,.32,.04,['#789e83','#8fb69a','#a0baa0'][i%3]);leaf.rotation.z=-Math.sin(angle)*.95;leaf.rotation.x=Math.cos(angle)*.85;leaf.rotation.y=angle}
  return g;
}
export function lamp(parent,x,y,z,scale=1){
  const g=group(parent,x,y,z);g.scale.setScalar(scale);cylinder(g,.23,.25,.07,0,.04,0,'#d4c9b1');cylinder(g,.032,.045,.58,0,.34,0,'#bda980');const shade=cylinder(g,.22,.36,.42,0,.78,0,mat('#fff2cd',{emissive:'#ffe4a4',emissiveIntensity:.16}),32);shade.castShadow=false;
  const light=new T.PointLight('#ffda94',0,5,2);light.position.set(0,.64,0);g.add(light);g.userData.light=light;return g;
}
export function books(parent,x,y,z,count=7){const colors=['#a9c4d0','#d5c5ad','#859da9','#a7b6c7','#e4d6b9','#91acb5','#a0a4c0'];for(let i=0;i<count;i++){const h=.37+(i%3)*.06;const b=box(parent,.095,h,.24,x+i*.11,y+h/2,z,colors[i%7],.01);if(i===count-1)b.rotation.z=-.16;box(b,.071,.012,.006,0,h*.27,.123,'#ece8dd',0)}}
export function plush(parent,x,y,z,scale=1){const g=group(parent,x,y,z);g.scale.setScalar(scale);ellipsoid(g,0,.25,0,.51,.31,.32,'#729ec3');ellipsoid(g,-.05,.12,.18,.4,.14,.2,'#f0f0e6');const fin=ellipsoid(g,.1,.18,.31,.22,.06,.12,'#628caf');fin.rotation.z=-.22;const tail=group(g,.48,.27,-.02);tail.rotation.z=.55;ellipsoid(tail,.1,.08,0,.25,.07,.14,'#729ec3');const t1=ellipsoid(tail,.27,.12,.1,.15,.06,.18,'#729ec3');t1.rotation.x=.4;ellipsoid(g,-.27,.29,.26,.025,.035,.02,'#344d67');ellipsoid(g,-.28,.3,.277,.008,.01,.005,'#ffffff');return g}
export function makeRug(parent){const tex=canvasTexture((c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#e8ebdf';c.beginPath();c.arc(w/2,h/2,w*.49,0,7);c.fill();c.strokeStyle='#aac4d3';c.lineWidth=28;c.beginPath();c.arc(w/2,h/2,w*.43,0,7);c.stroke();c.strokeStyle='#ccdce0';c.lineWidth=4;for(let i=0;i<3;i++){c.beginPath();c.arc(w/2,h/2,w*(.33+i*.025),0,7);c.stroke()}whale2d(c,w*.43,h*.51,w*.19,'#87aac2');for(let i=0;i<24;i++){let a=i/24*Math.PI*2;c.fillStyle='#d8e2e3';c.beginPath();c.arc(w/2+Math.cos(a)*w*.4,h/2+Math.sin(a)*h*.4,3,0,7);c.fill()}});const rug=mesh(parent,new T.PlaneGeometry(3.5,2.85),mat('#fff',{map:tex,transparent:true,alphaTest:.15,roughness:1}),0,.036,0);rug.rotation.x=-Math.PI/2;rug.castShadow=false;return rug}
export function createFurniture(parent,item,lamps){
  const g=group(parent,item.x,.2,item.z);g.rotation.y=item.rotation;g.userData.itemId=item.id;
  if(item.kind==='bed'){
    for(const xx of [-1.05,1.05])for(const zz of [-1.65,1.65])cylinder(g,.07,.055,.32,xx,.16,zz,'#bba788');
    box(g,2.65,.23,4.05,0,.34,0,'#e6d7be',.07);box(g,2.49,.34,3.9,0,.6,0,'#f3f2e7',.14);
    box(g,2.75,1.55,.18,0,.98,-2.0,'#e9e0cd',.12);box(g,2.47,.91,.12,0,1.13,-1.88,'#c7d9e4',.09);
    for(let i=0;i<4;i++)box(g,.016,.74,.018,-.94+i*.63,1.13,-1.808,'#b4cbd9',.005);
    const blanket=box(g,2.51,.26,2.55,0,.84,.58,'#80add0',.12);box(g,2.56,.1,.37,0,.98,-.66,'#d7e6ee',.035);
    for(let i=0;i<13;i++)box(g,.02,.014,2.23,-1.19+i*.2,.978,.75,'#bad5e4',.004);
    box(g,.14,.65,2.42,-1.22,.55,.65,'#8bb6d5',.06);box(g,.14,.65,2.42,1.22,.55,.65,'#8bb6d5',.06);
    for(let i=-1;i<=1;i+=2){const p=box(g,1.04,.24,.67,i*.61,.92,-1.4,'#f7f6ed',.12);p.rotation.z=i*.04;box(g,.76,.18,.5,i*.61,1.05,-1.5,'#d6e4eb',.09)}
    plush(g,-.62,1.1,-.62,.67);
  }
  if(item.kind==='desk'){
    for(const xx of [-1.45,1.45])for(const zz of [-.48,.48])box(g,.08,1.16,.08,xx,.58,zz,'#d9c9ae',.02);
    box(g,3.4,.13,1.35,0,1.22,0,'#ecddc4',.045);box(g,.65,1.09,1.05,1.23,.65,0,'#e6e6dd',.04);
    for(let i=0;i<3;i++){box(g,.6,.015,.01,1.23,.46+i*.26,.53,'#c8d3d5',.001);box(g,.17,.027,.03,1.23,.58+i*.26,.55,'#9daeba',.01)}
    box(g,.45,.035,.28,0,1.31,-.18,'#879ba9',.02);box(g,.08,.33,.07,0,1.47,-.27,'#879ba9',.015);box(g,1.49,.92,.08,0,1.91,-.3,'#627b8d',.035);
    const screen=mesh(g,new T.PlaneGeometry(1.37,.79),mat('#fff',{map:artTexture('sea'),emissive:'#abd5e3',emissiveIntensity:.22}),0,1.93,-.252);screen.castShadow=false;g.userData.screen=screen;
    const led=ellipsoid(g,.62,1.505,-.252,.018,.012,.008,new T.MeshBasicMaterial({color:'#90d9c2'}));led.userData.interaction='computer-power';g.userData.monitorLED=led;
    box(g,1.08,.045,.36,-.05,1.32,.36,'#f0eee6',.025);for(let r=0;r<3;r++)for(let k=0;k<13;k++)box(g,.062,.008,.066,-.5+k*.075,1.347,.25+r*.09,k%5===0?'#b4c9d6':'#d8e0e3',.005);
    ellipsoid(g,.68,1.35,.4,.1,.045,.14,'#c1d6e1');box(g,.34,.008,.4,.7,1.29,.38,'#9bb7cc',.02);
    const pc=box(g,.4,.76,.74,-1.33,.44,-.1,'#e3eaf0',.04);box(g,.36,.68,.01,-1.33,.45,.28,'#c1dae4',.03);for(let i=0;i<2;i++){const ring=mesh(g,new T.TorusGeometry(.1,.014,8,24),mat('#9ab9ce',{emissive:'#a5d6e5',emissiveIntensity:.3}),-1.33,.28+i*.29,.293);}
    const powerButton=cylinder(g,.035,.035,.015,-1.33,.73,.301,'#6b95a9',16);powerButton.rotation.x=Math.PI/2;powerButton.userData.interaction='computer-power';
    lamp(g,-1.35,1.29,-.26,.65).userData.light&&(lamps.push(g.children[g.children.length-1]));plant(g,1.32,1.29,-.25,.47);
    cylinder(g,.085,.065,.16,-.9,1.4,.4,'#f4f1e5');
    // A padded task chair, leaving a reachable approach in front.
    const chair=group(g,0,0,1.05);cylinder(chair,.045,.05,.6,0,.35,0,'#9baab0');for(let i=0;i<5;i++){let a=i*1.256;rod(chair,[0,.12,0],[Math.sin(a)*.41,.08,Math.cos(a)*.41],.025,'#a5afb0');ellipsoid(chair,Math.sin(a)*.4,.075,Math.cos(a)*.4,.06,.07,.06,'#788d9c')}
    box(chair,.84,.16,.78,0,.72,0,'#e5e8df',.08);box(chair,.84,.85,.17,0,1.18,.35,'#e3e6df',.09);box(chair,.68,.36,.04,0,1.03,.25,'#c4d7df',.04);
    for(let x of [-.46,.46]){rod(chair,[x,.6,.17],[x,1,.1],.024,'#a5b4b7');box(chair,.095,.06,.52,x,1.02,-.02,'#e7e6db',.025)}g.userData.chair=chair;
  }
  if(item.kind==='shelf'){
    box(g,2.1,2.67,.065,0,1.37,-.23,'#c4ac87',.015);for(const xx of[-1.02,1.02])box(g,.075,2.75,.5,xx,1.37,0,'#ddc49c',.015);
    for(let i=0;i<5;i++){box(g,2.1,.075,.52,0,.13+i*.65,0,'#dfc9a5',.015);if(i<4){books(g,-.86,.18+i*.65,0,i===2?5:8);if(i%2===0){const p=plant(g,.65,.18+i*.65,0,.36); }else{for(let j=0;j<3;j++)box(g,.47,.075,.28,.56,.22+i*.65+j*.08,['#9db8c5','#e3dac6','#8aa3b8'][j],.009)}}}
    plant(g,-.66,2.77,0,.62);plant(g,.64,2.77,0,.45,'#b2c5cf');
  }
  if(item.kind==='nightstand'){
    box(g,.8,.67,.85,0,.38,0,'#e4dfd1',.035);box(g,.85,.07,.9,0,.76,0,'#f1e7d2',.025);box(g,.72,.02,.016,0,.37,.43,'#becbd1',0);box(g,.17,.027,.025,0,.53,.447,'#91a8b6',.008);const l=lamp(g,0,.8,-.1,.72);lamps.push(l);for(let i=0;i<2;i++)box(g,.28,.045,.34,.2,.82+i*.046,.16,['#9fb7c7','#e2cda8'][i],.009);
  }
  if(item.kind==='rug')makeRug(g);
  if(item.kind==='pouf'){
    ellipsoid(g,0,.34,0,.68,.35,.62,'#ccdce2');ellipsoid(g,0,.52,-.18,.57,.5,.41,'#dce6e7');box(g,.63,.12,.54,0,.55,.16,'#b2cedc',.07);for(let i=-1;i<=1;i++)box(g,.028,.015,.43,i*.19,.616,.15,'#cfdee5',.003);
  }
  if(item.kind==='plant')plant(g,0,0,0,1.32);
  if(item.kind==='whale')plush(g,0,.04,0,.9);
  if(item.kind==='basket'){
    box(g,.81,.54,.61,0,.28,0,'#c8b798',.08);for(let y=.08;y<.52;y+=.055)box(g,.825,.023,.625,0,y,0,y%2?'#d8c5a4':'#cdb997',.06);box(g,.7,.02,.5,0,.56,0,'#9a8b70',.04);box(g,.53,.18,.36,0,.57,.02,'#b2cdda',.06);box(g,.5,.14,.34,.03,.68,.05,'#e7e8dc',.05);
  }
  if(item.kind==='aquarium'){
    for(const xx of[-.43,.43])for(const zz of[-.25,.25])box(g,.065,.22,.065,xx,.11,zz,'#baa98c');
    box(g,1.04,.58,.62,0,.49,0,'#e5d7bd',.04);box(g,1.1,.065,.68,0,.81,0,'#f1e8d3');box(g,.02,.49,.013,0,.5,.316,'#c4bea8',.003);for(const xx of[-.07,.07])box(g,.025,.09,.022,xx,.58,.332,'#90a6a6',.005);
    box(g,1.06,.045,.63,0,.88,0,'#92b2bc');box(g,1.0,.045,.57,0,.917,0,'#e2d7b9');
    const water=box(g,1.0,.55,.55,0,1.22,0,mat('#9dd8dd',{transparent:true,opacity:.12,roughness:.12,depthWrite:false}),0);water.castShadow=false;
    const glass=mat('#d6f4ef',{transparent:true,opacity:.13,roughness:.1,depthWrite:false});for(const zz of[-.3,.3]){const p=box(g,1.06,.67,.012,0,1.23,zz,glass,0);p.castShadow=false}for(const xx of[-.53,.53]){const p=box(g,.012,.67,.6,xx,1.23,0,glass,0);p.castShadow=false;box(g,.025,.72,.025,xx,1.23,.3,'#c0d7d5',.005);box(g,.025,.72,.025,xx,1.23,-.3,'#c0d7d5',.005)}
    for(const zz of[-.3,.3])box(g,1.1,.045,.035,0,1.59,zz,'#e8ebdf',.008);
    const fish=[];for(let i=0;i<3;i++){const f=group(g),color=['#e8b775','#e5d6a7','#82b7c8'][i];ellipsoid(f,0,0,0,.105,.052,.037,color);const tail=group(f,-.10,0,0);const fin=mesh(tail,new T.ConeGeometry(.065,.10,3),mat(color),-.03,0,0);fin.rotation.z=Math.PI/2;fin.scale.z=.3;ellipsoid(f,.055,.015,.032,.008,.009,.006,'#345c70');ellipsoid(f,.055,.015,-.032,.008,.009,.006,'#345c70');f.userData.tail=tail;f.traverse(o=>o.castShadow=false);fish.push(f)}
    for(const xx of[-.37,.31])for(let i=0;i<4;i++){const leaf=ellipsoid(g,xx+(i-1.5)*.035,1.02+i*.022,-.16,.025,.13+i*.018,.012,['#84b19f','#a6c4ad'][i%2]);leaf.rotation.z=(i-1.5)*.18}
    for(let i=0;i<8;i++)ellipsoid(g,Math.sin(i*2.3)*.38,.955,Math.cos(i*2.3)*.18,.06,.026,.035,i%2?'#e7d8bd':'#b4bec0');
    const bubbles=[];const bubbleGeo=new T.SphereGeometry(.012,8,6),bubbleMat=new T.MeshBasicMaterial({color:'#e1f6f2',transparent:true,opacity:.5});for(let i=0;i<8;i++){const b=mesh(g,bubbleGeo,bubbleMat);b.castShadow=false;bubbles.push(b)}
    const food=group(g);food.visible=false;const pelletGeo=new T.SphereGeometry(.012,6,4),pelletMat=mat('#c3a478');for(let i=0;i<10;i++){const p=mesh(food,pelletGeo,pelletMat);p.castShadow=false}
    g.userData.aquarium={fish,bubbles,food,feeding:0};
  }
  g.visible=!item.stored;
  g.traverse(o=>{if(o.isMesh)o.userData.itemId=item.id});return g;
}
export function createShell(parent,lamps){
  const base=box(parent,10.35,.5,8.35,0,-.12,0,'#a4bbc9',.15);box(parent,10.1,.13,8.1,0,.16,0,mat('#ffffff',{map:woodTexture()}),.04);
  // The cutaway walls keep the room readable from the default view.
  wallWithOpenings(parent,{name:'inner-left-wall',x:-5.03,rotation:Math.PI/2,w:8.1,top:4.1,depth:.18,color:'#86a7ca',cladding:false,holes:[{x:2.55,y:2.56,w:1.8,h:1.48}]});
  wallWithOpenings(parent,{name:'inner-rear-wall',z:-4.02,w:10.1,top:4.1,depth:.18,color:'#94b5d3',cladding:false,holes:[{x:1.6,y:2.49,w:5.6,h:2.28}]});
  cottageWindow(parent,{name:'inner-side-window',x:-5.03,y:2.56,z:-2.55,w:1.8,h:1.48,rotation:Math.PI/2});
  box(parent,.13,.16,8.0,-4.91,.32,0,'#f1efdf',.015);box(parent,10,.16,.12,0,.32,-3.89,'#f2f1e4',.015);
  box(parent,.25,.12,8.25,-5.03,4.15,0,'#cfdfe7',.025);box(parent,10.25,.12,.25,0,4.15,-4.02,'#d6e5e9',.025);
  // Wide sea-facing window and sheer pleated curtains.
  cottageWindow(parent,{name:'sea-facing-window',x:1.6,y:2.49,z:-4.02,w:5.6,h:2.28,rotation:Math.PI,columns:3});
  rod(parent,[-1.43,3.79,-3.65],[4.63,3.79,-3.65],.035,'#d3c2a4');
  const curtains=[];for(let side of[-1,1]){const g=group(parent,side<0?-1.17:4.32,0,-3.64);for(let i=0;i<8;i++){const x=(i-3.5)*.09;const cur=box(g,.105,2.4,.08,x,2.44,Math.cos(i*Math.PI)*.04,i%2?'#f0f0e8':'#fffbef',.035);cur.castShadow=false}curtains.push(g)}
  frame(parent,-4.9,2.55,.4,.92,1.13,'whale',Math.PI/2);frame(parent,-4.9,2.55,1.78,.86,1.13,'sea',Math.PI/2);
  // Floating shelf and trailing greenery.
  box(parent,.38,.07,2.15,-4.7,3.37,1.1,'#e1d0b1',.02);plant(parent,-4.65,3.42,.4,.35);plant(parent,-4.65,3.42,1.6,.32);
  for(let i=0;i<13;i++){const yy=3.42-i*.06;ellipsoid(parent,-4.55,yy,1.94+Math.sin(i*.8)*.09,.05,.06,.06,i%2?'#86ad91':'#9db99a')}
  // Cozy wall clock.
  const clock=group(parent,-2.01,3.08,-3.86);const face=cylinder(clock,.27,.27,.055,0,0,0,'#f1ead5',40);face.rotation.x=Math.PI/2;rod(clock,[0,0,.04],[.13,.07,.04],.013,'#7990a4');rod(clock,[0,0,.045],[-.06,.16,.045],.011,'#7990a4');
  // Balcony deck, rails and a sliding glass door.
  box(parent,2.7,.38,4.65,6.35,-.04,-1.72,'#b4c8cf',.09);box(parent,2.7,.1,4.6,6.35,.2,-1.72,'#d6d9cd',.025);
  for(let i=0;i<16;i++)box(parent,2.65,.015,.014,6.35,.26,-3.88+i*.285,'#b9c2bc',0);
  for(let z of[-3.85,.45]){rod(parent,[5.05,1.42,z],[7.66,1.42,z],.045,'#efeee1');rod(parent,[5.05,.33,z],[7.66,.33,z],.03,'#eff0e6');for(let x=5.2;x<7.7;x+=.33)rod(parent,[x,.35,z],[x,1.41,z],.025,'#e7ebe6')}
  rod(parent,[7.66,1.42,-3.85],[7.66,1.42,.45],.045,'#eff0e7');for(let z=-3.7;z<.5;z+=.34)rod(parent,[7.66,.35,z],[7.66,1.41,z],.025,'#e8ede5');
  plant(parent,7.18,.26,-3.4,.9);plant(parent,7.18,.26,.02,.7,'#c0cec7');
  cylinder(parent,.4,.4,.065,6.55,.95,-2.95,'#eadbc0');cylinder(parent,.035,.06,.7,6.55,.6,-2.95,'#b2bdb8');cylinder(parent,.17,.19,.025,6.55,.3,-2.95,'#b2bdb8');cylinder(parent,.07,.06,.13,6.5,1.05,-2.95,'#f5eddd');
  const door=slidingDoor(parent);
  // Warm garland above the window.
  const cable=new T.CatmullRomCurve3([new T.Vector3(-1.3,3.98,-3.6),new T.Vector3(1.5,3.7,-3.58),new T.Vector3(4.5,3.98,-3.6)]);mesh(parent,new T.TubeGeometry(cable,35,.012,5,false),mat('#b9b8a0'));const bulbs=[];for(let i=0;i<13;i++){const p=cable.getPoint(i/12);const bulb=ellipsoid(parent,p.x,p.y-.045,p.z,.035,.05,.035,mat('#fff5d5',{emissive:'#ffd49b',emissiveIntensity:.55}));bulbs.push(bulb)}
  const windowPanes=[];parent.traverse(o=>{if(o.userData.windowPane)windowPanes.push(o)});
  return{door,curtains,bulbs,base,windowPanes};
}
