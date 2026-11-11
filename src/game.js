// Colonia Aurora — a quiet top-down ant colony game.
// One scout, one valley, no enemies. Gather, return, grow the nest.

import { World, RESOURCES } from './world.js';
import {
  drawAnt,
  drawButterfly,
  drawNest,
  drawSprite,
} from './art.js';
import { AudioManager } from './audio.js';
import { TAU, angleLerp, clamp, damp, dist } from './utils.js';

const STORAGE_KEY = 'colonia-aurora-v1';
const CAPACITY = 4;

const OBJECTIVES = [
  {
    id: 'leaves',
    cat: 'leaves',
    target: 12,
    icon: 'leaf',
    label: 'Hojas frescas',
    short: 'Hojas',
    blurb: 'Acolcha los túneles del nido.',
  },
  {
    id: 'food',
    cat: 'food',
    target: 15,
    icon: 'seed',
    label: 'Semillas y bayas',
    short: 'Semillas',
    blurb: 'Alimento para toda la colonia.',
  },
  {
    id: 'stone',
    cat: 'stone',
    target: 8,
    icon: 'stone',
    label: 'Piedritas',
    short: 'Piedras',
    blurb: 'Refuerza la entrada del hormiguero.',
  },
];

const CATEGORY_LABELS = {
  food: 'semillas',
  leaves: 'hojas',
  stone: 'piedritas',
  wood: 'ramitas',
};

const CATEGORY_SINGULAR = {
  food: 'semilla',
  leaves: 'hoja',
  stone: 'piedrita',
  wood: 'ramita',
};

const RESOURCE_DOT = {
  leaf: '#9cbb58',
  seed: '#e0b85a',
  berry: '#d96b66',
  pebble: '#b8b6a5',
  twig: '#9b7248',
};

const ACTION_ICONS = {
  gather: 'leaf',
  deposit: 'nest',
  return: 'arrow',
  search: 'leaf',
  explore: 'ant',
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const minimap = $('minimap');
const mmctx = minimap.getContext('2d');
const actionBtn = $('action-btn');
const actionIco = $('action-ico');
const actionText = $('action-text');
const actionKey = $('action-key');
const cargoEl = $('cargo');
const cargoSlots = $('cargo-slots');
const cargoCount = $('cargo-count');
const cargoHint = $('cargo-hint');
const toastsEl = $('toasts');
const questList = $('quest-list');
const questCount = $('quest-count');
const questCard = $('quest-card');
const modal = $('modal');
const modalQuests = $('modal-quests');
const intro = $('intro');
const recenterBtn = $('btn-recenter');
const soundUse = $('sound-use');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const audio = new AudioManager();

const state = {
  resources: { food: 0, leaves: 0, stone: 0, wood: 0 },
  gathered: { food: 0, leaves: 0, stone: 0, wood: 0 },
  cargo: [],
  capacity: CAPACITY,
  objectives: OBJECTIVES.map((o) => ({ ...o, done: false })),
  nestStage: 0,
  celebrated: false,
  totalDelivered: 0,
  savedAt: 0,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || saved.v !== 1) return;
    for (const key of Object.keys(state.resources)) {
      if (Number.isFinite(saved.resources?.[key])) state.resources[key] = Math.max(0, saved.resources[key]);
      if (Number.isFinite(saved.gathered?.[key])) state.gathered[key] = Math.max(0, saved.gathered[key]);
    }
    if (Array.isArray(saved.cargo)) {
      state.cargo = saved.cargo.filter((k) => RESOURCES[k]).slice(0, CAPACITY);
    }
    if (Array.isArray(saved.objectives)) {
      state.objectives.forEach((o, i) => {
        o.done = !!saved.objectives[i];
      });
    }
    state.nestStage = clamp(Number(saved.nestStage) || 0, 0, 3);
    state.celebrated = !!saved.celebrated;
    state.totalDelivered = Number(saved.totalDelivered) || 0;
    state.savedAt = Number(saved.savedAt) || 0;
  } catch {
    /* corrupted save: start fresh */
  }
}

let saveTimer = 0;
function saveState(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try {
      const payload = {
        v: 1,
        resources: state.resources,
        gathered: state.gathered,
        cargo: state.cargo,
        objectives: state.objectives.map((o) => o.done),
        nestStage: state.nestStage,
        celebrated: state.celebrated,
        totalDelivered: state.totalDelivered,
        ant: { x: Math.round(ant.x), y: Math.round(ant.y) },
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage unavailable */
    }
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 350);
}

// ---------------------------------------------------------------------------
// World + actors
// ---------------------------------------------------------------------------

loadState();
const world = new World();
world.nest.stage = state.nestStage;

const ant = {
  x: world.nest.x,
  y: world.nest.y + 142,
  angle: -Math.PI / 2,
  vx: 0,
  vy: 0,
  speed: 176,
  moving: false,
  walkPhase: 0,
  target: null,
  job: null,
  gatherTimer: 0,
  depositGlow: 0,
  footTimer: 0,
};

let savedAnt = null;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.ant?.x) && Number.isFinite(parsed?.ant?.y)) savedAnt = parsed.ant;
  }
} catch {
  /* ignore */
}
if (savedAnt) {
  ant.x = clamp(savedAnt.x, 40, world.width - 40);
  ant.y = clamp(savedAnt.y, 40, world.height - 40);
}
const safeStart = world.resolveCollision(ant.x, ant.y, 12);
ant.x = safeStart.x;
ant.y = safeStart.y;

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('is-touch');

const camera = {
  x: ant.x,
  y: ant.y,
  zoom: 1,
  targetZoom: 1,
  follow: true,
};

let viewW = 0;
let viewH = 0;
let dpr = 1;
let time = 0;

const keys = new Set();
const joystick = { active: false, x: 0, y: 0, pointerId: null };
const particles = [];
const pollen = [];

