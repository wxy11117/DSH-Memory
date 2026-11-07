export function advanceTemperature(current,outdoor,target,on,balcony,dt){
  const ambient=Math.max(12,Math.min(30,outdoor+2)),goal=on?Math.max(ambient,target-(balcony?2:0)):ambient;
  return current+(goal-current)*(1-Math.exp(-Math.max(0,dt)*(on?.028:.008)));
}
