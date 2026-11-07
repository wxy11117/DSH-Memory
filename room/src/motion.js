import {walkable} from './core.js';

// Only remove grid corners when the entire replacement segment has body clearance.
export function smoothPath(start,path,items,balcony=false){
  if(!path)return null;
  const result=[];let from=start,index=0;
  while(index<path.length){let furthest=index-1;
    for(let end=index;end<path.length;end++){const p=path[end],n=Math.max(1,Math.ceil(Math.hypot(p.x-from.x,p.z-from.z)/.035));let clear=true;
      for(let i=1;i<=n;i++){if(!walkable(from.x+(p.x-from.x)*i/n,from.z+(p.z-from.z)*i/n,items,balcony)){clear=false;break}}
      if(!clear)break;furthest=end;
    }
    if(furthest<index)return null;
    const point=path[furthest];if(Math.hypot(point.x-from.x,point.z-from.z)>.001)result.push({...point});from=point;index=furthest+1;
  }
  return result;
}

export function advanceWalk(actor,dt){
  // Integrate long visible frames in small physics steps; low FPS must not slow walking time.
  let remaining=Number.isFinite(dt)?Math.max(0,Math.min(1,dt)):0,total=0,arrived=false;
  const before={x:actor.x,z:actor.z};
  while(remaining>1e-8){const step=Math.min(.05,remaining),result=advanceWalkStep(actor,step);remaining-=step;total+=result.distance;arrived=result.arrived;if(arrived)break}
  return{distance:total,dx:actor.x-before.x,dz:actor.z-before.z,arrived};
}
function advanceWalkStep(actor,dt){
  dt=Math.max(0,Math.min(.05,dt));const path=actor.path;
  if(!path.length){actor.speed=0;return{distance:0,dx:0,dz:0,arrived:false}}
  const previous={x:actor.x,z:actor.z};let remaining=0,from=previous;
  for(const p of path){remaining+=Math.hypot(p.x-from.x,p.z-from.z);from=p}
  const maximum=1.65,braking=5.8,acceleration=4.8;let desired=Math.min(maximum,Math.sqrt((braking*dt)**2+2*braking*remaining)-braking*dt);
  if(path.length>1){const a=path[0],b=path[1],dx=a.x-actor.x,dz=a.z-actor.z,d=Math.hypot(dx,dz),next=Math.hypot(b.x-a.x,b.z-a.z);if(d>.001&&next>.001){const alignment=(dx*(b.x-a.x)+dz*(b.z-a.z))/d/next;const cornerSpeed=maximum*(.55+.45*Math.max(0,alignment));desired=Math.min(desired,Math.sqrt(cornerSpeed**2+2*braking*d))}}
  const oldSpeed=actor.speed||0;actor.speed=oldSpeed+Math.max(-braking*dt,Math.min(acceleration*dt,desired-oldSpeed));
  let budget=(oldSpeed+actor.speed)*.5*dt,distance=0;
  while(path.length){const p=path[0],dx=p.x-actor.x,dz=p.z-actor.z,d=Math.hypot(dx,dz);if(d<.00001){actor.x=p.x;actor.z=p.z;distance+=d;path.shift();continue}if(budget<=0)break;
    const step=Math.min(d,budget);actor.x+=dx/d*step;actor.z+=dz/d*step;distance+=step;budget-=step;
    if(step===d){actor.x=p.x;actor.z=p.z;path.shift()}else break;
  }
  actor.walkDistance=(actor.walkDistance||0)+distance;
  if(!path.length)actor.speed=0;
  return{distance,dx:actor.x-previous.x,dz:actor.z-previous.z,arrived:!path.length};
}
