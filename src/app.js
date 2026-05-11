'use strict';

// DEV_START
const DEV_MODE    = true;
// DEV_END
const SHOT_ML     = 30;   // 3cl
const STORAGE_KEY = 'centurion_v1';

// Shot glass fill geometry (matches SVG clip polygon points="26,69 74,69 70,141 30,141")
const GLASS_BOTTOM_Y    = 141;
const GLASS_FILL_HEIGHT = 72; // 141 - 69
const FOAM_MAX_H        = 10;

// ── State ──────────────────────────────────────────────────────────────────

let state      = null;   // { numShooters, gameStartTime, status }
let rafId      = null;
let lastBellAt = 0;
let bellTimer  = null;
let wakeLock   = null;

// ── Persistence ────────────────────────────────────────────────────────────

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Audio ──────────────────────────────────────────────────────────────────

const bellAudio   = new Audio('media/ring.mp3');
const victoryAudio = new Audio('media/victory.mp3');
bellAudio.preload = victoryAudio.preload = 'auto';

function playBell() {
  try { bellAudio.currentTime = 0; bellAudio.play().catch(() => {}); } catch (_) {}
}

function playVictory() {
  try { victoryAudio.currentTime = 0; victoryAudio.play().catch(() => {}); } catch (_) {}
}

// ── Wake Lock ──────────────────────────────────────────────────────────────

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (_) {}
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// Re-acquire wake lock when tab regains focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state?.status === 'playing') {
    requestWakeLock();
  }
});

// ── Utils ──────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
}

function beerLiters(n) {
  return ((n * SHOT_ML) / 1000).toFixed(1);
}

function fmtDuration(minutes) {
  if (minutes <= 0) return '0min';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function elapsed() {
  return Math.max(0, Date.now() - state.gameStartTime);
}

// ── DOM Refs ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const pages = { intro: $('page-intro'), game: $('page-game'), end: $('page-end') };

function showPage(name) {
  Object.entries(pages).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

// ── Intro ──────────────────────────────────────────────────────────────────

const numInput   = $('num-shooters');
const beerLitersEl = $('beer-liters');
const beerCountEl  = $('beer-count');
const gameDurEl    = $('game-duration');

function refreshCalc() {
  const n = clamp(parseInt(numInput.value), 10, 1000);
  beerLitersEl.textContent = beerLiters(n);
  beerCountEl.textContent  = n;
  gameDurEl.textContent    = fmtDuration(n);
}

numInput.addEventListener('input', refreshCalc);

$('btn-minus').addEventListener('click', () => {
  const v = clamp(parseInt(numInput.value), 10, 1000);
  if (v > 1) { numInput.value = v - 1; refreshCalc(); }
});

$('btn-plus').addEventListener('click', () => {
  const v = clamp(parseInt(numInput.value), 10, 1000);
  if (v < 1000) { numInput.value = v + 1; refreshCalc(); }
});

$('btn-start').addEventListener('click', () => {
  const n = clamp(parseInt(numInput.value), 10, 1000);
  state = { status: 'playing', numShooters: n, gameStartTime: Date.now() };
  saveState();
  startGame();
});

// ── Game ───────────────────────────────────────────────────────────────────

const beerFillEl  = $('beer-fill');
const beerFoamEl  = $('beer-foam');
const timerSecs   = $('timer-secs');
const timerWrap   = $('timer-wrap');
const curShotEl   = $('cur-shot');
const shotsLeftEl = $('shots-left');
const totalShots  = $('total-shots');
const progressBar = $('progress-bar');
const progressPct = $('progress-pct');
const bellOverlay = $('bell-overlay');

function updateGlass(fraction) {
  const h = GLASS_FILL_HEIGHT * fraction;
  const y = GLASS_BOTTOM_Y - h;
  beerFillEl.setAttribute('y', y);
  beerFillEl.setAttribute('height', h);
  // Foam appears in last 15% of fill
  const foamF = Math.max(0, (fraction - 0.85) / 0.15);
  const foamH = FOAM_MAX_H * foamF;
  beerFoamEl.setAttribute('y', y - foamH);
  beerFoamEl.setAttribute('height', foamH + (h > 0 ? 1 : 0));
}

function startGame() {
  // Don't re-ring bells that already happened before this session
  lastBellAt = Math.floor(elapsed() / 60000);

  totalShots.textContent = state.numShooters;
  showPage('game');
  requestWakeLock();

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

function tick() {
  const ms        = elapsed();
  const total     = state.numShooters;
  const completed = Math.floor(ms / 60000);

  if (completed >= total) {
    endGame();
    return;
  }

  const currentShot   = completed + 1;
  const secInMin      = Math.floor((ms % 60000) / 1000);
  const secsLeft      = 60 - secInMin;
  const fracElapsed   = (ms % 60000) / 60000;
  const warn          = secsLeft <= 5;

  // Bell at each minute boundary
  if (completed > lastBellAt) {
    lastBellAt = completed;
    triggerBell();
  }

  // Update display
  timerSecs.textContent   = secsLeft;
  curShotEl.textContent   = currentShot;
  shotsLeftEl.textContent = total - currentShot;

  updateGlass(fracElapsed);
  timerWrap.classList.toggle('warn', warn);

  const pct = Math.round((completed / total) * 100);
  progressBar.style.width  = pct + '%';
  progressPct.textContent  = pct + '%';

  rafId = requestAnimationFrame(tick);
}

function triggerBell() {
  playBell();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);

  bellOverlay.classList.remove('hidden');
  clearTimeout(bellTimer);
  bellTimer = setTimeout(() => bellOverlay.classList.add('hidden'), 2500);
}

bellOverlay.addEventListener('click', () => {
  bellOverlay.classList.add('hidden');
  clearTimeout(bellTimer);
});

$('btn-abandon').addEventListener('click', () => {
  if (!confirm('Abandonner la partie ? Votre progression sera perdue.')) return;
  cancelAnimationFrame(rafId);
  releaseWakeLock();
  clearState();
  state = null;
  showPage('intro');
});

// DEV_START
if (DEV_MODE) {
  $('dev-toolbar').classList.remove('hidden');

  $('btn-dev-skip').addEventListener('click', () => {
    const completed = Math.floor(elapsed() / 60000);
    state.gameStartTime = Date.now() - ((completed + 1) * 60000 + 50);
    saveState();
  });

  $('btn-dev-end').addEventListener('click', () => {
    cancelAnimationFrame(rafId);
    endGame();
  });
}
// DEV_END

// ── End ────────────────────────────────────────────────────────────────────

function endGame() {
  cancelAnimationFrame(rafId);
  releaseWakeLock();

  const n = state.numShooters;
  $('stat-shots').textContent    = n;
  $('stat-liters').textContent   = beerLiters(n) + 'L';
  $('stat-duration').textContent = fmtDuration(n);

  state.status = 'ended';
  saveState();
  showPage('end');

  setTimeout(playVictory, 300);
}

$('btn-new-game').addEventListener('click', () => {
  clearState();
  state = null;
  showPage('intro');
});

// ── Init ───────────────────────────────────────────────────────────────────

refreshCalc();

const saved = loadState();
if (saved?.status === 'playing') {
  state = saved;
  const completed = Math.floor(Math.max(0, Date.now() - saved.gameStartTime) / 60000);
  if (completed >= saved.numShooters) {
    endGame();
  } else {
    numInput.value = saved.numShooters;
    refreshCalc();
    startGame();
  }
} else {
  showPage('intro');
}
