import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import * as engine from '../lib/hippocampus.js'
import { createActivityJournal, instrumentEngine, captureBrain, changesBetween, createFileObserver, dayKey } from '../lib/activity.mjs'
import { projectBrain, buildDashboard } from '../lib/dashboard-model.mjs'
import { startDashboard } from '../lib/dashboard-server.mjs'
import { apply } from '../lib/index.js'

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hp-activity-'))
const make = (id, extra = {}) => ({ id, text: '合成记录 '+id, category: 'study', tier: 'long', stabilityHours: 100, salience: 65, createdAt: Date.now(), updatedAt: Date.now(), ...extra })

test('engine instrumentation logs actual creation/recall/delete without storing text or queries', () => {
  const dir=temporary(),journal=createActivityJournal({dir}),st={}
  const hp=instrumentEngine(engine,{journal,space:()=> 'test'})
  const item=hp.remember(st,{text:'仅用于测试的独特正文不应进入日志',category:'study',salience:70})
  hp.retrieve(st,'独特正文查询不能保存',{now:Date.now()})
  hp.revise(st,{id:item.id,newText:'修订后的秘密正文也不保存'})
  hp.forget(st,item.id)
  const rows=journal.read({day:dayKey(),space:'test'})
  assert.equal(rows.filter(e=>e.type==='added').length,1)
  assert.equal(rows.filter(e=>e.type==='retrieved').length,1)
  assert.equal(rows.filter(e=>e.type==='revised').length,1)
  assert.equal(rows.filter(e=>e.type==='deleted').length,1)
  const raw=fs.readFileSync(path.join(dir,'activity',dayKey()+'.jsonl'),'utf8')
  assert.ok(!raw.includes('独特正文'));assert.ok(!raw.includes('秘密正文'));assert.ok(!raw.includes('查询'))
})

test('retrieval is not reported as successful recall or reinforcement', () => {
  const journal=createActivityJournal({dir:temporary()}),hp=instrumentEngine(engine,{journal}),st={}
  hp.remember(st,{text:'合成记忆：参加天文观测',category:'event'})
  hp.retrieve(st,'天文观测')
  const rows=journal.read({day:dayKey()})
  assert.ok(rows.some(e=>e.type==='retrieved'))
  assert.ok(!rows.some(e=>['recalled','reinforced'].includes(e.type)))
})

test('archive transitions and stable-strength changes have separate truthful events', () => {
  const a={brain:{items:[make('a'),make('b')],archive:[]}},before=captureBrain(a)
  a.brain.items[0].stabilityHours=160;a.brain.items[0].lastRecalledAt=Date.now()
  const b=a.brain.items.pop();a.brain.archive.push(b)
  const rows=changesBetween(before,captureBrain(a),{operation:'pickRecall'})
  assert.deepEqual(rows.map(e=>e.type).sort(),['archived','recalled'])
  assert.equal(rows.find(e=>e.type==='recalled').afterS,160)
})

test('file observer takes a baseline without inventing old events and never writes source', () => {
  const dir=temporary(),file=path.join(dir,'brain.json'),journal=createActivityJournal({dir:path.join(dir,'monitor')})
  const doc={conversations:{one:{brain:{items:[make('existing')],archive:[]}}}}
  fs.writeFileSync(file,JSON.stringify(doc));const original=fs.readFileSync(file)
  const observer=createFileObserver({file,journal,onlySpace:'one'})
  observer.poll();observer.poll();assert.deepEqual(fs.readFileSync(file),original)
  assert.equal(journal.read({day:dayKey()}).length,0)
  doc.conversations.one.brain.items.push(make('new'));fs.writeFileSync(file,JSON.stringify(doc));observer.poll()
  const rows=journal.read({day:dayKey()});assert.equal(rows.length,1);assert.equal(rows[0].type,'observed_added');assert.equal(rows[0].origin,'observation')
})

test('a temporarily missing/invalid source does not invent deletions', () => {
  const dir=temporary(),file=path.join(dir,'brain.json'),journal=createActivityJournal({dir}),doc={conversations:{one:{items:[make('a')]}}}
  fs.writeFileSync(file,JSON.stringify(doc));const observer=createFileObserver({file,journal});observer.poll()
  fs.writeFileSync(file,'{');assert.equal(observer.poll(),null)
  fs.writeFileSync(file,JSON.stringify(doc));observer.poll()
  assert.equal(journal.read({day:dayKey()}).length,0)
})

