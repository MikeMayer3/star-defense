'use strict';
/* ======================================================================
   STAR DEFENSE — a neon tower defense game.
   50 waves · 5 sectors (maps) · 6 tower types · credits economy.
   No build step, no dependencies — one canvas game file.
   ====================================================================== */

const DEBUG = new URLSearchParams(location.search).has('debug');

/* ======================================================================
   CANVAS + LAYOUT
   The board is a COLS×ROWS grid. All game logic runs in "cell units"
   (positions, ranges, speeds are in cells); rendering converts to pixels
   so the game scales to any window size.
   ====================================================================== */
const bgCanvas = document.getElementById('bg');
const cv = document.getElementById('game');
const bgCtx = bgCanvas.getContext('2d');
const ctx = cv.getContext('2d');

const COLS = 16, ROWS = 10;
let W = 0, H = 0, dpr = 1;
let cell = 40, boardX = 0, boardY = 0;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  for (const c of [bgCanvas, cv]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const topbar = document.getElementById('topbar');
  const shop = document.getElementById('shop');
  const topH = (!topbar.classList.contains('hidden') && topbar.offsetHeight) || 58;
  const shopH = (!shop.classList.contains('hidden') && shop.offsetHeight) || 112;
  cell = Math.min((W - 12) / COLS, (H - topH - shopH - 10) / ROWS);
  boardX = (W - cell * COLS) / 2;
  boardY = topH + (H - topH - shopH - cell * ROWS) / 2;
}
window.addEventListener('resize', () => { resize(); initStars(); });

function px(cx) { return boardX + cx * cell; }
function py(cy) { return boardY + cy * cell; }

/* ======================================================================
   SOUND (synthesized, no external assets — same approach as Star Typer)
   ====================================================================== */
const Sound = (() => {
  let actx = null;
  let enabled = localStorage.getItem('stardefense_sfx') !== '0';
  let musicEnabled = localStorage.getItem('stardefense_music') !== '0';
  let musicHandle = null;
  let musicBus = null; // master gain for music — lets mute cut ALL scheduled notes instantly
  function ctxReady() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, sweep = 0) {
    if (!enabled) return;
    try {
      const ac = ctxReady();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + sweep), ac.currentTime + dur);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch (e) { /* ignore */ }
  }

  // Background music: looping synth patterns scheduled with absolute
  // AudioContext timestamps so they stay sample-accurate. Each track is a
  // 4-bar chord progression (Am–F–C–G family), 32 steps per loop, so it
  // takes far longer to repeat than a single bar.
  const MUSIC_TRACKS = {
    drift: {
      name: 'Drift', bpm: 96,
      bass: [
        110.00, 0, 0, 110.00, 0, 0, 164.81, 0,       // Am
        87.31, 0, 0, 87.31, 0, 0, 130.81, 0,          // F
        130.81, 0, 0, 130.81, 0, 0, 196.00, 0,        // C
        98.00, 0, 0, 98.00, 0, 0, 146.83, 0,          // G
      ],
      arp: [
        220.00, 261.63, 329.63, 440.00, 523.25, 440.00, 329.63, 261.63,
        174.61, 220.00, 261.63, 349.23, 440.00, 349.23, 261.63, 220.00,
        261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 196.00,
        196.00, 246.94, 293.66, 392.00, 493.88, 392.00, 293.66, 246.94,
      ],
      hat: null,
      bassType: 'triangle', arpType: 'sine',
    },
    pulse: {
      name: 'Pulse', bpm: 130,
      bass: [
        110.00, 110.00, 220.00, 110.00, 110.00, 220.00, 110.00, 164.81,   // Am
        87.31, 87.31, 174.61, 87.31, 87.31, 174.61, 87.31, 130.81,        // F
        130.81, 130.81, 261.63, 130.81, 130.81, 261.63, 130.81, 196.00,   // C
        98.00, 98.00, 196.00, 98.00, 98.00, 196.00, 98.00, 146.83,        // G
      ],
      arp: [
        440.00, 0, 523.25, 440.00, 659.25, 523.25, 440.00, 329.63,
        349.23, 0, 440.00, 349.23, 523.25, 440.00, 349.23, 261.63,
        523.25, 0, 659.25, 523.25, 783.99, 659.25, 523.25, 392.00,
        392.00, 0, 493.88, 392.00, 587.33, 493.88, 392.00, 293.66,
      ],
      hat: [
        1, 0, 1, 1, 1, 0, 1, 0,
        1, 0, 1, 1, 1, 0, 1, 0,
        1, 0, 1, 1, 1, 0, 1, 0,
        1, 1, 1, 0, 1, 1, 1, 1,
      ],
      bassType: 'sawtooth', arpType: 'square',
    },
    nova: {
      name: 'Nova', bpm: 138,
      bass: [
        87.31, 0, 87.31, 87.31, 0, 87.31, 0, 130.81,     // F
        98.00, 0, 98.00, 98.00, 0, 98.00, 0, 146.83,     // G
        110.00, 0, 110.00, 110.00, 0, 110.00, 0, 164.81, // Am
        130.81, 0, 130.81, 130.81, 0, 130.81, 0, 196.00, // C
      ],
      arp: [
        349.23, 440.00, 523.25, 440.00, 349.23, 523.25, 698.46, 523.25,
        392.00, 493.88, 587.33, 493.88, 392.00, 587.33, 783.99, 587.33,
        440.00, 523.25, 659.25, 523.25, 440.00, 659.25, 880.00, 659.25,
        523.25, 659.25, 783.99, 659.25, 523.25, 783.99, 659.25, 587.33,
      ],
      hat: [
        1, 1, 0, 1, 1, 1, 0, 1,
        1, 1, 0, 1, 1, 1, 0, 1,
        1, 1, 0, 1, 1, 1, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
      ],
      bassType: 'square', arpType: 'sawtooth',
    },
  };
  const MUSIC_TRACK_KEY = 'stardefense_musicTrack';
  let currentTrackId = MUSIC_TRACKS[localStorage.getItem(MUSIC_TRACK_KEY)] ? localStorage.getItem(MUSIC_TRACK_KEY) : 'drift';

  function musicNote(freq, time, dur, type, vol) {
    if (!musicBus) return;
    try {
      const ac = ctxReady();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(vol, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain).connect(musicBus);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    } catch (e) { /* ignore */ }
  }
  function musicHat(time, vol) {
    if (!musicBus) return;
    try {
      const ac = ctxReady();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = 5200;
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      osc.connect(gain).connect(musicBus);
      osc.start(time);
      osc.stop(time + 0.05);
    } catch (e) { /* ignore */ }
  }
  function scheduleMusicBar(startTime) {
    const track = MUSIC_TRACKS[currentTrackId];
    const beat = 60 / track.bpm;
    const steps = track.bass.length;
    for (let i = 0; i < steps; i++) {
      const t = startTime + i * beat;
      if (track.bass[i]) musicNote(track.bass[i], t, beat * 0.9, track.bassType, 0.05);
      if (track.arp[i]) musicNote(track.arp[i], t, beat * 0.5, track.arpType, 0.032);
      if (track.hat && track.hat[i]) musicHat(t, 0.02);
    }
    return beat * steps;
  }
  function startMusic() {
    if (!musicEnabled || musicHandle) return;
    const ac = ctxReady();
    musicBus = ac.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(ac.destination);
    let nextBarTime = ac.currentTime + 0.1; // always restarts from the top of the loop
    const tick = () => {
      const barDur = scheduleMusicBar(nextBarTime);
      nextBarTime += barDur;
      musicHandle = setTimeout(tick, barDur * 1000 - 60);
    };
    tick();
  }
  function stopMusic() {
    if (musicHandle) { clearTimeout(musicHandle); musicHandle = null; }
    // Cut everything already scheduled: fast-fade the music bus (avoids a
    // click), then disconnect it. Orphaned oscillators die off silently.
    if (musicBus && actx) {
      const bus = musicBus;
      musicBus = null;
      try {
        bus.gain.setTargetAtTime(0, actx.currentTime, 0.015);
        setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 200);
      } catch (e) { /* ignore */ }
    }
  }
  function setTrack(id) {
    if (!MUSIC_TRACKS[id] || id === currentTrackId) return;
    currentTrackId = id;
    try { localStorage.setItem(MUSIC_TRACK_KEY, id); } catch (e) { /* ignore */ }
    if (musicHandle) { stopMusic(); startMusic(); }
  }

  return {
    place: () => { tone(340, 0.07, 'square', 0.08); tone(520, 0.09, 'sine', 0.07); },
    invalid: () => tone(140, 0.12, 'square', 0.08),
    upgrade: () => { tone(520, 0.1, 'sine', 0.12); setTimeout(() => tone(780, 0.14, 'sine', 0.12), 90); },
    sell: () => { tone(880, 0.07, 'square', 0.08); setTimeout(() => tone(660, 0.1, 'square', 0.07), 60); },
    shotBlaster: () => tone(950, 0.06, 'sawtooth', 0.035, -450),
    shotGatling: () => tone(720, 0.03, 'square', 0.018),
    shotFrost: () => tone(1250, 0.09, 'sine', 0.04, -600),
    shotMortar: () => tone(150, 0.16, 'triangle', 0.09, -50),
    shotTesla: () => tone(1500, 0.1, 'sawtooth', 0.04, -1000),
    shotRail: () => tone(240, 0.18, 'sawtooth', 0.09, 500),
    explosion: () => tone(130, 0.2, 'triangle', 0.11, -70),
    bigExplosion: () => { tone(90, 0.4, 'triangle', 0.16, -50); tone(200, 0.25, 'sawtooth', 0.08, -120); },
    leak: () => tone(180, 0.3, 'square', 0.13, -120),
    waveClear: () => { tone(520, 0.12, 'sine', 0.13); setTimeout(() => tone(660, 0.12, 'sine', 0.13), 110); setTimeout(() => tone(880, 0.2, 'sine', 0.13), 220); },
    boss: () => tone(180, 0.5, 'sawtooth', 0.15, 50),
    gameOver: () => { tone(300, 0.3, 'sine', 0.14, -150); setTimeout(() => tone(150, 0.5, 'sine', 0.14, -100), 250); },
    victory: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sine', 0.14), i * 150)); },
    setEnabled(v) { enabled = v; try { localStorage.setItem('stardefense_sfx', v ? '1' : '0'); } catch (e) { /* ignore */ } },
    isEnabled: () => enabled,
    startMusic, stopMusic,
    setMusicEnabled(v) {
      musicEnabled = v;
      try { localStorage.setItem('stardefense_music', v ? '1' : '0'); } catch (e) { /* ignore */ }
      if (!v) stopMusic(); else startMusic();
    },
    isMusicEnabled: () => musicEnabled,
    setTrack,
    getTrack: () => currentTrackId,
  };
})();

