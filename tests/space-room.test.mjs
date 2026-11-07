import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {mount,api,bind} from './helpers/room-host.mjs';
import {sessionId,spaceKey,acquireSpaceHub} from '../lib/spaces.mjs';
import {createRoomState} from '../lib/room-state.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'hp-room-state-'));
const remember=text=>({text,category:'self',salience:95});

test('default mode refuses missing and unbound identities instead of sharing a default brain',async t=>{
  const f=mount();t.after(()=>f.close());assert.equal(f.tools.size,22);
  assert.equal((await f.call('fish-a','hp_list')).code,'SPACE_UNBOUND');
  assert.equal((await f.tools.get('hp_remember').execute(remember('不应被存储'))).code,'SESSION_REQUIRED');
  assert.match(f.render('fish-a'),/首次使用[\s\S]*不同的鱼请选择不同空间[\s\S]*hp_space/);assert.equal(f.render(), '');
  assert.equal(fs.existsSync(path.join(f.home,'brain.json')),false);
  const room=await f.call('fish-a','hp_room');assert.equal(room.needsBinding,true);
  assert.equal((await api(room.url,'/api/bind',{space:'记忆空间1'})).status,400);
});

test('two fish isolate writes, reads, IDs, prompts, archives, exports and dashboard activity',async t=>{
  const f=mount();t.after(()=>f.close());const a=await bind(f,'fish-a','记忆空间1'),b=await bind(f,'fish-b','记忆空间2');
  const [ra,rb]=await Promise.all([f.call('fish-a','hp_remember',remember('我喜欢青柠薄荷，这是空间一的测试记录')),f.call('fish-b','hp_remember',remember('我喜欢紫罗兰，这是空间二的测试记录'))]);
  assert.ok(ra.ok&&rb.ok);const ar=await f.call('fish-a','hp_list',{space:'记忆空间2',include_archive:true});
  assert.equal(ar.total,1);assert.match(JSON.stringify(ar),/青柠/);assert.doesNotMatch(JSON.stringify(ar),/紫罗兰/);
  assert.equal((await f.call('fish-a','hp_get',{id:rb.id})).ok,false);
  assert.match(f.render('fish-a'),/青柠/);assert.doesNotMatch(f.render('fish-a'),/紫罗兰/);
  assert.match(f.render('fish-b'),/紫罗兰/);assert.doesNotMatch(f.render('fish-b'),/青柠/);
  const exported=await f.call('fish-a','hp_export');const doc=JSON.parse(fs.readFileSync(exported.path));assert.deepEqual(Object.keys(doc.conversations),['记忆空间1']);
  assert.equal((await f.call('fish-a','hp_export',{path:path.join(f.home,'brain.json')})).ok,false,'cannot overwrite shared store via export path');
  assert.equal((await f.call('fish-b','hp_import',{path:exported.path})).ok,false);
  assert.equal((await f.call('fish-a','hp_import',{path:exported.path})).ok,true);
  assert.match(JSON.stringify(await f.call('fish-b','hp_list')),/紫罗兰/);
  const panel=(await api(a,'/api/room/dashboard')).data.url,u=new URL(panel),headers={'x-memory-access':new URLSearchParams(u.hash.slice(1)).get('access')};
  const view=await(await fetch(u.origin+'/api/dashboard?reveal=1',{headers})).json();assert.equal(view.space,'记忆空间1');assert.equal(view.snapshot.total,1);assert.equal(view.spaces.length,1);assert.doesNotMatch(JSON.stringify(view),/紫罗兰|记忆空间2/);
  assert.equal((await fetch(u.origin+'/api/dashboard?space='+encodeURIComponent('记忆空间2'),{headers})).status,403);
  assert.equal((await api(a,'/api/room/state?space='+encodeURIComponent('记忆空间2'))).status,403);
  assert.equal((await api(a,'/api/room/save',{space:'记忆空间2',changes:{}})).status,403);
  assert.equal((await api(b,'/api/room/state')).data.space,'记忆空间2');
  const bp=(await api(b,'/api/room/dashboard')).data.url,bu=new URL(bp),bh={'x-memory-access':new URLSearchParams(bu.hash.slice(1)).get('access')};
  const bv=await(await fetch(bu.origin+'/api/dashboard',{headers:bh})).json();assert.equal(bv.spaces[0].label,'记忆空间2','do not rename every isolated panel to space 1');
});