test('dashboard projection never sweeps old memories and sealed text/words remain hidden', () => {
  const item=make('old',{createdAt:1,updatedAt:1,stabilityHours:1}),secret=make('sealed',{text:'绝密火星专用标记',sealed:true,tags:['绝密火星']})
  const doc={conversations:{test:{brain:{items:[item,secret],archive:[],web:{words:{绝密火星:{w:5,kind:'tag'}},edges:{}}}}}}
  const original=JSON.stringify(doc),view=projectBrain(doc,{space:'test',reveal:true})
  assert.equal(JSON.stringify(doc),original);assert.equal(view.total,2);assert.equal(view.memories.length,1)
  assert.ok(!JSON.stringify(view).includes('绝密火星'));assert.equal(view.graph.nodes.length,0)
  assert.equal(projectBrain(doc,{space:'test',reveal:false}).memories[0].text,'')
})

test('date and space filtering do not leak events across spaces; truncated last line is tolerated', () => {
  const dir=temporary(),now=new Date(2026,9,30,23,59).getTime(),journal=createActivityJournal({dir,clock:()=>now})
  journal.append([{type:'added',memoryId:'one'}],{space:'one'})
  journal.append([{type:'deleted',memoryId:'two'}],{space:'two'})
  fs.appendFileSync(path.join(dir,'activity',dayKey(now)+'.jsonl'),'{"partial":')
  const view=buildDashboard({doc:{conversations:{}},journal,space:'one',day:dayKey(now),now})
  assert.equal(view.eventCount,1);assert.equal(view.counts.added,1);assert.equal(view.counts.deleted,undefined)
  assert.equal(journal.read({day:'../meta'}).length,0)
})

test('journal failure cannot break memory writes', () => {
  const dir=temporary(),blocked=path.join(dir,'not-a-directory');fs.writeFileSync(blocked,'x')
  const journal=createActivityJournal({dir:blocked}),hp=instrumentEngine(engine,{journal}),st={}
  assert.doesNotThrow(()=>hp.remember(st,{text:'日志故障时记忆仍能写入',category:'study'}))
  assert.equal(st.brain.items.length,1);assert.ok(journal.status().error)
})

test('journal retention removes only dated activity logs beyond retention window', () => {
  const dir=temporary(),journal=createActivityJournal({dir,clock:()=>new Date(2026,9,31,12).getTime(),keepDays:90});journal.start()
  const folder=path.join(dir,'activity');fs.writeFileSync(path.join(folder,'2020-01-01.jsonl'),'old');fs.writeFileSync(path.join(folder,'keep.txt'),'keep')
  journal.append([{type:'added'}]);assert.ok(!fs.existsSync(path.join(folder,'2020-01-01.jsonl')));assert.ok(fs.existsSync(path.join(folder,'keep.txt')))
})

test('local HTTP service authenticates API, rejects cross-origin/write requests, and serves assets', async t => {
  const dir=temporary(),file=path.join(dir,'brain.json'),doc={conversations:{default:{brain:{items:[make('http',{text:'合成服务正文'})],archive:[]}}}}
  fs.writeFileSync(file,JSON.stringify(doc));const original=fs.readFileSync(file)
  const panel=await startDashboard({file,dir});t.after(()=>panel.close())
  const u=new URL(panel.url),access=new URLSearchParams(u.hash.slice(1)).get('access'),headers={'X-Memory-Access':access}
  assert.equal(panel.server.address().address,'127.0.0.1')
  assert.equal((await fetch(u.origin+'/api/dashboard')).status,401)
  assert.equal((await fetch(u.origin+'/api/dashboard',{headers:{...headers,Origin:'https://example.invalid'}})).status,403)
  assert.equal((await fetch(u.origin+'/api/dashboard',{method:'POST',headers})).status,405)
  assert.equal((await fetch(u.origin+'/api/dashboard?day=../../meta',{headers})).status,400)
  const view=await(await fetch(u.origin+'/api/dashboard',{headers})).json();assert.equal(view.snapshot.total,1);assert.equal(view.snapshot.memories[0].text,'')
  const shown=await(await fetch(u.origin+'/api/dashboard?reveal=1',{headers})).json();assert.equal(shown.snapshot.memories[0].text,'合成服务正文')
  for(const asset of ['/','/app.js','/network.js','/styles.css','/warm.css','/demo.js','/favicon.svg','/dafeiyu-mascot.webp'])assert.equal((await fetch(u.origin+asset)).status,200)
  assert.deepEqual(fs.readFileSync(file),original)
})

