// Procedural valley: terrain painting, stream, trails, props and harvestables.

import {
  TAU,
  clamp,
  distanceToPolyline,
  dist,
  fbm,
  makeCanvas,
  makeNoise,
  mixHex,
  mulberry32,
  pick,
  rand,
  randInt,
  rgba,
  smoothstep,
} from './utils.js';
import { createArt, createNestLook, drawSprite } from './art.js';

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const NEST = { x: 1600, y: 1240 };

const RESOURCE_INFO = {
  leaf: { category: 'leaves', value: 1, label: 'hoja', plural: 'hojas', icon: 'leaf' },
  seed: { category: 'food', value: 2, label: 'semilla', plural: 'semillas', icon: 'seed' },
  berry: { category: 'food', value: 3, label: 'baya', plural: 'bayas', icon: 'seed' },
  pebble: { category: 'stone', value: 1, label: 'piedrita', plural: 'piedritas', icon: 'stone' },
  twig: { category: 'wood', value: 1, label: 'ramita', plural: 'ramitas', icon: 'twig' },
};

export const RESOURCES = RESOURCE_INFO;

function catmullRom(points, samplesPerSegment = 12) {
  const out = [];
  if (points.length < 2) return points.slice();
  const pts = [points[0], ...points, points[points.length - 1]];
  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export class World {
  constructor(seed = 20261111) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.width = WORLD_W;
    this.height = WORLD_H;
    this.nest = { ...NEST, r: 118, stage: 0 };
    this.art = createArt(seed);
    this.nestLook = createNestLook(seed + 5);
    this.colliders = [];
    this.decor = [];
    this.resources = [];
    this.paths = [];
    this.bridges = [];
    this.ambientAnts = [];
    this.butterflies = [];

    this.noise = makeNoise(seed + 1);
    this.noise2 = makeNoise(seed + 2);

    this.generateStream();
    this.generatePaths();
    this.generateTerrain();
    this.scatterProps();
    this.scatterResources();
    this.createAmbientLife();
    this.buildMinimap();
  }

  // -- geometry -------------------------------------------------------------

  streamYAt(x) {
    return 520 + 170 * Math.sin(x * 0.00165 + 0.7) + 75 * Math.sin(x * 0.0042 + 2.2);
  }

  generateStream() {
    const points = [];
    for (let x = -220; x <= this.width + 220; x += 40) {
      points.push({ x, y: this.streamYAt(x) });
    }
    const widths = points.map((p) => 150 + 32 * Math.sin(p.x * 0.0031 + 1.4) + 12 * Math.sin(p.x * 0.009));
    const left = [];
    const right = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = widths[i] / 2;
      left.push({ x: points[i].x + nx * half, y: points[i].y + ny * half });
      right.push({ x: points[i].x - nx * half, y: points[i].y - ny * half });
    }
    const poly = new Path2D();
    poly.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) poly.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) poly.lineTo(right[i].x, right[i].y);
    poly.closePath();

    this.stream = { points, widths, poly };
    this.bridges = [
      { x: 1120, y: this.streamYAt(1120), rot: -0.06, sprite: 0 },
      { x: 2390, y: this.streamYAt(2390), rot: 0.07, sprite: 1 },
    ];
  }

  generatePaths() {
    const definitions = [
      [
        { x: 1600, y: 1240 },
        { x: 1500, y: 1140 },
        { x: 1370, y: 1060 },
        { x: 1230, y: 1040 },
        { x: 1110, y: 1120 },
        { x: 1030, y: 1260 },
        { x: 1060, y: 1430 },
        { x: 1160, y: 1560 },
      ],
      [
        { x: 1600, y: 1240 },
        { x: 1720, y: 1160 },
        { x: 1860, y: 1110 },
        { x: 2010, y: 1100 },
        { x: 2170, y: 1160 },
        { x: 2300, y: 1290 },
        { x: 2380, y: 1450 },
      ],
      [
        { x: 1600, y: 1240 },
        { x: 1650, y: 1370 },
        { x: 1620, y: 1510 },
        { x: 1700, y: 1660 },
        { x: 1830, y: 1770 },
        { x: 1980, y: 1820 },
      ],
      [
        { x: 1600, y: 1240 },
        { x: 1500, y: 1300 },
        { x: 1360, y: 1330 },
        { x: 1210, y: 1400 },
        { x: 1080, y: 1500 },
      ],
      [
        { x: 1600, y: 1240 },
        { x: 1610, y: 1090 },
        { x: 1560, y: 960 },
        { x: 1480, y: 850 },
      ],
    ];
    this.paths = definitions.map((points, i) => ({
      points: catmullRom(points, 14),
      width: i === 0 ? 54 : 44,
    }));
  }

  generateTerrain() {
    const canvas = makeCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    const rng = mulberry32(this.seed + 77);

    // Base meadow.
    ctx.fillStyle = '#7c9751';
    ctx.fillRect(0, 0, this.width, this.height);

    // Low-resolution colour field, upscaled with smoothing for a painterly wash.
    const nw = 240;
    const nh = 180;
    const low = makeCanvas(nw, nh);
    const lctx = low.getContext('2d');
    const img = lctx.createImageData(nw, nh);
    const colors = {
      dark: '#5e7d43',
      moss: '#57753d',
      base: '#7d9850',
      warm: '#94a45c',
      dry: '#aaa663',
      straw: '#b6ae6d',
    };
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const wx = (x / nw) * this.width;
        const wy = (y / nh) * this.height;
        const n = fbm(this.noise, wx * 0.0032, wy * 0.0032, 4);
        const m = fbm(this.noise2, wx * 0.008, wy * 0.008, 3);
        let color = mixHex(colors.dark, colors.base, smoothstep(n * 1.35 - 0.1));
        if (m > 0.56) color = mixHex(color, colors.moss, smoothstep((m - 0.56) * 4.5) * 0.7);
        if (n > 0.58) color = mixHex(color, colors.warm, smoothstep((n - 0.58) * 3.4) * 0.8);
        if (n > 0.7) color = mixHex(color, colors.dry, smoothstep((n - 0.7) * 4) * 0.55);
        const px = color.match(/\d+/g).map(Number);
        const idx = (y * nw + x) * 4;
        img.data[idx] = px[0];
        img.data[idx + 1] = px[1];
        img.data[idx + 2] = px[2];
        img.data[idx + 3] = 255;
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(low, 0, 0, this.width, this.height);

    // Soft sunlit / shaded patches.
    for (let i = 0; i < 55; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      const r = rand(rng, 120, 420);
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      const warm = rng() > 0.45;
      g.addColorStop(0, warm ? 'rgba(202,204,120,.12)' : 'rgba(53,82,42,.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Fine grass speckle.
    for (let i = 0; i < 17000; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      const len = rand(rng, 1.2, 4.5);
      const lean = rand(rng, -1.4, 1.4);
      const tone = pick(rng, ['#5b7a3d', '#6c8a44', '#8aa254', '#9caa5e', '#4e6e38', '#b0ad68']);
      ctx.strokeStyle = rgba(tone, rand(rng, 0.08, 0.3));
      ctx.lineWidth = rand(rng, 0.6, 1.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean, y - len * 0.6, x + lean * 1.6, y - len);
      ctx.stroke();
    }

    // Worn trails.
    for (const path of this.paths) {
      this.paintTrail(ctx, path.points, path.width, rng);
    }

    // Nest clearing.
    const clearing = ctx.createRadialGradient(this.nest.x, this.nest.y, 40, this.nest.x, this.nest.y, 300);
    clearing.addColorStop(0, 'rgba(148,119,76,.24)');
    clearing.addColorStop(0.5, 'rgba(145,118,77,.1)');
    clearing.addColorStop(1, 'rgba(145,118,77,0)');
    ctx.fillStyle = clearing;
    ctx.beginPath();
    ctx.arc(this.nest.x, this.nest.y, 300, 0, TAU);
    ctx.fill();

    // Stream: banks, water and baked details.
    this.paintStream(ctx, rng);

    // Baked leaf litter and twigs.
    for (let i = 0; i < 900; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.isWaterRaw(x, y, 40)) continue;
      const type = rng();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * TAU);
      if (type < 0.62) {
        ctx.fillStyle = rgba(pick(rng, ['#8d7c42', '#a18d4c', '#6f7a3b', '#b09a58']), rand(rng, 0.2, 0.5));
        ctx.beginPath();
        ctx.ellipse(0, 0, rand(rng, 2, 5.5), rand(rng, 1, 2.4), 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(pick(rng, ['#6f5637', '#846843', '#5a452d']), rand(rng, 0.2, 0.45));
        ctx.lineWidth = rand(rng, 0.8, 1.6);
        ctx.beginPath();
        ctx.moveTo(-rand(rng, 2, 7), 0);
        ctx.lineTo(rand(rng, 2, 7), rand(rng, -2, 2));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Slight darkening at the map border (the forest closes in).
    const edge = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.25,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72
    );
    edge.addColorStop(0, 'rgba(22,36,18,0)');
    edge.addColorStop(1, 'rgba(22,36,18,.32)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, this.width, this.height);

    this.terrain = canvas;
  }

  paintTrail(ctx, pts, width, rng) {
    const passes = [
      { w: width * 1.35, color: 'rgba(113,92,55,.16)' },
      { w: width * 0.92, color: 'rgba(142,112,68,.2)' },
      { w: width * 0.6, color: 'rgba(163,131,83,.2)' },
      { w: width * 0.28, color: 'rgba(177,145,94,.14)' },
    ];
    for (const pass of passes) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = pass.w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    // Scattered pebbles and dust along the edges.
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const count = randInt(rng, 0, 3);
      for (let j = 0; j < count; j++) {
        const a = rng() * TAU;
        const rr = rand(rng, width * 0.4, width * 1.1);
        const x = p.x + Math.cos(a) * rr;
        const y = p.y + Math.sin(a) * rr * 0.8;
        ctx.fillStyle = rgba(pick(rng, ['#b7a480', '#9a8a6b', '#c7b892']), rand(rng, 0.15, 0.4));
        ctx.beginPath();
        ctx.ellipse(x, y, rand(rng, 1, 3.2), rand(rng, 0.8, 2), rng() * TAU, 0, TAU);
        ctx.fill();
      }
    }
  }

  paintStream(ctx, rng) {
    const pts = this.stream.points;
    const widths = this.stream.widths;
    const drawStroke = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    drawStroke(238, 'rgba(190,168,120,.52)');
    drawStroke(206, 'rgba(171,146,101,.75)');
    drawStroke(184, '#315e58');
    drawStroke(168, '#3b6d64');
    drawStroke(138, '#467b70');
    drawStroke(86, 'rgba(89,143,128,.7)');

    // Water depth variation along the centre.
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const w = widths[i];
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, w * 0.5);
      g.addColorStop(0, 'rgba(39,83,78,.18)');
      g.addColorStop(1, 'rgba(39,83,78,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - w * 0.5, p.y - w * 0.5, w, w);
    }

    // Baked ripples.
    for (let i = 0; i < 160; i++) {
      const x = rand(rng, 0, this.width);
      const y = this.streamYAt(x) + rand(rng, -48, 48);
      ctx.strokeStyle = `rgba(208,240,225,${rand(rng, 0.04, 0.16)})`;
      ctx.lineWidth = rand(rng, 0.6, 1.5);
      ctx.beginPath();
      ctx.ellipse(x, y, rand(rng, 4, 22), rand(rng, 0.6, 2), 0, 0, TAU);
      ctx.stroke();
    }

    // Stones in the water.
    for (let i = 0; i < 36; i++) {
      const x = rand(rng, 100, this.width - 100);
      const y = this.streamYAt(x) + rand(rng, -62, 62);
      const r = rand(rng, 4, 15);
      ctx.fillStyle = 'rgba(30,55,48,.25)';
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 3, r * 1.1, r * 0.7, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, '#a9a894');
      g.addColorStop(0.6, '#7f8275');
      g.addColorStop(1, '#5a6055');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, rand(rng, -0.3, 0.3), 0, TAU);
      ctx.fill();
    }

    // Sandy speckles on the banks.
    for (let i = 0; i < 700; i++) {
      const x = rand(rng, 0, this.width);
      const y = this.streamYAt(x) + rand(rng, -115, 115);
      if (this.isWaterRaw(x, y, 0)) continue;
      ctx.fillStyle = rgba(pick(rng, ['#d2c29b', '#beab82', '#a99166']), rand(rng, 0.2, 0.5));
      ctx.beginPath();
      ctx.arc(x, y, rand(rng, 0.6, 2), 0, TAU);
      ctx.fill();
    }

  }

  // -- placement ------------------------------------------------------------

  isWaterRaw(x, y, pad = 0) {
    if (!this.stream) return false;
    const d = distanceToPolyline(x, y, this.stream.points).distance;
    const idx = clamp(Math.round((x + 220) / 40), 0, this.stream.widths.length - 1);
    return d < this.stream.widths[idx] / 2 + pad;
  }

  isOnBridge(x, y) {
    return this.bridges.some((b) => Math.abs(x - b.x) < 58 && Math.abs(y - b.y) < 145);
  }

  isWater(x, y, pad = 0) {
    if (this.isOnBridge(x, y)) return false;
    return this.isWaterRaw(x, y, pad);
  }

  nearPath(x, y, pad = 0) {
    return this.paths.some((p) => distanceToPolyline(x, y, p.points).distance < p.width * 0.5 + pad);
  }

  isBlocked(x, y, r = 0) {
    if (x < 30 || y < 30 || x > this.width - 30 || y > this.height - 30) return true;
    for (const c of this.colliders) {
      if (dist(x, y, c.x, c.y) < c.r + r) return true;
    }
    return false;
  }

  resolveCollision(x, y, r = 10) {
    let px = clamp(x, 26, this.width - 26);
    let py = clamp(y, 26, this.height - 26);
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        const dx = px - c.x;
        const dy = py - c.y;
        const d = Math.hypot(dx, dy);
        const min = c.r + r;
        if (d < min && d > 0.001) {
          const push = min - d;
          px += (dx / d) * push;
          py += (dy / d) * push;
        }
      }
    }
    return { x: clamp(px, 26, this.width - 26), y: clamp(py, 26, this.height - 26) };
  }

  terrainAt(x, y) {
    if (this.isOnBridge(x, y)) return 'bridge';
    if (this.isWaterRaw(x, y, -8)) return 'water';
    if (this.nearPath(x, y, 8)) return 'dirt';
    return 'grass';
  }

  speedAt(x, y) {
    const t = this.terrainAt(x, y);
    if (t === 'water') return 0.52;
    if (t === 'dirt') return 1.06;
    return 1;
  }

  canPlaceProp(x, y, opts = {}) {
    const {
      nestClear = 170,
      waterClear = 6,
      pathClear = 0,
      propGap = 26,
      treeGap = 58,
    } = opts;
    if (x < 18 || y < 18 || x > this.width - 18 || y > this.height - 18) return false;
    if (dist(x, y, this.nest.x, this.nest.y) < nestClear) return false;
    if (this.isWaterRaw(x, y, waterClear)) return false;
    if (pathClear && this.nearPath(x, y, pathClear)) return false;
    for (const c of this.colliders) {
      if (dist(x, y, c.x, c.y) < c.r + treeGap) return false;
    }
    for (const d of this.decor) {
      if ((d.kind === 'grass' || d.kind === 'flower' || d.kind === 'fern') && dist(x, y, d.x, d.y) < propGap) return false;
    }
    return true;
  }

  scatterProps() {
    const rng = mulberry32(this.seed + 999);
    const art = this.art;

    // A dense tree frame around the valley, with clusters inside.
    const treeSpots = [];
    for (let i = 0; i < 118; i++) {
      const side = i % 4;
      let x;
      let y;
      if (side === 0) {
        x = rand(rng, -40, this.width + 40);
        y = rand(rng, -50, 215);
      } else if (side === 1) {
        x = rand(rng, -40, this.width + 40);
        y = rand(rng, this.height - 215, this.height + 50);
      } else if (side === 2) {
        x = rand(rng, -50, 215);
        y = rand(rng, 120, this.height - 120);
      } else {
        x = rand(rng, this.width - 215, this.width + 50);
        y = rand(rng, 120, this.height - 120);
      }
      treeSpots.push({ x, y, scale: rand(rng, 0.72, 1.18) });
    }
    for (let i = 0; i < 48; i++) {
      treeSpots.push({
        x: rand(rng, 260, this.width - 260),
        y: rand(rng, 260, this.height - 260),
        scale: rand(rng, 0.62, 1.05),
      });
    }

    for (const spot of treeSpots) {
      if (dist(spot.x, spot.y, this.nest.x, this.nest.y) < 400) continue;
      if (this.isWaterRaw(spot.x, spot.y, 24)) continue;
      if (this.nearPath(spot.x, spot.y, 18)) continue;
      if (this.colliders.some((c) => dist(spot.x, spot.y, c.x, c.y) < 82)) continue;
      const spr = pick(rng, art.trees);
      const scale = spot.scale * rand(rng, 0.9, 1.08);
      const isPine = spr.canopy.r < 130;
      this.decor.push({
        kind: 'tree',
        x: spot.x,
        y: spot.y,
        scale,
        sprite: spr,
        shadow: (spr.canopy?.r || 110) * scale,
        layer: 0,
      });
      this.colliders.push({
        x: spot.x,
        y: spot.y,
        r: (isPine ? 20 : 26) * scale,
        kind: 'tree',
      });
    }

    // Rocks.
    for (let i = 0; i < 52; i++) {
      let x;
      let y;
      let tries = 0;
      do {
        x = rand(rng, 120, this.width - 120);
        y = rand(rng, 120, this.height - 120);
        tries++;
      } while (
        tries < 40 &&
        (dist(x, y, this.nest.x, this.nest.y) < 320 ||
          this.isWaterRaw(x, y, 20) ||
          this.nearPath(x, y, 10) ||
          this.colliders.some((c) => dist(x, y, c.x, c.y) < 66))
      );
      if (tries >= 40) continue;
      const spr = pick(rng, art.rocks);
      const scale = rand(rng, 0.55, 1.35);
      this.decor.push({ kind: 'rock', x, y, scale, sprite: spr, shadow: 46 * scale, layer: 0 });
      this.colliders.push({ x, y, r: 30 * scale, kind: 'rock' });
    }

    // Fallen logs.
    for (let i = 0; i < 9; i++) {
      let x;
      let y;
      let tries = 0;
      do {
        x = rand(rng, 260, this.width - 260);
        y = rand(rng, 260, this.height - 260);
        tries++;
      } while (
        tries < 40 &&
        (dist(x, y, this.nest.x, this.nest.y) < 340 ||
          this.isWaterRaw(x, y, 40) ||
          this.nearPath(x, y, 16) ||
          this.colliders.some((c) => dist(x, y, c.x, c.y) < 92))
      );
      if (tries >= 40) continue;
      const spr = pick(rng, art.logs);
      const scale = rand(rng, 0.7, 1.05);
      this.decor.push({ kind: 'log', x, y, scale, sprite: spr, shadow: 70 * scale, layer: 0 });
      this.colliders.push({ x, y, r: 24 * scale, kind: 'log' });
    }

    // Ground cover.
    const groundTypes = [
      { kind: 'grass', list: art.grass, count: 760, scale: [0.55, 1.15], alpha: [0.75, 1], shadow: 0 },
      { kind: 'flower', list: art.flowers, count: 155, scale: [0.6, 1.1], alpha: [0.85, 1], shadow: 0 },
      { kind: 'fern', list: art.ferns, count: 72, scale: [0.55, 1.1], alpha: [0.85, 1], shadow: 0 },
      { kind: 'mushroom', list: art.mushrooms, count: 58, scale: [0.6, 1.15], alpha: [0.9, 1], shadow: 0 },
      { kind: 'clover', list: art.clovers, count: 115, scale: [0.55, 1], alpha: [0.8, 1], shadow: 0 },
    ];
    for (const group of groundTypes) {
      let placed = 0;
      let guard = 0;
      while (placed < group.count && guard < group.count * 12) {
        guard++;
        const x = rand(rng, 30, this.width - 30);
        const y = rand(rng, 30, this.height - 30);
        if (!this.canPlaceProp(x, y, { nestClear: 145, waterClear: 10, propGap: 22, treeGap: 8 })) continue;
        if (group.kind === 'fern' && rng() > 0.65) continue;
        const spr = pick(rng, group.list);
        this.decor.push({
          kind: group.kind,
          x,
          y,
          scale: rand(rng, group.scale[0], group.scale[1]),
          alpha: rand(rng, group.alpha[0], group.alpha[1]),
          sprite: spr,
          sway: rand(rng, 0, TAU),
          shadow: 0,
          layer: 1,
        });
        placed++;
      }
    }

    // Pebbles.
    for (let i = 0; i < 150; i++) {
      const x = rand(rng, 30, this.width - 30);
      const y = rand(rng, 30, this.height - 30);
      if (!this.canPlaceProp(x, y, { nestClear: 130, waterClear: 4, propGap: 10, treeGap: 0 })) continue;
      this.decor.push({
        kind: 'pebble',
        x,
        y,
        scale: rand(rng, 0.4, 1.1),
        alpha: rand(rng, 0.4, 0.85),
        sprite: pick(rng, art.rocks),
        shadow: 0,
        layer: 1,
      });
    }

    // Reeds and lilies along the stream.
    for (let i = 0; i < 65; i++) {
      const x = rand(rng, 40, this.width - 40);
      const side = rng() > 0.5 ? 1 : -1;
      const y = this.streamYAt(x) + side * rand(rng, 84, 128);
      if (this.isWaterRaw(x, y, 6)) continue;
      if (this.colliders.some((c) => dist(x, y, c.x, c.y) < 40)) continue;
      this.decor.push({
        kind: 'reed',
        x,
        y,
        scale: rand(rng, 0.6, 1.15),
        alpha: rand(rng, 0.8, 1),
        sprite: pick(rng, art.reeds),
        sway: rand(rng, 0, TAU),
        shadow: 0,
        layer: 1,
      });
    }
    for (let i = 0; i < 24; i++) {
      const x = rand(rng, 160, this.width - 160);
      const y = this.streamYAt(x) + rand(rng, -42, 42);
      if (!this.isWaterRaw(x, y, 0)) continue;
      this.decor.push({
        kind: 'lily',
        x,
        y,
        scale: rand(rng, 0.7, 1.2),
        alpha: 0.95,
        sprite: pick(rng, art.lilies),
        sway: rand(rng, 0, TAU),
        shadow: 0,
        layer: 2,
      });
    }

    this.decor.sort((a, b) => a.y - b.y);
  }

  scatterResources() {
    const rng = mulberry32(this.seed + 4242);
    const types = ['leaf', 'seed', 'berry', 'pebble', 'twig'];
    const clusters = [];
    const nearNestAngles = [0.2, 0.9, 1.6, 2.5, 3.4, 4.3, 5.1, 5.8];
    for (const a of nearNestAngles) {
      const r = rand(rng, 260, 520);
      clusters.push({
        x: this.nest.x + Math.cos(a) * r,
        y: this.nest.y + Math.sin(a) * r * 0.78,
        type: pick(rng, types),
      });
    }
    for (let i = 0; i < 11; i++) {
      clusters.push({
        x: rand(rng, 350, this.width - 350),
        y: rand(rng, 350, this.height - 350),
        type: pick(rng, types),
      });
    }

    // Guaranteed starter nodes close to the nest, one of each useful kind.
    const starters = [
      { type: 'leaf', x: 1408, y: 1092 },
      { type: 'seed', x: 1815, y: 1084 },
      { type: 'pebble', x: 1442, y: 1404 },
      { type: 'berry', x: 1834, y: 1376 },
      { type: 'twig', x: 1694, y: 1490 },
    ];

    const addNode = (type, x, y, amount, allowPath = false) => {
      if (this.isWaterRaw(x, y, 8)) return false;
      if (this.isBlocked(x, y, 24)) return false;
      if (dist(x, y, this.nest.x, this.nest.y) < 160) return false;
      if (this.resources.some((r) => dist(x, y, r.x, r.y) < 58)) return false;
      if (!allowPath && this.paths.some((p) => distanceToPolyline(x, y, p.points).distance < 20)) return false;
      const max = amount || randInt(rng, 4, 6);
      this.resources.push({
        id: this.resources.length + 1,
        type,
        x,
        y,
        amount: max,
        max,
        regrow: 0,
        regrowTime: rand(rng, 24, 38),
        scale: rand(rng, 0.92, 1.14),
        sway: rand(rng, 0, TAU),
        pulse: 0,
        resource: true,
        sprite: this.art.resources[type],
      });
      return true;
    };

    for (const s of starters) addNode(s.type, s.x, s.y, 6, true);

    for (const cluster of clusters) {
      const count = randInt(rng, 3, 6);
      for (let i = 0; i < count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 24 && !placed; attempt++) {
          const a = rng() * TAU;
          const rr = rand(rng, 20, 95);
          const x = cluster.x + Math.cos(a) * rr;
          const y = cluster.y + Math.sin(a) * rr * 0.8;
          if (addNode(cluster.type, x, y)) placed = true;
        }
      }
    }

    // A few extra nodes sprinkled far from the trail.
    for (let i = 0; i < 22; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 20 && !placed; attempt++) {
        const x = rand(rng, 260, this.width - 260);
        const y = rand(rng, 260, this.height - 260);
        if (addNode(pick(rng, types), x, y)) placed = true;
      }
    }
  }

  createAmbientLife() {
    const rng = mulberry32(this.seed + 8080);
    for (let i = 0; i < 8; i++) {
      const a = rng() * TAU;
      const r = rand(rng, 55, 210);
      this.ambientAnts.push({
        ambient: true,
        x: this.nest.x + Math.cos(a) * r,
        y: this.nest.y + Math.sin(a) * r * 0.7,
        angle: rng() * TAU,
        target: null,
        speed: rand(rng, 16, 30),
        phase: rng() * TAU,
        wait: rand(rng, 0, 3),
        home: { x: this.nest.x, y: this.nest.y },
      });
    }
    const colors = ['#e8b46a', '#d98f5b', '#efd08b', '#c97c8f', '#e5c06a'];
    for (let i = 0; i < 6; i++) {
      this.butterflies.push({
        x: rand(rng, 500, this.width - 500),
        y: rand(rng, 500, this.height - 500),
        angle: rng() * TAU,
        speed: rand(rng, 18, 34),
        phase: rng() * TAU,
        color: pick(rng, colors),
        turn: rand(rng, -0.8, 0.8),
      });
    }
  }

  updateAmbient(dt, time) {
    for (const a of this.ambientAnts) {
      if (a.wait > 0) {
        a.wait -= dt;
        continue;
      }
      if (!a.target) {
        const ang = Math.random() * TAU;
        const r = 45 + Math.random() * 190;
        a.target = {
          x: this.nest.x + Math.cos(ang) * r,
          y: this.nest.y + Math.sin(ang) * r * 0.72,
        };
      }
      const dx = a.target.x - a.x;
      const dy = a.target.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        a.target = null;
        a.wait = 0.5 + Math.random() * 2.5;
      } else {
        a.angle = Math.atan2(dy, dx);
        a.x += (dx / d) * a.speed * dt;
        a.y += (dy / d) * a.speed * dt;
        a.phase += dt * 8;
      }
    }
    for (const b of this.butterflies) {
      b.turn += (Math.random() - 0.5) * dt * 2.2;
      b.turn = clamp(b.turn, -1.2, 1.2);
      b.angle += b.turn * dt;
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      if (b.x < 200) b.angle = 0;
      if (b.x > this.width - 200) b.angle = Math.PI;
      if (b.y < 200) b.angle = Math.PI / 2;
      if (b.y > this.height - 200) b.angle = -Math.PI / 2;
      b.x = clamp(b.x, 150, this.width - 150);
      b.y = clamp(b.y, 150, this.height - 150);
    }
  }

  updateResources(dt) {
    for (const r of this.resources) {
      if (r.amount <= 0) {
        r.regrow -= dt;
        if (r.regrow <= 0) {
          r.amount = r.max;
          r.regrow = 0;
          r.pulse = 1;
        }
      }
      r.pulse = Math.max(0, r.pulse - dt * 1.6);
    }
  }

  buildMinimap() {
    const w = 260;
    const h = 195;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(this.terrain, 0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, 'rgba(20,34,16,0)');
    g.addColorStop(1, 'rgba(20,34,16,.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    this.minimapBase = c;
  }

  // -- rendering ------------------------------------------------------------

  drawTerrain(ctx, cam, viewW, viewH, zoom) {
    const pad = 90;
    const sx = clamp(cam.x - viewW / (2 * zoom) - pad, 0, this.width);
    const sy = clamp(cam.y - viewH / (2 * zoom) - pad, 0, this.height);
    const sw = clamp(viewW / zoom + pad * 2, 1, this.width - sx);
    const sh = clamp(viewH / zoom + pad * 2, 1, this.height - sy);
    if (sw <= 0 || sh <= 0) return;
    ctx.drawImage(this.terrain, sx, sy, sw, sh, sx, sy, sw, sh);
  }

  drawWater(ctx, time) {
    ctx.save();
    ctx.clip(this.stream.poly);
    ctx.globalCompositeOperation = 'lighter';

    const span = this.width + 500;
    for (let i = 0; i < 22; i++) {
      const x = ((time * 26 + i * 157) % span) - 250;
      const y = this.streamYAt(x) + Math.sin(x * 0.01 + time * 0.8) * 34;
      const slope = Math.atan2(this.streamYAt(x + 4) - this.streamYAt(x - 4), 8);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(slope);
      ctx.fillStyle = `rgba(183,226,211,${0.06 + 0.035 * Math.sin(time * 1.6 + i)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26 + (i % 4) * 7, 1.8, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < 26; i++) {
      const x = 120 + ((i * 263.7) % (this.width - 240));
      const y = this.streamYAt(x) + Math.sin(i * 4.2) * 50;
      const a = Math.max(0, Math.sin(time * 1.4 + i * 1.7)) * 0.3;
      ctx.fillStyle = `rgba(224,248,232,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (i % 3) * 0.6, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Soft moving reflection on the banks.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const x = ((time * 18 + i * 600) % (this.width + 600)) - 300;
      const y = this.streamYAt(x);
      const g = ctx.createRadialGradient(x, y, 2, x, y, 150);
      g.addColorStop(0, 'rgba(200,240,215,.05)');
      g.addColorStop(1, 'rgba(200,240,215,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 150, y - 150, 300, 300);
    }
    ctx.restore();
  }

  drawBridges(ctx) {
    for (const b of this.bridges) {
      ctx.fillStyle = 'rgba(20,32,24,.22)';
      ctx.beginPath();
      ctx.ellipse(b.x + 8, b.y + 10, 78, 148, b.rot, 0, TAU);
      ctx.fill();
      const spr = this.art.bridges[b.sprite];
      drawSprite(ctx, spr, b.x, b.y, 1.1, 1, b.rot);
    }
  }
}