/* ======================================================================
   STARFIELD BACKGROUND
   ====================================================================== */
let stars = [];
function initStars() {
  stars = [];
  const layers = [
    { count: 60, speed: 5, size: [0.6, 1.4], alpha: 0.5 },
    { count: 40, speed: 11, size: [1, 2], alpha: 0.75 },
    { count: 20, speed: 20, size: [1.5, 3], alpha: 1 },
  ];
  layers.forEach((layer) => {
    for (let i = 0; i < layer.count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: layer.size[0] + Math.random() * (layer.size[1] - layer.size[0]),
        speed: layer.speed,
        alpha: layer.alpha,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  });
}

function drawStarfield(dt) {
  bgCtx.clearRect(0, 0, W, H);
  const grad = bgCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050619');
  grad.addColorStop(0.5, '#080a2a');
  grad.addColorStop(1, '#0c0e33');
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, W, H);
  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
    s.twinkle += dt * 3;
    const tw = 0.6 + Math.sin(s.twinkle) * 0.4;
    bgCtx.globalAlpha = s.alpha * tw;
    bgCtx.fillStyle = '#dff3ff';
    bgCtx.beginPath();
    bgCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    bgCtx.fill();
  }
  bgCtx.globalAlpha = 1;
}

/* ======================================================================
   MAPS — one per sector (10 waves each). Waypoints are grid cells;
   enemies travel between cell centers. Off-board waypoints (-1 / 16)
   make ships fly in from and out past the board edge.
   ====================================================================== */
const MAPS = [
  { name: 'Corridor',   wp: [[-1, 2], [12, 2], [12, 5], [3, 5], [3, 8], [16, 8]] },
  { name: 'Serpent',    wp: [[-1, 5], [2, 5], [2, 1], [6, 1], [6, 8], [10, 8], [10, 1], [14, 1], [14, 5], [16, 5]] },
  { name: 'Switchback', wp: [[-1, 1], [14, 1], [14, 8], [1, 8], [1, 3], [11, 3], [11, 6], [16, 6]] },
  { name: 'Zigzag',     wp: [[-1, 8], [3, 8], [3, 2], [7, 2], [7, 7], [11, 7], [11, 2], [14, 2], [14, 8], [16, 8]] },
  { name: 'Gauntlet',   wp: [[-1, 1], [13, 1], [13, 3], [2, 3], [2, 5], [13, 5], [13, 7], [2, 7], [-1, 7]] },
];

// Precompute per-map: waypoint centers (cell units), segment lengths, path cell set.
for (const m of MAPS) {
  m.pts = m.wp.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }));
  m.segLen = [];
  m.totalLen = 0;
  m.cells = new Set();
  for (let i = 0; i < m.pts.length - 1; i++) {
    const a = m.pts[i], b = m.pts[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y); // axis-aligned
    m.segLen.push(len);
    m.totalLen += len;
    const [c0, r0] = m.wp[i], [c1, r1] = m.wp[i + 1];
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    let c = c0, r = r0;
    while (true) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) m.cells.add(c + ',' + r);
      if (c === c1 && r === r1) break;
      c += dc; r += dr;
    }
  }
}