test('bridge/file scope never exposes other spaces', async t => {
  const dir=temporary(),file=path.join(dir,'brain.json');fs.writeFileSync(file,JSON.stringify({conversations:{one:{items:[make('a')]},two:{items:[make('b',{text:'不属于指定空间的内容'})]}}}))
  const panel=await startDashboard({file,dir,space:'one',mode:'observation'});t.after(()=>panel.close())
  const u=new URL(panel.url),headers={'X-Memory-Access':new URLSearchParams(u.hash.slice(1)).get('access')}
  const view=await(await fetch(u.origin+'/api/dashboard?reveal=1',{headers})).json();assert.deepEqual(view.spaces.map(s=>s.value),['one']);assert.ok(!JSON.stringify(view).includes('不属于指定空间'))
  assert.equal((await fetch(u.origin+'/api/dashboard?space=two',{headers})).status,403)
})

test('port failure rejects cleanly without starting a second listener', async t => {
  const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  await assert.rejects(startDashboard({dir:temporary(),demo:true,port:server.address().port}),e=>e.code==='EADDRINUSE')
})

test('plugin starts the panel before any tool request; repeated URLs reuse it and unload closes it', async t => {
  const dir=temporary(),tools=new Map(),effects=[],sections=[]
  const originalListen=http.Server.prototype.listen
  let starts=0,resolveReady
  const ready=new Promise(resolve=>{resolveReady=resolve})
  t.mock.method(http.Server.prototype,'listen',function(...args){
    starts++
    this.once('listening',()=>resolveReady(this))
    return originalListen.apply(this,args)
  })
  const ctx={
    tools:{register:tool=>tools.set(tool.name,tool)},
    effect(fn){effects.push(fn())},
    on(){return()=>{}},
    inject(deps,fn){fn({systemPrompt:{section(s){sections.push(s)}}})},
  }
  apply(ctx,{homeDir:dir,verbose:false,scopeMode:'shared',roomEnabled:false})
  t.after(()=>Promise.all(effects.map(fn=>fn?.())))
  assert.equal(tools.size,22)
  const server=await ready,origin=`http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(origin+'/')).status,200,'panel must be serving before hp_dashboard is called')
  const item=await tools.get('hp_remember').execute({text:'活动面板端到端测试的记忆',category:'study'})
  assert.equal(item.ok,true)
  const [a,b]=await Promise.all([tools.get('hp_dashboard').execute({}),tools.get('hp_dashboard').execute({})])
  assert.equal(a.ok,true);assert.equal(a.url,b.url);assert.equal(new URL(a.url).origin,origin);assert.equal(starts,1)
  const text=sections[0].text({userText:'端到端测试'});assert.ok(text.length>0)
  const u=new URL(a.url),headers={'X-Memory-Access':new URLSearchParams(u.hash.slice(1)).get('access')}
  const view=await(await fetch(u.origin+'/api/dashboard',{headers})).json();assert.equal(view.counts.added,1);assert.equal(view.counts.injected,1)
  await Promise.all(effects.map(fn=>fn?.()))
  assert.equal(server.listening,false)
  await assert.rejects(fetch(u.origin+'/api/dashboard',{headers}))
  assert.equal((await tools.get('hp_dashboard').execute({})).ok,false)
})

test('automatic panel startup failure leaves memory tools usable and address lookup retries', async t => {
  const dir=temporary(),tools=new Map(),effects=[]
  const originalListen=http.Server.prototype.listen
  let starts=0,resolveFailed
  const failed=new Promise(resolve=>{resolveFailed=resolve})
  t.mock.method(http.Server.prototype,'listen',function(...args){
    if(++starts===1){
      queueMicrotask(()=>{this.emit('error',Object.assign(new Error('simulated permission failure'),{code:'EACCES'}));resolveFailed()})
      return this
    }
    return originalListen.apply(this,args)
  })
  const ctx={tools:{register:tool=>tools.set(tool.name,tool)},effect(fn){effects.push(fn())},on(){return()=>{}}}
  assert.doesNotThrow(()=>apply(ctx,{homeDir:dir,verbose:false,scopeMode:'shared',roomEnabled:false,injectMode:'tool'}))
  t.after(()=>Promise.all(effects.map(fn=>fn?.())))
  await failed
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(tools.size,22)
  const item=await tools.get('hp_remember').execute({text:'面板启动失败仍能记住的合成记录',category:'study'})
  assert.equal(item.ok,true)
  const result=await tools.get('hp_dashboard').execute({})
  assert.equal(result.ok,true);assert.equal(starts,2)
  const u=new URL(result.url),headers={'X-Memory-Access':new URLSearchParams(u.hash.slice(1)).get('access')}
  const view=await(await fetch(u.origin+'/api/dashboard',{headers})).json()
  assert.equal(view.counts.added,1)
})

test('a disabled plugin never starts the panel service', async t => {
  let starts=0
  t.mock.method(http.Server.prototype,'listen',()=>{starts++;throw new Error('disabled plugin must not listen')})
  apply({}, {enabled:false,homeDir:temporary(),verbose:false,scopeMode:'shared',roomEnabled:false})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(starts,0)
})

test('the auto-started panel respects disabled activity recording', async t => {
  const dir=temporary(),tools=new Map(),effects=[]
  const ctx={tools:{register:tool=>tools.set(tool.name,tool)},effect(fn){effects.push(fn())},on(){return()=>{}}}
  apply(ctx,{homeDir:dir,verbose:false,scopeMode:'shared',roomEnabled:false,injectMode:'tool',activityLog:false})
  t.after(()=>Promise.all(effects.map(fn=>fn?.())))
  const item=await tools.get('hp_remember').execute({text:'不记录活动的合成记忆',category:'study'})
  assert.equal(item.ok,true)
  const result=await tools.get('hp_dashboard').execute({})
  assert.equal(result.ok,true)
  const u=new URL(result.url),headers={'X-Memory-Access':new URLSearchParams(u.hash.slice(1)).get('access')}
  const view=await(await fetch(u.origin+'/api/dashboard',{headers})).json()
  assert.equal(view.snapshot.total,1);assert.equal(view.eventCount,0)
  assert.equal(fs.existsSync(path.join(dir,'activity')),false)
})

test('live API returns stable word ids while newly stored relationships grow and sealed words disappear', async t => {
  const dir=temporary(),st={},doc={conversations:{default:st}},journal=createActivityJournal({dir})
  engine.remember(st,{text:'我与朋友有一个约定',category:'self',tags:['朋友','约定'],salience:90})
  const panel=await startDashboard({dir,getDoc:()=>doc,journal});t.after(()=>panel.close())
  const u=new URL(panel.url),headers={'X-Memory-Access':new URLSearchParams(u.hash.slice(1)).get('access')}
  const read=async()=>(await(await fetch(u.origin+'/api/dashboard?reveal=1',{headers})).json()).snapshot.graph
  const before=await read(),friend=before.nodes.find(n=>n.label==='朋友')
  const added=engine.remember(st,{text:'和朋友一起观察银河极光',category:'event',tags:['朋友','银河极光'],salience:90})
  const grown=await read();assert.ok(grown.nodes.length>before.nodes.length);assert.equal(grown.nodes.find(n=>n.label==='朋友').id,friend.id)
  assert.ok(grown.nodes.some(n=>n.label==='银河极光'))
  added.sealed=true
  const saved=JSON.stringify(doc),hidden=await read()
  assert.ok(!hidden.nodes.some(n=>n.label==='银河极光'));assert.equal(JSON.stringify(doc),saved)
})

test('the graph response can exceed the old 90-node cap while honoring its bounded candidate pool', () => {
  const items=Array.from({length:650},(_,i)=>make('large-'+i,{text:'图谱节点'+i,tags:['扩展词'+i]})),words=Object.fromEntries(items.map((m,i)=>[m.tags[0],{w:i+1,kind:'tag'}]))
  const doc={conversations:{default:{brain:{items,archive:[],web:{words,edges:{}}}}}}
  const graph=projectBrain(doc,{reveal:true}).graph
  assert.equal(graph.nodes.length,600);assert.equal(graph.availableNodes,650);assert.equal(graph.nodeLimit,600)
})
