import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/RoundedBoxGeometry.js';

const materials=new Map();
function material(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.72}));return materials.get(color)}
function block(g,w,h,d,x,y,z,color,r=.012){const m=new T.Mesh(r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new T.BoxGeometry(w,h,d),typeof color==='string'?material(color):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m}
function ring(g,w,h,t,d,z,color){for(const x of[-1,1])block(g,t,h,d,x*(w-t)/2,0,z,color);for(const y of[-1,1])block(g,w-2*t,t,d,0,y*(h-t)/2,z,color)}
const cream='#f3eddd',edge='#d8cfbb',seal='#66848e',brass='#b6a077';

// All wall segments and siding use the same apertures as the joinery.
export function wallWithOpenings(parent,{name,x=0,z=0,rotation=0,w=10.4,bottom=.2,top=4.16,depth=.24,color='#e4e8df',holes=[],cladding=true}){
  const g=new T.Group();g.name=name;g.position.set(x,0,z);g.rotation.y=rotation;parent.add(g);
  g.userData.apertures=holes.map(h=>({...h}));
  const xs=[-w/2,w/2,...holes.flatMap(h=>[h.x-h.w/2,h.x+h.w/2])].sort((a,b)=>a-b);
  const ys=[bottom,top,...holes.flatMap(h=>[h.y-h.h/2,h.y+h.h/2])].filter(y=>y>=bottom-1e-5&&y<=top+1e-5).sort((a,b)=>a-b);
  const inside=(x,y)=>holes.some(h=>Math.abs(x-h.x)<h.w/2-1e-6&&Math.abs(y-h.y)<h.h/2-1e-6);
  for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const sw=xs[i]-xs[i-1],sh=ys[j]-ys[j-1],cx=(xs[i]+xs[i-1])/2,cy=(ys[j]+ys[j-1])/2;
    if(sw<1e-5||sh<1e-5||inside(cx,cy))continue;
    const solid=block(g,sw,sh,depth,cx,cy,0,color,0);solid.userData.wallSolid=true;
  }
  if(cladding)for(let y=bottom+.18;y<top-.03;y+=.22)for(let i=1;i<xs.length;i++){
    const sw=xs[i]-xs[i-1],cx=(xs[i]+xs[i-1])/2;if(sw<1e-5||inside(cx,y))continue;
    block(g,sw,.009,.012,cx,y,depth/2+.005,'#c4d1cc',0);
  }
  return g;
}

function pane(g,w,h,x,y,z){
  const m=new T.MeshPhysicalMaterial({color:'#b9d6dc',roughness:.12,metalness:.05,transparent:true,opacity:.33,depthWrite:false,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.65,emissive:'#e7c391',emissiveIntensity:0});
  const p=new T.Mesh(new T.PlaneGeometry(w,h),m);p.position.set(x,y,z);p.userData.windowPane=true;p.castShadow=false;g.add(p);return p;
}

export function cottageWindow(parent,{name,x=0,y=2.15,z=0,w=2,h=2,rotation=0,columns=2}){
  const g=new T.Group();g.name=name;g.position.set(x,y,z);g.rotation.y=rotation;parent.add(g);
  // Reveal, exterior casing and inner casing surround empty space, never a backing board.
  ring(g,w,h,.075,.29,0,edge);ring(g,w+.18,h+.18,.095,.07,.185,cream);ring(g,w+.10,h+.10,.065,.045,-.16,cream);
  ring(g,w-.15,h-.15,.022,.04,.142,seal);ring(g,w-.19,h-.19,.043,.055,.17,'#f8f2e5');
  const clearW=w-.29,clearH=h-.29;
  pane(g,clearW,clearH,0,0,.11);
  for(let i=1;i<columns;i++)block(g,.064,clearH,.075,-clearW/2+clearW*i/columns,0,.18,cream,.008);
  block(g,clearW,.057,.075,0,.02,.18,cream,.008);
  // A shallow sloped sill, underside drip groove and a little rain cap.
  const sill=block(g,w+.34,.11,.47,0,-h/2-.055,.13,'#ded2bb',.018);sill.rotation.x=.045;
  block(g,w+.26,.028,.045,0,-h/2-.12,.31,'#b8b6a8',.006);
  block(g,w+.27,.055,.25,0,h/2+.115,.17,cream);
  for(let i=0;i<columns;i++){const hx=-clearW/2+clearW*(i+.5)/columns;block(g,.1,.028,.034,hx,-.055,.235,brass,.008);block(g,.025,.07,.045,hx,-.035,.226,brass,.008)}
  return g;
}