let marker = null;
let lastActionKey = '';
let lastCargoSignature = '';
let lastHint = '';
let lastNearNest = false;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(viewW * dpr));
  canvas.height = Math.max(1, Math.round(viewH * dpr));
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.imageSmoothingEnabled = true;
  camera.zoom = clamp(camera.zoom, 0.65, 1.9);
  camera.targetZoom = clamp(camera.targetZoom, 0.65, 1.9);
  clampCamera();
}

function initialZoom() {
  if (viewW < 520) return 1.26;
  if (viewW < 900) return 1.1;
  return 1.1;
}

function clampCamera() {
  const halfW = viewW / (2 * camera.zoom);
  const halfH = viewH / (2 * camera.zoom);
  if (halfW * 2 >= world.width) camera.x = world.width / 2;
  else camera.x = clamp(camera.x, halfW, world.width - halfW);
  if (halfH * 2 >= world.height) camera.y = world.height / 2;
  else camera.y = clamp(camera.y, halfH, world.height - halfH);
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - viewW / 2) / camera.zoom + camera.x,
    y: (sy - viewH / 2) / camera.zoom + camera.y,
  };
}

function isVisible(x, y, margin = 120) {
  const halfW = viewW / (2 * camera.zoom);
  const halfH = viewH / (2 * camera.zoom);
  return (
    x > camera.x - halfW - margin &&
    x < camera.x + halfW + margin &&
    y > camera.y - halfH - margin &&
    y < camera.y + halfH + margin
  );
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showToast(text, icon = 'leaf', duration = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  const iconEl = document.createElement('span');
  iconEl.className = 'toast-ico';
  iconEl.innerHTML = `<svg><use href="#i-${icon}"/></svg>`;
  const label = document.createElement('span');
  label.textContent = text;
  el.append(iconEl, label);
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 340);
  }, duration);
}

function bumpStat(cat) {
  const el = document.querySelector(`.stat[data-cat="${cat}"]`);
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 460);
}

function updateStats(bumpCats = []) {
  for (const cat of Object.keys(state.resources)) {
    const el = $(`stat-${cat}`);
    if (el) el.textContent = state.resources[cat];
  }
  for (const cat of bumpCats) bumpStat(cat);
}

function questProgress(obj) {
  return Math.min(state.resources[obj.cat] || 0, obj.target);
}

function updateQuestSummary(done) {
  const total = state.objectives.length;
  const complete = done === total;
  questCount.textContent = `${done}/${total}`;
  questCard.classList.toggle('all-done', complete);
  const eyebrow = questCard.querySelector('.eyebrow');
  if (eyebrow) eyebrow.textContent = complete ? 'Colonia completa' : 'La colonia necesita';
}

function renderQuestList() {
  const current = state.objectives.find((o) => !o.done);
  questList.innerHTML = state.objectives
    .map((obj) => {
      const progress = questProgress(obj);
      const pct = Math.round((progress / obj.target) * 100);
      return `<li class="quest-item ${obj.done ? 'done' : ''} ${obj === current ? 'current' : ''}" data-id="${obj.id}">
        <span class="quest-ico"><svg><use href="#i-${obj.icon}"/></svg></span>
        <div class="quest-main">
          <div class="quest-row"><b>${obj.label}</b><span class="quest-num">${progress}/${obj.target}</span></div>
          <div class="quest-bar"><i style="width:${pct}%"></i></div>
        </div>
        <span class="quest-check"><svg><use href="#i-check"/></svg></span>
      </li>`;
    })
    .join('');
  const done = state.objectives.filter((o) => o.done).length;
  updateQuestSummary(done);
}

function renderModalQuests() {
  modalQuests.innerHTML = state.objectives
    .map((obj) => {
      const progress = questProgress(obj);
      return `<div class="modal-quest ${obj.done ? 'done' : ''}">
        <span class="quest-ico"><svg><use href="#i-${obj.icon}"/></svg></span>
        <div><b>${obj.label}</b><span>${obj.blurb}</span></div>
        <span>${progress}/${obj.target}</span>
      </div>`;
    })
    .join('');
}

function updateQuestUI() {
  const current = state.objectives.find((o) => !o.done);
  for (const li of questList.children) {
    const obj = state.objectives.find((o) => o.id === li.dataset.id);
    if (!obj) continue;
    const progress = questProgress(obj);
    li.classList.toggle('done', obj.done);
    li.classList.toggle('current', obj === current);
    const num = li.querySelector('.quest-num');
    if (num) num.textContent = `${progress}/${obj.target}`;
    const bar = li.querySelector('.quest-bar i');
    if (bar) bar.style.width = `${Math.round((progress / obj.target) * 100)}%`;
  }
  const done = state.objectives.filter((o) => o.done).length;
  updateQuestSummary(done);
}

function updateCargoUI(force = false) {
  const signature = state.cargo.join(',');
  const nearNest = dist(ant.x, ant.y, world.nest.x, world.nest.y) < 150;
  const hint = state.cargo.length
    ? nearNest
      ? 'Estás en el nido: la carga baja sola'
      : state.cargo.length >= state.capacity
        ? 'Carga completa · vuelve al nido'
        : 'Lleva la carga al nido'
    : 'Busca hojas, semillas y piedritas';
  if (!force && signature === lastCargoSignature && hint === lastHint && nearNest === lastNearNest) return;
  lastCargoSignature = signature;
  lastHint = hint;
  lastNearNest = nearNest;

  cargoCount.textContent = `${state.cargo.length}/${state.capacity}`;
  cargoSlots.innerHTML = '';
  for (let i = 0; i < state.capacity; i++) {
    const kind = state.cargo[i];
    const slot = document.createElement('div');
    slot.className = `cargo-slot ${kind ? 'filled' : 'empty'}`;
    if (kind) {
      slot.innerHTML = `<svg><use href="#i-${RESOURCES[kind].icon}"/></svg>`;
      slot.title = RESOURCES[kind].label;
    }
    cargoSlots.appendChild(slot);
  }
  cargoHint.textContent = hint;
  cargoEl.classList.toggle('ready', nearNest && state.cargo.length > 0);
}