// Position along a map's path at distance s (cell units).
function pathPoint(map, s) {
  s = Math.max(0, Math.min(s, map.totalLen));
  for (let i = 0; i < map.segLen.length; i++) {
    if (s <= map.segLen[i] || i === map.segLen.length - 1) {
      const a = map.pts[i], b = map.pts[i + 1];
      const t = map.segLen[i] === 0 ? 0 : s / map.segLen[i];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    s -= map.segLen[i];
  }
  const last = map.pts[map.pts.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

/* ======================================================================
   TOWER TYPES — 6 turrets, each with 3 levels (base + 2 upgrades).
   dmg = per shot · rate = shots/sec · range in cells.
   ====================================================================== */
const TOWER_TYPES = [
  {
    id: 'blaster', name: 'Pulse Blaster', icon: '🔫', color: '#4bf5ff', glow: 'rgba(75,245,255,0.45)',
    desc: 'reliable single-target', cost: 50, dmg: 13, rate: 1.6, range: 2.7, upCost: [40, 80],
  },
  {
    id: 'frost', name: 'Frost Emitter', icon: '❄️', color: '#9fd8ff', glow: 'rgba(159,216,255,0.45)',
    desc: 'slows ships it hits', cost: 75, dmg: 5, rate: 1.1, range: 2.5, upCost: [60, 115],
  },
  {
    id: 'gatling', name: 'Gatling Array', icon: '🌀', color: '#5dffb0', glow: 'rgba(93,255,176,0.45)',
    desc: 'shreds fast & light', cost: 110, dmg: 6, rate: 5.5, range: 2.4, upCost: [85, 165],
  },
  {
    id: 'mortar', name: 'Plasma Mortar', icon: '💥', color: '#ff4ecb', glow: 'rgba(255,78,203,0.45)',
    desc: 'splash damage lobs', cost: 160, dmg: 42, rate: 0.55, range: 3.7, upCost: [130, 250],
  },
  {
    id: 'tesla', name: 'Tesla Coil', icon: '⚡', color: '#b46dff', glow: 'rgba(180,109,255,0.45)',
    desc: 'chains between ships', cost: 220, dmg: 24, rate: 1.1, range: 2.7, upCost: [175, 340],
  },
  {
    id: 'rail', name: 'Rail Cannon', icon: '🎯', color: '#ffe74b', glow: 'rgba(255,231,75,0.45)',
    desc: 'pierces down the line', cost: 320, dmg: 95, rate: 0.45, range: 5.2, upCost: [255, 490],
  },
];

// Effective stats for a tower instance at its current level.
function towerStats(t) {
  const ty = TOWER_TYPES[t.type];
  const l = t.level - 1; // 0..2
  return {
    dmg: ty.dmg * Math.pow(1.8, l),
    rate: ty.rate * Math.pow(1.13, l),
    range: ty.range + 0.3 * l,
    // type specials scale with level too
    slowPct: 0.42 + 0.08 * l,     // frost
    slowDur: 1.6 + 0.35 * l,      // frost
    splash: 1.25 + 0.2 * l,       // mortar
    chains: 3 + l,                // tesla (extra jumps beyond first target)
    upCost: t.level < 3 ? ty.upCost[t.level - 1] : null,
  };
}

/* ======================================================================
   ENEMY TYPES
   ====================================================================== */
const ENEMY_TYPES = {
  scout:   { name: 'Scout',   hp: 22,   speed: 2.2, reward: 4,  leak: 1,  radius: 0.26, color: '#ffb84b', shape: 'dart' },
  raider:  { name: 'Raider',  hp: 60,   speed: 1.6, reward: 7,  leak: 1,  radius: 0.3,  color: '#ff4ecb', shape: 'dart' },
  brute:   { name: 'Brute',   hp: 170,  speed: 1.0, reward: 13, leak: 2,  radius: 0.36, color: '#ff5566', shape: 'hex' },
  swarm:   { name: 'Swarmer', hp: 10,   speed: 2.7, reward: 2,  leak: 1,  radius: 0.17, color: '#5dffb0', shape: 'tri' },
  shield:  { name: 'Warden',  hp: 95,   speed: 1.4, reward: 12, leak: 2,  radius: 0.32, color: '#4bf5ff', shape: 'dart', shield: 0.5 },
  boss:    { name: 'Dreadnought', hp: 1500, speed: 0.7, reward: 150, leak: 10, radius: 0.55, color: '#ff5566', shape: 'boss' },
};

// Difficulty scaling with wave number.
function hpMult(lvl) { return 1 + 0.22 * (lvl - 1) + 0.016 * (lvl - 1) * (lvl - 1); }
function speedMult(lvl) { return 1 + 0.006 * lvl; }
function rewardMult(lvl) { return 1 + 0.04 * lvl; }

/* Build the spawn list for a wave: [{type, t}] sorted by spawn time. */
function buildWave(lvl) {
  const list = [];
  let t = 0.5;
  const gap = Math.max(0.32, 1.05 - lvl * 0.014); // spawns tighten as waves go up
  const push = (type, extraGap = 0) => { list.push({ type, t }); t += gap + extraGap; };

  if (lvl % 10 === 0) {
    // Boss wave: escorts, then the Dreadnought, then a rear guard.
    const escorts = 4 + Math.floor(lvl / 5);
    for (let i = 0; i < escorts; i++) push(lvl >= 20 ? 'shield' : 'raider');
    t += 1.5;
    push('boss', 2);
    for (let i = 0; i < Math.floor(lvl / 4); i++) push(lvl >= 30 ? 'brute' : 'scout');
    return list;
  }

  const count = Math.min(12 + Math.floor(lvl * 1.7), 68);
  for (let i = 0; i < count; i++) {
    let type = 'scout';
    const roll = Math.random();
    if (lvl >= 14 && roll < 0.16) type = 'shield';
    else if (lvl >= 6 && roll < 0.34) type = 'brute';
    else if (lvl >= 3 && roll < 0.62) type = 'raider';
    if (lvl >= 9 && i % 9 === 0) {
      // swarm burst — a tight pack of swarmers
      for (let k = 0; k < 6; k++) { list.push({ type: 'swarm', t }); t += 0.14; }
      t += gap;
      continue;
    }
    push(type);
  }
  return list;
}

/* ======================================================================
   GAME STATE
   ====================================================================== */
const CHECKPOINTS = [
  { wave: 1, money: 220 },
  { wave: 11, money: 1500 },
  { wave: 21, money: 3400 },
  { wave: 31, money: 6400 },
  { wave: 41, money: 10200 },
];
const KEY_BEST = 'stardefense_bestWave';
const KEY_SCORE = 'stardefense_hiScore';

const state = {
  mode: 'menu',        // menu | playing | paused | over
  phase: 'build',      // build | wave
  level: 1,
  money: 220,
  lives: 20,
  score: 0,
  kills: 0,
  earned: 0,
  speed: 1,
  auto: false,
  autoTimer: 0,
  waveTime: 0,
  bestWave: parseInt(localStorage.getItem(KEY_BEST) || '0', 10),
  hiScore: parseInt(localStorage.getItem(KEY_SCORE) || '0', 10),
  checkpoint: 1,
  placing: null,       // tower type index being placed, or null
  selected: null,      // built tower selected for upgrade/sell
  hover: null,         // {col,row} under the pointer
  flash: 0,            // red screen flash on leak
};

let towers = [];          // built towers
let grid = {};            // "c,r" -> tower
let enemies = [];
let bolts = [];           // homing projectiles
let shells = [];          // mortar arcs
let fx = [];              // beams / chains / rings
let parts = [];           // particles
let floats = [];          // floating texts
let spawnQueue = [];

function currentMap() { return MAPS[Math.min(4, Math.floor((state.level - 1) / 10))]; }

/* ======================================================================
   DOM REFS
   ====================================================================== */
const $ = (id) => document.getElementById(id);
const menuEl = $('menu'), topbarEl = $('topbar'), shopEl = $('shop'),
  bannerEl = $('banner'), pauseEl = $('pauseOverlay'), overEl = $('gameOver'),
  towerCardsEl = $('towerCards'), upPanelEl = $('upgradePanel');

/* ======================================================================
   ENTITY HELPERS
   ====================================================================== */
function spawnEnemy(type) {
  const def = ENEMY_TYPES[type];
  const lvl = state.level;
  const hp = def.hp * hpMult(lvl);
  const e = {
    type, def,
    s: 0,
    hp, maxHp: hp,
    speed: def.speed * speedMult(lvl),
    reward: Math.ceil(def.reward * rewardMult(lvl)),
    slowUntil: 0, slowPct: 0,
    shield: def.shield ? hp * def.shield : 0,
    shieldMax: def.shield ? hp * def.shield : 0,
    lastHit: -99,
    x: 0, y: 0, angle: 0,
    wob: Math.random() * Math.PI * 2,
    dead: false,
    enraged: false,
  };
  const p = pathPoint(currentMap(), 0);
  e.x = p.x; e.y = p.y; e.angle = p.angle;
  enemies.push(e);
  if (type === 'boss') { Sound.boss(); showBanner('⚠ DREADNOUGHT INBOUND ⚠', ENEMY_TYPES.boss.name); }
}

function damageEnemy(e, dmg, color) {
  if (e.dead) return;
  e.lastHit = state.waveTime;
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, dmg);
    e.shield -= absorbed;
    dmg -= absorbed;
  }
  e.hp -= dmg;
  if (e.type === 'boss' && !e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    e.speed *= 1.6;
    showBanner('DREADNOUGHT ENRAGED!', 'it\'s speeding up');
  }
  if (e.hp <= 0) {
    e.dead = true;
    state.money += e.reward;
    state.earned += e.reward;
    state.score += e.reward * 10;
    state.kills++;
    addFloat(e.x, e.y, '+$' + e.reward, '#ffe74b');
    burst(e.x, e.y, e.def.color, e.type === 'boss' ? 40 : 10, e.type === 'boss' ? 2.2 : 1);
    if (e.type === 'boss') Sound.bigExplosion(); else Sound.explosion();
  }
}

function addFloat(x, y, txt, color) {
  floats.push({ x, y, txt, color, life: 1 });
}

function burst(x, y, color, n, scale = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.8 + Math.random() * 2.4) * scale;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color, size: (0.04 + Math.random() * 0.06) * scale });
  }
}