test('same fish may share its space across sessions; rebinding invalidates old room URL',async t=>{
  const f=mount();t.after(()=>f.close());const old=await bind(f,'fish-a','记忆空间1');await bind(f,'fish-a-new-chat','记忆空间1');
  await f.call('fish-a','hp_remember',remember('我记住了一只青蓝色的鲸鱼'));
  assert.equal((await f.call('fish-a-new-chat','hp_list')).total,1);
  const setup1=await f.call('fish-a','hp_space'),setup2=await f.call('fish-a','hp_space');
  assert.equal((await api(setup1.setupUrl,'/api/bind',{space:'记忆空间2',confirm:true})).status,200);
  assert.equal((await api(setup1.setupUrl,'/api/setup')).status,401,'single-use setup ticket');
  assert.equal((await api(setup2.setupUrl,'/api/bind',{space:'记忆空间3',confirm:true})).status,400,'stale confirmation');
  assert.equal((await api(old,'/api/room/state')).status,403);
  assert.equal((await f.call('fish-a','hp_list')).total,0);
  assert.equal((await f.call('fish-a-new-chat','hp_list')).total,1);
});

test('local API requires its capability and rejects cross-origin requests and foreign clients',async t=>{
  const f=mount();t.after(()=>f.close());const a=await bind(f,'a','记忆空间1'),b=await bind(f,'b','记忆空间2');
  const client=(await api(a,'/api/room/connect',{})).data.id;
  assert.equal((await api(a,'/api/room/state',undefined,{'x-room-access':'invalid'})).status,401);
  assert.equal((await api(a,'/api/room/state',undefined,{origin:'https://example.invalid'})).status,403);
  assert.equal((await api(b,'/api/room/save',{clientId:client,changes:{'dayu.computer.note.v1':'串空间'}})).status,409);
  assert.equal((await api(a,'/api/room/save',{clientId:client,changes:{'arbitrary-file':'bad'}})).status,400);
  assert.equal((await fetch(new URL(a).origin+'/room/../lib/index.js')).status,404);
});

test('AI actions receive actual acknowledgments, and per-space notes survive plugin restart',async t=>{
  let f=mount();t.after(()=>f.close());const home=f.home,a=await bind(f,'a','记忆空间1');await bind(f,'b','记忆空间2');
  assert.equal((await f.call('a','hp_room_action',{action:'light',on:true})).code,'ROOM_CLOSED');
  const connection=(await api(a,'/api/room/connect',{})).data;
  const queued=await f.call('a','hp_room_action',{action:'note',text:'空间一的小屋便签'});assert.equal(queued.command.status,'queued');
  assert.equal((await f.call('a','hp_room_action',{action:'light',on:false})).code,'ROOM_BUSY');
  const claim=await api(a,'/api/room/claim',{clientId:connection.id});assert.equal(claim.data.command.status,'running');
  assert.equal((await api(a,'/api/room/save',{clientId:connection.id,changes:{'dayu.computer.note.v1':'空间一的小屋便签'}})).status,200);
  const ack={clientId:connection.id,id:queued.command.id,status:'completed',detail:'fixture applied note',runtime:{x:1,z:2,action:'idle',view:'interior'}};
  assert.equal((await api(a,'/api/room/result',ack)).data.status,'completed');assert.equal((await api(a,'/api/room/result',ack)).data.status,'completed');
  assert.equal((await f.call('a','hp_room_state')).commands[0].status,'completed');
  assert.equal((await f.call('b','hp_room_state')).note,'');
  await f.close();f=mount({homeDir:home});const loaded=await f.call('a','hp_room_state');assert.equal(loaded.note,'空间一的小屋便签');assert.equal(loaded.connected,false);assert.equal(loaded.runtime.x,1);
});

test('new page takes over without replay; stale heartbeat and unacknowledged action expire honestly',()=>{
  let now=100;const f=createRoomState(temp(),{clock:()=>now});const a=f.connect('记忆空间1');
  let q=f.enqueue('记忆空间1',{action:'light',on:true});f.claim('记忆空间1',a.id);const b=f.connect('记忆空间1');
  assert.equal(f.current('记忆空间1').commands[0].status,'cancelled');assert.throws(()=>f.patch('记忆空间1',a.id,{}));
  q=f.enqueue('记忆空间1',{action:'activity',value:'sea'});f.claim('记忆空间1',b.id);now+=30000;f.heartbeat('记忆空间1',b.id,{});now+=16000;
  assert.equal(f.current('记忆空间1').commands.at(-1).status,'failed');
  assert.equal(f.ack('记忆空间1',b.id,q.command.id,'completed').status,'failed','late success cannot rewrite timeout');
  now+=35001;assert.equal(f.enqueue('记忆空间1',{action:'light',on:false}).code,'ROOM_CLOSED');
});