function nearestNode(x, y, maxDistance) {
  let best = null;
  let bestD = maxDistance;
  for (const node of world.resources) {
    if (node.amount <= 0) continue;
    const d = dist(x, y, node.x, node.y);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

function nodeAtPoint(x, y, radius = 62) {
  let best = null;
  let bestD = radius;
  for (const node of world.resources) {
    const d = dist(x, y, node.x, node.y);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

function actionContext() {
  const nearNest = dist(ant.x, ant.y, world.nest.x, world.nest.y) < 132;
  const node = nearestNode(ant.x, ant.y, 98);
  if (nearNest && state.cargo.length) {
    return { key: 'deposit', label: 'Depositar', icon: 'nest', variant: 'nest', mode: 'deposit' };
  }
  if (node && state.cargo.length < state.capacity) {
    return { key: 'gather', label: 'Recolectar', icon: 'leaf', variant: 'ready', mode: 'gather', node };
  }
  if (node && state.cargo.length >= state.capacity) {
    return { key: 'return', label: 'Al nido', icon: 'arrow', variant: 'return', mode: 'return', node };
  }
  if (state.cargo.length) {
    return { key: 'return', label: 'Al nido', icon: 'arrow', variant: 'return', mode: 'return' };
  }
  const far = nearestNode(ant.x, ant.y, 1600);
  if (far) {
    return { key: 'search', label: 'Buscar', icon: 'leaf', variant: '', mode: 'search', node: far };
  }
  return { key: 'explore', label: 'Explorar', icon: 'ant', variant: '', mode: 'explore' };
}

function updateActionUI(force = false) {
  const info = actionContext();
  if (!force && info.key === lastActionKey) return;
  lastActionKey = info.key;
  actionText.textContent = info.label;
  actionIco.innerHTML = `<svg><use href="#i-${ACTION_ICONS[info.mode] || 'leaf'}"/></svg>`;
  actionBtn.className = `action-btn ${info.variant}`;
  actionBtn.setAttribute('aria-label', info.label);
  if (!isTouch) actionKey.textContent = 'E';
}

function updateSoundUI() {
  soundUse.setAttribute('href', audio.muted ? '#i-muted' : '#i-sound');
  $('btn-sound').setAttribute('aria-label', audio.muted ? 'Activar sonido' : 'Silenciar sonido');
  $('btn-sound').setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  $('btn-sound').title = audio.muted ? 'Activar sonido' : 'Silenciar sonido';
}

// ---------------------------------------------------------------------------
// Economy / interaction
// ---------------------------------------------------------------------------

function spawnBurst(x, y, kind, count = 8, opts = {}) {
  const palettes = {
    leaf: ['#a9c466', '#7ea247', '#c2d583'],
    seed: ['#eed27d', '#d2a64a', '#f6e5ab'],
    berry: ['#e37c76', '#b3444d', '#f0a59b'],
    pebble: ['#c3c1b1', '#8d8f81', '#e0ddca'],
    twig: ['#a47a4e', '#7a5735', '#c19a6c'],
    gold: ['#ffe7a3', '#e8bd5e', '#fff4ca'],
    confetti: ['#e9c25f', '#8fb35a', '#e78f79', '#f6ead0', '#c6a0ce'],
  };
  const colors = palettes[kind] || palettes.gold;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const speed = (opts.speed || 45) * (0.35 + Math.random() * 0.9);
    particles.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (opts.lift || 22),
      life: (opts.life || 0.8) * (0.65 + Math.random() * 0.7),
      maxLife: opts.life || 0.8,
      size: (opts.size || 2.4) * (0.6 + Math.random() * 0.9),
      color: colors[Math.floor(Math.random() * colors.length)],
      type: opts.type || 'spark',
      rot: Math.random() * TAU,
      spin: (Math.random() - 0.5) * 8,
      gravity: opts.gravity ?? 60,
      layer: opts.layer || 'air',
    });
  }
}

function spawnRipple(x, y) {
  particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.75,
    maxLife: 0.75,
    size: 4,
    color: 'rgba(205,240,225,0.5)',
    type: 'ripple',
    gravity: 0,
    layer: 'ground',
  });
}

function gatherNode(node) {
  if (!node || node.amount <= 0) return false;
  if (state.cargo.length >= state.capacity) {
    if (ant.job) ant.job.phase = 'return';
    showToast('Carga completa · vuelvo al nido', 'nest');
    return false;
  }
  node.amount -= 1;
  node.pulse = 1;
  state.cargo.push(node.type);
  audio.pickup(node.type);
  const info = RESOURCES[node.type];
  spawnBurst(node.x, node.y - 8, node.type, 7, { speed: 38, lift: 18, life: 0.7, type: 'leafBit' });
  updateCargoUI(true);
  updateActionUI(true);
  if (node.amount <= 0) {
    node.regrow = node.regrowTime;
    if (ant.job) {
      ant.job.phase = state.cargo.length ? 'return' : null;
      if (!ant.job.phase) ant.job = null;
      showToast(`Se acabaron las ${info.plural} por aquí`, 'leaf');
    }
  }
  if (state.cargo.length >= state.capacity) {
    showToast('Carga completa · vuelve al nido', 'nest');
    if (ant.job) ant.job.phase = 'return';
  }
  return true;
}