/* ======================================================================
   TOWER FIRING
   ====================================================================== */
function fireTower(t, st, target) {
  const ty = TOWER_TYPES[t.type];
  switch (ty.id) {
    case 'blaster':
      bolts.push({ x: t.x, y: t.y, target, speed: 11, dmg: st.dmg, color: ty.color, r: 0.09 });
      Sound.shotBlaster();
      break;
    case 'gatling':
      bolts.push({ x: t.x, y: t.y, target, speed: 14, dmg: st.dmg, color: ty.color, r: 0.06 });
      Sound.shotGatling();
      break;
    case 'frost':
      bolts.push({ x: t.x, y: t.y, target, speed: 10, dmg: st.dmg, color: ty.color, r: 0.09, slowPct: st.slowPct, slowDur: st.slowDur });
      Sound.shotFrost();
      break;
    case 'mortar': {
      // Lead the target: aim where it will be when the shell lands.
      const flight = 0.5;
      const lead = pathPoint(currentMap(), target.s + target.speed * effSlow(target) * flight);
      shells.push({ sx: t.x, sy: t.y, tx: lead.x, ty: lead.y, t: 0, dur: flight, dmg: st.dmg, splash: st.splash, color: ty.color });
      Sound.shotMortar();
      break;
    }
    case 'tesla': {
      // Chain lightning: hit target, then jump to nearest unhit enemies.
      const hitPts = [{ x: t.x, y: t.y }];
      const hitSet = new Set();
      let cur = target, dmg = st.dmg;
      for (let i = 0; i <= st.chains && cur; i++) {
        hitPts.push({ x: cur.x, y: cur.y });
        hitSet.add(cur);
        damageEnemy(cur, dmg, ty.color);
        dmg *= 0.72;
        let next = null, bd = 2.3;
        for (const e of enemies) {
          if (e.dead || hitSet.has(e)) continue;
          const d = Math.hypot(e.x - cur.x, e.y - cur.y);
          if (d < bd) { bd = d; next = e; }
        }
        cur = next;
      }
      fx.push({ kind: 'chain', pts: hitPts, life: 0.16, color: ty.color });
      Sound.shotTesla();
      break;
    }
    case 'rail': {
      // Instant piercing beam through the target out to max range.
      const dx = target.x - t.x, dy = target.y - t.y;
      const len = Math.hypot(dx, dy) || 0.001;
      const ux = dx / len, uy = dy / len;
      const ex = t.x + ux * st.range, ey = t.y + uy * st.range;
      for (const e of enemies) {
        if (e.dead) continue;
        const px_ = e.x - t.x, py_ = e.y - t.y;
        const proj = px_ * ux + py_ * uy;
        if (proj < 0 || proj > st.range) continue;
        const perp = Math.abs(px_ * uy - py_ * ux);
        if (perp < 0.35 + e.def.radius) damageEnemy(e, st.dmg, ty.color);
      }
      fx.push({ kind: 'beam', x1: t.x, y1: t.y, x2: ex, y2: ey, life: 0.14, color: ty.color });
      Sound.shotRail();
      break;
    }
  }
}

function effSlow(e) { return state.waveTime < e.slowUntil ? 1 - e.slowPct : 1; }

/* ======================================================================
   WAVE FLOW
   ====================================================================== */
function startWave() {
  if (state.phase !== 'build' || state.mode !== 'playing') return;
  state.phase = 'wave';
  state.waveTime = 0;
  spawnQueue = buildWave(state.level);
  const sector = Math.floor((state.level - 1) / 10) + 1;
  showBanner('WAVE ' + state.level, 'SECTOR ' + sector + ' — ' + currentMap().name.toUpperCase());
  updateHUD();
}

function waveComplete() {
  const bonus = 70 + state.level * 12;
  state.money += bonus;
  state.earned += bonus;
  state.score += bonus * 5;
  Sound.waveClear();
  addFloat(COLS / 2, ROWS / 2, 'WAVE BONUS +$' + bonus, '#5dffb0');

  if (state.level > state.bestWave) {
    state.bestWave = state.level;
    try { localStorage.setItem(KEY_BEST, String(state.bestWave)); } catch (e) { /* ignore */ }
  }

  if (state.level >= 50) { endGame(true); return; }

  state.level++;
  state.phase = 'build';

  if ((state.level - 1) % 10 === 0) {
    // New sector: recall all turrets for a full refund, switch maps.
    let refund = 0;
    for (const t of towers) refund += t.invested;
    state.money += refund;
    towers = [];
    grid = {};
    state.selected = null;
    closeUpgradePanel();
    showBanner('SECTOR ' + Math.floor((state.level - 1) / 10) + ' CLEAR!', 'turrets recalled +$' + refund + ' — new map: ' + currentMap().name.toUpperCase());
  } else {
    showBanner('WAVE ' + (state.level - 1) + ' CLEAR', '+$' + bonus + ' bonus');
  }

  if (state.auto) state.autoTimer = 2.4;
  updateHUD();
}

