import * as T from 'three';
import {group,box,ellipsoid,cylinder,rod,mesh,mat,canvasTexture} from './objects.js';

const cream='#f5edda',sage='#b6c8b3',oak='#d7ba92',blue='#92b3c1',metal='#9eafb0';
function tag(object,action){object.traverse(n=>{if(n.isMesh)n.userData.interaction=action});return object}
function ring(parent,r,tube,x,y,z,color){const m=mesh(parent,new T.TorusGeometry(r,tube,8,32),mat(color),x,y,z);m.rotation.x=Math.PI/2;return m}
function label(parent,text,x,y,z,w,h,color='#6b8e8b'){
  const texture=canvasTexture((c,cw,ch)=>{c.fillStyle='#f8f4e7';c.fillRect(0,0,cw,ch);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='600 37px sans-serif';text.split('\n').forEach((s,i,a)=>c.fillText(s,cw/2,ch/2+(i-(a.length-1)/2)*44))},256,128);
  return mesh(parent,new T.PlaneGeometry(w,h),mat('#fff',{map:texture}),x,y,z);
}
function cup(parent,x,y,z,color=blue,scale=1){const g=group(parent,x,y,z);g.scale.setScalar(scale);cylinder(g,.09,.07,.14,0,.07,0,color);cylinder(g,.074,.074,.006,0,.143,0,'#796953');const handle=mesh(g,new T.TorusGeometry(.048,.012,8,20),mat(color),.09,.08,0);return g}
function plate(parent,x,y,z,r=.23){cylinder(parent,r,r*.85,.025,x,y,z,cream);ring(parent,r*.88,.008,x,y+.016,z,blue)}
function food(parent,id,x,y,z,s=1){
  const g=group(parent,x,y,z);g.scale.setScalar(s);g.userData.foodId=id;
  if(id==='milk'||id==='juice'){const color=id==='milk'?'#e8eee0':'#e6b776';cylinder(g,.085,.095,.28,0,.15,0,color);cylinder(g,.04,.08,.055,0,.315,0,color);cylinder(g,.043,.043,.025,0,.35,0,id==='milk'?sage:'#e5d3a2');label(g,id==='milk'?'MILK':'ORANGE',0,.17,.092,.14,.10)}
  if(id==='yogurt'||id==='icecream'){cylinder(g,.09,.07,.13,0,.075,0,id==='yogurt'?'#bcd6df':'#d7c3d8');cylinder(g,.095,.095,.015,0,.15,0,cream);label(g,id==='yogurt'?'YOGURT':'VANILLA',0,.08,.084,.13,.055)}
  if(id==='eggs'){ellipsoid(g,0,.065,0,.043,.062,.042,'#ebd6b8')}
  if(id==='apple'){ellipsoid(g,0,.07,0,.075,.072,.071,'#d78675');rod(g,[0,.12,0],[.012,.16,.006],.008,'#957c59');const leaf=ellipsoid(g,.025,.145,0,.03,.008,.017,sage);leaf.rotation.z=.4}
  if(id==='strawberry'){const berry=cylinder(g,.065,.02,.105,0,.06,0,'#d78786',12);for(let i=0;i<6;i++){const a=i*Math.PI/3;ellipsoid(g,Math.cos(a)*.041,.071,Math.sin(a)*.041,.006,.008,.006,'#f1d6a2');const leaf=ellipsoid(g,Math.cos(a)*.024,.115,Math.sin(a)*.024,.025,.006,.012,'#8da989');leaf.rotation.y=-a}}
  if(id==='cheese'){box(g,.18,.09,.13,0,.05,0,'#e9c674',.025);for(const[x,yy]of[[-.04,.03],[.04,.06]])ellipsoid(g,x,yy,.066,.019,.017,.004,'#d8ae60')}
  if(id==='carrot'){const carrot=cylinder(g,.042,.007,.23,0,.12,0,'#de9f6b',12);carrot.rotation.z=.7;for(let i=0;i<3;i++)rod(g,[-.07,.21,0],[-.09+(i-1)*.035,.29,.01],.012,'#8caa85')}
  if(id==='greens'){for(let i=0;i<7;i++){const a=i*2.4;const leaf=ellipsoid(g,Math.cos(a)*.045,.07+Math.sin(i)*.02,Math.sin(a)*.035,.055,.09,.032,['#8fae88','#b8c997','#a1bb8f'][i%3]);leaf.rotation.z=Math.sin(a)*.5}}
  if(id==='fish'){ellipsoid(g,0,.04,0,.14,.035,.055,'#a0bdc7');const tail=mesh(g,new T.ConeGeometry(.063,.09,3),mat('#809eab'),.14,.04,0);tail.rotation.z=-Math.PI/2;ellipsoid(g,-.085,.065,.026,.009,.009,.009,'#466779');rod(g,[-.01,.067,0],[.06,.07,0],.006,'#c8d9dc')}
  if(id==='shrimp'){const shrimp=mesh(g,new T.TorusGeometry(.055,.018,8,18,Math.PI*1.6),mat('#dda594'),0,.035,0);shrimp.rotation.x=Math.PI/2;for(let i=0;i<3;i++)ellipsoid(g,-.045-i*.01,.025,-.03,.014,.009,.032,'#e9c4aa')}
  return g;
}

