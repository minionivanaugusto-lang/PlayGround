// Procedural sprite atlas and hand-drawn actors for Colonia Aurora.
// Everything is generated once into offscreen canvases so the render loop
// only has to blit a few hundred sprites.

import {
  TAU,
  clamp,
  hexToRgb,
  makeCanvas,
  mulberry32,
  pick,
  rand,
  randInt,
  rgba,
  shade,
} from './utils.js';

const GREEN_PALETTES = [
  { dark: '#2f4a25', mid: '#456a2e', light: '#6d943e', tip: '#94b858' },
  { dark: '#344d22', mid: '#4f7230', light: '#7b9c3d', tip: '#a7bd5e' },
  { dark: '#3b4d24', mid: '#5a7232', light: '#869a3f', tip: '#b3b660' },
  { dark: '#243f27', mid: '#3b6132', light: '#5c823c', tip: '#86a64c' },
  { dark: '#46521f', mid: '#67732a', light: '#8f9a3e', tip: '#bec16a' },
];

function sprite(canvas, ax = 0.5, ay = 0.92, extra = {}) {
  return { canvas, w: canvas.width, h: canvas.height, ax, ay, ...extra };
}

// ---------------------------------------------------------------------------
// Foliage
// ---------------------------------------------------------------------------

function makeBroadleaf(seed, paletteIndex) {
  const rng = mulberry32(seed);
  const W = 360;
  const H = 400;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 180;
  const baseY = 368;
  const pal = GREEN_PALETTES[paletteIndex % GREEN_PALETTES.length];

  // Trunk and roots.
  const trunkGrad = ctx.createLinearGradient(cx - 18, 0, cx + 22, 0);
  trunkGrad.addColorStop(0, '#4a3220');
  trunkGrad.addColorStop(0.45, '#775133');
  trunkGrad.addColorStop(0.7, '#8d6640');
  trunkGrad.addColorStop(1, '#3d2919');
  ctx.fillStyle = trunkGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 21, baseY);
  ctx.bezierCurveTo(cx - 15, 315, cx - 10, 275, cx - 8, 224);
  ctx.lineTo(cx + 9, 224);
  ctx.bezierCurveTo(cx + 11, 282, cx + 17, 318, cx + 24, baseY);
  ctx.quadraticCurveTo(cx + 10, baseY + 8, cx - 21, baseY);
  ctx.closePath();
  ctx.fill();

  // Root flares.
  ctx.strokeStyle = '#5b3f28';
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx - 8, baseY - 10);
  ctx.quadraticCurveTo(cx - 28, baseY + 4, cx - 38, baseY + 12);
  ctx.moveTo(cx + 8, baseY - 10);
  ctx.quadraticCurveTo(cx + 30, baseY + 3, cx + 42, baseY + 14);
  ctx.stroke();

  // Bark lines.
  ctx.strokeStyle = 'rgba(45,28,16,.45)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) {
    const y = 250 + rng() * 105;
    const x = cx - 8 + rng() * 16;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rand(rng, -5, 5), y + 12, x + rand(rng, -3, 3), y + 24);
    ctx.stroke();
  }

  // A couple of branches reaching into the canopy.
  ctx.strokeStyle = '#5c4028';
  ctx.lineWidth = 7;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, 262);
    ctx.quadraticCurveTo(cx + dir * 40, 238, cx + dir * 72, 210);
    ctx.stroke();
  }

  // Canopy under-shadow.
  ctx.fillStyle = 'rgba(27,44,21,.55)';
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 112;
    const x = cx + Math.cos(a) * rr * 1.15;
    const y = 160 + Math.sin(a) * rr * 0.88 + 18;
    const r = rand(rng, 36, 66);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // Main canopy clusters.
  const clusters = [];
  for (let i = 0; i < 30; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng());
    const x = cx + Math.cos(a) * rr * 128;
    const y = 156 + Math.sin(a) * rr * 100;
    clusters.push({ x, y, r: rand(rng, 34, 62) });
  }
  clusters.sort((a, b) => a.y - b.y);

  for (const c of clusters) {
    const g = ctx.createRadialGradient(
      c.x - c.r * 0.35,
      c.y - c.r * 0.4,
      c.r * 0.08,
      c.x,
      c.y,
      c.r
    );
    g.addColorStop(0, pal.tip);
    g.addColorStop(0.42, pal.light);
    g.addColorStop(0.75, pal.mid);
    g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, TAU);
    ctx.fill();
  }

  // Leafy fringe, drawn as little dabs around the silhouette.
  for (let i = 0; i < 340; i++) {
    const a = rng() * TAU;
    const rr = 0.62 + Math.sqrt(rng()) * 0.46;
    const x = cx + Math.cos(a) * rr * 138;
    const y = 156 + Math.sin(a) * rr * 110;
    const color = pick(rng, [pal.dark, pal.mid, pal.light, pal.tip]);
    ctx.fillStyle = rgba(color, rand(rng, 0.4, 0.85));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * TAU);
    ctx.beginPath();
    ctx.ellipse(0, 0, rand(rng, 2.4, 6.2), rand(rng, 1.2, 2.6), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Sunlit flecks on the upper-left.
  for (let i = 0; i < 90; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 0.9;
    const x = cx + Math.cos(a) * rr * 112 - 22;
    const y = 150 + Math.sin(a) * rr * 86 - 26;
    ctx.fillStyle = `rgba(216,233,156,${rand(rng, 0.08, 0.3)})`;
    ctx.beginPath();
    ctx.arc(x, y, rand(rng, 1.2, 3.4), 0, TAU);
    ctx.fill();
  }

  // A few gaps that reveal branches.
  ctx.fillStyle = 'rgba(24,38,18,.28)';
  for (let i = 0; i < 7; i++) {
    const x = cx + rand(rng, -80, 80);
    const y = 190 + rand(rng, -60, 70);
    ctx.beginPath();
    ctx.ellipse(x, y, rand(rng, 6, 18), rand(rng, 3, 8), rng() * TAU, 0, TAU);
    ctx.fill();
  }

  return sprite(canvas, 0.5, 0.94, {
    canopy: { x: 0, y: -230, r: 148 },
    trunk: { r: 28 },
  });
}