function endGame(victory) {
  state.mode = 'over';
  state.phase = 'build';
  Sound.stopMusic();
  if (victory) Sound.victory(); else Sound.gameOver();

  const title = $('endTitle');
  title.textContent = victory ? '🏆 GALAXY SAVED!' : 'LINE BREACHED';
  title.className = 'title ' + (victory ? 'victory-title' : 'gameover-title');
  $('finalWave').textContent = victory ? '50 / 50' : state.level + ' / 50';
  $('finalScore').textContent = state.score.toLocaleString();
  $('finalKills').textContent = state.kills.toLocaleString();
  $('finalEarned').textContent = '$' + state.earned.toLocaleString();

  let record = false;
  if (state.score > state.hiScore) {
    state.hiScore = state.score;
    record = true;
    try { localStorage.setItem(KEY_SCORE, String(state.hiScore)); } catch (e) { /* ignore */ }
  }
  $('newRecord').classList.toggle('hidden', !record);

  topbarEl.classList.add('hidden');
  shopEl.classList.add('hidden');
  overEl.classList.remove('hidden');
}

function leak(e) {
  e.dead = true;
  state.lives -= e.def.leak;
  state.flash = 0.5;
  Sound.leak();
  if (state.lives <= 0) { state.lives = 0; updateHUD(); endGame(false); return; }
  updateHUD();
}

/* ======================================================================
   BANNER
   ====================================================================== */
let bannerTimeout = null;
function showBanner(main, sub) {
  bannerEl.innerHTML = '';
  bannerEl.appendChild(document.createTextNode(main));
  if (sub) {
    const s = document.createElement('span');
    s.className = 'banner-sub';
    s.textContent = sub;
    bannerEl.appendChild(s);
  }
  bannerEl.classList.remove('hidden');
  // restart CSS animation
  bannerEl.style.animation = 'none';
  void bannerEl.offsetWidth;
  bannerEl.style.animation = '';
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => bannerEl.classList.add('hidden'), 1650);
}

/* ======================================================================
   SHOP / UPGRADE UI
   ====================================================================== */
function buildShopCards() {
  towerCardsEl.innerHTML = '';
  TOWER_TYPES.forEach((ty, i) => {
    const card = document.createElement('div');
    card.className = 'tower-card';
    card.style.setProperty('--tc', ty.color);
    card.style.setProperty('--tc-glow', ty.glow);
    card.dataset.index = i;
    card.innerHTML =
      '<div class="tw-icon">' + ty.icon + '</div>' +
      '<div class="tw-name">' + ty.name + '</div>' +
      '<div class="tw-cost">$' + ty.cost + '</div>' +
      '<div class="tw-desc">' + ty.desc + '</div>';
    card.addEventListener('click', () => {
      closeUpgradePanel();
      if (state.placing === i) { setPlacing(null); return; }
      if (state.money < ty.cost) { Sound.invalid(); return; }
      setPlacing(i);
    });
    towerCardsEl.appendChild(card);
  });
}

function setPlacing(i) {
  state.placing = i;
  state.selected = null;
  [...towerCardsEl.children].forEach((c, k) => c.classList.toggle('selected', k === i));
}

function refreshShopAfford() {
  [...towerCardsEl.children].forEach((c, k) => {
    c.classList.toggle('broke', state.money < TOWER_TYPES[k].cost);
  });
}

function openUpgradePanel(t) {
  setPlacing(null); // must come first — it clears state.selected
  state.selected = t;
  const ty = TOWER_TYPES[t.type];
  const st = towerStats(t);
  $('upName').textContent = ty.icon + ' ' + ty.name + ' — LVL ' + t.level;
  $('upStats').textContent =
    'DMG ' + Math.round(st.dmg) + ' · RATE ' + st.rate.toFixed(1) + '/s · RNG ' + st.range.toFixed(1);
  const upBtn = $('upgradeBtn');
  if (st.upCost != null) {
    upBtn.textContent = '⬆ UPGRADE $' + st.upCost;
    upBtn.disabled = state.money < st.upCost;
    upBtn.style.display = '';
  } else {
    upBtn.style.display = 'none';
  }
  $('sellBtn').textContent = '💰 SELL $' + sellValue(t);
  towerCardsEl.style.display = 'none';
  upPanelEl.classList.remove('hidden');
}

function closeUpgradePanel() {
  state.selected = null;
  towerCardsEl.style.display = '';
  upPanelEl.classList.add('hidden');
}

function sellValue(t) { return Math.floor(t.invested * 0.7); }

$('upgradeBtn').addEventListener('click', () => {
  const t = state.selected;
  if (!t) return;
  const st = towerStats(t);
  if (st.upCost == null || state.money < st.upCost) { Sound.invalid(); return; }
  state.money -= st.upCost;
  t.invested += st.upCost;
  t.level++;
  Sound.upgrade();
  burst(t.x, t.y, TOWER_TYPES[t.type].color, 14, 1.2);
  openUpgradePanel(t); // refresh numbers
  updateHUD();
});

$('sellBtn').addEventListener('click', () => {
  const t = state.selected;
  if (!t) return;
  state.money += sellValue(t);
  addFloat(t.x, t.y, '+$' + sellValue(t), '#ffe74b');
  towers = towers.filter((x) => x !== t);
  delete grid[t.col + ',' + t.row];
  Sound.sell();
  closeUpgradePanel();
  updateHUD();
});

$('closeUpBtn').addEventListener('click', closeUpgradePanel);

/* ======================================================================
   PLACEMENT + POINTER INPUT
   ====================================================================== */
function cellFromEvent(ev) {
  const col = Math.floor((ev.clientX - boardX) / cell);
  const row = Math.floor((ev.clientY - boardY) / cell);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}

function canBuildAt(col, row) {
  const key = col + ',' + row;
  return !currentMap().cells.has(key) && !grid[key];
}

cv.addEventListener('pointermove', (ev) => {
  state.hover = cellFromEvent(ev);
});

cv.addEventListener('click', (ev) => {
  if (state.mode !== 'playing') return;
  const c = cellFromEvent(ev);
  if (!c) { setPlacing(null); closeUpgradePanel(); return; }
  const key = c.col + ',' + c.row;

  // Clicking a built tower always opens its upgrade panel, even while a
  // shop card is still armed — otherwise you can't upgrade after placing.
  if (grid[key]) { openUpgradePanel(grid[key]); return; }

  if (state.placing != null) {
    const ty = TOWER_TYPES[state.placing];
    if (!canBuildAt(c.col, c.row) || state.money < ty.cost) { Sound.invalid(); return; }
    const t = {
      type: state.placing,
      col: c.col, row: c.row,
      x: c.col + 0.5, y: c.row + 0.5,
      level: 1, invested: ty.cost,
      cool: 0, angle: -Math.PI / 2, target: null,
    };
    towers.push(t);
    grid[key] = t;
    state.money -= ty.cost;
    Sound.place();
    burst(t.x, t.y, ty.color, 10);
    if (state.money < ty.cost) setPlacing(null); // can't afford another
    updateHUD();
    return;
  }

  closeUpgradePanel();
});

