/** Fixed, synthetic demonstrations. No plugin, user memory, storage, or network. */
const HOURS = 168;
const OBSERVATION_HOUR = 24;
const MAX_STABILITY = 60000;
const PRESETS = { meal: 14, event: 48, promise: 192 };
const RING_WEIGHTS = [1, 0.55, 0.30, 0.16];
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = {
  primary: '#ed593b', reinforced: '#7a55c4', ink: '#1f2421', muted: '#727873',
  grid: 'rgba(35, 40, 35, 0.10)', baseline: '#8d9d91',
};
let initialized = false;
let waitingForDom = false;

const retention = (hours, stability) => Math.exp(-hours / stability);
const formatNumber = (number, digits = 1) => new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: digits,
}).format(number);
const percent = value => `${formatNumber(value * 100)}%`;
const tierOf = stability => stability >= 720 ? '永久层' : stability >= 72 ? '长期记忆' : stability >= 4 ? '短期记忆' : '瞬时记忆';
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function motionPreference() {
  const system = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  let paused = document.documentElement.classList.contains('motion-paused');
  let previous = paused || system.matches;
  const listeners = new Set();
  const preference = {
    get matches() { return paused || system.matches; },
    addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
  };
  function changed() {
    if (previous === preference.matches) return;
    previous = preference.matches;
    for (const listener of listeners) listener({ matches: previous });
  }
  window.addEventListener('memory-motion-change', event => {
    if (typeof event.detail?.paused !== 'boolean') return;
    paused = event.detail.paused;
    changed();
  });
  system.addEventListener?.('change', changed);
  return preference;
}