function makePine(seed, variant) {
  const rng = mulberry32(seed);
  const W = 300;
  const H = 390;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 150;
  const baseY = 360;
  const pal = variant
    ? { dark: '#1f3d2c', mid: '#2f5435', light: '#4a703d', tip: '#6d8d4b' }
    : { dark: '#213c2a', mid: '#33583a', light: '#507647', tip: '#789455' };

  // Trunk.
  const g = ctx.createLinearGradient(cx - 10, 0, cx + 12, 0);
  g.addColorStop(0, '#3d2a1b');
  g.addColorStop(0.5, '#6a4a2e');
  g.addColorStop(1, '#3a2819');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 11, baseY);
  ctx.lineTo(cx - 5, 200);
  ctx.lineTo(cx + 5, 200);
  ctx.lineTo(cx + 12, baseY);
  ctx.closePath();
  ctx.fill();

  // Needle rosettes from the outside in.
  const centerY = 158;
  const rings = [
    { r: 128, count: 210, len: 34, color: pal.dark, alpha: 0.95 },
    { r: 100, count: 170, len: 30, color: pal.mid, alpha: 0.95 },
    { r: 72, count: 130, len: 25, color: pal.light, alpha: 0.95 },
    { r: 44, count: 90, len: 19, color: pal.tip, alpha: 0.9 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = rng() * TAU;
      const rr = ring.r * (0.4 + Math.sqrt(rng()) * 0.62);
      const x = cx + Math.cos(a) * rr * 1.03;
      const y = centerY + Math.sin(a) * rr * 0.84;
      const len = ring.len * rand(rng, 0.65, 1.15);
      const dir = Math.atan2(y - centerY, x - cx) + rand(rng, -0.4, 0.4);
      ctx.strokeStyle = rgba(ring.color, ring.alpha * rand(rng, 0.45, 0.95));
      ctx.lineWidth = rand(rng, 1.2, 2.6);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(dir) * len * 0.25, y - Math.sin(dir) * len * 0.25);
      ctx.lineTo(x + Math.cos(dir) * len, y + Math.sin(dir) * len);
      ctx.stroke();
    }
  }

  // Dark core and a sunlit dusting.
  const core = ctx.createRadialGradient(cx - 18, centerY - 24, 4, cx, centerY, 46);
  core.addColorStop(0, '#8aa05a');
  core.addColorStop(0.5, pal.mid);
  core.addColorStop(1, pal.dark);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, centerY, 34, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 70; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 100;
    ctx.fillStyle = `rgba(210,228,160,${rand(rng, 0.05, 0.2)})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr - 20, centerY + Math.sin(a) * rr * 0.8 - 16, rand(rng, 1, 3), 0, TAU);
    ctx.fill();
  }

  return sprite(canvas, 0.5, 0.94, {
    canopy: { x: 0, y: -212, r: 120 },
    trunk: { r: 22 },
  });
}

function makeBirch(seed) {
  const rng = mulberry32(seed);
  const W = 300;
  const H = 380;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 150;
  const baseY = 356;

  // Pale trunk.
  ctx.fillStyle = '#d8d2b8';
  ctx.beginPath();
  ctx.moveTo(cx - 9, baseY);
  ctx.bezierCurveTo(cx - 5, 300, cx - 8, 240, cx - 5, 185);
  ctx.lineTo(cx + 6, 185);
  ctx.bezierCurveTo(cx + 9, 250, cx + 8, 310, cx + 11, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,58,42,.7)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 16; i++) {
    const y = 210 + rng() * 140;
    const w = rand(rng, 3, 10);
    ctx.beginPath();
    ctx.moveTo(cx - 6 + rng() * 4, y);
    ctx.lineTo(cx - 6 + rng() * 4 + w, y + rand(rng, -1, 1));
    ctx.stroke();
  }

  const pal = { dark: '#4b6b2f', mid: '#6f8d3c', light: '#9ab452', tip: '#c6d276' };
  ctx.fillStyle = 'rgba(40,58,24,.42)';
  for (let i = 0; i < 12; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 80;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, 150 + Math.sin(a) * rr * 0.8 + 14, rand(rng, 26, 48), 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 24; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng());
    const x = cx + Math.cos(a) * rr * 104;
    const y = 148 + Math.sin(a) * rr * 84;
    const r = rand(rng, 26, 50);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    g.addColorStop(0, pal.tip);
    g.addColorStop(0.5, pal.light);
    g.addColorStop(0.8, pal.mid);
    g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 180; i++) {
    const a = rng() * TAU;
    const rr = 0.55 + Math.sqrt(rng()) * 0.5;
    ctx.fillStyle = rgba(pick(rng, [pal.dark, pal.mid, pal.light, pal.tip]), rand(rng, 0.3, 0.8));
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * rr * 108,
      148 + Math.sin(a) * rr * 88,
      rand(rng, 2, 5),
      rand(rng, 1, 2.4),
      rng() * TAU,
      0,
      TAU
    );
    ctx.fill();
  }

  return sprite(canvas, 0.5, 0.95, {
    canopy: { x: 0, y: -222, r: 112 },
    trunk: { r: 18 },
  });
}

// ---------------------------------------------------------------------------
// Rocks, logs and small plants
// ---------------------------------------------------------------------------

function makeRock(seed, variant) {
  const rng = mulberry32(seed);
  const W = 160;
  const H = 140;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 80;
  const cy = 82;
  const points = [];
  const n = randInt(rng, 8, 11);
  const baseR = rand(rng, 38, 48);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = baseR * rand(rng, 0.72, 1.12);
    points.push({ x: cx + Math.cos(a) * r * 1.1, y: cy + Math.sin(a) * r * 0.72 });
  }

  const g = ctx.createLinearGradient(cx - 40, cy - 45, cx + 42, cy + 42);
  g.addColorStop(0, variant ? '#b6b2a3' : '#9d9c8f');
  g.addColorStop(0.5, variant ? '#898a80' : '#7d7e73');
  g.addColorStop(1, '#54574f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    ctx.quadraticCurveTo((prev.x + p.x) / 2 + rand(rng, -4, 4), (prev.y + p.y) / 2 + rand(rng, -4, 4), p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // Top facet catching the light.
  ctx.fillStyle = 'rgba(226,224,205,.28)';
  ctx.beginPath();
  ctx.moveTo(cx - baseR * 0.7, cy - baseR * 0.12);
  ctx.quadraticCurveTo(cx - baseR * 0.2, cy - baseR * 0.66, cx + baseR * 0.42, cy - baseR * 0.38);
  ctx.quadraticCurveTo(cx - baseR * 0.05, cy - baseR * 0.08, cx - baseR * 0.7, cy - baseR * 0.12);
  ctx.closePath();
  ctx.fill();

  // Cracks.
  ctx.strokeStyle = 'rgba(48,50,44,.45)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const x = cx + rand(rng, -26, 26);
    const y = cy + rand(rng, -16, 18);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rand(rng, -12, 12), y + rand(rng, 5, 16));
    ctx.lineTo(x + rand(rng, -16, 16), y + rand(rng, 12, 24));
    ctx.stroke();
  }

  // Moss and lichen.
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * baseR * 0.85;
    ctx.fillStyle = rgba(pick(rng, ['#5d7d3a', '#6f8e45', '#8ba456']), rand(rng, 0.18, 0.55));
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6 + 6, rand(rng, 2, 7), rand(rng, 1, 4), rng() * TAU, 0, TAU);
    ctx.fill();
  }

  return sprite(canvas, 0.5, 0.82, { rock: { r: baseR * 0.8 } });
}

function makeLog(seed) {
  const rng = mulberry32(seed);
  const W = 260;
  const H = 120;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(130, 62);
  ctx.rotate(-0.08);
  const g = ctx.createLinearGradient(0, -28, 0, 30);
  g.addColorStop(0, '#8a633d');
  g.addColorStop(0.45, '#6e4d30');
  g.addColorStop(1, '#402c1b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-112, -27, 224, 54, 27);
  ctx.fill();

  // End grain.
  ctx.fillStyle = '#a88354';
  ctx.beginPath();
  ctx.ellipse(104, 0, 16, 27, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,55,30,.6)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(104, 0, 4 * i, 7 * i, 0, 0, TAU);
    ctx.stroke();
  }

  // Bark grooves.
  ctx.strokeStyle = 'rgba(38,25,14,.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    const x = rand(rng, -98, 82);
    const y = rand(rng, -24, 20);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rand(rng, 8, 24), y + rand(rng, -3, 3), x + rand(rng, 20, 42), y + rand(rng, -2, 4));
    ctx.stroke();
  }

  // Moss.
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rgba(pick(rng, ['#587a36', '#6d8f43', '#83a050']), rand(rng, 0.25, 0.7));
    ctx.beginPath();
    ctx.ellipse(rand(rng, -100, 88), rand(rng, -26, 24), rand(rng, 3, 10), rand(rng, 1, 4), rng() * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  return sprite(canvas, 0.5, 0.75, { log: true });
}

function makeFern(seed) {
  const rng = mulberry32(seed);
  const W = 100;
  const H = 100;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 50;
  const baseY = 88;
  const pal = pick(rng, GREEN_PALETTES);

  for (let f = 0; f < 8; f++) {
    const angle = -Math.PI / 2 + rand(rng, -1.15, 1.15);
    const len = rand(rng, 36, 52);
    const bend = rand(rng, -0.3, 0.3);
    const tipX = cx + Math.cos(angle) * len;
    const tipY = baseY + Math.sin(angle) * len;
    const midX = cx + Math.cos(angle + bend) * len * 0.5;
    const midY = baseY + Math.sin(angle + bend) * len * 0.5;
    ctx.strokeStyle = rgba(pal.mid, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();

    for (let i = 2; i < 8; i++) {
      const t = i / 8;
      const px = cx + (midX - cx) * t * 2 * (1 - t) + (tipX - cx) * t * t;
      const py = baseY + (midY - baseY) * t * 2 * (1 - t) + (tipY - baseY) * t * t;
      const side = i % 2 === 0 ? 1 : -1;
      ctx.fillStyle = rgba(pick(rng, [pal.light, pal.mid, pal.tip]), rand(rng, 0.6, 0.95));
      ctx.beginPath();
      ctx.ellipse(px + side * 4, py + 1, 4.6 * (1 - t * 0.4), 2, angle + side * 0.9, 0, TAU);
      ctx.fill();
    }
  }
  // Young fiddleheads.
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = rgba(pal.tip, 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx + rand(rng, -8, 8), baseY - rand(rng, 10, 22), rand(rng, 3, 6), 0.4, 4.6);
    ctx.stroke();
  }
  return sprite(canvas, 0.5, 0.9);
}

function makeGrassTuft(seed) {
  const rng = mulberry32(seed);
  const W = 64;
  const H = 54;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const baseX = 32;
  const baseY = 50;
  const pal = pick(rng, GREEN_PALETTES);
  const count = randInt(rng, 6, 11);
  for (let i = 0; i < count; i++) {
    const dir = rand(rng, -0.9, 0.9);
    const len = rand(rng, 16, 36);
    const tipX = baseX + dir * len * 0.8;
    const tipY = baseY - len;
    const ctrlX = baseX + dir * len * 0.2 + rand(rng, -4, 4);
    const ctrlY = baseY - len * 0.55;
    const width = rand(rng, 1.6, 3.4);
    ctx.fillStyle = rgba(pick(rng, [pal.mid, pal.light, pal.tip, pal.dark]), rand(rng, 0.7, 1));
    ctx.beginPath();
    ctx.moveTo(baseX - width, baseY);
    ctx.quadraticCurveTo(ctrlX - width * 0.4, ctrlY, tipX, tipY);
    ctx.quadraticCurveTo(ctrlX + width * 0.3, ctrlY + 2, baseX + width, baseY);
    ctx.closePath();
    ctx.fill();
  }
  return sprite(canvas, 0.5, 0.94);
}

function makeFlower(seed, variant) {
  const rng = mulberry32(seed);
  const W = 52;
  const H = 62;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 26;
  const baseY = 58;
  const palettes = [
    { petal: '#f5efd6', center: '#e0b455', stem: '#5b7b39' },
    { petal: '#e7c04f', center: '#a96c2c', stem: '#61823d' },
    { petal: '#c7a4d8', center: '#e6c466', stem: '#557638' },
    { petal: '#e79b91', center: '#eac76e', stem: '#5d7d3a' },
    { petal: '#f2e7a6', center: '#c58a34', stem: '#68873f' },
  ];
  const pal = palettes[variant % palettes.length];
  const topY = rand(rng, 18, 27);

  ctx.strokeStyle = pal.stem;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.quadraticCurveTo(cx + rand(rng, -5, 5), baseY - 18, cx + rand(rng, -3, 3), topY + 6);
  ctx.stroke();

  // Leaves.
  for (let i = 0; i < 2; i++) {
    const y = baseY - 12 - i * 9;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.fillStyle = rgba(pal.stem, 0.85);
    ctx.beginPath();
    ctx.ellipse(cx + side * 6, y, 6, 2.4, side * 0.7, 0, TAU);
    ctx.fill();
  }

  // Petals.
  const petals = randInt(rng, 5, 7);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + rng() * 0.2;
    const px = cx + Math.cos(a) * 7;
    const py = topY + Math.sin(a) * 6.2;
    const g = ctx.createRadialGradient(px, py - 1, 0.5, px, py, 5.6);
    g.addColorStop(0, shade(pal.petal, 0.2));
    g.addColorStop(1, pal.petal);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, 4.6, 3.1, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = pal.center;
  ctx.beginPath();
  ctx.arc(cx, topY, 3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath();
  ctx.arc(cx - 1, topY - 1, 1.1, 0, TAU);
  ctx.fill();

  return sprite(canvas, 0.5, 0.94);
}

function makeMushroom(seed) {
  const rng = mulberry32(seed);
  const W = 40;
  const H = 42;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 20;
  const baseY = 38;
  const capY = 20;
  const capR = rand(rng, 8, 12);
  ctx.fillStyle = '#e6d9bb';
  ctx.beginPath();
  ctx.moveTo(cx - 3.5, baseY);
  ctx.quadraticCurveTo(cx - 2, capY + 5, cx - 2.5, capY);
  ctx.lineTo(cx + 2.5, capY);
  ctx.quadraticCurveTo(cx + 2, capY + 5, cx + 3.5, baseY);
  ctx.closePath();
  ctx.fill();

  const g = ctx.createRadialGradient(cx - 4, capY - 6, 1, cx, capY, capR);
  g.addColorStop(0, '#d47a56');
  g.addColorStop(0.65, '#a94d38');
  g.addColorStop(1, '#793528');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, capY, capR, capR * 0.72, 0, Math.PI, TAU);
  ctx.quadraticCurveTo(cx, capY + 4, cx - capR, capY);
  ctx.fill();

  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(245,235,210,.7)';
    ctx.beginPath();
    ctx.arc(cx + rand(rng, -capR * 0.7, capR * 0.7), capY - rand(rng, 1, capR * 0.45), rand(rng, 0.8, 1.8), 0, TAU);
    ctx.fill();
  }
  return sprite(canvas, 0.5, 0.94);
}

function makeClover(seed) {
  const rng = mulberry32(seed);
  const W = 50;
  const H = 42;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const pal = pick(rng, GREEN_PALETTES);
  for (let i = 0; i < 7; i++) {
    const cx = 25 + rand(rng, -13, 13);
    const cy = 26 + rand(rng, -9, 9);
    ctx.strokeStyle = rgba(pal.mid, 0.8);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    for (let p = 0; p < 3; p++) {
      const a = (p / 3) * TAU + rng() * 0.3;
      ctx.fillStyle = rgba(pick(rng, [pal.light, pal.tip, pal.mid]), 0.9);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.2, 3.4, 2.6, a, 0, TAU);
      ctx.fill();
    }
  }
  return sprite(canvas, 0.5, 0.9);
}

function makeReeds(seed) {
  const rng = mulberry32(seed);
  const W = 70;
  const H = 110;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const pal = { dark: '#3c5c35', mid: '#5a7a3e', light: '#7e9a4a' };
  for (let i = 0; i < 7; i++) {
    const x = 35 + rand(rng, -16, 16);
    const h = rand(rng, 50, 92);
    const bend = rand(rng, -14, 14);
    ctx.strokeStyle = rgba(pick(rng, [pal.mid, pal.light, pal.dark]), 0.9);
    ctx.lineWidth = rand(rng, 1.2, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, 104);
    ctx.quadraticCurveTo(x + bend * 0.4, 104 - h * 0.5, x + bend, 104 - h);
    ctx.stroke();
  }
  // Cattails.
  for (let i = 0; i < 2; i++) {
    const x = 35 + rand(rng, -10, 10);
    const y = 30 + rand(rng, -8, 8);
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 104);
    ctx.lineTo(x + rand(rng, -3, 3), y);
    ctx.stroke();
    ctx.fillStyle = '#6b4a2c';
    ctx.beginPath();
    ctx.roundRect(x - 2.5, y - 2, 5, 15, 2.5);
    ctx.fill();
  }
  return sprite(canvas, 0.5, 0.95);
}

function makeLily(seed) {
  const rng = mulberry32(seed);
  const W = 60;
  const H = 50;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 30;
  const cy = 25;
  const r = rand(rng, 15, 22);
  const g = ctx.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, r);
  g.addColorStop(0, '#8db05c');
  g.addColorStop(0.7, '#5f863e');
  g.addColorStop(1, '#44652f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0.5, TAU - 0.5);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,70,30,.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  return sprite(canvas, 0.5, 0.5);
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function resourceBase(ctx, cx, baseY) {
  ctx.fillStyle = 'rgba(92,72,42,.22)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 4, 30, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,96,56,.26)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, baseY - 7, 21, 8, 0, 0, TAU);
  ctx.fill();
}

function makeLeafPile(seed) {
  const rng = mulberry32(seed);
  const W = 90;
  const H = 80;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 45;
  const baseY = 68;
  resourceBase(ctx, cx, baseY);

  const colors = ['#7da84a', '#94b451', '#b7b24a', '#c59b3f', '#6c9a43'];
  for (let i = 0; i < 7; i++) {
    const x = cx + rand(rng, -18, 18);
    const y = baseY - rand(rng, 3, 15);
    const rot = rand(rng, -1.4, 1.4);
    const len = rand(rng, 22, 32);
    const wid = rand(rng, 8, 12);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = pick(rng, colors);
    ctx.beginPath();
    ctx.moveTo(0, -len / 2);
    ctx.bezierCurveTo(wid, -len * 0.15, wid, len * 0.18, 0, len / 2);
    ctx.bezierCurveTo(-wid, len * 0.18, -wid, -len * 0.15, 0, -len / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,66,28,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -len / 2 + 2);
    ctx.lineTo(0, len / 2 - 2);
    ctx.stroke();
    for (let v = 1; v < 4; v++) {
      const vy = -len / 2 + (v / 4) * len;
      ctx.beginPath();
      ctx.moveTo(0, vy);
      ctx.lineTo(wid * 0.55, vy + 3);
      ctx.moveTo(0, vy);
      ctx.lineTo(-wid * 0.55, vy + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  return sprite(canvas, 0.5, 0.86);
}

function makeSeedPile(seed) {
  const rng = mulberry32(seed);
  const W = 90;
  const H = 80;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 45;
  const baseY = 68;
  resourceBase(ctx, cx, baseY);

  // A few dry stalks.
  ctx.strokeStyle = 'rgba(139,116,57,.8)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i++) {
    const x = cx + rand(rng, -14, 14);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + rand(rng, -4, 4), baseY - 16, x + rand(rng, -8, 8), baseY - 26);
    ctx.stroke();
  }

  for (let i = 0; i < 9; i++) {
    const x = cx + rand(rng, -19, 19);
    const y = baseY - rand(rng, 3, 16);
    const rot = rand(rng, -0.9, 0.9);
    const len = rand(rng, 10, 15);
    const wid = rand(rng, 3.2, 5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(0, -len / 2, 0, len / 2);
    g.addColorStop(0, '#f0d585');
    g.addColorStop(0.55, '#d5ab4b');
    g.addColorStop(1, '#9d7130');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -len / 2);
    ctx.quadraticCurveTo(wid, -len * 0.05, 0, len / 2);
    ctx.quadraticCurveTo(-wid, -len * 0.05, 0, -len / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,84,34,.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -len / 2 + 1);
    ctx.lineTo(0, len / 2 - 1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,200,.65)';
    ctx.beginPath();
    ctx.ellipse(-wid * 0.3, -len * 0.18, 1.1, 2.2, -0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return sprite(canvas, 0.5, 0.86);
}

function makeBerryPile(seed) {
  const rng = mulberry32(seed);
  const W = 96;
  const H = 86;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 48;
  const baseY = 72;
  resourceBase(ctx, cx, baseY);

  // Little leafy shrub.
  ctx.fillStyle = '#4e7334';
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 20;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * rr, baseY - 16 + Math.sin(a) * rr * 0.6, rand(rng, 6, 11), rand(rng, 4, 7), rng() * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#6b9142';
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 17;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * rr - 3, baseY - 22 + Math.sin(a) * rr * 0.5, rand(rng, 4, 8), rand(rng, 2.5, 5), rng() * TAU, 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < 9; i++) {
    const x = cx + rand(rng, -19, 19);
    const y = baseY - rand(rng, 10, 33);
    const r = rand(rng, 3, 4.8);
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r);
    g.addColorStop(0, i % 3 === 0 ? '#e88a8a' : '#e05f5f');
    g.addColorStop(1, '#962f3d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, 0.8, 0, TAU);
    ctx.fill();
  }
  return sprite(canvas, 0.5, 0.86);
}

function makePebblePile(seed) {
  const rng = mulberry32(seed);
  const W = 90;
  const H = 76;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 45;
  const baseY = 66;
  resourceBase(ctx, cx, baseY);

  const stones = [
    { x: 0, y: 0, r: 13 },
    { x: -14, y: 3, r: 8 },
    { x: 15, y: 2, r: 9 },
    { x: -5, y: -8, r: 7 },
    { x: 10, y: -7, r: 6 },
    { x: -18, y: -5, r: 5 },
  ];
  for (const s of stones) {
    const x = cx + s.x + rand(rng, -2, 2);
    const y = baseY - 8 + s.y;
    const r = s.r;
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, '#c6c4b3');
    g.addColorStop(0.55, '#99998c');
    g.addColorStop(1, '#65675e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.75, rand(rng, -0.4, 0.4), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,62,55,.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y);
    ctx.lineTo(x + r * 0.3, y + r * 0.2);
    ctx.stroke();
  }
  return sprite(canvas, 0.5, 0.86);
}

function makeTwigPile(seed) {
  const rng = mulberry32(seed);
  const W = 94;
  const H = 80;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = 47;
  const baseY = 68;
  resourceBase(ctx, cx, baseY);

  const sticks = [
    { x: 0, y: 0, len: 40, rot: -0.35 },
    { x: -4, y: 2, len: 34, rot: 0.5 },
    { x: 5, y: -1, len: 30, rot: 1.2 },
    { x: -2, y: -3, len: 26, rot: -1.0 },
    { x: 6, y: 3, len: 24, rot: 0.05 },
  ];
  for (const s of sticks) {
    const x = cx + s.x;
    const y = baseY - 8 + s.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(s.rot);
    ctx.strokeStyle = '#6c4a2c';
    ctx.lineWidth = rand(rng, 2.4, 4);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s.len / 2, 0);
    ctx.lineTo(s.len / 2, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,26,14,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-s.len / 2, 0.8);
    ctx.lineTo(s.len / 2, 0.8);
    ctx.stroke();
    // Bud.
    if (rng() > 0.5) {
      ctx.fillStyle = '#8aa34c';
      ctx.beginPath();
      ctx.ellipse(s.len * 0.3, -2, 2.4, 1.4, -0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  return sprite(canvas, 0.5, 0.86);
}

function makeBridge(seed) {
  const rng = mulberry32(seed);
  const W = 150;
  const H = 300;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.04);

  // Two long logs.
  for (const side of [-1, 1]) {
    const g = ctx.createLinearGradient(side * 20, 0, side * 54, 0);
    g.addColorStop(0, '#8a633d');
    g.addColorStop(0.5, '#6a4a2d');
    g.addColorStop(1, '#3d2a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(side > 0 ? 24 : -54, -132, 30, 264, 15);
    ctx.fill();
  }

  // Cross planks.
  for (let i = 0; i < 9; i++) {
    const y = -118 + i * 28;
    const g = ctx.createLinearGradient(-38, y, 38, y + 10);
    g.addColorStop(0, '#7b5735');
    g.addColorStop(0.5, '#9b7447');
    g.addColorStop(1, '#5b4026');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-36, y, 72, 15, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,28,15,.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let j = 0; j < 4; j++) {
      ctx.strokeStyle = 'rgba(60,40,22,.25)';
      ctx.beginPath();
      ctx.moveTo(-30 + j * 18, y + 3);
      ctx.lineTo(-26 + j * 18, y + 12);
      ctx.stroke();
    }
  }

  // Moss on the upstream edge.
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = rgba(pick(rng, ['#587a36', '#6d8f43', '#84a050']), rand(rng, 0.2, 0.6));
    ctx.beginPath();
    ctx.ellipse(rand(rng, -50, 50), rand(rng, -128, 128), rand(rng, 2, 7), rand(rng, 1, 3), rng() * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  return sprite(canvas, 0.5, 0.5);
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

const CARGO_COLORS = {
  seed: ['#f0d585', '#b98a35'],
  leaf: ['#96b455', '#5f8236'],
  berry: ['#e06a6a', '#9c3341'],
  pebble: ['#bdbcab', '#707267'],
  twig: ['#8b633d', '#5b3f26'],
};

export function drawCargoItem(ctx, kind, x, y, scale = 1, angle = 0) {
  const colors = CARGO_COLORS[kind] || CARGO_COLORS.seed;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  if (kind === 'leaf') {
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,66,28,.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
  } else if (kind === 'berry') {
    const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 4.5);
    g.addColorStop(0, '#ef9090');
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, TAU);
    ctx.fill();
  } else if (kind === 'pebble') {
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 4, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(-1.4, -1.2, 1.8, 1.2, 0.2, 0, TAU);
    ctx.fill();
  } else if (kind === 'twig') {
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 1.5);
    ctx.lineTo(7, -1.5);
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, -4, 0, 4);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2, 6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,84,34,.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawAnt(ctx, ant, time, options = {}) {
  const {
    player = false,
    scale = 1,
    cargo = null,
    moving = false,
    phase = 0,
    selected = true,
  } = options;

  ctx.save();
  ctx.translate(ant.x, ant.y);

  // Soft contact shadow.
  ctx.fillStyle = 'rgba(18,28,12,.24)';
  ctx.beginPath();
  ctx.ellipse(4 * scale, 6 * scale, 19 * scale, 8 * scale, 0.15, 0, TAU);
  ctx.fill();

  if (player && selected) {
    ctx.save();
    ctx.rotate(time * 0.18);
    ctx.strokeStyle = 'rgba(255,235,170,.5)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 8]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 24 * scale, 18 * scale, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,244,200,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 28 * scale, 21 * scale, 0, 0, TAU);
    ctx.stroke();
  }

  ctx.rotate(ant.angle);
  ctx.scale(scale, scale);

  const walk = moving ? Math.sin(phase * 2) * 0.55 : Math.sin(time * 1.8) * 0.06;
  const bodyBob = moving ? Math.sin(phase * 4) * 0.5 : Math.sin(time * 1.6) * 0.25;
  ctx.translate(0, bodyBob);

  // Legs (behind the body).
  const legColor = '#2a180e';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const baseX = 5 - i * 4.6;
      const swing = Math.sin(phase * 2 + i * 2.3 + (side > 0 ? Math.PI : 0));
      const kneeX = baseX + swing * (moving ? 6 : 1.5) + (i - 1) * 1.6;
      const kneeY = side * (10.5 + (moving ? Math.abs(swing) * 2 : 0));
      const footX = kneeX + swing * (moving ? 5 : 1) + (i - 1) * 1.2;
      const footY = side * (18 + (moving ? Math.abs(swing) * 2.2 : 0));
      ctx.strokeStyle = legColor;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(baseX, side * 2.5);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,96,58,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX, side * 2.5);
      ctx.lineTo(kneeX, kneeY);
      ctx.stroke();
    }
  }

  // Abdomen.
  const abGrad = ctx.createRadialGradient(-13, -3, 1, -10, 0, 13);
  abGrad.addColorStop(0, player ? '#8c4f2b' : '#5b3620');
  abGrad.addColorStop(0.55, player ? '#5f321d' : '#3b2416');
  abGrad.addColorStop(1, '#211209');
  ctx.fillStyle = abGrad;
  ctx.beginPath();
  ctx.ellipse(-10, 0, 10.5, 7.8, 0, 0, TAU);
  ctx.fill();

  // Amber sheen marking the player's colony.
  if (player) {
    ctx.fillStyle = 'rgba(217,150,74,.32)';
    ctx.beginPath();
    ctx.ellipse(-10.5, -1.4, 7, 4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,211,145,.35)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(-10, 0, 10, 7.2, 0, 0, TAU);
    ctx.stroke();
  }

  // Waist.
  ctx.fillStyle = '#2a180e';
  ctx.beginPath();
  ctx.arc(-2.4, 0, 2.1, 0, TAU);
  ctx.fill();

  // Thorax.
  const thGrad = ctx.createRadialGradient(1, -2, 0.5, 3, 0, 8);
  thGrad.addColorStop(0, player ? '#8a5030' : '#5a3821');
  thGrad.addColorStop(1, '#2b180d');
  ctx.fillStyle = thGrad;
  ctx.beginPath();
  ctx.ellipse(3, 0, 6.6, 5.1, 0, 0, TAU);
  ctx.fill();

  // Head.
  const headGrad = ctx.createRadialGradient(11, -2.4, 0.5, 13, 0, 7);
  headGrad.addColorStop(0, player ? '#965a36' : '#633d25');
  headGrad.addColorStop(1, '#241309');
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(13, 0, 5.8, 0, TAU);
  ctx.fill();

  // Eyes.
  ctx.fillStyle = 'rgba(255,240,205,.8)';
  ctx.beginPath();
  ctx.arc(15.3, -3.1, 1.15, 0, TAU);
  ctx.arc(15.3, 3.1, 1.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,18,8,.9)';
  ctx.beginPath();
  ctx.arc(15.8, -3.1, 0.55, 0, TAU);
  ctx.arc(15.8, 3.1, 0.55, 0, TAU);
  ctx.fill();

  // Mandibles.
  ctx.strokeStyle = '#2a180e';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(17.4, side * 2.6);
    ctx.quadraticCurveTo(21.5, side * 4.4, 22.8, side * 1.5);
    ctx.stroke();
  }

  // Antennae.
  const sway = Math.sin(time * 2.6) * 1.6;
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#2f1b0f';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(16.5, side * 2.2);
    ctx.quadraticCurveTo(22 + sway * side, side * 3.4, 27 + sway, side * (8 + Math.sin(time * 2 + side) * 1.2));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22 + sway * side, side * 3.4);
    ctx.lineTo(23.5 + sway * side, side * 6.5);
    ctx.stroke();
  }

  // Cargo carried in the mandibles.
  if (cargo) {
    drawCargoItem(ctx, cargo, 24.5, -0.8, 0.92, Math.sin(time * 3) * 0.12);
  }

  ctx.restore();
}

export function drawButterfly(ctx, b, time) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  const flap = 0.35 + Math.abs(Math.sin(time * 8 + b.phase)) * 0.75;
  ctx.fillStyle = b.color;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side * flap);
    ctx.beginPath();
    ctx.ellipse(-2.5, -5, 5.2, 7.2, -0.5, 0, TAU);
    ctx.ellipse(3.5, -4.2, 4.2, 5.2, 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#3b2a1c';
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.6, 5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#3b2a1c';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.quadraticCurveTo(-2, -7, -4, -8);
  ctx.moveTo(0, -4);
  ctx.quadraticCurveTo(2, -7, 4, -8);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Nest
// ---------------------------------------------------------------------------

export function createNestLook(seed) {
  const rng = mulberry32(seed);
  const blobs = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + rand(rng, -0.12, 0.12);
    const r = rand(rng, 68, 106);
    blobs.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r * 0.7,
      w: rand(rng, 24, 46),
      h: rand(rng, 15, 30),
      rot: rng() * TAU,
      color: pick(rng, ['#8b6a44', '#96754c', '#7d5e3c', '#a07e51', '#715336']),
    });
  }
  const clods = [];
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * 94;
    clods.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r * 0.66,
      w: rand(rng, 7, 20),
      h: rand(rng, 3, 9),
      rot: rng() * TAU,
      color: pick(rng, ['#a27c4d', '#8a6740', '#b18a58', '#74563a']),
    });
  }
  const pebbles = [];
  for (let i = 0; i < 54; i++) {
    const a = rng() * TAU;
    const r = rand(rng, 28, 106);
    pebbles.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r * 0.66,
      w: rand(rng, 1.4, 4.8),
      h: rand(rng, 1.2, 3),
      rot: rng() * TAU,
      tone: pick(rng, ['#b8b09a', '#9b9583', '#d0c6ac', '#857f70']),
    });
  }
  const specks = [];
  for (let i = 0; i < 110; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * 104;
    specks.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r * 0.66,
      w: rand(rng, 0.7, 2.6),
      h: rand(rng, 0.6, 1.8),
      rot: rng() * TAU,
      tone: pick(rng, ['rgba(70,47,28,.3)', 'rgba(210,175,118,.24)', 'rgba(96,70,42,.28)']),
    });
  }
  const flowers = [];
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU;
    const r = rand(rng, 94, 138);
    flowers.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r * 0.68,
      s: rand(rng, 0.45, 0.8),
      color: pick(rng, ['#f4edc9', '#e9c95f', '#d9a3c7', '#e59a8f']),
      rot: rng() * TAU,
    });
  }
  const grass = [];
  for (let i = 0; i < 30; i++) {
    const a = rng() * TAU;
    const r = rand(rng, 108, 150);
    grass.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.68, s: rand(rng, 0.4, 0.85), rot: rng() * TAU });
  }
  return { blobs, clods, pebbles, specks, flowers, grass };
}

export function drawNest(ctx, nest, look, time) {
  const { x, y, stage } = nest;
  const t = time;

  // Soft contact shadow.
  ctx.save();
  ctx.translate(x + 16, y + 26);
  ctx.scale(1, 0.52);
  const sh = ctx.createRadialGradient(0, 0, 8, 0, 0, 148);
  sh.addColorStop(0, 'rgba(22,32,15,.34)');
  sh.addColorStop(0.55, 'rgba(22,32,15,.2)');
  sh.addColorStop(1, 'rgba(22,32,15,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, 148, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Uneven skirt of loose earth.
  for (const b of look.blobs) {
    ctx.save();
    ctx.translate(x + b.x, y + b.y + 10);
    ctx.rotate(b.rot);
    ctx.fillStyle = rgba(b.color, 0.88);
    ctx.beginPath();
    ctx.ellipse(0, 0, b.w, b.h, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Main mound, built from a few overlapping earth lumps so the silhouette
  // stays irregular instead of reading like a perfect disc.
  const lumps = [
    { dx: 0, dy: 2, rx: 106, ry: 68, light: '#b08a5b', dark: '#745437' },
    { dx: -30, dy: -12, rx: 58, ry: 42, light: '#ba9463', dark: '#846040' },
    { dx: 34, dy: 8, rx: 52, ry: 38, light: '#a98456', dark: '#6e5034' },
    { dx: -8, dy: 18, rx: 68, ry: 38, light: '#a17b4d', dark: '#6d4e32' },
  ];
  for (const lump of lumps) {
    const g = ctx.createRadialGradient(x + lump.dx - 24, y + lump.dy - 26, 4, x + lump.dx, y + lump.dy, lump.rx * 1.15);
    g.addColorStop(0, lump.light);
    g.addColorStop(0.55, mixHexLocal(lump.light, lump.dark, 0.42));
    g.addColorStop(1, lump.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + lump.dx, y + lump.dy, lump.rx, lump.ry, 0, 0, TAU);
    ctx.fill();
  }

  // Warm rim light on the upper-left crest.
  ctx.strokeStyle = 'rgba(236,206,151,.28)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x - 6, y - 4, 94, 61, 0, Math.PI * 0.98, Math.PI * 1.68);
  ctx.stroke();

  // Earth clods and fine crumbs give the mound texture.
  for (const c of look.clods) {
    ctx.save();
    ctx.translate(x + c.x, y + c.y + 5);
    ctx.rotate(c.rot);
    ctx.fillStyle = rgba(c.color, 0.55);
    ctx.beginPath();
    ctx.ellipse(0, 0, c.w, c.h, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const sp of look.specks) {
    ctx.save();
    ctx.translate(x + sp.x, y + sp.y + 5);
    ctx.rotate(sp.rot);
    ctx.fillStyle = sp.tone;
    ctx.beginPath();
    ctx.ellipse(0, 0, sp.w, sp.h, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Short, broken ridges — the ant tunnels pushing up through the soil.
  const ridges = [
    { r: 34, start: 0.3, end: 1.8, alpha: 0.16 },
    { r: 55, start: 2.4, end: 4.1, alpha: 0.13 },
    { r: 76, start: 0.9, end: 2.9, alpha: 0.1 },
    { r: 48, start: 4.6, end: 5.9, alpha: 0.11 },
  ];
  for (const ridge of ridges) {
    ctx.strokeStyle = `rgba(82,57,34,${ridge.alpha})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, ridge.r * 1.18, ridge.r * 0.7, 0, ridge.start, ridge.end);
    ctx.stroke();
  }

  // Pebbles and crumbs around the mound.
  for (const p of look.pebbles) {
    ctx.save();
    ctx.translate(x + p.x, y + p.y + 6);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.tone;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.w, p.h, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Entrance: a dark throat ringed by a raised lip of fresh soil.
  const rim = ctx.createRadialGradient(x - 5, y + 1, 3, x, y + 8, 34);
  rim.addColorStop(0, '#5e4228');
  rim.addColorStop(0.7, '#7e5b38');
  rim.addColorStop(1, 'rgba(126,91,56,0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 34, 22, 0, 0, TAU);
  ctx.fill();

  const hole = ctx.createRadialGradient(x - 3, y + 4, 1, x, y + 9, 24);
  hole.addColorStop(0, '#0d0804');
  hole.addColorStop(0.55, '#1d1108');
  hole.addColorStop(1, '#3b2615');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.ellipse(x, y + 9, 22, 14, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(218,181,124,.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 9, 24, 15.5, 0, Math.PI * 1.02, Math.PI * 1.88);
  ctx.stroke();

  // Loose crumbs around the mouth.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.2;
    ctx.fillStyle = 'rgba(150,117,74,.7)';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * (28 + (i % 3) * 2), y + 9 + Math.sin(a) * 18, 1.4, 0, TAU);
    ctx.fill();
  }

  // Stage decorations.
  if (stage >= 1) {
    for (const f of look.flowers) {
      ctx.save();
      ctx.translate(x + f.x, y + f.y + 10);
      ctx.rotate(f.rot);
      ctx.fillStyle = f.color;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 3.2 * f.s, Math.sin(a) * 2.8 * f.s, 2.8 * f.s, 2 * f.s, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#e2b45c';
      ctx.beginPath();
      ctx.arc(0, 0, 1.6 * f.s, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  if (stage >= 2) {
    // Leaf banner on a twig.
    ctx.strokeStyle = '#6b4a2c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + 80, y - 4);
    ctx.quadraticCurveTo(x + 88, y - 44, x + 84, y - 70);
    ctx.stroke();
    ctx.save();
    ctx.translate(x + 84, y - 62);
    ctx.rotate(Math.sin(t * 1.2) * 0.08 + 0.2);
    ctx.fillStyle = '#7fa547';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(18, -9, 31, 7, 9, 22);
    ctx.bezierCurveTo(2, 15, -4, 8, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,84,32,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, 2);
    ctx.lineTo(15, 15);
    ctx.stroke();
    ctx.restore();

    // Secondary entrance.
    ctx.fillStyle = '#2b190d';
    ctx.beginPath();
    ctx.ellipse(x - 62, y + 20, 11, 7, -0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,165,110,.26)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x - 62, y + 20, 12, 8, -0.2, 0, TAU);
    ctx.stroke();
  }

  if (stage >= 3) {
    // Little flower arch and glowing spores.
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const px = x + Math.cos(a) * 38;
      const py = y - 18 + Math.sin(a) * 28;
      ctx.fillStyle = i % 2 ? '#f6efd0' : '#e8c65d';
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 8; i++) {
      const a = t * 0.4 + (i / 8) * TAU;
      const r = 60 + Math.sin(t * 1.4 + i) * 10;
      ctx.fillStyle = `rgba(255,239,178,${0.2 + Math.sin(t * 2 + i) * 0.12})`;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y - 8 + Math.sin(a) * r * 0.55, 1.6, 0, TAU);
      ctx.fill();
    }
  }

  // Tiny grass around the base.
  for (const gr of look.grass) {
    ctx.save();
    ctx.translate(x + gr.x, y + gr.y + 8);
    ctx.rotate(gr.rot);
    ctx.strokeStyle = 'rgba(104,132,64,.7)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(2 * gr.s, -8 * gr.s, (i - 1) * 5 * gr.s, -15 * gr.s);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function mixHexLocal(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}

// ---------------------------------------------------------------------------
// Atlas factory
// ---------------------------------------------------------------------------

function makeShadowSprite() {
  const W = 256;
  const H = 128;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 126);
  g.addColorStop(0, 'rgba(18,29,14,.5)');
  g.addColorStop(0.35, 'rgba(18,29,14,.38)');
  g.addColorStop(0.7, 'rgba(18,29,14,.16)');
  g.addColorStop(1, 'rgba(18,29,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 126, 0, TAU);
  ctx.fill();
  ctx.restore();
  return canvas;
}

export function createArt(seed = 20261111) {
  const rng = mulberry32(seed);
  const art = {
    trees: [],
    rocks: [],
    logs: [],
    ferns: [],
    grass: [],
    flowers: [],
    mushrooms: [],
    clovers: [],
    reeds: [],
    lilies: [],
    resources: {
      leaf: makeLeafPile(seed + 11),
      seed: makeSeedPile(seed + 12),
      berry: makeBerryPile(seed + 13),
      pebble: makePebblePile(seed + 14),
      twig: makeTwigPile(seed + 15),
    },
    bridges: [makeBridge(seed + 21), makeBridge(seed + 22)],
    shadow: makeShadowSprite(),
  };

  for (let i = 0; i < 5; i++) art.trees.push(makeBroadleaf(seed + 100 + i * 17, i));
  for (let i = 0; i < 2; i++) art.trees.push(makePine(seed + 300 + i * 19, i));
  for (let i = 0; i < 2; i++) art.trees.push(makeBirch(seed + 400 + i * 23));
  for (let i = 0; i < 4; i++) art.rocks.push(makeRock(seed + 500 + i * 29, i % 2));
  for (let i = 0; i < 2; i++) art.logs.push(makeLog(seed + 600 + i * 31));
  for (let i = 0; i < 3; i++) art.ferns.push(makeFern(seed + 700 + i * 37));
  for (let i = 0; i < 6; i++) art.grass.push(makeGrassTuft(seed + 800 + i * 41));
  for (let i = 0; i < 5; i++) art.flowers.push(makeFlower(seed + 900 + i * 43, i));
  for (let i = 0; i < 3; i++) art.mushrooms.push(makeMushroom(seed + 1000 + i * 47));
  for (let i = 0; i < 2; i++) art.clovers.push(makeClover(seed + 1100 + i * 53));
  for (let i = 0; i < 2; i++) art.reeds.push(makeReeds(seed + 1200 + i * 59));
  for (let i = 0; i < 2; i++) art.lilies.push(makeLily(seed + 1300 + i * 61));

  art.rand = rng;
  return art;
}

export function drawSprite(ctx, spr, x, y, scale = 1, alpha = 1, rotation = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (rotation) {
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(spr.canvas, -spr.w * spr.ax * scale, -spr.h * spr.ay * scale, spr.w * scale, spr.h * scale);
  } else {
    ctx.drawImage(spr.canvas, x - spr.w * spr.ax * scale, y - spr.h * spr.ay * scale, spr.w * scale, spr.h * scale);
  }
  ctx.restore();
}

export function drawTreeShadow(ctx, x, y, scale, radius) {
  ctx.save();
  ctx.translate(x + 14 * scale, y + 14 * scale);
  ctx.rotate(0.12);
  const g = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
  g.addColorStop(0, 'rgba(22,33,15,.28)');
  g.addColorStop(0.7, 'rgba(22,33,15,.16)');
  g.addColorStop(1, 'rgba(22,33,15,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
