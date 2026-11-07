import * as T from 'three';
import {makeCoast,groundHeight} from './coast.js';
import {wallWithOpenings,cottageWindow,cottageDoor,porchLantern} from './joinery.js';
import {makeKitchen} from './kitchen-model.js';
import {KITCHEN_ITEMS} from './kitchen-data.js';
import {group,box,ellipsoid,cylinder,rod,mesh,mat,plant,books,lamp,frame,makeRug,plush,canvasTexture,woodTexture} from './objects.js';

export const ATTIC_Y=4.48;
export const ATTIC_ITEMS=[{id:'loft-sofa',x:-2.6,z:-1.8,w:2.75,d:1.45},{id:'loft-shelf',x:-3.05,z:.7,w:.6,d:2.7},{id:'loft-telescope',x:2.8,z:-2.55,w:1.1,d:1.2},{id:'loft-chest',x:3.5,z:2.5,w:1.1,d:.8},{id:'loft-hatch',x:1.8,z:2.8,w:1.2,d:.8},...KITCHEN_ITEMS];
function tag(o,name){o.traverse(n=>{if(n.isMesh)n.userData.interaction=name});return o}
function gable(parent,z,back=false){const s=new T.Shape();s.moveTo(-5.12,4.19);s.lineTo(5.12,4.19);s.lineTo(0,6.85);s.closePath();const hole=new T.Path();hole.absarc(0,5.4,.62,0,Math.PI*2,true);s.holes.push(hole);const g=mesh(parent,new T.ExtrudeGeometry(s,{depth:.12,bevelEnabled:false}),mat('#e4e8df'),0,0,z);const ring=mesh(parent,new T.TorusGeometry(.65,.07,10,64),mat('#fff7e5'),0,5.4,z+(back?-.04:.16));const glass=mesh(parent,new T.CircleGeometry(.59,48),new T.MeshPhysicalMaterial({color:'#b9d6dc',side:T.DoubleSide,transparent:true,opacity:.33,roughness:.12,metalness:.05,clearcoat:1,depthWrite:false,emissive:'#e7c391',emissiveIntensity:0}),0,5.4,z+.05);glass.userData.windowPane=true;glass.castShadow=false;box(parent,.055,1.16,.16,0,5.4,z+.05,'#f6efdc');box(parent,1.16,.055,.16,0,5.4,z+.05,'#f6efdc');return g}