function depositAll() {
  if (!state.cargo.length) return 0;
  const summary = {};
  const bump = new Set();
  for (const kind of state.cargo) {
    const info = RESOURCES[kind];
    state.resources[info.category] += info.value;
    state.gathered[info.category] += info.value;
    summary[info.category] = (summary[info.category] || 0) + info.value;
    bump.add(info.category);
  }
  const delivered = state.cargo.length;
  state.totalDelivered += delivered;
  state.cargo = [];
  ant.depositGlow = 1;
  audio.deposit();
  spawnBurst(world.nest.x, world.nest.y + 4, 'gold', 16, { speed: 55, lift: 30, life: 1, type: 'spark' });
  spawnBurst(world.nest.x, world.nest.y, 'leaf', 5, { speed: 30, lift: 20, life: 0.8, type: 'leafBit' });

  const text = Object.entries(summary)
    .map(([cat, value]) => `+${value} ${value === 1 ? CATEGORY_SINGULAR[cat] : CATEGORY_LABELS[cat]}`)
    .join(' · ');
  showToast(`Depositado: ${text}`, 'nest', 2400);
  updateStats([...bump]);
  updateQuestUI();
  updateCargoUI(true);
  updateActionUI(true);
  checkObjectives();
  saveState();
  return delivered;
}

function checkObjectives() {
  let changed = false;
  for (const obj of state.objectives) {
    if (!obj.done && state.resources[obj.cat] >= obj.target) {
      obj.done = true;
      changed = true;
      state.nestStage = state.objectives.filter((o) => o.done).length;
      audio.objective();
      spawnBurst(world.nest.x, world.nest.y - 20, 'confetti', 34, {
        speed: 80,
        lift: 50,
        life: 1.4,
        type: 'confetti',
        gravity: 80,
      });
      showToast(`Objetivo completado · ${obj.label}`, 'check', 3800);
    }
  }
  if (changed) {
    world.nest.stage = state.nestStage;
    updateQuestUI();
    renderModalQuests();
    updateActionUI(true);
    saveState();
  }
  if (state.objectives.every((o) => o.done) && !state.celebrated) {
    state.celebrated = true;
    state.nestStage = 3;
    world.nest.stage = 3;
    audio.complete();
    spawnBurst(world.nest.x, world.nest.y - 30, 'confetti', 90, {
      speed: 130,
      lift: 70,
      life: 2.2,
      type: 'confetti',
      gravity: 90,
    });
    showToast('¡La colonia prospera! El valle es tuyo para explorar', 'sparkle', 7000);
    saveState();
  }
}

function startJob(node) {
  if (!node || node.amount <= 0) {
    showToast('Ese recurso todavía está creciendo', 'leaf');
    return;
  }
  const full = state.cargo.length >= state.capacity;
  ant.job = { node, phase: full ? 'return' : 'gather' };
  ant.target = null;
  marker = { x: node.x, y: node.y, t: 0, kind: 'resource' };
  if (full) {
    showToast('Carga completa · vuelvo al nido y regreso', 'nest');
  } else {
    showToast(`Recolectando ${RESOURCES[node.type].plural}`, RESOURCES[node.type].icon);
  }
  updateActionUI(true);
}

function cancelJob() {
  if (!ant.job) return;
  ant.job = null;
  ant.gatherTimer = 0;
}

function goToNest() {
  ant.job = null;
  ant.target = { x: world.nest.x, y: world.nest.y + 92 };
  marker = { x: world.nest.x, y: world.nest.y + 60, t: 0, kind: 'nest' };
  updateActionUI(true);
}

function performAction() {
  audio.unlock();
  const nearNest = dist(ant.x, ant.y, world.nest.x, world.nest.y) < 132;
  if (nearNest && state.cargo.length) {
    cancelJob();
    depositAll();
    return;
  }
  const node = nearestNode(ant.x, ant.y, 96);
  if (node) {
    if (state.cargo.length >= state.capacity) {
      ant.job = { node, phase: 'return' };
      goToNestKeepJob(node);
      return;
    }
    cancelJob();
    ant.target = null;
    gatherNode(node);
    updateActionUI(true);
    return;
  }
  if (state.cargo.length) {
    goToNest();
    showToast('Volviendo al nido con la carga', 'nest');
    return;
  }
  const far = nearestNode(ant.x, ant.y, 1500);
  if (far) startJob(far);
  else showToast('No hay recursos cerca. Explora un poco más', 'leaf');
}

function goToNestKeepJob(node) {
  ant.job = { node, phase: 'return' };
  ant.target = null;
  marker = { x: world.nest.x, y: world.nest.y + 60, t: 0, kind: 'nest' };
  showToast('Carga completa · vuelvo al nido', 'nest');
  updateActionUI(true);
}

// ---------------------------------------------------------------------------
// Input: world taps, camera drag, pinch, wheel, keyboard
// ---------------------------------------------------------------------------

function handleWorldTap(wx, wy) {
  audio.unlock();
  const node = nodeAtPoint(wx, wy, 68);
  if (node) {
    if (node.amount <= 0) {
      showToast('Ese recurso está creciendo. Prueba con otro', 'leaf');
      marker = { x: node.x, y: node.y, t: 0, kind: 'depleted' };
      return;
    }
    startJob(node);
    return;
  }
  if (dist(wx, wy, world.nest.x, world.nest.y) < 165) {
    goToNest();
    if (state.cargo.length) showToast('Volviendo al nido con la carga', 'nest');
    return;
  }
  cancelJob();
  ant.target = { x: clamp(wx, 30, world.width - 30), y: clamp(wy, 30, world.height - 30) };
  marker = { x: ant.target.x, y: ant.target.y, t: 0, kind: 'ground' };
  updateActionUI(true);
}

const pointers = new Map();
let pinch = null;
let pinchUsed = false;

canvas.addEventListener('pointerdown', (event) => {
  audio.unlock();
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  canvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    startTime: performance.now(),
    moved: false,
  });
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    pinch = {
      distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      zoom: camera.targetZoom,
    };
    pinchUsed = true;
    for (const p of pointers.values()) p.moved = true;
  }
});

