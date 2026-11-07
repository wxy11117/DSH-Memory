import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceWalk} from '../room/src/motion.js';
const actor=()=>({x:0,z:0,speed:0,walkDistance:0,path:[{x:1,z:0},{x:1,z:2},{x:3,z:2}]});
test('visible one-second frames finish the same route as smooth frames within the action deadline',()=>{
  const slow=actor(),smooth=actor();let slowArrived=false;
  for(let i=0;i<20;i++){const step=advanceWalk(slow,1);slowArrived||=step.arrived;for(let j=0;j<20;j++)advanceWalk(smooth,.05)}
  assert.equal(slowArrived,true);assert.equal(slow.path.length,0);assert.equal(smooth.path.length,0);
  assert.deepEqual({x:slow.x,z:slow.z},{x:3,z:2});assert.ok(Math.abs(slow.walkDistance-smooth.walkDistance)<1e-9);
});
test('long suspended frame is bounded and non-finite dt cannot corrupt position',()=>{
  const a=actor();advanceWalk(a,Infinity);assert.equal(a.x,0);advanceWalk(a,600);
  assert.ok(a.walkDistance>0&&a.walkDistance<2);assert.ok(a.path.length>0);
});