cv.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  setPlacing(null);
  closeUpgradePanel();
});

window.addEventListener('keydown', (ev) => {
  if (state.mode === 'playing' || state.mode === 'paused') {
    if (ev.key === 'Escape') {
      if (state.placing != null || state.selected) { setPlacing(null); closeUpgradePanel(); }
      else togglePause();
      return;
    }
  }
  if (state.mode !== 'playing') return;
  if (ev.key === ' ') { ev.preventDefault(); startWave(); }
  const n = parseInt(ev.key, 10);
  if (n >= 1 && n <= 6) {
    closeUpgradePanel();
    if (state.money >= TOWER_TYPES[n - 1].cost) setPlacing(n - 1); else Sound.invalid();
  }
  if (DEBUG) {
    if (ev.key === 'm') { state.money += 5000; updateHUD(); }
    if (ev.key === 'k') { for (const e of enemies) damageEnemy(e, 1e9); }
    if (ev.key === 'j' && state.phase === 'build') { state.level = Math.min(50, state.level + 9); updateHUD(); }
  }
});

/* ======================================================================
   HUD
   ====================================================================== */
function updateHUD() {
  $('moneyVal').textContent = '$' + Math.floor(state.money).toLocaleString();
  $('livesVal').textContent = state.lives;
  $('waveVal').textContent = state.level + ' / 50';
  $('scoreVal').textContent = state.score.toLocaleString();
  document.querySelector('.lives-block').classList.toggle('danger', state.lives <= 5);
  const wb = $('waveBtn');
  wb.classList.toggle('running', state.phase === 'wave');
  wb.textContent = state.phase === 'wave' ? '⚔ WAVE ' + state.level : '▶ START WAVE ' + state.level;
  refreshShopAfford();
  if (state.selected) {
    // keep upgrade button affordability fresh
    const st = towerStats(state.selected);
    if (st.upCost != null) $('upgradeBtn').disabled = state.money < st.upCost;
  }
}

/* ======================================================================
   MENU / FLOW
   ====================================================================== */
function buildCheckpointCards() {
  const wrap = $('checkpointSelect');
  wrap.innerHTML = '';
  CHECKPOINTS.forEach((cp) => {
    const unlocked = cp.wave === 1 || state.bestWave >= cp.wave - 1;
    const card = document.createElement('div');
    card.className = 'cp-card' + (unlocked ? '' : ' locked') + (state.checkpoint === cp.wave && unlocked ? ' selected' : '');
    card.innerHTML =
      '<div class="cp-icon">' + (unlocked ? '🛰️' : '🔒') + '</div>' +
      '<div class="cp-name">WAVE ' + cp.wave + '</div>' +
      '<div class="cp-desc">' + (unlocked ? '$' + cp.money + ' start' : 'clear wave ' + (cp.wave - 1)) + '</div>';
    if (unlocked) {
      card.addEventListener('click', () => {
        state.checkpoint = cp.wave;
        buildCheckpointCards();
      });
    }
    wrap.appendChild(card);
  });
  $('bestStats').textContent =
    'Best Wave: ' + state.bestWave + '  •  High Score: ' + state.hiScore.toLocaleString();
}

function startGame(fromWave) {
  const cp = CHECKPOINTS.find((c) => c.wave === fromWave) || CHECKPOINTS[0];
  state.mode = 'playing';
  state.phase = 'build';
  state.level = cp.wave;
  state.money = DEBUG ? 999999 : cp.money;
  state.lives = 20;
  state.score = 0;
  state.kills = 0;
  state.earned = 0;
  state.autoTimer = 0;
  state.placing = null;
  state.selected = null;
  towers = []; grid = {};
  enemies = []; bolts = []; shells = []; fx = []; parts = []; floats = [];
  spawnQueue = [];

  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  topbarEl.classList.remove('hidden');
  shopEl.classList.remove('hidden');
  closeUpgradePanel();
  resize();
  Sound.startMusic();
  updateHUD();
  showBanner('SECTOR ' + (Math.floor((cp.wave - 1) / 10) + 1) + ' — ' + currentMap().name.toUpperCase(), 'build turrets, then start the wave');
}

function goToMenu() {
  state.mode = 'menu';
  Sound.stopMusic();
  menuEl.classList.remove('hidden');
  overEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  topbarEl.classList.add('hidden');
  shopEl.classList.add('hidden');
  buildCheckpointCards();
  resize();
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    pauseEl.classList.remove('hidden');
    Sound.stopMusic();
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    pauseEl.classList.add('hidden');
    Sound.startMusic();
  }
}

$('startBtn').addEventListener('click', () => startGame(state.checkpoint));
$('retryBtn').addEventListener('click', () => {
  // retry from the highest unlocked checkpoint at or below the wave reached
  let cp = 1;
  for (const c of CHECKPOINTS) {
    if (c.wave <= state.level && (c.wave === 1 || state.bestWave >= c.wave - 1)) cp = c.wave;
  }
  startGame(cp);
});
$('menuBtn').addEventListener('click', goToMenu);
$('resumeBtn').addEventListener('click', togglePause);
$('quitBtn').addEventListener('click', goToMenu);
$('pauseBtn').addEventListener('click', togglePause);
$('waveBtn').addEventListener('click', startWave);

$('speedBtn').addEventListener('click', () => {
  state.speed = state.speed >= 3 ? 1 : state.speed + 1;
  $('speedBtn').textContent = state.speed + '×';
  $('speedBtn').classList.toggle('on', state.speed > 1);
});

$('autoBtn').addEventListener('click', () => {
  state.auto = !state.auto;
  $('autoBtn').textContent = 'AUTO: ' + (state.auto ? 'ON' : 'OFF');
  $('autoBtn').classList.toggle('on', state.auto);
});

// Sound/music toggles exist in two places (menu + in-game HUD); keep all
// four buttons showing the same state.
function refreshAudioButtons() {
  const s = Sound.isEnabled(), m = Sound.isMusicEnabled();
  $('muteBtn').textContent = s ? '🔊 Sound On' : '🔇 Sound Off';
  $('musicBtn').textContent = m ? '🎵 Music On' : '🎵 Music Off';
  $('sfxBtnGame').textContent = s ? '🔊' : '🔇';
  $('sfxBtnGame').classList.toggle('off', !s);
  $('musicBtnGame').classList.toggle('off', !m);
}
function toggleSfx() { Sound.setEnabled(!Sound.isEnabled()); refreshAudioButtons(); }
function toggleMusic() { Sound.setMusicEnabled(!Sound.isMusicEnabled()); refreshAudioButtons(); }
$('muteBtn').addEventListener('click', toggleSfx);
$('musicBtn').addEventListener('click', toggleMusic);
$('sfxBtnGame').addEventListener('click', toggleSfx);
$('musicBtnGame').addEventListener('click', toggleMusic);
refreshAudioButtons();

const trackSelectEl = $('trackSelect');
function refreshTrackButtons() {
  [...trackSelectEl.children].forEach((b) => b.classList.toggle('selected', b.dataset.track === Sound.getTrack()));
}
trackSelectEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-track]');
  if (!btn) return;
  Sound.setTrack(btn.dataset.track);
  refreshTrackButtons();
});
refreshTrackButtons();

/* ======================================================================
   UPDATE
   ====================================================================== */