canvas.addEventListener('pointermove', (event) => {
  const p = pointers.get(event.pointerId);
  if (!p) return;
  const dx = event.clientX - p.x;
  const dy = event.clientY - p.y;
  p.x = event.clientX;
  p.y = event.clientY;
  const travel = Math.hypot(event.clientX - p.startX, event.clientY - p.startY);
  if (travel > 9) p.moved = true;

  if (pointers.size >= 2) {
    const pts = [...pointers.values()];
    if (pinch && pinch.distance > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      camera.targetZoom = clamp(pinch.zoom * (d / pinch.distance), 0.65, 1.9);
    }
    return;
  }

  if (p.moved) {
    camera.follow = false;
    recenterBtn.hidden = false;
    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;
    clampCamera();
    canvas.classList.add('dragging');
  }
});

function endPointer(event) {
  const p = pointers.get(event.pointerId);
  if (!p) return;
  const elapsed = performance.now() - p.startTime;
  if (pointers.size === 1 && !p.moved && !pinchUsed && elapsed < 520) {
    const w = screenToWorld(event.clientX, event.clientY);
    handleWorldTap(w.x, w.y);
  }
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    pinchUsed = false;
    canvas.classList.remove('dragging');
  }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', (event) => {
  if (pointers.has(event.pointerId)) endPointer(event);
});

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    camera.targetZoom = clamp(camera.targetZoom * factor, 0.65, 1.9);
  },
  { passive: false }
);

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (event.key === 'Escape') {
    closeModal();
    return;
  }
  if (modal.hidden === false) return;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd'].includes(key)) {
    event.preventDefault();
  }
  if (key === ' ' || key === 'e' || key === 'enter') {
    event.preventDefault();
    performAction();
    return;
  }
  if (key === 'q' || key === 'c') {
    camera.follow = true;
    recenterBtn.hidden = true;
    return;
  }
  if (key === '+' || key === '=') {
    camera.targetZoom = clamp(camera.targetZoom * 1.1, 0.65, 1.9);
    return;
  }
  if (key === '-' || key === '_') {
    camera.targetZoom = clamp(camera.targetZoom * 0.9, 0.65, 1.9);
    return;
  }
  keys.add(key);
  audio.unlock();
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener('blur', () => keys.clear());

// Joystick
const joystickBase = document.querySelector('.joystick-base');
const joystickKnob = $('joystick-knob');
const joystickWrap = $('joystick');

function updateJoystick(event) {
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const max = rect.width / 2 - 14;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > max) {
    dx = (dx / len) * max;
    dy = (dy / len) * max;
  }
  joystick.x = dx / max;
  joystick.y = dy / max;
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

joystickBase.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  audio.unlock();
  joystick.active = true;
  joystick.pointerId = event.pointerId;
  joystickBase.setPointerCapture?.(event.pointerId);
  joystickWrap.classList.add('active');
  updateJoystick(event);
});

joystickBase.addEventListener('pointermove', (event) => {
  if (!joystick.active || event.pointerId !== joystick.pointerId) return;
  updateJoystick(event);
});

function releaseJoystick(event) {
  if (event.pointerId !== joystick.pointerId) return;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.x = 0;
  joystick.y = 0;
  joystickKnob.style.transform = 'translate(0px, 0px)';
  joystickWrap.classList.remove('active');
}

joystickBase.addEventListener('pointerup', releaseJoystick);
joystickBase.addEventListener('pointercancel', releaseJoystick);
joystickBase.addEventListener('lostpointercapture', releaseJoystick);

// Buttons
actionBtn.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  actionBtn.classList.add('press');
  performAction();
});
actionBtn.addEventListener('pointerup', () => actionBtn.classList.remove('press'));
actionBtn.addEventListener('pointercancel', () => actionBtn.classList.remove('press'));
actionBtn.addEventListener('pointerleave', () => actionBtn.classList.remove('press'));

$('btn-sound').addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  updateSoundUI();
  showToast(audio.muted ? 'Sonido silenciado' : 'Sonido activado', audio.muted ? 'muted' : 'sparkle', 1600);
});

function openModal() {
  renderModalQuests();
  modal.hidden = false;
  intro.classList.remove('show');
}

function closeModal() {
  modal.hidden = true;
}

$('btn-help').addEventListener('click', openModal);
$('quest-more').addEventListener('click', openModal);
$('modal-close').addEventListener('click', closeModal);
modal.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));

$('btn-zoom-in').addEventListener('click', () => {
  camera.targetZoom = clamp(camera.targetZoom * 1.14, 0.65, 1.9);
});
$('btn-zoom-out').addEventListener('click', () => {
  camera.targetZoom = clamp(camera.targetZoom * 0.88, 0.65, 1.9);
});
recenterBtn.addEventListener('click', () => {
  camera.follow = true;
  recenterBtn.hidden = true;
});

$('intro-close').addEventListener('click', () => intro.classList.remove('show'));

// Reset (two taps, no native confirm dialog).
let resetArmed = false;
let resetTimer = 0;
const resetBtn = $('btn-reset');
const resetNote = $('reset-note');
resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.classList.add('confirm');
    resetBtn.textContent = '¿Seguro? Toca otra vez para reiniciar';
    resetNote.textContent = 'Se perderán las reservas y los objetivos.';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      resetBtn.classList.remove('confirm');
      resetBtn.textContent = 'Reiniciar progreso de la colonia';
      resetNote.textContent = 'Se borrarán las reservas y los objetivos.';
    }, 4500);
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
});