export function makeHouse(scene,lamps){
  const exterior=group(scene),roof=group(scene),attic=group(scene),yard=group(scene);const shade='#e6e9e0',trim='#faf3e4';
  box(exterior,10.12,.10,8.06,0,4.21,0,'#e2d7c1',.015);
  const frontWindows=[{x:-2.6,y:2.15,w:3.5,h:2.12},{x:.85,y:2.15,w:1.72,h:2.12}];
  wallWithOpenings(exterior,{name:'front-elevation',z:4.08,holes:[...frontWindows,{x:3.45,y:1.71,w:1.58,h:3.02}]});
  frontWindows.forEach((a,i)=>cottageWindow(exterior,{...a,z:4.08,name:'front-window-'+i,columns:i?2:3}));
  cottageDoor(exterior,{x:3.45,z:4.08});
  wallWithOpenings(exterior,{name:'left-elevation',x:-5.18,rotation:-Math.PI/2,w:8.2,holes:[{x:-2.55,y:2.56,w:1.8,h:1.48}]});
  cottageWindow(exterior,{name:'left-window',x:-5.18,y:2.56,z:-2.55,w:1.8,h:1.48,rotation:-Math.PI/2});
  wallWithOpenings(exterior,{name:'right-elevation',x:5.10,rotation:Math.PI/2,w:8.2,holes:[{x:1.49,y:1.91,w:2.18,h:3.42},{x:-2,y:2.24,w:1.62,h:1.8}]});
  cottageWindow(exterior,{name:'right-window',x:5.1,y:2.24,z:2,w:1.62,h:1.8,rotation:Math.PI/2});
  wallWithOpenings(exterior,{name:'rear-elevation',z:-4.13,rotation:Math.PI,holes:[{x:-1.6,y:2.49,w:5.6,h:2.28}]});
  // Corner boards bridge the wall joints; openings stay clear of the siding.
  for(const x of[-5.13,5.13])for(const z of[-4.04,4.08])box(exterior,.17,4.08,.17,x,2.17,z,trim,.015);
  box(exterior,2.2,.2,1.4,3.45,.06,4.86,'#c3c8c0',.06);box(exterior,2.5,.16,.55,3.45,-.03,5.72,'#d9d6c9',.04);box(exterior,2.7,.13,.5,3.45,-.10,6.18,'#ded9c9',.03);
  for(const z of[-4.05,4.05])box(exterior,10.3,.32,.18,0,-.04,z,'#b6bcb6',.025);
  for(const x of[-5.1,5.1])box(exterior,.18,.32,8.1,x,-.04,0,'#b6bcb6',.025);
  const porchLight=porchLantern(exterior,2.18,2.52,4.24);lamps.push(porchLight);
  const signTex=canvasTexture((c,w,h)=>{c.fillStyle='#f4efdf';c.fillRect(0,0,w,h);c.fillStyle='#6185a2';c.font='600 50px Georgia';c.textAlign='center';c.fillText('DAYU',w/2,77);c.font='20px sans-serif';c.fillText('SEASIDE COTTAGE',w/2,118)},256,160);box(exterior,1.5,.88,.1,3.45,3.8,4.22,'#d4c29d',.05);mesh(exterior,new T.PlaneGeometry(1.38,.76),mat('#fff',{map:signTex}),3.45,3.8,4.281);
  gable(roof,4.09);gable(roof,-4.24,true);
  const angle=Math.atan2(2.7,5.6),slope=Math.hypot(5.6,2.7);
  for(const side of[-1,1]){const wing=group(roof,side*2.8,5.5,0);wing.rotation.z=-side*angle;box(wing,slope,.18,9.2,0,0,0,'#587da8',.04);for(let z=-4.5;z<=4.5;z+=.37)box(wing,slope,.04,.028,0,.105,z,'#7799bb',.005);for(let x=-slope/2;x<=slope/2;x+=.57)box(wing,.025,.04,9.22,x,.12,0,'#6081a2',.005);for(const z of[-4.63,4.63])box(wing,slope+.12,.18,.17,0,0,z,trim,.03)}
  const ridge=cylinder(roof,.11,.11,9.35,0,6.86,0,'#7296b8');ridge.rotation.x=Math.PI/2;
  for(const side of[-1,1])box(roof,.16,.19,9.25,side*5.62,4.16,0,trim,.02);
  // Chimney and whale-shaped weather vane.
  box(roof,.65,1.3,.72,-2.6,6.08,-2.1,'#c5c6bd');box(roof,.79,.13,.84,-2.6,6.79,-2.1,trim);cylinder(roof,.16,.16,.35,-2.6,7.02,-2.1,'#718395');
  rod(roof,[0,6.9,-2.2],[0,7.65,-2.2],.025,'#73879a');const vane=plush(roof,0,7.53,-2.2,.37);vane.rotation.y=Math.PI/2;
  // Loft floor and a readable, usable reading nook under the roof structure.
  box(attic,10.05,.18,8.03,0,4.35,0,mat('#fff',{map:woodTexture()}),.025);box(attic,10.2,.14,8.2,0,4.21,0,'#e4d8be',.03);
  gable(attic,-4.1,true);for(const x of[-4.88,4.88])box(attic,.13,.55,8,x,4.7,0,'#bdcddd',.02);
  const atticBeams=[];for(const z of[-3.75,-2.1]){const beams=group(attic);rod(beams,[-4.7,4.7,z],[0,6.85,z],.055,'#d4bd96');rod(beams,[0,6.85,z],[4.7,4.7,z],.055,'#d4bd96');atticBeams.push(beams)}
  const sofa=group(attic,-2.6,4.48,-1.8);box(sofa,2.75,.36,1.45,0,.28,0,'#8caec5',.17);box(sofa,2.75,.67,.3,0,.7,-.59,'#abc8d6',.13);for(const x of[-1.3,1.3])box(sofa,.25,.52,1.4,x,.5,0,'#b4ccd7',.1);for(const x of[-.62,.62])box(sofa,1.11,.13,1.04,x,.53,.06,'#c7dce2',.07);const pillow=box(sofa,.6,.5,.18,-.75,.95,-.35,'#f0dfb7',.08);pillow.rotation.z=.2;plush(sofa,.7,.63,0,.55);tag(sofa,'loft-read');
  const bookcase=group(attic,-3.05,4.48,.7);bookcase.scale.y=.64;bookcase.rotation.y=Math.PI/2;for(const x of[-1.35,1.35])box(bookcase,.08,1.3,.55,x,.65,0,'#decaa8');for(let y of[.1,.7,1.3]){box(bookcase,2.8,.08,.6,0,y,0,'#e8d5b5');if(y<1.3){books(bookcase,-1.15,y+.045,0,14)}}plant(bookcase,1,1.34,0,.4);tag(bookcase,'loft-read');
  const rug=group(attic,.2,4.46,.6);makeRug(rug);rug.scale.set(1.15,1,1.15);
  const telescope=group(attic,2.8,4.48,-2.55);for(const a of[0,2.1,4.2]){rod(telescope,[0,.91,0],[Math.sin(a)*.45,.03,Math.cos(a)*.45],.035,'#bfab8b');ellipsoid(telescope,Math.sin(a)*.45,.03,Math.cos(a)*.45,.065,.035,.065,'#6d858b')}
  cylinder(telescope,.1,.13,.3,0,.83,0,'#769398');const telescopePivot=group(telescope,0,1.16,0);telescopePivot.rotation.x=.16;
  const tube=cylinder(telescopePivot,.16,.17,.98,0,0,0,'#f0e4c9');tube.rotation.x=Math.PI/2;
  for(const z of[-.37,.24]){const ring=cylinder(telescopePivot,.176,.176,.055,0,0,z,'#92aeb3');ring.rotation.x=Math.PI/2}
  const hood=cylinder(telescopePivot,.192,.192,.19,0,0,-.54,'#607e91');hood.rotation.x=Math.PI/2;
  const lens=mesh(telescopePivot,new T.CircleGeometry(.163,32),new T.MeshPhysicalMaterial({color:'#7dcbdc',metalness:.42,roughness:.1,clearcoat:1}),0,0,-.64);lens.rotation.y=Math.PI;
  const eye=cylinder(telescopePivot,.065,.065,.22,0,0,.57,'#4c667b');eye.rotation.x=Math.PI/2;rod(telescopePivot,[.17,-.02,.24],[.26,-.15,.35],.025,'#a68f69');ellipsoid(telescopePivot,.27,-.16,.36,.07,.05,.05,'#587280');tag(telescope,'telescope');
  const chest=box(attic,1.1,.7,.8,3.5,4.83,2.5,'#c3b091',.08);box(attic,1.16,.1,.84,3.5,5.21,2.5,'#ddccb0',.035);tag(chest,'souvenir');
  const hatch=box(attic,1.2,.05,.8,1.8,4.46,2.8,'#8d9b9d',.015);tag(hatch,'downstairs');for(let i=0;i<4;i++)box(attic,1.15,.026,.035,1.8,4.5,2.5+i*.2,'#d2bc96');
  const loftLamp=lamp(attic,-.82,5.48,-3.62,.55);lamps.push(loftLamp);tag(loftLamp,'lamp');
  const kitchen=makeKitchen(attic,ATTIC_Y);
  // The cottage stands on a continuous mainland coast with an inland entrance path.
  const coast=makeCoast(yard);
  for(let i=0;i<7;i++){const z=6.3+i*.48,x=3.45+Math.sin(i*.25)*.2;const p=ellipsoid(yard,x,groundHeight(x,z)+.025,z,.44,.035,.20,'#e7dfc9');p.rotation.y=Math.sin(i)*.1}
  for(const[x,z]of[[-7,4.9],[-8,-2.6],[9,5.7],[-13,2.8],[-10,11]]){const tree=group(yard,x,groundHeight(x,z),z);rod(tree,[0,0,0],[.1,2.1,0],.11,'#b29b7a');for(let i=0;i<7;i++){const a=i*2.4;ellipsoid(tree,Math.sin(a)*.45,1.8+(i%3)*.35,Math.cos(a)*.45,.63,.52,.62,['#79a68f','#97b9a0','#aec9a8'][i%3])}}
  for(const side of[-1,1]){for(let i=0;i<9;i++){const x=side<0?-7.6+i*.36:8.1+i*.24,z=side<0?6:2+i*.24;plant(yard,x,groundHeight(x,z),z,.3+i%3*.045,'#c4ba9f');for(let k=0;k<3;k++)ellipsoid(yard,x+Math.sin(k*2)*.1,.05+(i%3)*.03,z+Math.cos(k*2)*.1,.09,.055,.08,['#e4c3ce','#e9dcaf','#b6c7dc'][i%3])}}
  const fence=group(yard);for(let x=-8.5;x<1.7;x+=.55){box(fence,.08,1.03,.08,x,.31,7.05,'#eee9d9');}for(const y of[.16,.68])box(fence,10.6,.08,.08,-3.4,y,7.05,'#ece9db');
  const mailbox=group(yard,5.2,groundHeight(5.2,6.8),6.8);box(mailbox,.09,.9,.09,0,.45,0,'#d2bb95');box(mailbox,.48,.4,.65,0,1.05,0,'#6c94b0',.09);box(mailbox,.29,.025,.03,0,1.09,.34,'#e7eddf');tag(mailbox,'mailbox');
  exterior.visible=false;roof.visible=false;attic.visible=false;
  const windowPanes=[];exterior.traverse(o=>{if(o.userData.windowPane)windowPanes.push(o)});
  return{exterior,roof,attic,yard,windowPanes,coast,kitchen,atticBeams,telescope,telescopePivot};
}

