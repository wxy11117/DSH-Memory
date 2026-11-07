export const STORAGE_KEY = 'dayu.seaside.room.v1';
export const CATALOG = [
  {id:'bed',name:'云朵小床',kind:'bed',x:-3.15,z:-.25,w:2.65,d:4.1,rotation:0,stored:false},
  {id:'desk',name:'海景电脑桌',kind:'desk',x:1.65,z:-3.05,w:3.4,d:1.35,rotation:0,stored:false},
  {id:'shelf',name:'海风书架',kind:'shelf',x:-3.45,z:-3.62,w:2.1,d:.5,rotation:0,stored:false},
  {id:'nightstand',name:'床头小柜',kind:'nightstand',x:-1.1,z:-2.05,w:.8,d:.85,rotation:0,stored:false},
  {id:'rug',name:'鲸鱼地毯',kind:'rug',x:.65,z:1.35,w:3.5,d:2.85,rotation:0,stored:false,passable:true},
  {id:'pouf',name:'软软懒人椅',kind:'pouf',x:3.45,z:1.85,w:1.35,d:1.25,rotation:0,stored:false},
  {id:'plant',name:'海岛绿植',kind:'plant',x:-4.12,z:2.9,w:.7,d:.7,rotation:0,stored:false},
  {id:'whale',name:'鲸鱼抱枕',kind:'whale',x:.4,z:1.7,w:.8,d:.55,rotation:0,stored:false,passable:true},
  {id:'basket',name:'藤编收纳篮',kind:'basket',x:4.15,z:3.15,w:.85,d:.65,rotation:0,stored:false},
  {id:'aquarium',name:'小鱼的玻璃屋',kind:'aquarium',x:-2.55,z:3.1,w:1.1,d:.68,rotation:0,stored:false},
];
export const DEFAULTS={version:1,weather:'sunny',time:'afternoon',temperature:24,realTime:false,balcony:false,auto:false,lamps:false,sound:false,curtainsOpen:true,careCount:0,feedCount:0,heaterOn:false,heaterTarget:24,furniture:CATALOG.map(i=>({...i}))};
export function freshState(){return structuredClone(DEFAULTS)}
export function dimensions(item){return Math.abs(item.rotation%Math.PI)>.1?[item.d,item.w]:[item.w,item.d]}
export function inBounds(x,z,balcony=false,pad=.18){
  if(x>=-4.8+pad&&x<=4.8-pad&&z>=-3.82+pad&&z<=3.8-pad)return true;
  if(!balcony)return false;
  if(x>4.5&&x<5.3&&z>-2.38+pad&&z<-.6-pad)return true;
  return x>=5.15&&x<=7.45-pad&&z>=-3.6+pad&&z<=.48-pad;
}
export function walkable(x,z,items,balcony=false,pad=.23){
  if(!inBounds(x,z,balcony,pad))return false;
  return !items.some(i=>{if(i.stored||i.passable)return false;const[w,d]=dimensions(i);return Math.abs(x-i.x)<w/2+pad&&Math.abs(z-i.z)<d/2+pad});
}
export function canPlace(item,items){
  const[w,d]=dimensions(item);
  if(item.x-w/2< -4.7||item.x+w/2>4.65||item.z-d/2< -3.9||item.z+d/2>3.7)return false;
  // Keep the balcony threshold accessible.
  if(!item.passable&&item.x+w/2>4.05&&item.z-d/2<-.55&&item.z+d/2> -2.45)return false;
  return !items.some(other=>{if(other.id===item.id||other.stored||other.passable||item.passable)return false;const[ow,od]=dimensions(other);return Math.abs(item.x-other.x)<(w+ow)/2+.04&&Math.abs(item.z-other.z)<(d+od)/2+.04});
}
export function findPath(start,goal,items,balcony=false){
  const step=.2,x0=-4.6,z0=-3.6,nx=61,nz=37;
  const key=(x,z)=>z*nx+x;
  const point=k=>({x:x0+(k%nx)*step,z:z0+Math.floor(k/nx)*step});
  const grid=p=>({x:Math.max(0,Math.min(nx-1,Math.round((p.x-x0)/step))),z:Math.max(0,Math.min(nz-1,Math.round((p.z-z0)/step)))});
  const target=grid(goal), origin=grid(start);
  if(!walkable(goal.x,goal.z,items,balcony))return null;
  const startKey=key(origin.x,origin.z),goalKey=key(target.x,target.z);
  if(!walkable(point(goalKey).x,point(goalKey).z,items,balcony))return null;
  const queue=[startKey],parents=new Map([[startKey,null]]);
  const valid=k=>{const p=point(k);return walkable(p.x,p.z,items,balcony)};
  for(let n=0;n<queue.length;n++){
    const k=queue[n];if(k===goalKey)break;
    const x=k%nx,z=Math.floor(k/nx);
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const xx=x+dx,zz=z+dz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;
      const next=key(xx,zz);if(parents.has(next)||!valid(next))continue;
      if(dx&&dz&&(!valid(key(x+dx,z))||!valid(key(x,z+dz))))continue;
      parents.set(next,k);queue.push(next);
    }
  }
  if(!parents.has(goalKey))return null;
  const path=[];let k=goalKey;while(k!==null&&k!==startKey){path.push(point(k));k=parents.get(k)}
  path.reverse();path.push({x:goal.x,z:goal.z});return path;
}
export function localPoint(item,x,z){const c=Math.cos(item.rotation),s=Math.sin(item.rotation);return{x:item.x+x*c+z*s,z:item.z-x*s+z*c}}
export function interactionPoint(item){
  const points={bed:[1.7,.7],desk:[0,1.55],pouf:[-.95,0],aquarium:[.95,0]};
  const p=points[item.kind]||[0,1];return localPoint(item,...p);
}
export function validateSave(value){
  const state=freshState();if(!value||value.version!==1)return state;
  if(['sunny','cloudy','rainy','snowy'].includes(value.weather))state.weather=value.weather;
  if(['morning','afternoon','sunset','night'].includes(value.time))state.time=value.time;
  if(Number.isFinite(value.temperature))state.temperature=Math.max(-5,Math.min(35,value.temperature));
  for(const key of ['realTime','balcony','auto','lamps','curtainsOpen','heaterOn'])if(typeof value[key]==='boolean')state[key]=value[key];
  if(Number.isFinite(value.heaterTarget))state.heaterTarget=Math.max(16,Math.min(28,Math.round(value.heaterTarget)));
  if(Number.isFinite(value.careCount))state.careCount=Math.max(0,Math.floor(value.careCount));
  if(Number.isFinite(value.feedCount))state.feedCount=Math.max(0,Math.floor(value.feedCount));
  // Audio always starts muted until a user gesture.
  if(Array.isArray(value.furniture)){
    const proposed=CATALOG.map(base=>{
      const v=value.furniture.find(i=>i.id===base.id);
      if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.z))return{...base};
      const rotation=Number.isFinite(v.rotation)?((Math.round(v.rotation/(Math.PI/2))%4+4)%4)*Math.PI/2:0;
      return{...base,x:v.x,z:v.z,rotation,stored:!!v.stored};
    });
    // New furniture must never invalidate an existing saved arrangement.
    for(const item of proposed)if(!value.furniture.some(v=>v.id===item.id)&&!canPlace(item,proposed))item.stored=true;
    if(proposed.filter(i=>!i.stored).every(i=>canPlace(i,proposed)))state.furniture=proposed;
  }
  return state;
}