// Minimap tap: send the ant to that spot.
minimap.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  const rect = minimap.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * world.width;
  const y = ((event.clientY - rect.top) / rect.height) * world.height;
  handleWorldTap(x, y);
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 160));

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function updateJob(dt) {
  if (!ant.job) return;
  const node = ant.job.node;
  if (!node) {
    ant.job = null;
    return;
  }
  if (ant.job.phase === 'return') {
    ant.target = { x: world.nest.x, y: world.nest.y + 92 };
    if (dist(ant.x, ant.y, world.nest.x, world.nest.y) < 112) {
      depositAll();
      if (node.amount > 0) {
        ant.job = { node, phase: 'gather' };
        ant.target = null;
      } else {
        ant.job = null;
      }
    }
    return;
  }

  if (node.amount <= 0) {
    if (state.cargo.length) ant.job = { node, phase: 'return' };
    else {
      ant.job = null;
      ant.target = null;
    }
    return;
  }

  if (dist(ant.x, ant.y, node.x, node.y) > 58) {
    ant.target = { x: node.x, y: node.y + 10 };
  } else {
    ant.target = null;
    ant.gatherTimer -= dt;
    if (ant.gatherTimer <= 0) {
      ant.gatherTimer = 0.58;
      gatherNode(node);
    }
  }
}

function updateAnt(dt) {
  let inputX = 0;
  let inputY = 0;
  if (keys.has('w') || keys.has('arrowup')) inputY -= 1;
  if (keys.has('s') || keys.has('arrowdown')) inputY += 1;
  if (keys.has('a') || keys.has('arrowleft')) inputX -= 1;
  if (keys.has('d') || keys.has('arrowright')) inputX += 1;
  if (joystick.active) {
    inputX = joystick.x;
    inputY = joystick.y;
  }

  const inputLen = Math.hypot(inputX, inputY);
  const manual = inputLen > 0.12;
  if (manual) {
    cancelJob();
    ant.target = null;
    marker = null;
  }

  if (!manual) updateJob(dt);

  // Auto-deposit whenever the scout is back at the nest with something.
  if (state.cargo.length && dist(ant.x, ant.y, world.nest.x, world.nest.y) < 108) {
    const hadJob = ant.job;
    depositAll();
    if (hadJob) {
      if (hadJob.node.amount > 0) ant.job = { node: hadJob.node, phase: 'gather' };
      else ant.job = null;
    }
  }

  let desiredX = 0;
  let desiredY = 0;
  let targetSpeed = 0;

  if (manual) {
    const len = inputLen || 1;
    const terrainSpeed = world.speedAt(ant.x, ant.y);
    targetSpeed = ant.speed * terrainSpeed * clamp(inputLen, 0, 1);
    desiredX = (inputX / len) * targetSpeed;
    desiredY = (inputY / len) * targetSpeed;
  } else if (ant.target) {
    const dx = ant.target.x - ant.x;
    const dy = ant.target.y - ant.y;
    const d = Math.hypot(dx, dy);
    if (d < 7) {
      ant.target = null;
    } else {
      const terrainSpeed = world.speedAt(ant.x, ant.y);
      targetSpeed = ant.speed * terrainSpeed * clamp(d / 40, 0.35, 1);
      desiredX = (dx / d) * targetSpeed;
      desiredY = (dy / d) * targetSpeed;
    }
  }

  ant.vx = damp(ant.vx, desiredX, 11, dt);
  ant.vy = damp(ant.vy, desiredY, 11, dt);
  const speed = Math.hypot(ant.vx, ant.vy);
  ant.moving = speed > 8;

  if (ant.moving) {
    const targetAngle = Math.atan2(ant.vy, ant.vx);
    ant.angle = angleLerp(ant.angle, targetAngle, 1 - Math.exp(-13 * dt));
    ant.walkPhase += dt * (5.5 + speed * 0.03);
  } else {
    ant.walkPhase += dt * 1.1;
  }

  const nx = ant.x + ant.vx * dt;
  const ny = ant.y + ant.vy * dt;
  const resolved = world.resolveCollision(nx, ny, 11);
  // Kill velocity into obstacles so the ant does not buzz against a trunk.
  if (Math.abs(resolved.x - nx) > 0.4) ant.vx *= 0.2;
  if (Math.abs(resolved.y - ny) > 0.4) ant.vy *= 0.2;
  ant.x = resolved.x;
  ant.y = resolved.y;

  // Footsteps / water ripples.
  ant.footTimer -= dt;
  if (ant.moving && ant.footTimer <= 0) {
    const terrain = world.terrainAt(ant.x, ant.y);
    ant.footTimer = terrain === 'water' ? 0.18 : 0.16;
    const bx = ant.x - Math.cos(ant.angle) * 11;
    const by = ant.y - Math.sin(ant.angle) * 11;
    if (terrain === 'water') {
      spawnRipple(bx, by);
    } else {
      particles.push({
        x: bx,
        y: by,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 4,
        life: 0.5,
        maxLife: 0.5,
        size: terrain === 'dirt' ? 2.4 : 1.7,
        color: terrain === 'dirt' ? 'rgba(168,143,99,0.4)' : 'rgba(140,166,91,0.35)',
        type: 'dust',
        gravity: -4,
        layer: 'ground',
      });
    }
  }

  ant.depositGlow = Math.max(0, ant.depositGlow - dt * 1.2);
  updateCargoUI();
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    if (p.type === 'ripple') {
      p.size += dt * 26;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 1.2;
    p.vy *= 1 - dt * 0.8;
    p.vy += p.gravity * dt;
    p.rot += p.spin * dt;
  }
  if (particles.length > 420) particles.splice(0, particles.length - 420);
}