function update(dt) {
  if (state.mode !== 'playing') return;
  state.flash = Math.max(0, state.flash - dt * 1.5);

  // Refresh the HUD a few times a second so credits tick up live during a
  // wave and the upgrade button's affordability stays current.
  state.hudTimer = (state.hudTimer || 0) - dt;
  if (state.hudTimer <= 0) { state.hudTimer = 0.25; updateHUD(); }

  if (state.phase === 'build' && state.auto && state.autoTimer > 0) {
    state.autoTimer -= dt;
    if (state.autoTimer <= 0) startWave();
  }
  if (state.phase !== 'wave') {
    updateParticlesOnly(dt);
    return;
  }

  state.waveTime += dt;

  // spawn
  while (spawnQueue.length && spawnQueue[0].t <= state.waveTime) {
    spawnEnemy(spawnQueue.shift().type);
  }

  const map = currentMap();

  // enemies
  for (const e of enemies) {
    if (e.dead) continue;
    e.s += e.speed * effSlow(e) * dt;
    if (e.s >= map.totalLen) { leak(e); continue; }
    const p = pathPoint(map, e.s);
    e.wob += dt * 6;
    e.x = p.x; e.y = p.y; e.angle = p.angle;
    // shield regen: 8%/s after 1.5s without being hit
    if (e.shieldMax > 0 && e.shield < e.shieldMax && state.waveTime - e.lastHit > 1.5) {
      e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.08 * dt);
    }
  }
  enemies = enemies.filter((e) => !e.dead);

  // towers
  for (const t of towers) {
    t.cool -= dt;
    const st = towerStats(t);
    let best = null, bestS = -1;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d <= st.range && e.s > bestS) { best = e; bestS = e.s; }
    }
    t.target = best;
    if (best) {
      t.angle = Math.atan2(best.y - t.y, best.x - t.x);
      if (t.cool <= 0) { fireTower(t, st, best); t.cool = 1 / st.rate; }
    }
  }

  // bolts (homing)
  for (const b of bolts) {
    if (b.hit) continue;
    const tg = b.target;
    if (!tg || tg.dead) { b.hit = true; continue; } // fizzle if target died
    const dx = tg.x - b.x, dy = tg.y - b.y;
    const d = Math.hypot(dx, dy);
    const step = b.speed * dt;
    if (d <= step + tg.def.radius) {
      damageEnemy(tg, b.dmg, b.color);
      if (b.slowPct && !tg.dead) {
        tg.slowPct = Math.max(tg.slowPct * (state.waveTime < tg.slowUntil ? 1 : 0), b.slowPct);
        tg.slowUntil = state.waveTime + b.slowDur;
      }
      b.hit = true;
    } else {
      b.x += (dx / d) * step;
      b.y += (dy / d) * step;
    }
  }
  bolts = bolts.filter((b) => !b.hit);

  // mortar shells
  for (const sh of shells) {
    sh.t += dt;
    if (sh.t >= sh.dur) {
      sh.done = true;
      fx.push({ kind: 'ring', x: sh.tx, y: sh.ty, life: 0.3, maxLife: 0.3, r: sh.splash, color: sh.color });
      burst(sh.tx, sh.ty, sh.color, 12, 1.3);
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - sh.tx, e.y - sh.ty);
        if (d <= sh.splash + e.def.radius) damageEnemy(e, sh.dmg, sh.color);
      }
    }
  }
  shells = shells.filter((s) => !s.done);

  updateParticlesOnly(dt);

  // wave end?
  if (spawnQueue.length === 0 && enemies.length === 0 && state.mode === 'playing') {
    waveComplete();
  }
}

function updateParticlesOnly(dt) {
  for (const p of parts) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= dt;
  }
  parts = parts.filter((p) => p.life > 0);
  for (const f of floats) { f.y -= dt * 0.7; f.life -= dt * 1.1; }
  floats = floats.filter((f) => f.life > 0);
  for (const e of fx) e.life -= dt;
  fx = fx.filter((e) => e.life > 0);
}

/* ======================================================================
   RENDER
   ====================================================================== */
