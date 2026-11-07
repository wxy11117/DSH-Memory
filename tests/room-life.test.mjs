import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRoomState,validateAction} from '../lib/room-state.mjs';
import {createRoomLife,validateLifeSettings} from '../lib/room-life.mjs';
import {ACTIONS,actionCatalog} from '../room/src/action-catalog.js';
import {mount,bind,api} from './helpers/room-host.mjs';
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-life-'));let now=new Date(2026,10,7,12).getTime(),binding='记忆空间1',available=true;
  const rooms=createRoomState(dir,{clock:()=>now}),space=binding,session='fish-a',messages=[];
  const agent={id:session,status:'idle',followup:message=>messages.push(message)};
  const bridge={getAgent:id=>id===session?agent:null,createMessage:body=>({id:randomUUID(),...body})};
  const life=createRoomLife({rooms,clock:()=>now,listSpaces:()=>[space],resolveSpace:()=>binding,getBridge:()=>available?bridge:null});
  let client=rooms.connect(space);
  const pulse=(visible=true)=>rooms.heartbeat(space,client.id,{visible});
  return{dir,rooms,life,space,session,messages,agent,bridge,pulse,
    enable:(extra={})=>life.configure(space,session,{enabled:true,confirmCosts:true,...extra}),
    disable:()=>life.configure(space,session,{enabled:false}),
    advance:ms=>{now+=ms;client=rooms.connect(space);pulse()},
    reconnect:()=>{client=rooms.connect(space)},
    bind:value=>{binding=value},available:value=>{available=value},
    get now(){return now},get client(){return client}};
}
test('catalog coordinates uniquely map all published actions and preserve vector receipts',()=>{
  assert.equal(new Set(ACTIONS.map(a=>a.vector.join(','))).size,ACTIONS.length);
  for(const item of ACTIONS){const result=validateAction({vector:item.vector,...(item.requires?{text:'留一张便签'}:{})});assert.equal(result.action,item.action);assert.deepEqual(result.vector,item.vector);assert.equal(result.vectorVersion,1)}
  assert.equal(actionCatalog().floors.length,2);
  assert.deepEqual(actionCatalog({floor:2,activity:2}).actions.map(a=>a.vector),[[2,2,1],[2,2,2],[2,2,3]]);
});
test('invalid, mixed, unknown and mismatched vector commands fail closed',()=>{
  for(const vector of [[],[1,1],[1,1,1,1],[1.1,1,1],['1',1,1],[3,1,1],[2,2,99]])assert.throws(()=>validateAction({vector}));
  for(const args of [{action:'light'}, {vectorVersion:2},{text:'多余'},{space:'other'}])assert.throws(()=>validateAction({vector:[1,1,1],...args}));
  assert.throws(()=>validateAction({vector:[1,4,2]}));assert.throws(()=>actionCatalog({activity:1}));assert.throws(()=>actionCatalog({floor:2,activity:9}));
});
test('autonomy is off by default and cost confirmation and bounded integer limits are required',async()=>{
  const f=fixture();f.pulse();await f.life.tick();assert.equal(f.messages.length,0);assert.equal(f.life.status(f.space).life.enabled,false);
  assert.throws(()=>f.life.configure(f.space,f.session,{enabled:true}),/确认/);
  for(const settings of [{intervalMinutes:1},{intervalMinutes:241},{dailyLimit:0},{dailyLimit:25},{dailyLimit:2.2},{enabled:true,sessionId:'other'}])assert.throws(()=>validateLifeSettings({enabled:true,confirmCosts:true,...settings}));
});
test('ordinary newly connected page is not considered visible before its first ready heartbeat',async()=>{
  const f=fixture();f.enable();await f.life.tick();assert.equal(f.messages.length,0);
  f.pulse();await f.life.tick();assert.equal(f.messages.length,1);
});
test('scheduler wakes only its bound idle session and creates one verifiable model message',async()=>{
  const f=fixture();f.enable();f.pulse();await f.life.tick();
  assert.equal(f.messages.length,1);const m=f.messages[0];assert.equal(m.source.kind,'hippocampus-room');assert.ok(m.id&&m.source.runId);
  assert.match(m.content[0].text,/今日首次自主唤醒/);
  assert.match(m.content[0].text,/每轮最多安排一个动作/);assert.equal(f.life.status(f.space).life.attempts,1);
  await f.life.tick();assert.equal(f.messages.length,1);
});
test('hidden page, disabled interface, busy session and pending action do not consume wakeups',async()=>{
  for(const mode of ['hidden','closed','busy','pending']){
    const f=fixture();f.enable();f.pulse();
    if(mode==='hidden')f.pulse(false);
    if(mode==='closed')f.rooms.setInterface(f.space,false);
    if(mode==='busy')f.agent.status='running';
    if(mode==='pending')f.rooms.enqueue(f.space,{vector:[1,1,1]});
    await f.life.tick();assert.equal(f.messages.length,0,mode);assert.equal(f.life.status(f.space).life.attempts,0);
  }
});
test('minimum interval, daily cap and no catch-up bursts remain enforced',async()=>{
  const f=fixture();f.enable({intervalMinutes:15,dailyLimit:2});f.pulse();await f.life.tick();
  f.advance(14*60000);await f.life.tick();assert.equal(f.messages.length,1);
  f.advance(60000);await f.life.tick();assert.equal(f.messages.length,2);assert.match(f.messages[1].content[0].text,/接着当前 DSH 会话中今天的生活计划/);
  f.advance(5*3600000);await f.life.tick();await f.life.tick();assert.equal(f.messages.length,2);
  f.advance(24*3600000);await f.life.tick();assert.equal(f.messages.length,3,'new day allows one turn, never backlog');
});
test('disable and re-enable does not reset spend counters or skip cooldown',async()=>{
  const f=fixture();f.enable();f.pulse();await f.life.tick();f.disable();f.enable();await f.life.tick();
  assert.equal(f.messages.length,1);assert.equal(f.life.status(f.space).life.attempts,1);
  const restarted=createRoomState(f.dir,{clock:()=>f.now});assert.equal(restarted.settings(f.space).life.attempts,1);assert.equal(restarted.settings(f.space).life.enabled,true);
});
test('a failed delivery is counted durably and not retried immediately',async()=>{
  const f=fixture();f.agent.followup=()=>{throw new Error('host unavailable')};f.enable();f.pulse();await f.life.tick();await f.life.tick();
  assert.equal(f.life.status(f.space).life.attempts,1);assert.match(f.life.status(f.space).life.lastStatus,/唤醒失败/);
  assert.equal(createRoomState(f.dir).settings(f.space).life.attempts,1);
});
test('unavailable host keeps autonomy off while ordinary room actions still work',async()=>{
  const f=fixture();f.available(false);assert.throws(()=>f.enable(),/接口未就绪/);
  assert.equal(f.rooms.enqueue(f.space,{vector:[1,6,1]}).ok,true);assert.equal(f.life.status(f.space).available,false);
});
test('rebound session is disabled before the next wakeup',async()=>{
  const f=fixture();f.enable();f.pulse();f.bind('记忆空间2');await f.life.tick();
  assert.equal(f.messages.length,0);assert.equal(f.life.status(f.space).life.enabled,false);
});
test('autonomous actions require their claimed run and permit at most one attempt',async()=>{
  const f=fixture();f.enable();f.pulse();await f.life.tick();const m=f.messages[0];
  f.life.claimed(f.session,m);assert.throws(()=>f.life.authorizeAction(f.session,f.space),/许可已失效/);
  assert.throws(()=>f.life.authorizeAction(f.session,'记忆空间2',m.source.runId));
  f.life.authorizeAction(f.session,f.space,m.source.runId);
  assert.throws(()=>f.life.authorizeAction(f.session,f.space,m.source.runId),/已使用/);
  f.life.claimed(f.session,{id:'human-message'});assert.doesNotThrow(()=>f.life.authorizeAction(f.session,f.space));
});
test('late autonomous actions are rejected after disable, hide, expiry, rebind or disposal',async()=>{
  for(const mode of ['disable','hide','expire','rebind','dispose']){
    const f=fixture();f.enable();f.pulse();await f.life.tick();const m=f.messages[0];f.life.claimed(f.session,m);
    if(mode==='disable')f.disable();if(mode==='hide')f.pulse(false);if(mode==='expire')f.advance(121*1000);if(mode==='rebind')f.bind('记忆空间2');if(mode==='dispose')f.life.close();
    assert.throws(()=>f.life.authorizeAction(f.session,f.space,m.source.runId),undefined,mode);
  }
});
test('closing the interface cancels queued commands and leaves stored room values intact',()=>{
  const f=fixture();f.rooms.patch(f.space,f.client.id,{'dayu.computer.note.v1':'保留便签'});f.rooms.enqueue(f.space,{vector:[1,1,1]});
  f.rooms.setInterface(f.space,false);assert.equal(f.rooms.current(f.space).commands[0].status,'cancelled');
  assert.equal(f.rooms.enqueue(f.space,{vector:[1,6,1]}).code,'ROOM_INTERFACE_CLOSED');
  assert.equal(f.rooms.current(f.space).storage['dayu.computer.note.v1'],'保留便签');
  assert.equal(createRoomState(f.dir).settings(f.space).interfaceEnabled,false);
});
test('dashboard room entry is authenticated, fixed to one space and invalidated on rebinding',async t=>{
  const f=mount();t.after(()=>f.close());await bind(f,'fish-a','记忆空间1');await bind(f,'fish-b','记忆空间2');
  const panel=await f.call('fish-a','hp_dashboard'),u=new URL(panel.url),headers={'x-memory-access':new URLSearchParams(u.hash.slice(1)).get('access')};
  assert.equal((await fetch(u.origin+'/api/room-entry')).status,401);
  const view=await(await fetch(u.origin+'/api/dashboard',{headers})).json();assert.equal(view.roomAvailable,true);
  const entry=await(await fetch(u.origin+'/api/room-entry',{headers})).json();assert.equal(entry.space,'记忆空间1');
  assert.equal((await api(entry.url,'/api/room/state')).data.space,'记忆空间1');
  assert.equal((await fetch(u.origin+'/api/room-entry?space=other',{headers})).status,400);
  await bind(f,'fish-a','记忆空间2');
  assert.equal((await fetch(u.origin+'/api/room-entry',{headers})).status,409);
});
test('room settings cannot select another space; toggles leave memory and other rooms operational',async t=>{
  const f=mount();t.after(()=>f.close());const a=await bind(f,'a','记忆空间1'),b=await bind(f,'b','记忆空间2');
  const connection=(await api(a,'/api/room/connect',{})).data;
  assert.equal((await api(a,'/api/room/interface',{enabled:false,space:'记忆空间2'})).status,403);
  assert.equal((await api(a,'/api/room/interface',{enabled:false})).status,200);
  assert.equal((await api(b,'/api/room/settings')).data.interfaceEnabled,true);
  assert.equal((await f.call('a','hp_room_action',{vector:[1,6,1]})).code,'ROOM_INTERFACE_CLOSED');
  assert.equal((await f.call('a','hp_remember',{text:'小屋关闭时也可以记住我喜欢青柠',category:'self'})).ok,true);
  assert.equal((await api(a,'/api/room/life',{enabled:true})).status,400);
  assert.equal((await f.call('a','hp_room_life',{enabled:true})).life.enabled,false,'read-only tool cannot turn autonomy on');
  assert.equal((await api(a,'/api/room/heartbeat',{clientId:connection.id,runtime:{visible:false}})).status,200);
});