test('unfinished command is interrupted on restart, invalid actions never enter the queue',()=>{
  const dir=temp();let f=createRoomState(dir);f.connect('记忆空间1');
  assert.throws(()=>f.enqueue('记忆空间1',{action:'shell',text:'anything'}));assert.throws(()=>f.enqueue('记忆空间1',{action:'light',on:'yes'}));assert.throws(()=>f.enqueue('记忆空间1',{action:'furniture',item:'desk',x:Infinity,z:1,rotation:0}));
  f.enqueue('记忆空间1',{action:'weather',value:'rainy'});f=createRoomState(dir);
  assert.equal(f.current('记忆空间1').commands[0].status,'interrupted');assert.equal(f.current('记忆空间1').connected,false);
});

test('identity cannot come from process env or mismatched context; unsafe space names rejected',()=>{
  assert.equal(sessionId({agent:{id:'chat-a'}}),'chat-a');assert.throws(()=>sessionId({session:{id:'chat-a'}}));
  assert.throws(()=>sessionId({agent:{id:'a',session:{id:'b'}}}));
  for(const key of ['__proto__','constructor','../other','a/b',' a'])assert.throws(()=>spaceKey(key));
});

test('store pool shares in-memory updates, and corrupt brain file is kept untouched',()=>{
  const dir=temp(),one=acquireSpaceHub(dir),two=acquireSpaceHub(dir);assert.equal(one,two);one.bind('a','记忆空间1',null);assert.equal(two.resolve('a'),'记忆空间1');one.release();assert.ok(fs.existsSync(path.join(dir,'room-preview.lock')));two.release();assert.equal(fs.existsSync(path.join(dir,'room-preview.lock')),false);
  const bad=temp(),file=path.join(bad,'brain.json');fs.writeFileSync(file,'{broken');assert.throws(()=>acquireSpaceHub(bad));assert.equal(fs.readFileSync(file,'utf8'),'{broken');assert.equal(fs.existsSync(path.join(bad,'room-preview.lock')),false);
});

test('room storage error does not stop memory tools or prompt registration',async t=>{
  const dir=temp();fs.writeFileSync(path.join(dir,'rooms.json'),'{bad');const f=mount({homeDir:dir,scopeMode:'shared'});t.after(()=>f.close());
  assert.equal(f.tools.size,22);assert.equal((await f.call('a','hp_remember',remember('房间坏了，记忆仍然能工作'))).ok,true);
  assert.match(f.render('a'),/记忆仍然/);assert.equal((await f.call('a','hp_room')).ok,false);assert.equal((await f.call('a','hp_dashboard')).ok,true);
  assert.equal(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'),'{bad');
});

test('room listener failure is contained and later address request can retry',async t=>{
  const listen=http.Server.prototype.listen;let calls=0;
  t.mock.method(http.Server.prototype,'listen',function(...args){if(++calls===1){queueMicrotask(()=>this.emit('error',new Error('fixture listen failure')));return this}return listen.apply(this,args)});
  const f=mount();t.after(()=>f.close());await new Promise(r=>setImmediate(r));
  const room=await f.call('a','hp_room');assert.equal(room.ok,true);assert.equal(room.needsBinding,true);
  await bind(f,'a','记忆空间1');assert.equal((await f.call('a','hp_remember',remember('小屋恢复之后记忆可用'))).ok,true);
});

test('invalid legacy space config and unreadable brain return diagnostics without throwing during apply',async t=>{
  const bad=mount({space:'invalid/path'});t.after(()=>bad.close());assert.equal((await bad.call('a','hp_space')).code,'MEMORY_INIT_ERROR');assert.equal(bad.tools.size,1);
  const dir=temp();fs.writeFileSync(path.join(dir,'brain.json'),'{broken');const f=mount({homeDir:dir});t.after(()=>f.close());assert.equal((await f.call('a','hp_space')).code,'MEMORY_INIT_ERROR');assert.equal(fs.readFileSync(path.join(dir,'brain.json'),'utf8'),'{broken');
});
