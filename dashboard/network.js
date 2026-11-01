/* Read-only association projection. No memory writes, external libraries or requests. */
(() => {
  'use strict'
  const TAU = Math.PI * 2
  const RING_GAIN = [1, .55, .3, .16]
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const number = v => Number.isFinite(Number(v)) ? Number(v) : 0
  const stable = (a, b) => String(a).localeCompare(String(b), 'en')
  const PROFILES = [{ maxDepth:3,fanout:6,maxNodes:90 },{ maxDepth:4,fanout:10,maxNodes:180 },{ maxDepth:5,fanout:14,maxNodes:360 },{ maxDepth:6,fanout:18,maxNodes:600 }]
  const gainAt = level => RING_GAIN[level] ?? .16 * Math.pow(.55, level-3)
  const radiusAt = level => [0,.34,.64,.91][level] ?? .91+(level-3)*.27
  const edgeKey = e => JSON.stringify([String(e.source),String(e.target)].sort(stable))
  function wordKey(word) {
    let a=2166136261,b=2246822507
    for(const char of String(word)){const c=char.codePointAt(0);a=Math.imul(a^c,16777619);b=Math.imul(b^c,3266489909)}
    return 'local-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0')
  }
  function diffGraph(before,after) {
    const oldNodes=new Set((before?.nodes||[]).map(n=>String(n.id))),newNodes=new Set((after?.nodes||[]).map(n=>String(n.id)))
    const oldEdges=new Map((before?.edges||[]).map(e=>[edgeKey(e),number(e.weight)])),newEdges=new Map((after?.edges||[]).map(e=>[edgeKey(e),number(e.weight)]))
    return { addedNodes:[...newNodes].filter(id=>!oldNodes.has(id)),removedNodes:[...oldNodes].filter(id=>!newNodes.has(id)),
      addedEdges:[...newEdges.keys()].filter(id=>!oldEdges.has(id)),removedEdges:[...oldEdges.keys()].filter(id=>!newEdges.has(id)),
      changedEdges:[...newEdges.keys()].filter(id=>oldEdges.has(id)&&oldEdges.get(id)!==newEdges.get(id)) }
  }
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
  const normalize = p => { const length = Math.hypot(p.x, p.y, p.z) || 1; return { x: p.x / length, y: p.y / length, z: p.z / length } }
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
  function rotatePoint(p, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
    const x = p.x * cy + p.z * sy, z = -p.x * sy + p.z * cy
    return { x, y: p.y * cp - z * sp, z: p.y * sp + z * cp }
  }

  function cleanGraph(nodes, edges) {
    const byId = new Map()
    for (const n of nodes || []) if (n?.id != null && !byId.has(String(n.id))) {
      byId.set(String(n.id), { ...n, id: String(n.id), weight: Math.max(0, number(n.weight)), memoryIds: [...(n.memoryIds || [])] })
    }
    const pairs = new Map()
    for (const e of edges || []) {
      const a = String(e.source), b = String(e.target), weight = number(e.weight)
      if (a === b || !byId.has(a) || !byId.has(b) || weight <= 0) continue
      const [source, target] = [a, b].sort(stable), key = JSON.stringify([source, target])
      if (!pairs.has(key) || weight > pairs.get(key).weight) pairs.set(key, { source, target, weight })
    }
    const links = [...pairs.values()], adj = new Map([...byId.keys()].map(id => [id, []]))
    for (const e of links) { adj.get(e.source).push({ id: e.target, weight: e.weight }); adj.get(e.target).push({ id: e.source, weight: e.weight }) }
    for (const row of adj.values()) row.sort((a, b) => b.weight - a.weight || stable(a.id, b.id))
    return { byId, links, adj }
  }

  function chooseCore(graph, memories) {
    const represented = new Set([...graph.byId.values()].flatMap(n => n.memoryIds))
    const rank = m => (m.pinned ? 4 : 0) + clamp(number(m.importance), 0, 100) / 50
      + Math.min(1.5, Math.log1p(Math.max(0, number(m.stability))) / 6) + (m.semantic ? .35 : 0) + (m.archived ? 0 : .5)
    const memory = (memories || []).filter(m => represented.has(m.id)).slice().sort((a, b) => rank(b) - rank(a) || stable(a.id, b.id))[0]
    let candidates = [...graph.byId.values()].filter(n => !memory || n.memoryIds.includes(memory.id))
    const concrete = candidates.filter(n => n.kind !== 'cat')
    if (concrete.length) candidates = concrete
    const score = n => (graph.adj.get(n.id).reduce((s, e) => s + e.weight, 0) + 1) / Math.sqrt(1 + n.weight)
    candidates.sort((a, b) => score(b) - score(a) || stable(a.id, b.id))
    return { id: candidates[0]?.id || '', memoryId: memory?.id || '' }
  }

  function buildModel(nodes, edges, memories = [], rootId = '', options = {}) {
    const graph = cleanGraph(nodes, edges), core = chooseCore(graph, memories)
    const maxDepth=clamp(Math.floor(number(options.maxDepth)||3),1,6),fanout=clamp(Math.floor(number(options.fanout)||6),1,18),maxNodes=clamp(Math.floor(number(options.maxNodes)||90),1,600)
    const root = graph.byId.has(rootId) ? rootId : core.id
    if (!root) return { rootId: '', defaultRootId: '', coreMemoryId: '', nodes: [], edges: [], omitted: 0, counts: Array(maxDepth+1).fill(0),maxDepth,fanout,maxNodes }
    const found = new Map([[root, { id: root, level: 0, score: 1, parent: null, branch: root }]])
    let frontier = [root]
    // Minimum reachable hop is the displayed layer. Within a layer, retain the
    // strongest parent path. Defaults use six outgoing edges and the engine's
    // three-layer gains; expanded profiles are read-only visual exploration.
    for (let level = 1; level <= maxDepth && frontier.length; level++) {
      const next = new Set()
      for (const id of frontier) {
        const here = found.get(id)
        for (const edge of graph.adj.get(id).slice(0, fanout)) {
          const old = found.get(edge.id)
          if (old && old.level < level) continue
          if(!old&&found.size>=maxNodes)continue
          const score = here.score * gainAt(level) * Math.min(1, .45 + edge.weight / 4)
          if (!old || score > old.score) {
            found.set(edge.id, { id: edge.id, level, score, parent: id, branch: level === 1 ? edge.id : here.branch })
          }
          next.add(edge.id)
        }
      }
      frontier = [...next].sort((a,b)=>found.get(b).score-found.get(a).score||stable(a,b))
    }
    const children = new Map([...found.keys()].map(id => [id, []]))
    for (const n of found.values()) if (n.parent) children.get(n.parent).push(n.id)
    for (const row of children.values()) row.sort((a, b) => found.get(b).score - found.get(a).score || stable(a, b))
    const previous=options.previousModel?.rootId===root?new Map(options.previousModel.nodes.map(n=>[n.id,n])):new Map()
    // Distribute the first branches over a sphere, then grow every branch in a
    // cone around its parent direction. This is a volume, not a tilted 2D disc.
    const assign = id => {
      const n = found.get(id), row = children.get(id)
      const kept=[]
      for(const kid of row){
        const child=found.get(kid),old=previous.get(kid),oldParent=previous.get(id)
        const parentStable=n.level===0||oldParent&&Math.hypot(n.direction.x-oldParent.direction.x,n.direction.y-oldParent.direction.y,n.direction.z-oldParent.direction.z)<1e-8
        if(old?.direction&&old.parent===id&&old.level===child.level&&parentStable){child.direction={...old.direction};kept.push(child.direction)}
      }
      row.forEach((kid, i) => {
        const child = found.get(kid)
        if(child.direction){assign(kid);return}
        if(previous.size&&kept.length){
          const candidates=Array.from({length:48},(_,j)=>{
            if(n.level===0){const y=1-2*(j+.5)/48,r=Math.sqrt(1-y*y),a=j*GOLDEN_ANGLE+.6;return{x:Math.cos(a)*r,y,z:Math.sin(a)*r}}
            const d=n.direction,u=normalize(cross(d,Math.abs(d.y)>.85?{x:1,y:0,z:0}:{x:0,y:1,z:0})),v=cross(d,u)
            const s=(child.level===2?.58:.38)*Math.sqrt((j+.6)/48),a=j*GOLDEN_ANGLE+child.level*.9
            return normalize({x:d.x*Math.cos(s)+(u.x*Math.cos(a)+v.x*Math.sin(a))*Math.sin(s),y:d.y*Math.cos(s)+(u.y*Math.cos(a)+v.y*Math.sin(a))*Math.sin(s),z:d.z*Math.cos(s)+(u.z*Math.cos(a)+v.z*Math.sin(a))*Math.sin(s)})
          })
          const room=d=>Math.min(...kept.map(k=>Math.hypot(d.x-k.x,d.y-k.y,d.z-k.z)))
          candidates.sort((a,b)=>room(b)-room(a));child.direction=candidates[0]
        } else if (n.level === 0) {
          const y = 1 - 2 * (i + .5) / row.length, ring = Math.sqrt(1 - y * y), azimuth = i * GOLDEN_ANGLE + .6
          child.direction = { x: Math.cos(azimuth) * ring, y, z: Math.sin(azimuth) * ring }
        } else {
          const d = n.direction, u = normalize(cross(d, Math.abs(d.y) > .85 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 })), v = cross(d, u)
          const spread = (child.level === 2 ? .58 : .38) * Math.sqrt((i + .6) / row.length)
          const azimuth = i * GOLDEN_ANGLE + child.level * .9
          const c = Math.cos(spread), s = Math.sin(spread), a = Math.cos(azimuth), b = Math.sin(azimuth)
          child.direction = normalize({ x: d.x*c + (u.x*a+v.x*b)*s, y: d.y*c + (u.y*a+v.y*b)*s, z: d.z*c + (u.z*a+v.z*b)*s })
        }
        kept.push(child.direction)
        assign(kid)
      })
    }
    found.get(root).direction = { x: 0, y: 0, z: 0 }
    assign(root)
    const ceilings=[1];for(let level=1;level<=maxDepth;level++)ceilings[level]=ceilings[level-1]*gainAt(level)
    const result = [...found.values()].map(n => {
      const relative = clamp(n.score / ceilings[n.level], 0, 1)
      const radius = n.level ? radiusAt(n.level) + (1 - relative) * .07 : 0
      return { ...graph.byId.get(n.id), ...n, radius,
        position: { x: n.direction.x * radius, y: n.direction.y * radius, z: n.direction.z * radius } }
    })
    const visible = new Set(found.keys()), counts = Array(maxDepth+1).fill(0)
    for (const n of result) counts[n.level]++
    const links = graph.links.filter(e => visible.has(e.source) && visible.has(e.target)).map(e => ({ ...e,
      tree: found.get(e.source).parent === e.target || found.get(e.target).parent === e.source }))
    return { rootId: root, defaultRootId: core.id, coreMemoryId: core.memoryId, nodes: result, edges: links,
      omitted: graph.byId.size - result.length, counts,maxDepth,fanout,maxNodes }
  }

  class View {
    constructor(canvas, onSelect) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onSelect = onSelect
      this.rawNodes = []; this.rawEdges = []; this.memories = []; this.nodes = []; this.edges = []
      this.selected = ''; this.hover = ''; this.zoom = 1; this.yaw = -.4; this.pitch = .24
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
      this.paused = this.reducedMotion.matches; this.dirty = true; this.lastFrame = 0; this.wave = null
      this.layoutAt = 0; this.signature = ''; this.visible = true; this.drag = null
      this.context='';this.stage=0;this.growth=null;this.lastChange=null;this.extent=1;this.fromExtent=1
      this.labelHits = []
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement)
      this.observer = new IntersectionObserver(rows => { this.visible = !!rows[0]?.isIntersecting; this.dirty = true }); this.observer.observe(canvas)
      this.reducedMotion.addEventListener('change', () => { if (this.reducedMotion.matches) this.paused = true; this.dirty = true; this.onSelect?.(this.nodes.find(n => n.id === this.selected) || null) })
      this.resize(); this.bind()
      const tick = now => {
        const dt = Math.min(50, now - (this.lastFrame || now))
        if (this.visible && this.width && this.height && !document.hidden &&
            (this.dirty || !this.paused || this.wave || this.growth || now - this.layoutAt < 600 || (!this.reducedMotion.matches && this.nodes.length)) &&
            (this.dirty || now - this.lastFrame >= 1000/30)) {
          if (!this.paused && !this.drag && now - (this.lastInteraction || 0) > 1600) this.yaw += dt * .00009
          this.draw(now); this.dirty = false; this.lastFrame = now
        }
        this.animation = requestAnimationFrame(tick)
      }
      this.animation = requestAnimationFrame(tick)
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect(), ratio = Math.min(2, devicePixelRatio || 1)
      this.width = rect.width; this.height = rect.height
      this.canvas.width = Math.round(rect.width * ratio); this.canvas.height = Math.round(rect.height * ratio)
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); this.dirty = true
    }
    setData(nodes, edges, memories = [], context = '') {
      if(context!==this.context){this.context=context;this.signature='';this.nodes=[];this.edges=[];this.model=null;this.rawNodes=[];this.rawEdges=[];this.selected='';this.stage=0;this.lastChange=null;this.growth=null;this.wave=null;this.labelHits=[]}
      const signature = JSON.stringify([nodes, edges, memories.map(m => [m.id, m.pinned, m.importance, m.stability, m.archived, m.semantic])])
      const initialized=!!this.signature,delta=diffGraph({nodes:this.rawNodes,edges:this.rawEdges},{nodes,edges})
      this.rawNodes = nodes; this.rawEdges = edges; this.memories = memories
      if (signature === this.signature) return
      this.signature = signature
      if(initialized&&Object.values(delta).some(v=>v.length)){
        this.lastChange={...delta,at:Date.now()}
        if(!this.reducedMotion.matches)this.growth={...delta,nodes:new Set(delta.addedNodes),edges:new Set([...delta.addedEdges,...delta.changedEdges]),start:performance.now(),duration:2400}
      }
      this.arrange(nodes.some(n => n.id === this.selected) ? this.selected : '', initialized, true)
    }
    arrange(id, animate = true, preserve = false) {
      const now = performance.now(), old = new Map(this.nodes.map(n => [n.id, this.position(n, now)]))
      this.model = buildModel(this.rawNodes, this.rawEdges, this.memories, id, {...PROFILES[this.stage],previousModel:preserve?this.model:null})
      this.selected = this.model.rootId
      this.nodes = this.model.nodes.map(n => {
        const phase = parseInt(wordKey(n.id).slice(-6),16) / 0xffffff * TAU
        return { ...n, starPhase:phase, starRate:.00066+(phase%1)*.00022,
          from: animate && !this.reducedMotion.matches ? old.get(n.id) || old.get(n.parent) || { x: 0, y: 0, z: 0 } : n.position }
      })
      this.fromExtent=this.extent;this.extent=Math.max(1,...this.nodes.map(n=>n.radius+.07));if(!animate||this.reducedMotion.matches)this.fromExtent=this.extent
      this.edges = this.model.edges; this.layoutAt = now; this.dirty = true
      this.hover='';this.labelHits=[];document.getElementById('graphTooltip').hidden=true
      this.canvas.setAttribute('aria-label', `三维星光差序联想图，当前中心 ${this.nodes.find(n => n.id === this.selected)?.label || '暂无'}。拖动观察前后球层，滚轮缩放，方向键旋转，点击星光或词语向三维空间扩散。`)
    }
    position(n, now) {
      const t = this.reducedMotion.matches ? 1 : clamp((now - this.layoutAt) / 520, 0, 1), ease = 1 - Math.pow(1 - t, 3)
      return { x: n.from.x + (n.position.x - n.from.x) * ease, y: n.from.y + (n.position.y - n.from.y) * ease, z: n.from.z + (n.position.z - n.from.z) * ease }
    }
    project(p) {
      const t=this.reducedMotion?.matches?1:clamp((performance.now()-(this.layoutAt||0))/520,0,1),extent=(this.fromExtent||1)+((this.extent||1)-(this.fromExtent||1))*(1-Math.pow(1-t,3))
      const rotated = rotatePoint({x:p.x/extent,y:p.y/extent,z:p.z/extent}, this.yaw, this.pitch), perspective = 3.4 / (3.4 - rotated.z)
      const scale = Math.min(this.width * .39, this.height * .37) * this.zoom
      return { x: this.width / 2 + rotated.x * scale * perspective, y: this.height / 2 + rotated.y * scale * perspective, depth: rotated.z, scale: perspective }
    }
    point(n, now = performance.now()) { return this.project(this.position(n, now)) }
    at(x, y) {
      const hits = this.nodes.map(n => ({ n, p: this.point(n) })).filter(({ n, p }) => Math.hypot(p.x - x, p.y - y) < (n.level === 0 ? 26 : Math.max(12,14*p.scale)))
      const dot = hits.sort((a, b) => b.p.depth - a.p.depth)[0]?.n
      if (dot) return dot
      const label = this.labelHits.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
      return label && this.nodes.find(n => n.id === label.id)
    }
    select(id) {
      const chosen = this.rawNodes.some(n => n.id === id) ? id : this.model?.defaultRootId
      if (!chosen) return
      this.hover = ''; this.labelHits = []
      document.getElementById('graphTooltip').hidden = true
      if (chosen !== this.selected) this.arrange(chosen)
      this.wave = { start: performance.now(), duration: this.reducedMotion.matches ? 180 : Math.max(2800,...this.nodes.map(n=>n.level*500+900)) }
      this.lastInteraction = performance.now(); this.dirty = true
      this.onSelect?.(this.nodes.find(n => n.id === this.selected) || null)
    }
    rotate(dx, dy = 0) { this.yaw += dx; this.pitch = clamp(this.pitch + dy, -1.45, 1.45); this.lastInteraction = performance.now(); this.dirty = true }
    expand() { if(this.stage>=PROFILES.length-1)return;this.stage++;this.arrange(this.selected,true,true);this.onSelect?.(this.nodes.find(n=>n.id===this.selected)||null) }
    collapse() { this.stage=0;this.arrange(this.selected,true,true);this.onSelect?.(this.nodes.find(n=>n.id===this.selected)||null) }
    reset() { this.zoom = 1; this.yaw = -.4; this.pitch = .24; this.stage=0;this.arrange(this.model?.defaultRootId,true);this.select(this.selected) }
    togglePause() { this.paused = !this.paused; this.dirty = true; return this.paused }
    bind() {
      const c = this.canvas, xy = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
      c.addEventListener('pointerdown', e => {
        if (this.drag || e.button !== 0) return
        const p = xy(e); this.drag = { start: p, last: p, node: this.at(p.x, p.y), moved: false, id: e.pointerId }
        c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'
      })
      c.addEventListener('pointermove', e => {
        const p = xy(e)
        if (this.drag) {
          if (e.pointerId !== this.drag.id) return
          const d = this.drag
          if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 4) d.moved = true
          if (d.moved) this.rotate((p.x - d.last.x) * .009, (p.y - d.last.y) * .006)
          d.last = p; return
        }
        const n = this.at(p.x, p.y); this.hover = n?.id || ''; c.style.cursor = n ? 'pointer' : 'grab'
        const tooltip = document.getElementById('graphTooltip')
        tooltip.hidden = !n
        if (n) { tooltip.textContent = `${n.label} · ${n.level ? `第 ${n.level} 圈` : '联想中心'} · 点击展开`; tooltip.style.left = clamp(p.x + 12, 4, Math.max(4, this.width - 180)) + 'px'; tooltip.style.top = Math.max(0, p.y - 32) + 'px' }
        this.dirty = true
      })
      const end = (e, cancelled = false) => {
        if (!this.drag || e.pointerId !== this.drag.id) return
        const d = this.drag; this.drag = null; c.style.cursor = 'grab'
        if (!cancelled && !d.moved && d.node) this.select(d.node.id)
        if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId)
      }
      c.addEventListener('pointerup', e => end(e)); c.addEventListener('pointercancel', e => end(e, true))
      c.addEventListener('lostpointercapture', () => { this.drag = null; c.style.cursor = 'grab' })
      c.addEventListener('pointerleave', () => { document.getElementById('graphTooltip').hidden = true; this.hover = ''; this.dirty = true })
      c.addEventListener('wheel', e => { e.preventDefault(); this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * .001), .6, 2.2); this.dirty = true }, { passive: false })
      c.addEventListener('keydown', e => {
        const actions = { ArrowLeft: () => this.rotate(-.16), ArrowRight: () => this.rotate(.16), ArrowUp: () => this.rotate(0, -.12), ArrowDown: () => this.rotate(0, .12), r: () => this.reset(), '+': () => { this.zoom = Math.min(2.2, this.zoom + .1) }, '-': () => { this.zoom = Math.max(.6, this.zoom - .1) } }
        if (actions[e.key]) { e.preventDefault(); actions[e.key](); this.dirty = true }
      })
    }
    sphere(radius, alpha, pulse = false, offset = { x: 0, y: 0, z: 0 }) {
      const ctx = this.ctx, curves = [], steps = 64
      const latitude = pulse ? [0] : [-.55, 0, .55]
      for (const y of latitude) {
        const ring = Math.sqrt(1-y*y)
        curves.push(Array.from({ length: steps + 1 }, (_, i) => { const a = i / steps * TAU; return { x: Math.cos(a)*ring*radius, y: y*radius, z: Math.sin(a)*ring*radius } }))
      }
      for (const azimuth of [0, Math.PI/3, Math.PI*2/3]) curves.push(Array.from({ length: steps + 1 }, (_, i) => {
        const a = i / steps * TAU
        return { x: Math.cos(a)*Math.cos(azimuth)*radius, y: Math.sin(a)*radius, z: Math.cos(a)*Math.sin(azimuth)*radius }
      }))
      for (const curve of curves) {
        const projected = curve.map(p => this.project({ x: p.x+offset.x, y: p.y+offset.y, z: p.z+offset.z }))
        for (const front of [false, true]) {
          ctx.beginPath()
          for (let i=1; i<projected.length; i++) {
            const a=projected[i-1], b=projected[i]
            if (((a.depth+b.depth) >= 0) !== front) continue
            ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)
          }
          ctx.globalAlpha = alpha * (front ? 1 : .27)
          ctx.strokeStyle = pulse ? '#cf8056' : '#c6a277';ctx.lineWidth = pulse ? 1.35 : .8;ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }
    draw(now) {
      const ctx = this.ctx, w = this.width, h = this.height
      ctx.clearRect(0, 0, w, h)
      this.labelHits = []
      this.canvas.dataset.nodeCount=String(this.nodes.length);this.canvas.dataset.edgeCount=String(this.edges.length)
      this.canvas.dataset.nodeStyle='soft-starlight';this.canvas.dataset.twinkle=this.reducedMotion.matches?'reduced':'gentle'
      if (!this.nodes.length) {this.wave=null;this.growth=null;this.canvas.dataset.center='';this.canvas.dataset.wave='idle';this.canvas.dataset.growth='idle';return}
      const waveAge = this.wave ? now - this.wave.start : -1
      if (this.wave && waveAge > this.wave.duration) this.wave = null
      const growthAge=this.growth?now-this.growth.start:0
      if(this.growth&&growthAge>this.growth.duration)this.growth=null
      const growthPulse=this.growth?1-growthAge/this.growth.duration:0
      const points = new Map(this.nodes.map(n => [n.id, this.point(n, now)])), byId = new Map(this.nodes.map(n => [n.id, n]))
      const color = level => ['#c99249', '#d89a73', '#b7a271', '#ae9cbe'][Math.min(3,level)]
      const globeRadius = Math.min(w*.39,h*.37)*this.zoom*1.025
      const atmosphere = ctx.createRadialGradient(w/2-globeRadius*.3,h/2-globeRadius*.4,0,w/2,h/2,globeRadius)
      atmosphere.addColorStop(0,'#fff8e624');atmosphere.addColorStop(.65,'#edc28a08');atmosphere.addColorStop(1,'#edd4af0b')
      ctx.fillStyle=atmosphere;ctx.beginPath();ctx.arc(w/2,h/2,globeRadius,0,TAU);ctx.fill()
      // Spherical latitude/longitude grids retain front and back segments.
      const displayDepth=Math.max(1,...this.nodes.map(n=>n.level))
      for(let level=1;level<=displayDepth;level++)this.sphere(radiusAt(level)+.04,level===displayDepth?.12:.055)
      for (const edge of this.edges) {
        const a = points.get(edge.source), b = points.get(edge.target), na = byId.get(edge.source), nb = byId.get(edge.target)
        const level = Math.max(na.level, nb.level), hovered = edge.source === this.hover || edge.target === this.hover
        const growing=this.growth?.edges.has(edgeKey(edge))
        const edgeDepth = clamp(.8 + (a.depth+b.depth)*.27,.3,1.2)
        const baseAlpha=level<4?[1,.42,.27,.17][level]:.17*Math.pow(.78,level-3),strength=Math.min(1,.45+edge.weight/4)
        ctx.globalAlpha = hovered ? .76 : growing ? .2+growthPulse*.6 : (edge.tree ? baseAlpha : .025) * edgeDepth * strength
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = hovered || growing ? '#c59358' : color(level); ctx.lineWidth = growing ? 1+growthPulse : (edge.tree ? Math.max(.65,1.35-level*.2) : .55)*(.75+Math.min(.65,Math.sqrt(edge.weight)*.1)); ctx.stroke()
        if (edge.tree && this.wave && !this.reducedMotion.matches) {
          const child = na.parent === nb.id ? na : nb, parent = child === na ? nb : na
          const t = (waveAge - 300 - (child.level - 1) * 500) / 560
          if (t >= 0 && t <= 1) {
            const p = points.get(parent.id), q = points.get(child.id)
            const x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t,r=4.5
            const glow=ctx.createRadialGradient(x,y,0,x,y,r)
            glow.addColorStop(0,'#fff9e2');glow.addColorStop(.24,'#d9b478ad');glow.addColorStop(1,'#d9b47800')
            ctx.globalAlpha=.8/child.level;ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2)
          }
        }
      }
      ctx.globalAlpha = 1
      if (this.wave && !this.reducedMotion.matches) {
        const center = this.position(byId.get(this.selected),now)
        for (let i = 0; i < 2; i++) {
          const t = (waveAge - i * 240) / (this.wave.duration-600)
          if (t < 0 || t > 1) continue
          this.sphere(.065+t*(this.extent+.15),(1-t)*.48,true,center)
        }
      }
      const ordered = [...this.nodes].sort((a, b) => points.get(a.id).depth - points.get(b.id).depth)
      for (const n of ordered) {
        const p = points.get(n.id), isCore = n.level === 0, isHover = n.id === this.hover
        const born=!!this.growth?.nodes.has(n.id),pulse=Math.max(born?growthPulse:0,this.wave ? Math.max(0,1-Math.abs(waveAge-(n.level*500+400))/400) : 0)
        const shimmer=this.reducedMotion.matches?.3:Math.pow((1+Math.sin(now*n.starRate+n.starPhase))/2,6)
        const light=Math.max(shimmer*.7,pulse,isHover?.75:0)
        const r=(isCore?5.4:Math.max(1.9,3.4-n.level*.22)+Math.min(.55,Math.sqrt(n.weight)*.06))*p.scale*(1+light*.08)
        const opacity=(isCore?1:n.level<4?[1,.96,.83,.68][n.level]:Math.max(.3,.68*Math.pow(.83,n.level-3))) * clamp(.82+p.depth*.28,.5,1) * (born?clamp(growthAge/450,.08,1):1)
        ctx.save();ctx.translate(p.x,p.y)
        // A tiny light source with feathered bloom, not an outlined star symbol.
        const halo=r*(isCore?5.5:4)+light*5
        const glow=ctx.createRadialGradient(0,0,0,0,0,halo)
        glow.addColorStop(0,color(n.level)+'65');glow.addColorStop(.25,color(n.level)+'29');glow.addColorStop(.65,color(n.level)+'09');glow.addColorStop(1,color(n.level)+'00')
        ctx.globalAlpha=opacity*(.6+light*.35);ctx.fillStyle=glow;ctx.fillRect(-halo,-halo,halo*2,halo*2)
        // Faint diffraction light only becomes noticeable at the twinkle peak.
        ctx.save();ctx.rotate(Math.sin(n.starPhase)*.12)
        const rayLength=r*(isCore?3.5:2.7)+light*5
        const ray=ctx.createLinearGradient(-rayLength,0,rayLength,0)
        ray.addColorStop(0,color(n.level)+'00');ray.addColorStop(.38,color(n.level)+'38');ray.addColorStop(.5,'#fff7d9');ray.addColorStop(.62,color(n.level)+'38');ray.addColorStop(1,color(n.level)+'00')
        ctx.strokeStyle=ray;ctx.lineWidth=isCore?1:.65;ctx.shadowColor=color(n.level);ctx.shadowBlur=4
        ctx.globalAlpha=opacity*((isCore?.14:.025)+light*.25)
        for(let axis=0;axis<2;axis++){ctx.beginPath();ctx.moveTo(-rayLength,0);ctx.lineTo(rayLength,0);ctx.stroke();ctx.rotate(Math.PI/2)}
        ctx.restore()
        const point=ctx.createRadialGradient(0,0,0,0,0,r*1.7)
        point.addColorStop(0,'#fffefa');point.addColorStop(.1,'#fff9e6');point.addColorStop(.27,color(n.level)+'d5');point.addColorStop(.46,color(n.level)+'70');point.addColorStop(.73,color(n.level)+'18');point.addColorStop(1,color(n.level)+'00')
        ctx.globalAlpha=opacity*(.86+light*.14);ctx.fillStyle=point;ctx.fillRect(-r*1.7,-r*1.7,r*3.4,r*3.4)
        ctx.restore()
      }
      ctx.globalAlpha = 1
      // Place important labels first; hide colliding secondary labels, never the selected label.
      const boxes = [], labels = [...this.nodes].sort((a, b) => (b.id === this.hover) - (a.id === this.hover) || a.level - b.level || b.score - a.score)
      for (const n of labels) {
        const p = points.get(n.id), core = n.level === 0, hover = n.id === this.hover
        const text = n.label.length > 11 ? n.label.slice(0, 10) + '…' : n.label
        ctx.font = `${core || hover ? '600' : '400'} ${core ? 16 : 12}px "Microsoft YaHei",sans-serif`
        const width = ctx.measureText(text).width + 14, y = p.y + (core ? 31 : 20), box = { x: p.x - width / 2, y: y - 13, w: width, h: 21 }
        if (!core && !hover && (boxes.some(b => box.x < b.x + b.w + 3 && box.x + box.w + 3 > b.x && box.y < b.y + b.h + 2 && box.y + box.h + 2 > b.y) || box.x < 3 || box.x + box.w > w - 3 || box.y + box.h > h - 8)) continue
        boxes.push(box); this.labelHits.push({ ...box, id: n.id }); ctx.fillStyle = core ? '#fff3dfed' : '#fffaf1d9'; ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 7); ctx.fill()
        ctx.globalAlpha = core || hover ? 1 : clamp(.85+p.depth*.2,.58,1)
        ctx.fillStyle = core ? '#9d603c' : hover ? '#975a37' : n.level >= 3 ? '#9a8c7d' : '#876d55'; ctx.textAlign = 'center'; ctx.fillText(text, p.x, y + 2)
        ctx.globalAlpha = 1
      }
      // Small orientation guide makes the depth rotation visible even on sparse graphs.
      const origin={x:w-38,y:h-44}
      for (const [axis,tint] of [[{x:1,y:0,z:0},'#c98967'],[{x:0,y:1,z:0},'#b8a078'],[{x:0,y:0,z:1},'#a49bb7']]) {
        const v=rotatePoint(axis,this.yaw,this.pitch)
        ctx.strokeStyle=tint;ctx.lineWidth=1.5;ctx.globalAlpha=v.z<0?.45:.85;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(origin.x+v.x*20,origin.y+v.y*20);ctx.stroke()
        ctx.fillStyle=tint;ctx.beginPath();ctx.arc(origin.x+v.x*20,origin.y+v.y*20,2.4,0,TAU);ctx.fill()
      }
      ctx.globalAlpha=1;ctx.font='10px "Microsoft YaHei",sans-serif';ctx.fillStyle='#ae987f';ctx.textAlign='center';ctx.fillText('3D',origin.x,origin.y+32)
      this.canvas.dataset.rotation = `${this.yaw.toFixed(3)},${this.pitch.toFixed(3)}`
      this.canvas.dataset.center = this.selected
      this.canvas.dataset.wave = this.wave ? 'active' : 'idle'
      this.canvas.dataset.layout = 'spherical-3d'
      this.canvas.dataset.growth = this.growth ? 'active' : 'idle'
    }
  }
  globalThis.MemoryNetwork = { buildModel, View, rotatePoint, diffGraph,wordKey,profiles:PROFILES.map(p=>({...p})),ringGain: [...RING_GAIN] }
})()
