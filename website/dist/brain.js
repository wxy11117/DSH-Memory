/** A small, dependency-free cortical constellation. Coordinates stay in 3D. */
const mountedBrains = new WeakMap();
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, amount) => a + (b - a) * amount;

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** The folded, slightly asymmetric surface of one hemisphere. */
function cortex(side, latitude, longitude, inset = 0) {
  const latitudeCos = Math.cos(latitude);
  // Each lobe is one HALF of the same broad cerebral envelope. Giving each
  // hemisphere its own translated ellipsoid makes the silhouette look like
  // lungs: their poles stay far apart. Here both poles meet at a fine fissure.
  const halfAngle = ((longitude % TAU + TAU) % TAU) * 0.5;
  const front = Math.cos(halfAngle);
  const folds = 1
    + 0.037 * Math.sin(longitude * 7 + Math.sin(latitude * 4) * 1.8)
    + 0.026 * Math.cos(latitude * 13 + longitude * 2 + side * 0.6)
    + 0.012 * Math.sin(latitude * 21 - longitude * 5);
  const temporal = Math.exp(-Math.pow((latitude + 0.42) / 0.3, 2));
  const frontal = Math.max(0, front) * 0.025;
  const width = (0.975 + temporal * 0.032) * folds * (1 - inset);
  const fissure = 0.012 + 0.006 * latitudeCos;
  const x = side * (fissure + width * latitudeCos * Math.sin(halfAngle));
  const y = Math.sin(latitude) * 0.71 * folds
    + 0.018 * front * latitudeCos - 0.018 * Math.cos(longitude * 2) * latitudeCos;
  const z = front * latitudeCos * (0.70 + frontal) * folds * (1 - inset)
    + Math.sin(latitude) * 0.035;
  return { x, y, z };
}

function bezier(a, b, c, d, t) {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    z: u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z,
  };
}

function makeAnatomy(compact) {
  const random = seededRandom(19371);
  const rows = compact ? 11 : 15;
  const columns = compact ? 48 : 76;
  const nodes = [];
  const edges = [];
  const fibers = [];
  const satellites = [];

  for (const side of [-1, 1]) {
    const offset = nodes.length;
    for (let row = 0; row < rows; row++) {
      const baseLatitude = mix(-1.46, 1.49, row / (rows - 1));
      for (let column = 0; column < columns; column++) {
        const angle = column / columns * TAU;
        // Meandering gyri, rather than straight latitude lines on a sphere.
        const latitude = baseLatitude
          + (Math.sin(angle * 3 + row * 0.68 + side) * 0.067
          + Math.sin(angle * 6 - row * 0.4) * 0.026) * Math.cos(baseLatitude);
        const longitude = angle + Math.sin(baseLatitude * 3) * 0.08;
        const position = cortex(side, latitude, longitude);
        nodes.push({
          ...position,
          seed: random(),
          size: 0.48 + random() * 0.91,
          side,
          ridge: row % 3 === 0,
        });
        const index = offset + row * columns + column;
        edges.push({ a: index, b: offset + row * columns + (column + 1) % columns, ridge: true });
        if (row && column % 3 !== 1) {
          const slant = (row % 2 ? 1 : -1) + columns;
          edges.push({ a: index, b: offset + (row - 1) * columns + (column + slant) % columns, ridge: false });
        }
        if (row > 1 && column % 13 === 0) {
          edges.push({ a: index, b: offset + (row - 2) * columns + (column + 5) % columns, ridge: false });
        }
      }
    }

    // Curved white-matter bundles underneath the cortical folds.
    const bundleCount = compact ? 13 : 23;
    for (let i = 0; i < bundleCount; i++) {
      const phase = i / bundleCount;
      const a = cortex(side, -0.9 + phase * 1.6, 0.25 + phase * 2.1, 0.08);
      const d = cortex(side, 0.7 - phase * 1.4, 2.7 + phase * 2.4, 0.12);
      const b = { x: side * (0.18 + phase * 0.2), y: 0.35, z: 0.22 - phase * 0.4 };
      const c = { x: side * 0.25, y: -0.36, z: 0.27 };
      fibers.push({ a, b, c, d, phase: random(), bridge: false });
    }
  }

  // A small corpus-callosum fan ties the two lobes together without filling
  // the longitudinal fissure. The descending bundle suggests a brain stem.
  const bridges = compact ? 8 : 13;
  for (let i = 0; i < bridges; i++) {
    const t = i / (bridges - 1);
    fibers.push({
      a: { x: -0.44, y: mix(-0.11, 0.24, t), z: mix(-0.42, 0.45, t) },
      b: { x: -0.2, y: 0.36 + t * 0.07, z: mix(-0.28, 0.33, t) },
      c: { x: 0.2, y: 0.36 + t * 0.07, z: mix(-0.28, 0.33, t) },
      d: { x: 0.44, y: mix(-0.11, 0.24, t), z: mix(-0.42, 0.45, t) },
      phase: random(), bridge: true,
    });
    fibers.push({
      a: { x: mix(-0.38, 0.38, t), y: -0.35, z: -0.22 },
      b: { x: mix(-0.13, 0.13, t), y: -0.58, z: -0.31 },
      c: { x: mix(-0.08, 0.08, t), y: -0.79, z: -0.23 },
      d: { x: mix(-0.07, 0.07, t), y: -0.95, z: -0.14 },
      phase: random(), bridge: false,
    });
  }

  for (let i = 0; i < (compact ? 20 : 35); i++) {
    const angle = i / (compact ? 20 : 35) * TAU + random() * 0.2;
    const radius = 1.27 + random() * 0.3;
    const side = Math.cos(angle) < 0 ? -1 : 1;
    satellites.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.76,
      z: (random() - 0.5) * 0.9,
      seed: random(),
      anchor: cortex(side, clamp(Math.sin(angle) * 0.95, -1, 1), Math.PI * (0.2 + random() * 0.65)),
    });
  }
  return { nodes, edges, fibers, satellites };
}

