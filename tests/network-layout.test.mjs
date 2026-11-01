import test from 'node:test'
import assert from 'node:assert/strict'
import '../dashboard/network.js'
import '../dashboard/demo.js'
const { buildModel, rotatePoint, View, diffGraph,wordKey } = globalThis.MemoryNetwork
const node = (id, extra = {}) => ({ id, label: id, weight: 2, kind: 'gram', memoryIds: [], ...extra })
const edge = (source, target, weight = 4) => ({ source, target, weight })

test('association layers follow real paths with decreasing gains and preserve the input', () => {
  const nodes = ['a','b','c','d','isolated'].map(id => node(id)), edges = [edge('a','b'),edge('b','c'),edge('c','d')]
  const before = JSON.stringify([nodes,edges]), model = buildModel(nodes,edges,[],'a')
  assert.equal(JSON.stringify([nodes,edges]),before)
  assert.deepEqual(model.counts,[1,1,1,1]);assert.equal(model.omitted,1)
  const byId = new Map(model.nodes.map(n => [n.id,n]))
  assert.equal(byId.get('a').score,1)
  assert.equal(byId.get('b').score,.55)
  assert.ok(Math.abs(byId.get('d').score - .55*.3*.16) < 1e-10)
  for(const id of ['b','c','d']){const n=byId.get(id),p=byId.get(n.parent);assert.equal(n.level,p.level+1);assert.ok(n.radius>p.radius);assert.ok(n.score<p.score)}
  assert.ok(!byId.has('isolated'))
})

test('each word fans out along at most six strongest edges and weaker peers are further away', () => {
  const nodes=['a',...Array.from({length:8},(_,i)=>'b'+i)].map(id=>node(id))
  const model=buildModel(nodes,Array.from({length:8},(_,i)=>edge('a','b'+i, .5+i*.2)),[],'a')
  assert.equal(model.counts[1],6);assert.equal(model.omitted,2)
  assert.ok(!model.nodes.some(n=>n.id==='b0'||n.id==='b1'))
  assert.ok(model.nodes.find(n=>n.id==='b7').radius < model.nodes.find(n=>n.id==='b2').radius)
})

test('the default center comes from an important represented memory rather than a generic hub', () => {
  const nodes=[node('meaning',{memoryIds:['core']}),node('hub',{kind:'cat',weight:1000,memoryIds:['core','ordinary']}),node('other',{memoryIds:['ordinary']})]
  const memories=[{id:'core',pinned:true,importance:95,stability:1000},{id:'ordinary',importance:50,stability:20}]
  const model=buildModel(nodes,[edge('meaning','hub'),edge('hub','other',20)],memories)
  assert.equal(model.rootId,'meaning');assert.equal(model.coreMemoryId,'core')
})

test('cycles, invalid edges and re-centering do not fabricate paths or destabilize the center', () => {
  const nodes=['a','b','c','isolated'].map(id=>node(id)),edges=[edge('a','b'),edge('b','c'),edge('c','a'),edge('a','missing'),edge('a','a'),edge('a','b',NaN)]
  const model=buildModel(nodes,edges,[],'c')
  assert.equal(model.nodes.find(n=>n.id==='c').parent,null)
  assert.deepEqual(model.counts,[1,2,0,0])
  const alone=buildModel(nodes,edges,[],'isolated')
  assert.equal(alone.nodes.length,1);assert.equal(alone.edges.length,0)
})

test('demo clusters use co-occurrence and the chosen self memory reaches three layers', () => {
  const snapshot=globalThis.MemoryDemo('2026-10-31').snapshot
  const model=buildModel(snapshot.graph.nodes,snapshot.graph.edges,snapshot.memories)
  assert.equal(model.nodes.find(n=>n.id===model.rootId).label,'我')
  assert.ok(model.counts[1]>0&&model.counts[2]>0&&model.counts[3]>0)
  for(const edge of snapshot.graph.edges){const a=snapshot.graph.nodes.find(n=>n.id===edge.source),b=snapshot.graph.nodes.find(n=>n.id===edge.target);assert.ok(a.memoryIds.some(id=>b.memoryIds.includes(id)))}
})

test('the spherical layout fills a volume and keeps descendants near their branch direction', () => {
  const snapshot=globalThis.MemoryDemo('2026-10-31').snapshot
  const model=buildModel(snapshot.graph.nodes,snapshot.graph.edges,snapshot.memories)
  const byId=new Map(model.nodes.map(n=>[n.id,n]))
  const first=model.nodes.filter(n=>n.level===1).map(n=>n.position)
  const [a,b,c]=first
  const volume=a.x*(b.y*c.z-b.z*c.y)-a.y*(b.x*c.z-b.z*c.x)+a.z*(b.x*c.y-b.y*c.x)
  assert.ok(Math.abs(volume)>.005,'first-layer points must not lie in a plane through the core')
  assert.ok(model.nodes.some(n=>n.position.z>.3)&&model.nodes.some(n=>n.position.z<-.3))
  for(const n of model.nodes){
    assert.ok(Math.abs(Math.hypot(n.position.x,n.position.y,n.position.z)-n.radius)<1e-9)
    if(n.level>1){const p=byId.get(n.parent);assert.ok(n.direction.x*p.direction.x+n.direction.y*p.direction.y+n.direction.z*p.direction.z>.8)}
  }
})