function updateCamera(dt) {
  camera.zoom = damp(camera.zoom, camera.targetZoom, 9, dt);
  if (camera.follow) {
    const lead = 34;
    const leadX = Math.cos(ant.angle) * lead * clamp(Math.hypot(ant.vx, ant.vy) / 150, 0, 1);
    const leadY = Math.sin(ant.angle) * lead * clamp(Math.hypot(ant.vx, ant.vy) / 150, 0, 1);
    camera.x = damp(camera.x, ant.x + leadX, 6, dt);
    camera.y = damp(camera.y, ant.y + leadY, 6, dt);
    recenterBtn.hidden = true;
  }
  clampCamera();
}

function updatePollen(dt) {
  for (const p of pollen) {
    p.x += p.vx * dt;
    p.y += p.vy * dt + Math.sin(time * 0.6 + p.phase) * 0.002;
    if (p.x < -0.03) p.x = 1.03;
    if (p.x > 1.03) p.x = -0.03;
    if (p.y < -0.03) p.y = 1.03;
    if (p.y > 1.03) p.y = -0.03;
  }
}

function updateMarker(dt) {
  if (!marker) return;
  marker.t += dt;
  if (marker.t > 1.15) marker = null;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function drawTreeUnderCanopy(tree) {
  if (!tree.sprite.canopy) return false;
  const cx = tree.x + tree.sprite.canopy.x * tree.scale;
  const cy = tree.y + tree.sprite.canopy.y * tree.scale;
  const r = tree.sprite.canopy.r * tree.scale * 0.95;
  return dist(ant.x, ant.y, cx, cy) < r && ant.y < tree.y + 36;
}

function drawShadows() {
  const shadow = world.art.shadow;
  for (const d of world.decor) {
    if (!d.shadow) continue;
    if (!isVisible(d.x, d.y, d.shadow + 140)) continue;
    const r = d.kind === 'tree' ? d.shadow * 1.28 : d.shadow * 1.05;
    const ox = d.kind === 'tree' ? 22 * d.scale : 8;
    const oy = d.kind === 'tree' ? 20 * d.scale : 7;
    ctx.globalAlpha = d.kind === 'tree' ? 0.72 : 0.55;
    ctx.drawImage(shadow, d.x + ox - r, d.y + oy - r * 0.5, r * 2, r);
    ctx.globalAlpha = 1;
  }
}

function drawGroundEffects() {
  // Target marker.
  if (marker) {
    const fade = clamp(1 - marker.t / 1.15, 0, 1);
    const radius = 12 + marker.t * 22;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = marker.kind === 'resource' ? 'rgba(255,236,170,.85)' : 'rgba(245,239,210,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(marker.x, marker.y + 4, radius, radius * 0.55, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,244,205,.25)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(marker.x, marker.y + 4, radius * 1.35, radius * 0.72, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Highlight the node the scout is working on / standing near.
  const focus = ant.job?.node || nearestNode(ant.x, ant.y, 96);
  if (focus) {
    const pulse = 0.5 + Math.sin(time * 3.4) * 0.18;
    const g = ctx.createRadialGradient(focus.x, focus.y, 4, focus.x, focus.y, 58);
    g.addColorStop(0, `rgba(255,238,165,${0.12 + pulse * 0.12})`);
    g.addColorStop(0.65, `rgba(255,230,140,${0.05 + pulse * 0.05})`);
    g.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(focus.x, focus.y + 8, 62, 36, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = `rgba(255,240,180,${0.45 + pulse * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -time * 16;
    ctx.beginPath();
    ctx.ellipse(focus.x, focus.y + 6, 39, 23, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Ground particles (dust and ripples).
  for (const p of particles) {
    if (p.layer !== 'ground') continue;
    if (!isVisible(p.x, p.y, 30)) continue;
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    if (p.type === 'ripple') {
      ctx.strokeStyle = `rgba(205,240,225,${alpha * 0.5})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, 0, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${alpha * 0.7})`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + alpha * 0.5), 0, TAU);
      ctx.fill();
    }
  }
}

function drawResource(node) {
  if (!isVisible(node.x, node.y, 100)) return;
  const spr = node.sprite;
  const depleted = node.amount <= 0;
  const sway = Math.sin(time * 1.15 + node.sway) * 0.022;
  const scale = node.scale * (1 + node.pulse * 0.06);

  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.rotate(sway);
  ctx.scale(scale, scale);
  ctx.globalAlpha = depleted ? 0.3 : 1;
  ctx.drawImage(spr.canvas, -spr.w * spr.ax, -spr.h * spr.ay);
  ctx.restore();

  if (depleted) {
    const progress = 1 - clamp(node.regrow / node.regrowTime, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(190,220,140,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(node.x, node.y - 38, 8, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,240,180,.55)';
    ctx.beginPath();
    ctx.arc(node.x, node.y - 38, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (node.pulse > 0) {
    ctx.save();
    ctx.globalAlpha = node.pulse * 0.4;
    ctx.strokeStyle = '#fff3c2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(node.x, node.y - 18, 18 + (1 - node.pulse) * 20, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDecor(d) {
  let alpha = d.alpha ?? 1;
  if (d.kind === 'tree' && drawTreeUnderCanopy(d)) alpha = Math.min(alpha, 0.5);
  if (d.sway !== undefined) {
    drawSprite(ctx, d.sprite, d.x, d.y, d.scale, alpha, Math.sin(time * 1.05 + d.sway) * 0.024);
  } else {
    drawSprite(ctx, d.sprite, d.x, d.y, d.scale, alpha);
  }
}

function drawActors() {
  const items = [];
  for (const d of world.decor) {
    if (!isVisible(d.x, d.y, d.kind === 'tree' ? 420 : 90)) continue;
    items.push(d);
  }
  for (const r of world.resources) {
    if (isVisible(r.x, r.y, 80)) items.push(r);
  }
  world.nest.isNest = true;
  world.nest.sortY = world.nest.y + 74;
  items.push(world.nest);

  for (const a of world.ambientAnts) {
    if (isVisible(a.x, a.y, 40)) items.push(a);
  }
  items.push(ant);

  items.sort((a, b) => (a.sortY ?? a.y) - (b.sortY ?? b.y));

  for (const item of items) {
    if (item === ant) {
      drawAnt(ctx, ant, time, {
        player: true,
        scale: 1.2,
        cargo: state.cargo[state.cargo.length - 1] || null,
        moving: ant.moving,
        phase: ant.walkPhase,
        selected: true,
      });
    } else if (item.isNest) {
      drawNest(ctx, { x: world.nest.x, y: world.nest.y, stage: world.nest.stage }, world.nestLook, time);
    } else if (item.resource) {
      drawResource(item);
    } else if (item.ambient) {
      drawAnt(ctx, item, time, {
        player: false,
        scale: 0.62,
        cargo: null,
        moving: true,
        phase: item.phase,
        selected: false,
      });
    } else {
      drawDecor(item);
    }
  }

  // Butterflies float above everything in the meadow.
  for (const b of world.butterflies) {
    if (isVisible(b.x, b.y, 30)) drawButterfly(ctx, b, time);
  }
}

function drawAirParticles() {
  for (const p of particles) {
    if (p.layer !== 'air') continue;
    if (!isVisible(p.x, p.y, 40)) continue;
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = alpha;
    if (p.type === 'confetti') {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1);
    } else if (p.type === 'leafBit') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.5, p.size * 0.7, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPollen() {
  ctx.save();
  for (const p of pollen) {
    const x = p.x * viewW;
    const y = p.y * viewH;
    const twinkle = 0.25 + 0.2 * Math.sin(time * 0.9 + p.phase);
    ctx.fillStyle = `rgba(255,246,206,${twinkle * p.alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#24371f';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  world.drawTerrain(ctx, camera, viewW, viewH, camera.zoom);
  world.drawWater(ctx, time);
  world.drawBridges(ctx);
  drawGroundEffects();
  drawShadows();
  drawActors();
  drawAirParticles();

  ctx.restore();
  drawPollen();
}

function drawMinimap() {
  const w = minimap.width;
  const h = minimap.height;
  mmctx.clearRect(0, 0, w, h);
  mmctx.drawImage(world.minimapBase, 0, 0, w, h);
  const sx = w / world.width;
  const sy = h / world.height;

  for (const r of world.resources) {
    mmctx.globalAlpha = r.amount > 0 ? 0.9 : 0.25;
    mmctx.fillStyle = RESOURCE_DOT[r.type] || '#e0b85a';
    mmctx.beginPath();
    mmctx.arc(r.x * sx, r.y * sy, r.amount > 0 ? 2.2 : 1.4, 0, TAU);
    mmctx.fill();
  }
  mmctx.globalAlpha = 1;

  // Nest.
  mmctx.fillStyle = '#f4e2ae';
  mmctx.strokeStyle = 'rgba(60,44,24,.75)';
  mmctx.lineWidth = 1.5;
  mmctx.beginPath();
  mmctx.arc(world.nest.x * sx, world.nest.y * sy, 4.2, 0, TAU);
  mmctx.fill();
  mmctx.stroke();

  // Camera viewport.
  const vw = (viewW / camera.zoom) * sx;
  const vh = (viewH / camera.zoom) * sy;
  mmctx.strokeStyle = 'rgba(255,250,232,.45)';
  mmctx.lineWidth = 1.2;
  mmctx.strokeRect(camera.x * sx - vw / 2, camera.y * sy - vh / 2, vw, vh);

  // Scout.
  mmctx.save();
  mmctx.translate(ant.x * sx, ant.y * sy);
  mmctx.rotate(ant.angle);
  mmctx.fillStyle = '#fff8dc';
  mmctx.strokeStyle = 'rgba(45,35,20,.8)';
  mmctx.lineWidth = 1;
  mmctx.beginPath();
  mmctx.moveTo(5.5, 0);
  mmctx.lineTo(-3.5, -3.5);
  mmctx.lineTo(-1.5, 0);
  mmctx.lineTo(-3.5, 3.5);
  mmctx.closePath();
  mmctx.fill();
  mmctx.stroke();
  mmctx.restore();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  time += dt;

  updateAnt(dt);
  world.updateResources(dt);
  world.updateAmbient(dt, time);
  updateParticles(dt);
  updateCamera(dt);
  updatePollen(dt);
  updateMarker(dt);
  updateActionUI();

  render();
  drawMinimap();

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function buildPollen() {
  for (let i = 0; i < 34; i++) {
    pollen.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.008,
      vy: -0.002 - Math.random() * 0.006,
      phase: Math.random() * TAU,
      size: 0.7 + Math.random() * 1.7,
      alpha: 0.35 + Math.random() * 0.5,
    });
  }
}

function boot() {
  resize();
  const z = initialZoom();
  camera.zoom = z;
  camera.targetZoom = z;
  camera.x = ant.x;
  camera.y = ant.y;
  clampCamera();
  buildPollen();

  renderQuestList();
  renderModalQuests();
  updateStats();
  updateCargoUI(true);
  updateActionUI(true);
  updateSoundUI();
  updateQuestUI();

  if (!state.objectives.every((o) => o.done)) {
    setTimeout(() => intro.classList.add('show'), 900);
    setTimeout(() => intro.classList.remove('show'), 11500);
  }

  requestAnimationFrame(frame);
  setTimeout(() => saveState(true), 1200);
}

boot();

window.addEventListener('visibilitychange', () => {
  if (document.hidden) saveState(true);
});
window.addEventListener('pagehide', () => saveState(true));

// Expose a tiny debug surface for automated checks and curious players.
window.coloniaAurora = {
  state,
  ant,
  world,
  camera,
  gatherNode,
  depositAll,
  startJob,
  handleWorldTap,
  saveState,
};