export function cottageDoor(parent,{x,y=.2,z,w=1.58,h=3.02}){
  const g=new T.Group();g.name='front-door';g.position.set(x,y+h/2,z);parent.add(g);
  ring(g,w+.18,h+.16,.105,.12,.17,cream);ring(g,w,h,.045,.22,.005,seal);
  const leaf=new T.Group();leaf.position.set(0,-h/2,.055);g.add(leaf);
  const blue='#608ba6',light='#86a8bb',dark='#527b92',glazingBottom=1.38,glazingTop=2.81;
  for(const side of[-1,1])block(leaf,.14,h-.08,.13,side*(w-.22)/2,h/2,0,blue,.018);
  block(leaf,w-.2,1.28,.13,0,.68,0,blue,.018);block(leaf,w-.2,.15,.13,0,h-.13,0,blue);
  block(leaf,w-.2,.12,.14,0,glazingBottom-.04,0,blue);
  for(const cy of[.39,.92]){block(leaf,w-.39,.37,.035,0,cy,.083,dark,.015);block(leaf,w-.45,.30,.035,0,cy,.104,blue,.015);block(leaf,w-.43,.018,.028,0,cy+.17,.11,light,.005)}
  const glassH=glazingTop-glazingBottom,glassY=(glazingBottom+glazingTop)/2,glassW=w-.43;
  const lightFrame=new T.Group();lightFrame.position.set(0,glassY,.06);leaf.add(lightFrame);ring(lightFrame,glassW+.07,glassH+.07,.04,.045,.04,'#d9e4df');
  pane(leaf,glassW,glassH,0,glassY,.045);
  for(const xx of[-1,1])block(leaf,.028,glassH,.045,xx*glassW/6,glassY,.105,'#e5e9da',.006);
  const hx=w/2-.22;block(leaf,.085,.31,.034,hx,1.15,.12,brass,.018);block(leaf,.22,.045,.055,hx-.065,1.21,.165,brass,.015);block(leaf,.022,.045,.01,hx,1.065,.144,'#5f6b6b',.006);
  for(const yy of[.4,1.52,2.63])block(leaf,.045,.15,.05,-w/2+.065,yy,.11,brass,.009);
  block(leaf,w-.24,.065,.025,0,.10,.09,'#9eafac',.008);
  block(g,w+.12,.065,.38,0,-h/2+.015,.085,'#b8bcb0',.012);
  g.traverse(o=>{if(o.isMesh)o.userData.interaction='enter'});return g;
}

export function porchLantern(parent,x,y,z){
  const g=new T.Group();g.name='porch-lantern';g.position.set(x,y,z);parent.add(g);
  const metal='#587581';block(g,.13,.35,.07,0,.06,0,metal,.018);block(g,.045,.045,.30,0,.18,.15,metal);
  block(g,.34,.065,.30,0,.29,.3,metal,.02);block(g,.3,.045,.26,0,-.18,.3,metal,.018);
  for(const xx of[-.13,.13])for(const zz of[.19,.41])block(g,.025,.44,.025,xx,.055,zz,metal,.006);
  const glass=new T.MeshStandardMaterial({color:'#e4e4cc',transparent:true,opacity:.24,roughness:.25,depthWrite:false});block(g,.24,.39,.20,0,.055,.3,glass,.008);
  const bulb=new T.Mesh(new T.SphereGeometry(.062,16,12),new T.MeshStandardMaterial({color:'#fff5d3',emissive:'#ffdc99',emissiveIntensity:.6}));bulb.position.set(0,.06,.3);g.add(bulb);g.userData.bulb=bulb;
  const light=new T.PointLight('#ffe0a3',0,5,2);light.position.set(0,.06,.45);g.add(light);g.userData.light=light;return g;
}

export function slidingDoor(parent){
  const fixed=new T.Group();fixed.name='balcony-door-frame';parent.add(fixed);
  for(const z of[-2.51,-.46])block(fixed,.16,3.25,.12,5.02,1.87,z,cream,.018);
  block(fixed,.19,.14,2.2,5.02,3.53,-1.49,cream,.018);block(fixed,.24,.065,2.2,5.02,.285,-1.49,'#b3c1bf');
  for(const x of[4.95,5.07])block(fixed,.022,.025,4.05,x,.323,-2.43,'#7d969a',.004);
  block(fixed,.10,.07,4.08,4.96,3.46,-2.42,'#9eafb0');
  const door=new T.Group();door.name='balcony-sliding-leaf';door.position.set(5.02,.29,-2.44);parent.add(door);
  for(const z of[.04,1.92]){block(door,.075,3.12,.075,0,1.58,z,'#c3d1d1');block(door,.026,3.04,.018,-.045,1.58,z+(z<1?.055:-.055),seal,.003)}
  for(const y of[.04,3.12])block(door,.075,.075,1.94,0,y,.98,cream);
  const p=pane(door,1.81,3.0,0,1.58,.98);p.rotation.y=Math.PI/2;p.material.opacity=.15;
  for(const x of[-.09,.09]){block(door,.03,.31,.035,x,1.55,1.78,'#91a9ad');for(const y of[1.4,1.7])block(door,.08,.032,.035,x/2,y,1.78,'#91a9ad')}
  door.traverse(o=>o.userData.balconyDoor=true);door.userData.balconyDoor=true;return door;
}