function drawPath(map) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(px(map.pts[0].x), py(map.pts[0].y));
    for (let i = 1; i < map.pts.length; i++) ctx.lineTo(px(map.pts[i].x), py(map.pts[i].y));
  };
  // outer glow edge
  path();
  ctx.strokeStyle = 'rgba(75, 245, 255, 0.28)';
  ctx.lineWidth = cell * 0.92;
  ctx.shadowColor = 'rgba(75,245,255,0.5)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // dark lane
  path();
  ctx.strokeStyle = 'rgba(8, 14, 44, 0.92)';
  ctx.lineWidth = cell * 0.8;
  ctx.stroke();
  // marching direction dashes
  path();
  ctx.strokeStyle = 'rgba(75, 245, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([cell * 0.28, cell * 0.5]);
  ctx.lineDashOffset = -performance.now() / 24;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBase(map) {
  const p = pathPoint(map, map.totalLen - 0.9);
  const t = performance.now() / 1000;
  const r = cell * (0.55 + Math.sin(t * 2.4) * 0.05);
  const x = px(p.x), y = py(p.y);
  ctx.save();
  // pulsing shield rings — the mothership you're defending
  for (let i = 3; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(x, y, r * (0.5 + i * 0.28), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(93, 255, 176, ' + (0.38 - i * 0.09) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.shadowColor = '#5dffb0';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#0d2b22';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5dffb0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r * 0.18, r * 0.3, Math.PI, 0);
  ctx.fillStyle = 'rgba(93,255,176,0.5)';
  ctx.fill();
  ctx.restore();
}

function drawPortal(map) {
  const p = pathPoint(map, 0.6);
  const t = performance.now() / 1000;
  const x = px(p.x), y = py(p.y);
  ctx.save();
  ctx.shadowColor = '#ff4ecb';
  ctx.shadowBlur = 16;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(x, y, cell * (0.32 + i * 0.14 + Math.sin(t * 3 + i) * 0.04), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 78, 203, ' + (0.7 - i * 0.3) + ')';
    ctx.lineWidth = 3 - i;
    ctx.stroke();
  }
  ctx.restore();
}

function drawGridOverlay() {
  // faint build grid + hover highlight while placing
  ctx.strokeStyle = 'rgba(120, 160, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(px(c), py(0)); ctx.lineTo(px(c), py(ROWS)); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(px(0), py(r)); ctx.lineTo(px(COLS), py(r)); ctx.stroke();
  }
  if (state.hover) {
    const { col, row } = state.hover;
    const ok = canBuildAt(col, row) && state.money >= TOWER_TYPES[state.placing].cost;
    const ty = TOWER_TYPES[state.placing];
    ctx.fillStyle = ok ? 'rgba(93, 255, 176, 0.18)' : 'rgba(255, 85, 102, 0.2)';
    ctx.fillRect(px(col), py(row), cell, cell);
    // range preview
    ctx.beginPath();
    ctx.arc(px(col + 0.5), py(row + 0.5), ty.range * cell, 0, Math.PI * 2);
    ctx.strokeStyle = ok ? 'rgba(93,255,176,0.5)' : 'rgba(255,85,102,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ok ? 'rgba(93,255,176,0.06)' : 'rgba(255,85,102,0.06)';
    ctx.fill();
  }
}

function drawTower(t) {
  const ty = TOWER_TYPES[t.type];
  const x = px(t.x), y = py(t.y);
  const s = cell * 0.5;
  ctx.save();
  // pad
  ctx.fillStyle = 'rgba(14, 20, 52, 0.9)';
  ctx.strokeStyle = ty.color;
  ctx.lineWidth = 1.5;
  roundRect(x - s * 0.82, y - s * 0.82, s * 1.64, s * 1.64, s * 0.3);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // turret (rotates toward target)
  ctx.translate(x, y);
  ctx.rotate(t.angle);
  ctx.shadowColor = ty.color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = ty.color;
  switch (ty.id) {
    case 'blaster':
      ctx.fillRect(0, -s * 0.12, s * 0.85, s * 0.24);
      circle(0, 0, s * 0.34, ty.color);
      break;
    case 'frost':
      poly(6, s * 0.42, ty.color);
      circle(0, 0, s * 0.18, '#ffffff');
      break;
    case 'gatling':
      ctx.fillRect(0, -s * 0.3, s * 0.75, s * 0.14);
      ctx.fillRect(0, -s * 0.07, s * 0.9, s * 0.14);
      ctx.fillRect(0, s * 0.16, s * 0.75, s * 0.14);
      circle(0, 0, s * 0.32, ty.color);
      break;
    case 'mortar':
      circle(0, 0, s * 0.42, ty.color);
      ctx.fillStyle = '#0a0e28';
      circle(0, 0, s * 0.2, '#0a0e28');
      break;
    case 'tesla':
      poly(3, s * 0.4, ty.color);
      circle(s * 0.05, 0, s * 0.16, '#ffffff');
      break;
    case 'rail':
      ctx.fillRect(-s * 0.2, -s * 0.1, s * 1.15, s * 0.2);
      ctx.fillRect(s * 0.55, -s * 0.18, s * 0.25, s * 0.36);
      circle(-s * 0.05, 0, s * 0.3, ty.color);
      break;
  }
  ctx.restore();

  // level pips
  for (let i = 0; i < t.level; i++) {
    circle(x - s * 0.5 + i * s * 0.32 + s * 0.18, y + s * 0.68, 2.2, ty.color);
  }

  // selected: show range
  if (state.selected === t) {
    const st = towerStats(t);
    ctx.beginPath();
    ctx.arc(x, y, st.range * cell, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(75,245,255,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(75,245,255,0.05)';
    ctx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function poly(n, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function drawEnemy(e) {
  const x = px(e.x), y = py(e.y);
  const r = e.def.radius * cell;
  const bob = Math.sin(e.wob) * r * 0.12;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.shadowColor = e.def.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = e.def.color;

  if (e.def.shape === 'boss') {
    const t = performance.now() / 1000;
    const pulse = 1 + Math.sin(t * 3) * 0.06;
    ctx.rotate(e.angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.5 * pulse, r * 0.85 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = e.enraged ? '#ffe74b' : '#b46dff';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.def.shape === 'hex') {
    ctx.rotate(e.angle);
    poly(6, r, e.def.color);
    circle(0, 0, r * 0.4, '#3a0e18');
  } else if (e.def.shape === 'tri') {
    ctx.rotate(e.angle);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.8, -r * 0.7);
    ctx.lineTo(-r * 0.8, r * 0.7);
    ctx.closePath();
    ctx.fill();
  } else {
    // dart ship
    ctx.rotate(e.angle);
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.lineTo(-r * 0.7, -r * 0.85);
    ctx.lineTo(-r * 0.3, 0);
    ctx.lineTo(-r * 0.7, r * 0.85);
    ctx.closePath();
    ctx.fill();
    // engine glow
    circle(-r * 0.55, 0, r * 0.22, 'rgba(255,255,255,0.7)');
  }
  ctx.restore();

  // shield ring
  if (e.shield > 0) {
    ctx.beginPath();
    ctx.arc(x, y + bob, r * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(75, 245, 255, ' + (0.25 + 0.5 * (e.shield / e.shieldMax)) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // slow tint
  if (state.waveTime < e.slowUntil) {
    ctx.beginPath();
    ctx.arc(x, y + bob, r * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(159, 216, 255, 0.25)';
    ctx.fill();
  }

  // hp bar when damaged
  if (e.hp < e.maxHp) {
    const w = Math.max(cell * 0.6, r * 2.4);
    const hx = x - w / 2, hy = y + bob - r - cell * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(hx, hy, w, 4);
    const frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = frac > 0.5 ? '#5dffb0' : frac > 0.25 ? '#ffe74b' : '#ff5566';
    ctx.fillRect(hx, hy, w * frac, 4);
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  if (state.mode === 'menu') return;

  const map = currentMap();
  drawPath(map);
  drawPortal(map);
  drawBase(map);

  if (state.placing != null) drawGridOverlay();

  for (const t of towers) drawTower(t);
  for (const e of enemies) drawEnemy(e);

  // bolts
  for (const b of bolts) {
    ctx.save();
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    circle(px(b.x), py(b.y), Math.max(2, b.r * cell), b.color);
    ctx.restore();
  }

  // shells (arcing)
  for (const sh of shells) {
    const k = sh.t / sh.dur;
    const x = sh.sx + (sh.tx - sh.sx) * k;
    const y = sh.sy + (sh.ty - sh.sy) * k - Math.sin(k * Math.PI) * 1.4; // arc height in cells
    ctx.save();
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = 12;
    circle(px(x), py(y), cell * 0.12, sh.color);
    ctx.restore();
  }

  // fx: beams, chains, rings
  for (const e of fx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, e.life / (e.maxLife || 0.16));
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = e.color;
    if (e.kind === 'beam') {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px(e.x1), py(e.y1));
      ctx.lineTo(px(e.x2), py(e.y2));
      ctx.stroke();
    } else if (e.kind === 'chain') {
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < e.pts.length; i++) {
        const p = e.pts[i];
        const jx = i === 0 ? 0 : (Math.random() - 0.5) * 8;
        const jy = i === 0 ? 0 : (Math.random() - 0.5) * 8;
        if (i === 0) ctx.moveTo(px(p.x), py(p.y));
        else ctx.lineTo(px(p.x) + jx, py(p.y) + jy);
      }
      ctx.stroke();
    } else if (e.kind === 'ring') {
      const k = 1 - e.life / e.maxLife;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(px(e.x), py(e.y), e.r * cell * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // particles
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    circle(px(p.x), py(p.y), Math.max(1.5, p.size * cell), p.color);
  }
  ctx.globalAlpha = 1;

  // floating texts
  ctx.textAlign = 'center';
  ctx.font = '700 ' + Math.max(11, cell * 0.3) + 'px "Segoe UI", system-ui, sans-serif';
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, px(f.x), py(f.y));
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // leak flash
  if (state.flash > 0) {
    ctx.fillStyle = 'rgba(255, 60, 80, ' + state.flash * 0.25 + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ======================================================================
   MAIN LOOP
   ====================================================================== */
let lastT = performance.now();
function loop(now) {
  let dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  drawStarfield(dt);
  for (let i = 0; i < state.speed; i++) update(dt);
  render();
  requestAnimationFrame(loop);
}

/* ======================================================================
   BOOT
   ====================================================================== */
resize();
initStars();
buildShopCards();
buildCheckpointCards();
requestAnimationFrame(loop);