test('3D rotation preserves distance and the camera gives front nodes a larger perspective', () => {
  const turned=rotatePoint({x:0,y:0,z:1},Math.PI/2,0)
  assert.ok(Math.abs(turned.x-1)<1e-9&&Math.abs(turned.z)<1e-9)
  const point={x:.4,y:-.3,z:.7},rotated=rotatePoint(point,.9,-.5)
  assert.ok(Math.abs(Math.hypot(rotated.x,rotated.y,rotated.z)-Math.hypot(point.x,point.y,point.z))<1e-9)
  const camera={yaw:0,pitch:0,width:1000,height:570,zoom:1}
  const near=View.prototype.project.call(camera,{x:.3,y:0,z:.8})
  const far=View.prototype.project.call(camera,{x:.3,y:0,z:-.8})
  assert.ok(near.scale>far.scale*1.5)
  assert.ok(near.x-500>far.x-500)
})

test('returned snapshots distinguish growth, weight updates and removals without accumulating stale nodes', () => {
  const before={nodes:['a','b','old'].map(id=>node(id)),edges:[edge('a','b',2),edge('b','old')]}
  const after={nodes:['b','a','new'].map(id=>node(id)),edges:[edge('b','a',3),edge('a','new')]}
  const change=diffGraph(before,after)
  assert.deepEqual(change.addedNodes,['new']);assert.deepEqual(change.removedNodes,['old'])
  assert.equal(change.addedEdges.length,1);assert.equal(change.removedEdges.length,1);assert.equal(change.changedEdges.length,1)
  const unchanged=diffGraph(after,{nodes:[...after.nodes].reverse(),edges:after.edges.map(e=>({...e,source:e.target,target:e.source}))})
  assert.ok(Object.values(unchanged).every(a=>a.length===0))
  assert.equal(wordKey('咖啡'),wordKey('咖啡'));assert.notEqual(wordKey('咖啡'),wordKey('朋友'))
})

test('new branches preserve existing positions when the center, parent and strength stay the same', () => {
  const nodes=['a','b','c','d'].map(id=>node(id)),edges=[edge('a','b'),edge('b','c'),edge('a','d')]
  const before=buildModel(nodes,edges,[],'a')
  const after=buildModel([...nodes,node('new')],[...edges,edge('a','new')],[],'a',{previousModel:before})
  for(const old of before.nodes)assert.deepEqual(after.nodes.find(n=>n.id===old.id).position,old.position)
  assert.equal(after.nodes.find(n=>n.id==='new').parent,'a')
  assert.ok(after.nodes.some(n=>n.id==='new'))
})

test('progressive expansion reaches deeper real paths and keeps an explicit node budget', () => {
  const nodes=Array.from({length:20},(_,i)=>node(String(i))),edges=nodes.slice(1).map((n,i)=>edge(String(i),n.id))
  const initial=buildModel(nodes,edges,[],'0'),expanded=buildModel(nodes,edges,[],'0',{maxDepth:6,fanout:18,maxNodes:600,previousModel:initial})
  assert.equal(initial.nodes.length,4);assert.equal(expanded.nodes.length,7)
  assert.ok(expanded.nodes.at(-1).radius>expanded.nodes.at(-2).radius)
  assert.ok(expanded.nodes.at(-1).score<expanded.nodes.at(-2).score)
  const limited=buildModel(nodes,edges,[],'0',{maxDepth:6,maxNodes:5})
  assert.equal(limited.nodes.length,5)
  for(const n of limited.nodes)assert.ok(!n.parent||limited.nodes.some(p=>p.id===n.parent))
})

test('the optional growth demonstration adds explicit synthetic records with stable existing ids', () => {
  const before=globalThis.MemoryDemo('2026-10-31',true,0),after=globalThis.MemoryDemo('2026-10-31',true,1)
  const change=diffGraph(before.snapshot.graph,after.snapshot.graph)
  assert.equal(after.mode,'demo');assert.equal(after.snapshot.total,before.snapshot.total+1)
  assert.equal(change.addedNodes.length,2);assert.ok(change.addedEdges.length>0);assert.equal(change.removedNodes.length,0)
  const initial=buildModel(before.snapshot.graph.nodes,before.snapshot.graph.edges,before.snapshot.memories)
  const updated=buildModel(after.snapshot.graph.nodes,after.snapshot.graph.edges,after.snapshot.memories,initial.rootId,{previousModel:initial})
  assert.ok(updated.nodes.length>initial.nodes.length)
})