/**
 * Mount a transparent, responsive brain illustration.
 * Modes: observe | encode | recall. No host state or network access is used.
 * The optional destroy() is useful when a page replaces its canvas.
 */
export function initBrain(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { pulse() {}, setMode() {}, setPaused() {}, destroy() {} };
  }
  mountedBrains.get(canvas)?.destroy();
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { pulse() {}, setMode() {}, setPaused() {}, destroy() {} };

  const compact = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const anatomy = makeAnatomy(compact);
  const nodes = anatomy.nodes;
  const projected = nodes.map(() => ({ x: 0, y: 0, z: 0, perspective: 1 }));
  const energy = new Float32Array(nodes.length);
  const waves = [];
  const disposers = [];
  let width = 1;
  let height = 1;
  let dpr = 1;
  let scale = 1;
  let sceneTime = 0;
  let lastTime = 0;
  let lastPaint = 0;
  let frame = 0;
  let mode = 'observe';
  let manualPause = false;
  let visible = true;
  let destroyed = false;
  let reducedMotion = motionPreference.matches;
  let drag = null;
  let yaw = -0.49;
  let pitch = 0.36;
  let yawTarget = yaw;
  let pitchTarget = pitch;
  let pointerX = 0;
  let pointerY = 0;
  let pointerEaseX = 0;
  let pointerEaseY = 0;
  let sinYaw = 0;
  let cosYaw = 1;
  let sinPitch = 0;
  let cosPitch = 1;
  let nextAutomaticPulse = 2.5;

  const oldStyles = { touchAction: canvas.style.touchAction, cursor: canvas.style.cursor };
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  }

  function project(point, output = {}) {
    const x = point.x * cosYaw + point.z * sinYaw;
    const z0 = -point.x * sinYaw + point.z * cosYaw;
    const y = point.y * cosPitch - z0 * sinPitch;
    const z = point.y * sinPitch + z0 * cosPitch;
    const perspective = 4.6 / (4.6 - z);
    output.x = width * 0.5 + x * scale * perspective;
    output.y = height * 0.475 - y * scale * perspective;
    output.z = z;
    output.perspective = perspective;
    return output;
  }

  function glow(x, y, radius, strength, orange = false) {
    if (radius <= 0 || strength <= 0) return;
    const rgb = orange ? '244,91,57' : '218,138,56';
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${rgb},${strength})`);
    gradient.addColorStop(0.23, `rgba(${rgb},${strength * 0.34})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawStage() {
    // A soft contact shadow and a calibrated orbital trace suggest a specimen
    // suspended above a display stage. The canvas itself remains transparent.
    ctx.save();
    ctx.translate(width * 0.5, height * 0.475 + scale * 1.13);
    ctx.scale(1, 0.115);
    const radius = scale * 0.82;
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    shadow.addColorStop(0, 'rgba(43,39,32,0.075)');
    shadow.addColorStop(0.45, 'rgba(43,39,32,0.028)');
    shadow.addColorStop(1, 'rgba(43,39,32,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();

    const orbitPoint = (angle) => project({
      x: Math.cos(angle) * 1.27,
      y: -0.16 + Math.sin(angle) * 0.075,
      z: Math.sin(angle) * 1.07,
    });
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = 'rgba(83,76,65,0.15)';
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    for (let step = 0; step <= 100; step++) {
      const point = orbitPoint(step / 100 * TAU);
      if (!step) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const offset = -0.64 + sceneTime * 0.035;
    ctx.strokeStyle = 'rgba(244,91,57,0.36)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let step = 0; step <= 22; step++) {
      const point = orbitPoint(offset + step / 22 * 0.62);
      if (!step) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    const marker = orbitPoint(offset + 0.62);
    ctx.fillStyle = 'rgba(244,91,57,0.8)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 2.1, 0, TAU);
    ctx.fill();
  }

  function drawFibers() {
    ctx.lineWidth = 0.6;
    for (let i = 0; i < anatomy.fibers.length; i++) {
      const fiber = anatomy.fibers[i];
      const a = project(fiber.a);
      const b = project(fiber.b);
      const c = project(fiber.c);
      const d = project(fiber.d);
      ctx.strokeStyle = fiber.bridge ? 'rgba(55,56,52,0.2)' : 'rgba(96,94,85,0.115)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
      ctx.stroke();

      // Sparse traveling signals; no per-frame allocations for geometry.
      if (i % (compact ? 6 : 4) !== 0) continue;
      const speed = mode === 'encode' ? 0.14 : mode === 'recall' ? 0.1 : 0.055;
      const phase = (sceneTime * speed + fiber.phase) % 1;
      const tip = project(bezier(fiber.a, fiber.b, fiber.c, fiber.d, phase));
      const tailPhase = Math.max(0, phase - 0.085);
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(218,138,56,0.7)' : 'rgba(244,91,57,0.75)';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      for (let step = 0; step <= 5; step++) {
        const point = project(bezier(fiber.a, fiber.b, fiber.c, fiber.d, mix(tailPhase, phase, step / 5)));
        if (!step) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.fillStyle = i % 3 === 0 ? 'rgba(218,138,56,0.96)' : 'rgba(244,91,57,0.98)';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 1.35, 0, TAU);
      ctx.fill();
      glow(tip.x, tip.y, 6, 0.12, i % 3 !== 0);
      ctx.lineWidth = 0.6;
    }
  }

  function drawSatellites() {
    for (let i = 0; i < anatomy.satellites.length; i++) {
      const node = anatomy.satellites[i];
      const point = project(node);
      const anchor = project(node.anchor);
      const shimmer = 0.65 + Math.sin(sceneTime * 0.4 + node.seed * 10) * 0.2;
      ctx.strokeStyle = `rgba(81,77,68,${0.15 * shimmer})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(anchor.x, anchor.y);
      if (i % 3 === 0) {
        const neighbor = project(anatomy.satellites[(i + 1) % anatomy.satellites.length]);
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(neighbor.x, neighbor.y);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(69,67,59,${0.48 * shimmer})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, i % 5 === 0 ? 1.65 : 0.8, 0, TAU);
      ctx.fill();
      if (i % 7 === 0) {
        ctx.strokeStyle = 'rgba(218,138,56,0.31)';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4.7, 0, TAU);
        ctx.stroke();
      }
    }
  }

  function render() {
    if (destroyed || !width || !height) return;
    const drift = reducedMotion ? 0 : Math.sin(sceneTime * 0.105) * 0.15;
    const currentYaw = yaw + drift + pointerEaseX * 0.105;
    const currentPitch = pitch + pointerEaseY * 0.07;
    sinYaw = Math.sin(currentYaw);
    cosYaw = Math.cos(currentYaw);
    sinPitch = Math.sin(currentPitch);
    cosPitch = Math.cos(currentPitch);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    drawStage();
    drawSatellites();
    drawFibers();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      project(node, projected[i]);
      let light = 0;
      // Quiet persistent firing keeps the still illustration alive, too.
      const rhythm = Math.sin(sceneTime * (mode === 'observe' ? 0.65 : 1.1) + node.seed * 48);
      if (node.seed > 0.965 && rhythm > 0.35) light = (rhythm - 0.35) * 0.7;
      for (const wave of waves) {
        const age = sceneTime - wave.birth;
        const radius = reducedMotion ? 0.38 : age * wave.speed;
        const distance = Math.hypot(node.x - wave.x, node.y - wave.y, node.z - wave.z);
        const band = (distance - radius) / (mode === 'recall' ? 0.18 : 0.13);
        const envelope = clamp(1 - age / wave.duration, 0, 1);
        light = Math.max(light, Math.exp(-band * band) * envelope);
      }
      energy[i] = light;
    }

    // Depth bins give the back hemisphere a soft translucent silhouette.
    for (let bucket = 0; bucket < 5; bucket++) {
      const alpha = [0.065, 0.12, 0.2, 0.32, 0.47][bucket];
      for (const ridge of [false, true]) {
        ctx.beginPath();
        for (const edge of anatomy.edges) {
          if (edge.ridge !== ridge) continue;
          const a = projected[edge.a];
          const b = projected[edge.b];
          const depth = clamp(Math.floor(((a.z + b.z) * 0.5 + 1) * 2.5), 0, 4);
          if (depth !== bucket) continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.lineWidth = ridge ? 0.73 : 0.45;
        ctx.strokeStyle = `rgba(${ridge ? '38,41,38' : '96,96,87'},${alpha * (ridge ? 1 : 0.64)})`;
        ctx.stroke();
      }
    }

    // Activity follows existing neural connections, rather than a flat ring.
    ctx.beginPath();
    for (const edge of anatomy.edges) {
      if (energy[edge.a] + energy[edge.b] < 0.82) continue;
      const a = projected[edge.a];
      const b = projected[edge.b];
      if (a.z + b.z < -0.5) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = mode === 'encode' ? 'rgba(244,91,57,0.76)' : 'rgba(244,91,57,0.58)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let bucket = 0; bucket < 4; bucket++) {
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const point = projected[i];
        if (clamp(Math.floor((point.z + 1) * 2), 0, 3) !== bucket) continue;
        const size = nodes[i].size * point.perspective * (compact ? 0.79 : 0.87);
        ctx.moveTo(point.x + size, point.y);
        ctx.arc(point.x, point.y, size, 0, TAU);
      }
      ctx.fillStyle = ['rgba(120,120,109,0.2)', 'rgba(94,95,86,0.36)', 'rgba(52,56,50,0.64)', 'rgba(26,31,27,0.88)'][bucket];
      ctx.fill();
    }

    let glows = 0;
    for (let i = 0; i < nodes.length; i++) {
      const activation = energy[i];
      const point = projected[i];
      if (activation < 0.12 || point.z < -0.45) continue;
      const radius = (0.75 + activation * 1.05) * point.perspective;
      if (activation > 0.48 && i % 3 === 0 && glows < (compact ? 18 : 36)) {
        glow(point.x, point.y, 5 + activation * 7, activation * 0.13, true);
        glows++;
      }
      ctx.fillStyle = `rgba(244,91,57,${clamp(activation * 1.2, 0, 0.98)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, TAU);
      ctx.fill();
    }
  }

  function canAnimate() {
    return !destroyed && !manualPause && visible && !document.hidden && !reducedMotion;
  }

  function animate(timestamp) {
    frame = 0;
    if (!canAnimate()) return;
    const elapsed = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.06) : 0;
    lastTime = timestamp;
    sceneTime += elapsed;
    const ease = 1 - Math.exp(-elapsed * 5.6);
    yaw = mix(yaw, yawTarget, ease);
    pitch = mix(pitch, pitchTarget, ease);
    pointerEaseX = mix(pointerEaseX, pointerX, ease);
    pointerEaseY = mix(pointerEaseY, pointerY, ease);
    while (waves.length && sceneTime - waves[0].birth > waves[0].duration) waves.shift();
    if (sceneTime > nextAutomaticPulse) {
      addPulse();
      nextAutomaticPulse = sceneTime + (mode === 'observe' ? 8.4 : mode === 'encode' ? 3.7 : 5.2);
    }
    const minimumFrameTime = compact ? 1000 / 32 : 1000 / 48;
    if (timestamp - lastPaint >= minimumFrameTime) {
      render();
      lastPaint = timestamp;
    }
    frame = requestAnimationFrame(animate);
  }

  function syncAnimation() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (canAnimate()) frame = requestAnimationFrame(animate);
  }

  function addPulse(origin) {
    const index = Math.floor(((sceneTime * 0.173 + 0.31) % 1) * nodes.length);
    const source = origin || nodes[index];
    waves.push({
      x: source.x, y: source.y, z: source.z,
      birth: sceneTime,
      speed: mode === 'recall' ? 0.48 : 0.62,
      duration: 4.8,
    });
    if (waves.length > 4) waves.shift();
  }

  function pulse() {
    if (destroyed) return;
    addPulse();
    render();
    if (!frame) syncAnimation();
  }

  function setMode(nextMode) {
    if (!['observe', 'encode', 'recall'].includes(nextMode) || destroyed) return;
    if (mode === nextMode) return;
    mode = nextMode;
    nextAutomaticPulse = sceneTime + 4;
    addPulse(mode === 'recall' ? { x: 0, y: 0.15, z: 0.3 } : { x: -0.58, y: 0.24, z: 0.55 });
    render();
    if (!frame) syncAnimation();
  }

  function setPaused(paused) {
    manualPause = Boolean(paused);
    syncAnimation();
  }

  function resize() {
    if (destroyed) return;
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    scale = Math.min(width * 0.405, height * 0.405);
    render();
  }

  function nearestNode(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    let nearest = null;
    let distance = Infinity;
    for (let i = 0; i < projected.length; i++) {
      const point = projected[i];
      if (point.z < -0.15) continue;
      const squared = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (squared < distance) {
        distance = squared;
        nearest = nodes[i];
      }
    }
    return nearest;
  }

  listen(canvas, 'pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: yawTarget, pitch: pitchTarget, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  listen(canvas, 'pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointerX = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1, -1, 1);
    pointerY = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1, -1, 1);
    if (drag && event.pointerId === drag.id) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      yawTarget = drag.yaw + dx * 0.006;
      pitchTarget = clamp(drag.pitch + dy * 0.004, -0.68, 0.68);
    }
    if (reducedMotion || manualPause) {
      yaw = yawTarget;
      pitch = pitchTarget;
      // Pointer movement itself stays responsive without inertial animation.
      pointerEaseX = reducedMotion ? 0 : pointerX;
      pointerEaseY = reducedMotion ? 0 : pointerY;
      render();
    }
  });

  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = !drag.moved && event.type === 'pointerup';
    drag = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'grab';
    if (clicked) {
      addPulse(nearestNode(event.clientX, event.clientY));
      render();
    }
  }

  listen(canvas, 'pointerup', endDrag);
  listen(canvas, 'pointercancel', endDrag);
  listen(canvas, 'lostpointercapture', endDrag);
  listen(canvas, 'pointerleave', () => { if (!drag) { pointerX = 0; pointerY = 0; } });
  listen(document, 'visibilitychange', syncAnimation);
  listen(window, 'resize', resize, { passive: true });

  const changeMotion = () => {
    reducedMotion = motionPreference.matches;
    yaw = yawTarget;
    pitch = pitchTarget;
    pointerEaseX = 0;
    pointerEaseY = 0;
    render();
    syncAnimation();
  };
  if (motionPreference.addEventListener) listen(motionPreference, 'change', changeMotion);
  else {
    motionPreference.addListener(changeMotion);
    disposers.push(() => motionPreference.removeListener(changeMotion));
  }

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    disposers.push(() => observer.disconnect());
  }
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncAnimation();
    }, { threshold: 0.01 });
    observer.observe(canvas);
    disposers.push(() => observer.disconnect());
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    for (const dispose of disposers) dispose();
    canvas.style.touchAction = oldStyles.touchAction;
    canvas.style.cursor = oldStyles.cursor;
    mountedBrains.delete(canvas);
  }

  const controller = { pulse, setMode, setPaused, destroy };
  mountedBrains.set(canvas, controller);
  resize();
  syncAnimation();
  return controller;
}