export function enrichInterior(root,furniture,shell){
  const desk=furniture.get('desk'),shelf=furniture.get('shelf');
  const headphones=group(desk,1.65,.86,.17);const hoop=mesh(headphones,new T.TorusGeometry(.17,.025,10,28,Math.PI),mat('#526f8d'));hoop.rotation.z=.2;for(const x of[-.16,.16])ellipsoid(headphones,x,-.015,0,.055,.12,.065,'#7897b0');
  const notebook=box(desk,.4,.035,.31,-.8,1.33,.28,'#cdb5a0',.012);box(desk,.37,.014,.28,-.8,1.354,.28,'#f6f0df',.005);rod(desk,[-.95,1.37,.28],[-.65,1.37,.43],.011,'#7195ad');
  const shellTray=group(desk,.95,1.29,-.3);cylinder(shellTray,.16,.16,.025,0,.015,0,'#f6ebd2');for(let i=0;i<3;i++)ellipsoid(shellTray,(i-1)*.07,.07,0,.05,.04,.065,['#dcc0af','#f1dfcd','#d7c0d5'][i]);
  const player=box(shelf,.57,.3,.3,.52,2.27,.12,'#bcced5',.035);for(const x of[.35,.69]){const speaker=cylinder(shelf,.065,.065,.015,x,2.28,.28,'#6d869b');speaker.rotation.x=Math.PI/2}tag(player,'music');
  const stairs=group(root,-.4,.23,-1.8);for(const x of[-.28,.28])rod(stairs,[x,0,0],[x,4.15,-1.5],.035,'#d7c49f');for(let i=0;i<12;i++)rod(stairs,[-.28,i*.35,-i*.125],[.28,i*.35,-i*.125],.03,'#e6d6b4');tag(stairs,'upstairs');
  for(const curtain of shell.curtains)tag(curtain,'curtains');
  const chime=group(root,5.1,3.25,-.65);rod(chime,[0,0,0],[0,-.22,0],.008,'#a9a28c');ellipsoid(chime,0,-.28,0,.1,.1,.1,mat('#b4dbe0',{transparent:true,opacity:.65}));box(chime,.06,.25,.007,0,-.48,0,'#e4ca9e',.002);tag(chime,'chime');
  const musicLED=ellipsoid(player,.21,.065,.155,.013,.013,.005,new T.MeshBasicMaterial({color:'#7694a1'}));musicLED.userData.interaction='music';
  return{stairs,chime,player,musicLED};
}