function initDecayLab(reducedMotion) {
  const canvas = document.getElementById('decay-chart');
  const slider = document.getElementById('stability');
  if (!canvas || !slider) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  const stabilityOutput = document.getElementById('stability-value');
  const retentionOutput = document.getElementById('retention-value');
  const tierOutput = document.getElementById('tier-value');
  const status = document.getElementById('lab-status');
  const reinforceButton = document.getElementById('reinforce');
  const resetButton = document.getElementById('reset-curve');
  const presetButtons = [...document.querySelectorAll('button[data-memory-preset]')];
  const minimum = Math.max(0.1, Number(slider.min) || 4);
  const originalMax = Math.max(240, Number(slider.max) || 240);
  const initial = clamp(Number(slider.value) || 48, minimum, MAX_STABILITY);
  let baseline = initial;
  let stability = initial;
  let displayedStability = initial;
  let reinforcementCount = 0;
  let preset = Object.keys(PRESETS).find(key => PRESETS[key] === initial) || null;
  let width = 0;
  let height = 0;
  let animation = 0;

  slider.step = 'any';
  canvas.style.width = '100%';
  canvas.setAttribute('role', 'img');
  if (status) {
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
  }

  function updateControls(message) {
    slider.max = String(Math.min(MAX_STABILITY, Math.max(originalMax, Math.ceil(stability / 120) * 120)));
    slider.value = String(stability);
    slider.setAttribute('aria-valuetext', `${formatNumber(stability, 2)} 小时，24 小时模拟留存 ${percent(retention(24, stability))}`);
    if (stabilityOutput) {
      stabilityOutput.textContent = formatNumber(stability, 2);
      if ('value' in stabilityOutput) stabilityOutput.value = stabilityOutput.textContent;
    }
    if (retentionOutput) retentionOutput.textContent = percent(retention(24, stability));
    for (const legend of document.querySelectorAll('.legend-current')) {
      legend.style.backgroundColor = reinforcementCount > 0 ? COLORS.reinforced : COLORS.primary;
    }
    if (tierOutput) {
      tierOutput.textContent = tierOf(stability);
      tierOutput.title = '层级按 S 划分：低于 4 小时为瞬时；4–72 小时为短期；72–720 小时为长期；720 小时及以上为永久层。永久层仍按指数曲线衰减。';
    }
    if (reinforceButton) {
      reinforceButton.disabled = stability >= MAX_STABILITY;
      reinforceButton.title = stability >= MAX_STABILITY ? '已到达本示意的稳定性上限' : '稳定性乘 1.6，在相同的 24 小时观察点比较';
    }
    for (const button of presetButtons) button.setAttribute('aria-pressed', String(button.dataset.memoryPreset === preset));
    if (status) status.textContent = `${message} 半衰期 ${formatNumber(stability * Math.LN2)} 小时；24 小时留存 ${percent(retention(24, stability))}。仅为数学示意，不读取真实记忆；留存值不是事实正确率。`;
    canvas.setAttribute('aria-label', `指数遗忘曲线：横轴 0 到 168 小时，纵轴模拟留存 0 到 100%。基线 S 为 ${formatNumber(baseline, 2)} 小时，当前 S 为 ${formatNumber(stability, 2)} 小时，24 小时留存 ${percent(retention(24, stability))}，半衰期 ${formatNumber(stability * Math.LN2)} 小时。`);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const nextWidth = Math.max(240, Math.round(box.width || canvas.parentElement?.clientWidth || 680));
    const nextHeight = Math.round(box.height >= 240 ? box.height : clamp(nextWidth * 0.49, 290, 370));
    if (box.height < 240) canvas.style.height = `${nextHeight}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(displayedStability);
  }

  function draw(current) {
    if (!width || !height) return;
    const ctx = context;
    const margin = { left: 46, right: 20, top: 52, bottom: 47 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const x = time => margin.left + (time / HOURS) * plotWidth;
    const y = strength => margin.top + (1 - strength) * plotHeight;
    const enhanced = reinforcementCount > 0;
    const curveColor = enhanced ? COLORS.reinforced : COLORS.primary;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui, -apple-system, "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';

    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(x(0), y(fraction)); ctx.lineTo(x(HOURS), y(fraction)); ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      ctx.fillText(`${fraction * 100}%`, margin.left - 9, y(fraction));
    }
    const ticks = width < 470 ? [0, 24, 72, 120, 168] : [0, 24, 48, 72, 96, 120, 144, 168];
    for (const hour of ticks) {
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(x(hour), y(1)); ctx.lineTo(x(hour), y(0)); ctx.stroke();
      ctx.fillStyle = hour === 24 ? curveColor : COLORS.muted;
      ctx.textAlign = hour === 0 ? 'left' : hour === HOURS ? 'right' : 'center';
      ctx.fillText(String(hour), x(hour), y(0) + 18);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.fillText('经过时间 / 小时', x(HOURS), height - 9);

    const curvePath = value => {
      ctx.beginPath();
      for (let step = 0; step <= 280; step++) {
        const time = HOURS * step / 280;
        if (!step) ctx.moveTo(x(time), y(retention(time, value)));
        else ctx.lineTo(x(time), y(retention(time, value)));
      }
    };
    const gradient = ctx.createLinearGradient(0, y(1), 0, y(0));
    gradient.addColorStop(0, enhanced ? 'rgba(122, 85, 196, 0.15)' : 'rgba(237, 89, 59, 0.14)');
    gradient.addColorStop(1, 'rgba(237, 89, 59, 0)');
    curvePath(current);
    ctx.lineTo(x(HOURS), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();

    curvePath(baseline);
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = COLORS.baseline; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.setLineDash([]);
    curvePath(current);
    ctx.strokeStyle = curveColor; ctx.lineWidth = 2.7;
    ctx.shadowColor = curveColor; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;

    const markerX = x(OBSERVATION_HOUR);
    const markerY = y(retention(OBSERVATION_HOUR, current));
    ctx.beginPath(); ctx.moveTo(markerX, y(1)); ctx.lineTo(markerX, y(0));
    ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(70, 70, 66, 0.30)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    if (enhanced) {
      ctx.beginPath(); ctx.arc(markerX, y(retention(24, baseline)), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.baseline; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(markerX, markerY, 10, 0, Math.PI * 2);
    ctx.fillStyle = enhanced ? 'rgba(122, 85, 196, 0.12)' : 'rgba(237, 89, 59, 0.12)'; ctx.fill();
    ctx.beginPath(); ctx.arc(markerX, markerY, 4.3, 0, Math.PI * 2);
    ctx.fillStyle = curveColor; ctx.fill();
    ctx.fillStyle = COLORS.ink; ctx.textAlign = 'left';
    ctx.font = '12px system-ui, -apple-system, "Microsoft YaHei", sans-serif';
    ctx.fillText(`24 h · ${percent(retention(24, current))}`, markerX + 13, Math.max(margin.top + 13, markerY - 14));

    function legend(left, color, text, dashed, legendY = 22) {
      ctx.beginPath(); ctx.moveTo(left, legendY); ctx.lineTo(left + 20, legendY);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [4, 3] : []); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLORS.muted; ctx.textAlign = 'left';
      ctx.font = '11px system-ui, -apple-system, "Microsoft YaHei", sans-serif';
      ctx.fillText(text, left + 27, legendY);
    }
    const narrow = width < 410;
    legend(margin.left, COLORS.baseline, `基线 ${formatNumber(baseline, 1)} h`, true, narrow ? 15 : 22);
    legend(narrow ? margin.left : Math.max(width * 0.53, 167), curveColor, enhanced ? `强化 ${formatNumber(current, 1)} h` : '当前曲线', false, narrow ? 33 : 22);
  }

  function redraw(animate = false) {
    cancelAnimationFrame(animation);
    if (!animate || reducedMotion.matches) {
      displayedStability = stability;
      draw(displayedStability);
      return;
    }
    const from = displayedStability;
    const to = stability;
    const started = performance.now();
    const frame = now => {
      const progress = clamp((now - started) / 420, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      displayedStability = from + (to - from) * eased;
      draw(displayedStability);
      if (progress < 1) animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
  }

  function setBaseline(value, selectedPreset = null) {
    baseline = stability = clamp(value, minimum, MAX_STABILITY);
    reinforcementCount = 0;
    preset = selectedPreset;
    updateControls('已设定新的比较基线。');
    redraw();
  }
  slider.addEventListener('input', () => setBaseline(Number(slider.value) || minimum));
  reinforceButton?.addEventListener('click', () => {
    stability = Math.min(MAX_STABILITY, stability * 1.6);
    reinforcementCount += 1;
    updateControls(`已强化 ${reinforcementCount} 次，S 每次乘 1.6；比较使用相同的时间起点。`);
    redraw(true);
  });
  resetButton?.addEventListener('click', () => {
    stability = baseline;
    reinforcementCount = 0;
    updateControls('已撤销强化，恢复所选基线。');
    redraw();
  });
  for (const button of presetButtons) button.addEventListener('click', () => {
    const name = button.dataset.memoryPreset;
    if (Object.hasOwn(PRESETS, name)) setBaseline(PRESETS[name], name);
  });
  reducedMotion.addEventListener?.('change', () => {
    if (!reducedMotion.matches && reinforcementCount > 0) displayedStability = baseline;
    redraw(!reducedMotion.matches && reinforcementCount > 0);
  });
  updateControls('调节稳定性 S，或点击强化观察曲线变化。');
  resize();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  window.addEventListener('resize', resize, { passive: true });
}

const NODES = [
  { word: '火锅', x: 105, y: 142 },
  { word: '小陈', x: 310, y: 78 },
  { word: '毕业聚餐', x: 520, y: 130 },
  { word: '海边', x: 777, y: 94 },
  { word: '旅行', x: 746, y: 302 },
  { word: '周日', x: 496, y: 294 },
  { word: '约定', x: 238, y: 305 },
];
const MOBILE_NODES = [
  { word: '火锅', x: 78, y: 68 },
  { word: '小陈', x: 240, y: 68 },
  { word: '毕业聚餐', x: 402, y: 68 },
  { word: '海边', x: 402, y: 230 },
  { word: '旅行', x: 315, y: 345 },
  { word: '周日', x: 240, y: 230 },
  { word: '约定', x: 78, y: 230 },
];
const EDGES = [
  { a: '火锅', b: '小陈', w: 2.8, bend: -16 },
  { a: '火锅', b: '毕业聚餐', w: 1.5, bend: 40 },
  { a: '小陈', b: '毕业聚餐', w: 2.2, bend: -14 },
  { a: '毕业聚餐', b: '海边', w: 0.8, bend: -18 },
  { a: '海边', b: '旅行', w: 2.8, bend: -15 },
  { a: '旅行', b: '周日', w: 1.4, bend: -16 },
  { a: '周日', b: '约定', w: 2.4, bend: -18 },
  { a: '约定', b: '小陈', w: 1.0, bend: -28 },
  { a: '小陈', b: '周日', w: 0.8, bend: 20 },
];

/** Max-product propagation: a new ring multiplies its parent's existing score. */
function propagate(seed) {
  const scores = new Map([[seed, { score: 1, ring: 0, parent: null }]]);
  let frontier = [seed];
  for (let ring = 1; ring <= 3 && frontier.length; ring += 1) {
    const next = new Set();
    for (const word of frontier) {
      const parent = scores.get(word);
      if (parent.ring !== ring - 1) continue;
      for (const edge of EDGES) {
        const target = edge.a === word ? edge.b : edge.b === word ? edge.a : null;
        if (!target) continue;
        const score = parent.score * RING_WEIGHTS[ring] * Math.min(1, 0.45 + edge.w / 4);
        if (score > (scores.get(target)?.score || 0)) {
          scores.set(target, { score, ring, parent: word });
          next.add(target);
        }
      }
    }
    frontier = [...next];
  }
  return scores;
}

function initAssociationLab(reducedMotion) {
  const svg = document.getElementById('association-svg');
  if (!svg) return;
  const result = document.getElementById('association-result');
  if (result) {
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    result.setAttribute('aria-atomic', 'true');
  }
  const buttons = [...document.querySelectorAll('button[data-cue]')];
  const clickable = new Set(['火锅', '海边', '小陈']);
  const nodeByWord = new Map(NODES.map(node => [node.word, node]));
  const nodeElements = new Map();
  const edgeElements = [];
  const ringNames = ['线索', '第一环', '第二环', '第三环'];
  const ringColors = [COLORS.primary, '#d87850', '#9566bd', '#6e5897'];
  let animations = [];
  let activeCue = '火锅';
  let compact = false;
  let layoutSignature = '';
  svg.setAttribute('viewBox', '0 0 900 420');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', '固定示例词图。可用上方按钮或图中火锅、海边、小陈切换传播线索。');
  const title = svgElement('title', {}, '从一个词出发，观察三环联想');
  const desc = svgElement('desc', {}, '节点与边都是固定合成示例；边上的 w 表示共现权重。每圈继续乘 0.55、0.30、0.16，边增益为 min(1, 0.45 + w/4)，多路径取最大值。光路和节点分数表示演示传播强度，不代表事实正确率、发生概率或因果。');
  const defs = svgElement('defs');
  const filter = svgElement('filter', { id: 'lab-neural-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
  filter.append(svgElement('feGaussianBlur', { stdDeviation: 3, result: 'blur' }));
  const merge = svgElement('feMerge');
  merge.append(svgElement('feMergeNode', { in: 'blur' }), svgElement('feMergeNode', { in: 'SourceGraphic' }));
  filter.append(merge); defs.append(filter);
  const edgeLayer = svgElement('g', { fill: 'none' });
  const labelLayer = svgElement('g');
  const nodeLayer = svgElement('g');
  svg.replaceChildren(title, desc, defs, edgeLayer, labelLayer, nodeLayer);

  function edgeGeometry(edge) {
    const a = nodeByWord.get(edge.a), b = nodeByWord.get(edge.b);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const bend = compact && edge.a === '火锅' && edge.b === '毕业聚餐' ? -65 : edge.bend;
    const control = { x: (a.x + b.x) / 2 - (b.y - a.y) / length * bend, y: (a.y + b.y) / 2 + (b.x - a.x) / length * bend };
    const forward = `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`;
    const reverse = `M ${b.x} ${b.y} Q ${control.x} ${control.y} ${a.x} ${a.y}`;
    return { forward, reverse, midX: (a.x + 2 * control.x + b.x) / 4, midY: (a.y + 2 * control.y + b.y) / 4 };
  }
  for (const edge of EDGES) {
    const { forward, reverse, midX, midY } = edgeGeometry(edge);
    const base = svgElement('path', { d: forward, stroke: '#8e978f', 'stroke-opacity': 0.6, 'stroke-width': 1.2 });
    const glow = svgElement('path', { d: forward, stroke: COLORS.primary, 'stroke-width': 2.2, 'stroke-linecap': 'round', filter: 'url(#lab-neural-glow)', opacity: 0 });
    edgeLayer.append(base, glow);
    const weight = svgElement('text', { x: midX, y: midY - 9, fill: COLORS.muted, 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'system-ui, sans-serif' }, `w ${edge.w.toFixed(1)}`);
    labelLayer.append(weight);
    edgeElements.push({ edge, base, glow, weight, forward, reverse });
  }
  for (const node of NODES) {
    const group = svgElement('g', { transform: `translate(${node.x} ${node.y})`, 'data-node': node.word });
    const halo = svgElement('circle', { r: 41, fill: 'none', stroke: COLORS.primary, 'stroke-width': 1, opacity: 0.2 });
    const outer = svgElement('circle', { r: 29, fill: '#fffefa', stroke: '#969e97', 'stroke-width': 1.4 });
    const core = svgElement('circle', { r: 5, fill: COLORS.primary, filter: 'url(#lab-neural-glow)' });
    const name = svgElement('text', { y: 49, fill: COLORS.ink, 'font-size': 17, 'font-weight': 600, 'text-anchor': 'middle', 'font-family': 'system-ui, "Microsoft YaHei", sans-serif' }, node.word);
    const score = svgElement('text', { y: 68, fill: COLORS.muted, 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'system-ui, "Microsoft YaHei", sans-serif' });
    group.append(halo, outer, core, name, score);
    if (clickable.has(node.word)) {
      group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', `用${node.word}作为联想线索`);
      group.style.cursor = 'pointer';
      group.addEventListener('click', () => selectCue(node.word));
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCue(node.word); }
      });
      group.addEventListener('focus', () => halo.setAttribute('stroke-width', '3'));
      group.addEventListener('blur', () => halo.setAttribute('stroke-width', '1'));
    }
    nodeLayer.append(group);
    nodeElements.set(node.word, { group, halo, outer, core, name, score });
  }

  function selectCue(seed, animate = true) {
    if (!nodeByWord.has(seed)) return;
    activeCue = seed;
    for (const animation of animations) animation.cancel();
    animations = [];
    const scores = propagate(seed);
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.cue === seed));
    for (const [word, elements] of nodeElements) {
      const hit = scores.get(word);
      const color = hit ? ringColors[hit.ring] : '#969e97';
      const brightness = hit ? 0.32 + 0.68 * Math.sqrt(hit.score) : 0.18;
      elements.outer.setAttribute('stroke', color);
      elements.outer.setAttribute('stroke-opacity', String(brightness));
      elements.outer.setAttribute('stroke-width', word === seed ? '2.1' : '1.4');
      elements.halo.setAttribute('stroke', color);
      elements.halo.setAttribute('opacity', word === seed ? '0.65' : String(brightness * 0.45));
      elements.core.setAttribute('fill', color);
      elements.core.setAttribute('r', word === seed ? '8' : String(3 + 3 * brightness));
      elements.core.setAttribute('opacity', String(brightness));
      elements.name.setAttribute('fill', word === seed ? '#9e3926' : COLORS.ink);
      elements.score.textContent = hit ? `${ringNames[hit.ring]} · ${hit.score.toFixed(3)}` : '未被激活';
      elements.group.setAttribute('aria-label', `${word}，${hit ? `${ringNames[hit.ring]}，示例传播强度 ${hit.score.toFixed(3)}` : '未被激活'}${clickable.has(word) ? '；可切换为联想线索' : ''}`);
      if (clickable.has(word)) elements.group.setAttribute('aria-pressed', String(word === seed));
    }
    for (const elements of edgeElements) {
      const { edge, glow, weight } = elements;
      const towardB = scores.get(edge.b)?.parent === edge.a;
      const towardA = scores.get(edge.a)?.parent === edge.b;
      const target = towardB ? scores.get(edge.b) : towardA ? scores.get(edge.a) : null;
      glow.setAttribute('d', towardA ? elements.reverse : elements.forward);
      glow.setAttribute('opacity', target ? String(0.30 + 0.7 * Math.sqrt(target.score)) : '0');
      glow.setAttribute('stroke', target ? ringColors[target.ring] : COLORS.primary);
      weight.setAttribute('fill', target ? '#4b524c' : COLORS.muted);
      if (target && animate && !reducedMotion.matches && typeof glow.animate === 'function') {
        const length = glow.getTotalLength();
        animations.push(glow.animate([
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 },
        ], { duration: 580, delay: (target.ring - 1) * 130, easing: 'ease-out', fill: 'backwards' }));
      }
    }
    if (!result) return;
    const ranked = [...scores.entries()].filter(([word]) => word !== seed).sort((a, b) => b[1].score - a[1].score);
    const farthest = [...ranked].sort((a, b) => b[1].ring - a[1].ring || b[1].score - a[1].score)[0];
    const route = [];
    for (let word = farthest?.[0]; word; word = scores.get(word)?.parent) route.unshift(word);
    const heading = document.createElement('strong');
    heading.textContent = `从「${seed}」出发`;
    const pathText = document.createElement('p');
    pathText.textContent = route.length ? `远端示例：${route.join(' → ')} · 强度 ${farthest[1].score.toFixed(3)}` : '当前线索没有连接到示例词图。';
    result.replaceChildren(heading, pathText);
  }
  function updateLayout() {
    const box = svg.getBoundingClientRect();
    const isCompact = window.innerWidth < 600;
    const signature = `${isCompact}:${Math.round(box.width)}:${Math.round(box.height)}`;
    if (signature === layoutSignature) return;
    layoutSignature = signature;
    compact = isCompact;
    svg.setAttribute('viewBox', compact ? '0 0 480 440' : '0 0 900 420');
    // Compensate for SVG scaling so mobile labels remain about 16/10 screen px.
    const scale = compact ? Math.min((box.width || 480) / 480, (box.height || 440) / 440) : 1;
    const fontScale = compact ? clamp(1 / scale, 1, 2.5) : 1;
    for (const node of compact ? MOBILE_NODES : NODES) {
      nodeByWord.set(node.word, node);
      const elements = nodeElements.get(node.word);
      elements.group.setAttribute('transform', `translate(${node.x} ${node.y})`);
      elements.name.setAttribute('font-size', String((compact ? 16 : 17) * fontScale));
      elements.score.setAttribute('font-size', String((compact ? 10 : 11) * fontScale));
      elements.name.setAttribute('y', compact ? '56' : '49');
      elements.score.setAttribute('y', compact ? '78' : '68');
    }
    for (const elements of edgeElements) {
      const geometry = edgeGeometry(elements.edge);
      elements.forward = geometry.forward;
      elements.reverse = geometry.reverse;
      elements.base.setAttribute('d', geometry.forward);
      elements.weight.setAttribute('x', String(geometry.midX));
      elements.weight.setAttribute('y', String(geometry.midY - 9));
      // The seven labelled nodes take priority over nine tiny edge labels on phones.
      elements.weight.setAttribute('display', compact ? 'none' : 'inline');
    }
    selectCue(activeCue, false);
  }
  for (const button of buttons) button.addEventListener('click', () => selectCue(button.dataset.cue));
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) { for (const animation of animations) animation.cancel(); animations = []; }
    else selectCue(activeCue, true);
  });
  updateLayout();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateLayout).observe(svg.parentElement || svg);
  window.addEventListener('resize', updateLayout, { passive: true });
}

export function initLab() {
  if (initialized || typeof document === 'undefined') return;
  if (!document.getElementById('decay-chart') && !document.getElementById('association-svg')) {
    if (document.readyState === 'loading' && !waitingForDom) {
      waitingForDom = true;
      document.addEventListener('DOMContentLoaded', initLab, { once: true });
    }
    return;
  }
  initialized = true;
  const reducedMotion = motionPreference();
  initDecayLab(reducedMotion);
  initAssociationLab(reducedMotion);
}