export function makeKitchen(parent,floorY){
  const root=group(parent,0,floorY,0);root.name='attic-kitchen';
  const counter=group(root,-1.25,0,-3.25);counter.name='kitchen-counter';
  box(counter,2.8,.86,1.02,0,.48,0,sage,.06);box(counter,2.9,.085,1.1,0,.96,0,cream,.035);box(counter,2.67,.08,.92,0,.09,0,'#8da18c',.01);
  for(const x of[-.92,0,.92]){box(counter,.84,.65,.045,x,.49,.535,'#c3d1be',.025);rod(counter,[x-.15,.69,.573],[x+.15,.69,.573],.017,'#a48d6d')}
  // An inset sink, dish drainer and an arched tap under the low roof.
  box(counter,.7,.025,.64,-.8,1.009,0,metal,.09);box(counter,.54,.025,.46,-.8,1.025,0,'#718e97',.08);cylinder(counter,.028,.028,.012,-.8,1.043,0,'#bfc7c3');
  const faucet=group(counter,-.8,1,-.29);const arch=mesh(faucet,new T.TorusGeometry(.14,.021,8,24,Math.PI),mat(metal),0,.19,0);rod(faucet,[-.14,0,0],[-.14,.19,0],.022,metal);rod(faucet,[.14,.19,0],[.14,.13,0],.022,metal);tag(faucet,'sink');
  const water=rod(counter,[-.66,1.13,-.29],[-.66,1.04,-.29],.013,'#a5dbe3');water.material=new T.MeshBasicMaterial({color:'#a9e0e8',transparent:true,opacity:.65});water.visible=false;water.castShadow=false;
  for(let i=0;i<3;i++){const dish=cylinder(counter,.13,.13,.016,-1.2+i*.07,1.14,.12,cream);dish.rotation.z=Math.PI/2;ring(counter,.13,.008,-1.2+i*.07,1.13,.12,blue).rotation.z=Math.PI/2}
  // Two burners, a pot with a removable lid, a pan and a small chopping board.
  box(counter,.84,.025,.7,.37,1.015,-.02,'#5f777b',.045);for(const x of[.13,.61]){cylinder(counter,.14,.14,.018,x,1.038,-.03,'#334e58');ring(counter,.11,.008,x,1.055,-.03,'#93adb4')}
  const pot=group(counter,.12,1.05,-.03);cylinder(pot,.14,.12,.19,0,.10,0,'#b0c6c2');ring(pot,.145,.014,0,.20,0,cream);for(const side of[-1,1])rod(pot,[side*.14,.14,0],[side*.23,.14,0],.025,'#a18b6a');
  const lid=group(pot,0,.22,0);ellipsoid(lid,0,0,0,.147,.026,.147,cream);cylinder(lid,.034,.03,.03,0,.04,0,'#a18b6a');
  const pan=group(counter,.63,1.06,-.04);cylinder(pan,.14,.11,.035,0,.02,0,'#7a8f90');rod(pan,[.11,.03,0],[.38,.04,.12],.025,oak);
  const board=box(counter,.4,.028,.34,1.05,1.02,.08,oak,.05);box(counter,.19,.012,.035,1.06,1.05,.08,'#a9b5b1',.003);box(counter,.1,.015,.035,1.20,1.05,.08,'#7c9b8d',.007);
  const crock=group(counter,.96,1.02,-.30);cylinder(crock,.073,.061,.17,0,.085,0,cream);for(let i=0;i<3;i++){const utensil=group(crock,(i-1)*.038,.14,0);utensil.rotation.z=(i-1)*.15;rod(utensil,[0,0,0],[0,.25,0],.01,oak);ellipsoid(utensil,0,.26,0,.035,.045,.014,i===1?'#a5b9af':oak)}
  cup(counter,-.3,1.01,.32,blue,.85);tag(counter,'cook');tag(faucet,'sink');
  const steam=group(counter,.12,1.42,-.03);const steamMaterial=new T.MeshBasicMaterial({color:'#fff9e4',transparent:true,opacity:.28,depthWrite:false});for(let i=0;i<5;i++){const p=ellipsoid(steam,0,0,0,.035,.10,.035,steamMaterial.clone());p.castShadow=false}steam.visible=false;

  // Open cavity, real shelves, door bins and individually selectable food models.
  const fridge=group(root,1.05,0,-3.2);fridge.name='mini-fridge';
  box(fridge,1.14,.09,1.06,0,.085,0,'#acc1b2',.045);box(fridge,1.14,.075,1.06,0,1.515,0,sage,.035);
  for(const x of[-.54,.54])box(fridge,.075,1.42,1.06,x,.8,0,sage,.03);
  box(fridge,1.05,1.36,.07,0,.8,-.49,cream,.02);box(fridge,.97,1.32,.025,0,.80,-.448,'#e7eee1',.01);
  const inside=group(fridge);inside.name='fridge-contents';
  for(const y of[.17,.54,.9,1.26]){box(inside,.99,.025,.88,0,y,.015,'#dbe9e0',.012);box(inside,1,.028,.025,0,y,.45,'#f8f6e7',.005)}
  const foodGroups=new Map(),add=(id,node)=>{if(!foodGroups.has(id))foodGroups.set(id,[]);foodGroups.get(id).push(node);return node};
  add('milk',food(inside,'milk',-.32,.92,-.02,.88));add('juice',food(inside,'juice',-.03,.92,-.08,.88));add('yogurt',food(inside,'yogurt',.30,.92,.16,1.05));
  plate(inside,-.25,.56,.03,.21);add('fish',food(inside,'fish',-.25,.58,.03,1.15));plate(inside,.25,.56,.04,.20);for(let i=0;i<3;i++)add('shrimp',food(inside,'shrimp',.16+i*.08,.58,.06+(i%2)*.07,.75));
  box(inside,.93,.15,.78,0,.255,.03,mat('#d3e3d0',{transparent:true,opacity:.48,depthWrite:false}),.035);
  for(let i=0;i<3;i++){add('greens',food(inside,'greens',-.32+i*.11,.20,-.05,1.0));add('carrot',food(inside,'carrot',.16+i*.09,.20,.02,.85))}
  for(let i=0;i<3;i++)add('icecream',food(inside,'icecream',(i-1)*.25,1.28,.04,.95));
  label(inside,'FROZEN',0,1.30,.455,.28,.055,'#94a5b4');
  const glow=box(inside,.72,.018,.44,0,1.46,-.02,new T.MeshStandardMaterial({color:'#fff7d6',emissive:'#fff4c8',emissiveIntensity:.8}),.008);glow.castShadow=false;
  const fridgeLight=new T.PointLight('#fff2d3',0,2.5,2);fridgeLight.position.set(0,1.3,.25);fridge.add(fridgeLight);
  const hinge=group(fridge,.565,0,.54);hinge.name='fridge-door-hinge';
  const door=group(hinge,-.565,0,0);box(door,1.13,1.43,.105,0,.79,0,'#c4d5c2',.07);box(door,1.0,1.29,.025,0,.79,-.067,cream,.035);
  rod(door,[-.37,.76,.105],[-.37,1.10,.105],.026,'#a18c6d');label(door,'DAYU\nFRESH & HAPPY',0,1.27,.056,.43,.19);
  const magnet=box(door,.12,.11,.012,.31,1.12,.06,blue,.015);magnet.rotation.z=.16;
  const doorFoods=group(door);doorFoods.name='fridge-door-food';
  for(const y of[.24,.66,1.08]){box(doorFoods,.9,.04,.22,0,y,-.18,cream,.015);box(doorFoods,.9,.09,.025,0,y+.055,-.29,mat('#d7e5d5',{transparent:true,opacity:.55,depthWrite:false}),.015)}
  for(let i=0;i<6;i++)add('eggs',food(doorFoods,'eggs',-.31+(i%3)*.12,.27,-.15-Math.floor(i/3)*.08,.8));
  for(let i=0;i<2;i++)add('apple',food(doorFoods,'apple',-.27+i*.17,.69,-.18,.78));for(let i=0;i<3;i++)add('strawberry',food(doorFoods,'strawberry',.09+i*.10,.69,-.19,.7));
  for(let i=0;i<2;i++)add('cheese',food(doorFoods,'cheese',-.19+i*.28,1.11,-.19,.9));
  tag(fridge,'fridge');for(const[id,nodes]of foodGroups)nodes.forEach(n=>tag(n,'food:'+id));

  const table=group(root,0,0,.3);table.name='dining-table';box(table,1.4,.075,.9,0,.74,0,oak,.13);
  for(const x of[-.53,.53])for(const z of[-.3,.3])rod(table,[x,.04,z],[x*.9,.73,z*.9],.038,'#be9f77');
  for(const x of[-1.02,1.02]){const stool=group(table,x,0,0);cylinder(stool,.23,.21,.09,0,.44,0,'#b4c7ba');for(let i=0;i<3;i++){const a=i*2.1;rod(stool,[Math.cos(a)*.15,.42,Math.sin(a)*.15],[Math.cos(a)*.19,.03,Math.sin(a)*.19],.027,oak)}}
  box(table,.51,.009,.82,0,.784,0,'#e6dfc7',.012);for(let i=0;i<5;i++)box(table,.012,.002,.82,-.20+i*.10,.790,0,'#c9d0b9',0);
  const settings=group(table);for(const x of[-.40,.40]){plate(settings,x,.81,.04,.18);cup(settings,x,.79,-.27,blue,.7);rod(settings,[x+.21,.81,-.11],[x+.21,.81,.16],.009,'#a2aeaa');ellipsoid(settings,x+.21,.81,-.15,.021,.008,.031,'#a2aeaa');for(const d of[0,.028])rod(settings,[x-.21+d,.81,-.1],[x-.21+d,.81,.20],.005,oak)}
  for(const x of[-.40,.40]){const profile=[[0,0],[.065,0],[.103,.025],[.115,.078],[.103,.078],[.091,.030],[.055,.013],[0,.013]].map(([r,y])=>new T.Vector2(r,y));mesh(settings,new T.LatheGeometry(profile,28),mat(cream),x,.837,.04)}
  const meal=group(table,0,.80,.03);const dishGroups=new Map();
  const berry=group(meal);cylinder(berry,.13,.10,.16,0,.08,0,blue);cylinder(berry,.12,.12,.008,0,.167,0,'#f9f1df');for(let i=0;i<3;i++)food(berry,'strawberry',Math.sin(i*2)*.065,.17,Math.cos(i*2)*.06,.65);dishGroups.set('berry',berry);
  const omelette=group(meal);plate(omelette,0,.015,0,.22);ellipsoid(omelette,0,.04,0,.17,.018,.13,'#f8eed7');ellipsoid(omelette,0,.058,0,.068,.018,.062,'#efc16b');food(omelette,'greens',.12,.045,.08,.46);dishGroups.set('omelette',omelette);
  const soup=group(meal);cylinder(soup,.19,.13,.12,0,.06,0,blue);cylinder(soup,.175,.175,.009,0,.126,0,'#dbbf8e');for(let i=0;i<5;i++)ellipsoid(soup,Math.sin(i*2.4)*.10,.136,Math.cos(i*2.4)*.10,.032,.009,.024,i%2?'#99b68c':'#e2aa7b');dishGroups.set('soup',soup);tag(table,'table');
  let open=false,opening=0,cooking=false,tapTime=0;
  return{root,fridge,hinge,inside,doorFoods,foodGroups,counter,table,settings,meal,fridgeLight,steam,
    get open(){return open},get opening(){return opening},get cooking(){return cooking},get tapTime(){return tapTime},
    setFridge(value){open=!!value},setCooking(value){cooking=!!value;steam.visible=cooking},
    setTable(value,dish){settings.visible=!!value;for(const[id,node]of dishGroups)node.visible=id===dish;meal.visible=!!dish},
    setStock(stock){for(const[id,nodes]of foodGroups)nodes.forEach((n,i)=>n.visible=(stock[id]??0)>0&&i<stock[id])},
    rinse(){tapTime=3.5;water.visible=true},
    update(dt,time){opening=T.MathUtils.damp(opening,open?1:0,5,dt);hinge.rotation.y=opening*1.92;inside.visible=opening>.025;doorFoods.visible=opening>.025;fridgeLight.intensity=opening*.65;lid.position.y=T.MathUtils.damp(lid.position.y,cooking?.28:.22,5,dt);lid.rotation.z=cooking?Math.sin(time*7)*.035:0;
      steam.children.forEach((p,i)=>{const t=(time*.45+i/5)%1;p.position.set(Math.sin(time+i)*.035,t*.6,Math.cos(i)*.03);p.material.opacity=(1-t)*.27;p.scale.set(.035+t*.04,.08+t*.08,.035+t*.04)});tapTime=Math.max(0,tapTime-dt);water.visible=tapTime>0;water.material.opacity=.5+Math.sin(time*17)*.1;
    }
  };
}
