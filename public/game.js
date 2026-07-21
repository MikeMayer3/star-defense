'use strict';
/* ======================================================================
   STAR DEFENSE — a neon tower defense game.
   5-map campaign · 30 waves each · 6 tower types · credits economy.
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

const COLS = 18, ROWS = 11;
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

  // HUD lives in side rails (money/shields/wave, and the tower shop) plus a
  // small top-right button cluster and the top-center wave preview strip;
  // this is what makes the grid readable on a landscape phone (see
  // CLAUDE.md notes on this layout if tempted to move chrome back to the
  // top/bottom). topH is a fixed clearance sized for the wave-preview
  // strip (top:10px, ~36px tall) rather than the (now tiny) corner button
  // cluster's own height, since the preview is what actually needs the
  // board's top edge to stay clear.
  const leftRail = document.getElementById('leftRail');
  const shop = document.getElementById('shop');
  const topH = 48;
  const leftW = (!leftRail.classList.contains('hidden') && leftRail.offsetWidth) || 108;
  const rightW = (!shop.classList.contains('hidden') && shop.offsetWidth) || 108;
  cell = Math.min((W - leftW - rightW - 12) / COLS, (H - topH - 10) / ROWS);
  boardX = leftW + (W - leftW - rightW - cell * COLS) / 2;
  boardY = topH + (H - topH - cell * ROWS) / 2;
}
window.addEventListener('resize', () => { resize(); initStars(); updateWavePreview(); });

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
  // AudioContext timestamps so they stay sample-accurate. Tracks are written
  // on an 8th-note grid from named notes (so patterns read like sheet music);
  // each is an 8-bar chord progression (64 steps) with a bassline, an
  // arpeggio, an optional lead counter-melody and hats — busier and quicker
  // than the old 4-bar quarter-note loops, with more movement before it
  // repeats. Every note is a chord tone of its bar, so it always stays in key.
  const HZ = {
    E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50,
  };
  // turn a list of note names ('' = rest) into a frequency step-array
  const seq = (names) => names.map((n) => (n ? HZ[n] : 0));

  const MUSIC_TRACKS = {
    // Drift — mellow, flowing. Am F C G · Am F G Am
    drift: {
      name: 'Drift', bpm: 112,
      bass: seq([
        'A2', '', 'E3', '', 'A2', '', 'C3', '',
        'F2', '', 'C3', '', 'F2', '', 'A2', '',
        'C3', '', 'G3', '', 'C3', '', 'E3', '',
        'G2', '', 'D3', '', 'G2', '', 'B2', '',
        'A2', '', 'E3', '', 'A2', '', 'C3', '',
        'F2', '', 'C3', '', 'F2', '', 'A2', '',
        'G2', '', 'D3', '', 'G2', '', 'D3', '',
        'A2', '', 'E3', '', 'A2', '', 'E3', '',
      ]),
      arp: seq([
        'A3', 'C4', 'E4', 'A4', 'E4', 'C4', 'E4', 'C4',
        'A3', 'C4', 'F4', 'A4', 'F4', 'C4', 'A3', 'C4',
        'C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'G4', 'E4',
        'B3', 'D4', 'G4', 'B4', 'G4', 'D4', 'G4', 'D4',
        'E4', 'A4', 'C5', 'A4', 'E4', 'C4', 'A3', 'E4',
        'F4', 'A4', 'C5', 'A4', 'F4', 'C4', 'A3', 'F3',
        'D4', 'G4', 'B4', 'D5', 'B4', 'G4', 'D4', 'B3',
        'A3', 'C4', 'E4', 'A4', 'C5', 'A4', 'E4', 'A3',
      ]),
      lead: seq([
        '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '',
        '', '', '', '', '', 'E5', '', '',
        '', '', '', '', '', 'D5', '', '',
        '', '', 'E5', '', '', 'C5', '', 'A4',
        '', '', 'F5', '', '', 'C5', '', 'A4',
        '', '', 'D5', '', '', 'B4', '', 'G4',
        '', '', 'C5', '', '', 'A4', '', 'E4',
      ]),
      hat: [
        0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
        1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      ],
      bassType: 'triangle', arpType: 'sine', leadType: 'sine',
    },
    // Pulse — driving, punchy. Am Am F F · G G Am G
    pulse: {
      name: 'Pulse', bpm: 140,
      bass: seq([
        'A2', 'A2', 'A3', 'A2', 'A2', 'A2', 'A3', 'E3',
        'A2', 'A2', 'A3', 'A2', 'A2', 'E3', 'A3', 'C3',
        'F2', 'F2', 'F3', 'F2', 'F2', 'F2', 'F3', 'C3',
        'F2', 'F2', 'F3', 'F2', 'F2', 'C3', 'F3', 'A2',
        'G2', 'G2', 'G3', 'G2', 'G2', 'G2', 'G3', 'D3',
        'G2', 'G2', 'G3', 'G2', 'G2', 'D3', 'G3', 'B2',
        'A2', 'A2', 'A3', 'A2', 'A2', 'A2', 'A3', 'E3',
        'G2', 'G2', 'G3', 'G2', 'G2', 'D3', 'B2', 'D3',
      ]),
      arp: seq([
        'A4', 'C5', 'E5', 'C5', 'A4', 'E4', 'A4', 'C5',
        'E5', 'C5', 'A4', 'C5', 'E5', 'A5', 'E5', 'C5',
        'F4', 'A4', 'C5', 'A4', 'F4', 'C4', 'F4', 'A4',
        'C5', 'A4', 'F4', 'A4', 'C5', 'F5', 'C5', 'A4',
        'G4', 'B4', 'D5', 'B4', 'G4', 'D4', 'G4', 'B4',
        'D5', 'B4', 'G4', 'B4', 'D5', 'G5', 'D5', 'B4',
        'A4', 'C5', 'E5', 'A5', 'E5', 'C5', 'A4', 'E4',
        'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4', 'D4',
      ]),
      hat: [
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
        1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      ],
      bassType: 'sawtooth', arpType: 'square',
    },
    // Nova — bright, intense, syncopated. F G Am C · F G Am G
    nova: {
      name: 'Nova', bpm: 148,
      bass: seq([
        'F2', '', 'F3', 'F2', '', 'F2', 'C3', '',
        'G2', '', 'G3', 'G2', '', 'G2', 'D3', '',
        'A2', '', 'A3', 'A2', '', 'A2', 'E3', '',
        'C3', '', 'C4', 'C3', '', 'C3', 'G3', '',
        'F2', 'F2', 'F3', '', 'F2', '', 'C3', 'A2',
        'G2', 'G2', 'G3', '', 'G2', '', 'D3', 'B2',
        'A2', 'A2', 'A3', '', 'A2', '', 'E3', 'C3',
        'G2', 'G2', 'G3', '', 'G2', 'D3', 'B2', 'D3',
      ]),
      arp: seq([
        'F4', 'A4', 'C5', 'F5', 'C5', 'A4', 'C5', 'F4',
        'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'D5', 'G4',
        'A4', 'C5', 'E5', 'A5', 'E5', 'C5', 'E5', 'A4',
        'C5', 'E5', 'G5', 'C5', 'G4', 'E4', 'G4', 'C5',
        'A4', 'C5', 'F5', 'A5', 'F5', 'C5', 'A4', 'F4',
        'G4', 'B4', 'D5', 'G5', 'B4', 'D5', 'G4', 'B4',
        'A4', 'C5', 'E5', 'A5', 'E5', 'C5', 'A4', 'E4',
        'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4', 'D4',
      ]),
      lead: seq([
        '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '',
        '', '', '', '', '', '', '', '',
        '', '', 'A5', '', '', 'F5', '', 'C5',
        '', '', 'D5', '', '', 'G5', '', 'B4',
        '', '', 'E5', '', '', 'A5', '', 'C5',
        '', '', 'D5', '', '', 'B4', '', 'G4',
      ]),
      hat: [
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      ],
      bassType: 'square', arpType: 'sawtooth', leadType: 'triangle',
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
    const step = 30 / track.bpm; // 8th-note grid (half of a 60/bpm beat)
    const steps = track.bass.length;
    for (let i = 0; i < steps; i++) {
      const t = startTime + i * step;
      if (track.bass[i]) musicNote(track.bass[i], t, step * 1.7, track.bassType, 0.05);
      if (track.arp[i]) musicNote(track.arp[i], t, step * 0.95, track.arpType, 0.030);
      if (track.lead && track.lead[i]) musicNote(track.lead[i], t, step * 1.6, track.leadType || 'triangle', 0.028);
      if (track.hat && track.hat[i]) musicHat(t, 0.018);
    }
    return step * steps;
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
   STARFIELD BACKGROUND — twinkling star layers plus a few fixed deep-space
   set pieces (planet, distant galaxy) and occasional passing comets.
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

// Planet + rings: fixed at a corner of the viewport — at this "distance"
// there's no perceptible drift over a play session, so it doesn't scroll
// with the stars (avoids a single unique object popping/teleporting on wrap).
// Each map gets its own planet + galaxy: different position, body color,
// and ring/glow tint, so the backdrop itself signals which sector you're
// in. On the main menu this previews whichever map card is highlighted;
// in-game it reflects the map actually being played.
// Order matches MAPS above (reordered to match difficulty) — each entry
// stays paired with the map it was themed for by name, not by old slot.
const SECTOR_BACKDROPS = [
  { // Zigzag — icy planet, ember-orange galaxy
    planetPos: [0.5, 0.14], planetColor: '#a8c8e8',
    ringColor: 'rgba(220, 240, 255,', ringAccent: 'rgba(150, 200, 255,',
    galaxyPos: [0.8, 0.82], galaxyCore: 'rgba(255, 230, 190,', galaxyMid: 'rgba(255, 140, 90,', galaxyArm: 'rgba(255, 150, 100,',
  },
  { // Switchback — teal gas giant, magenta nebula-galaxy
    planetPos: [0.85, 0.78], planetColor: '#3f9e8a',
    ringColor: 'rgba(160, 255, 230,', ringAccent: 'rgba(255, 255, 255,',
    galaxyPos: [0.13, 0.18], galaxyCore: 'rgba(255, 220, 245,', galaxyMid: 'rgba(255, 140, 220,', galaxyArm: 'rgba(255, 150, 225,',
  },
  { // Serpent — rusty desert world, cyan-white galaxy
    planetPos: [0.15, 0.18], planetColor: '#b8663f',
    ringColor: 'rgba(255, 200, 150,', ringAccent: 'rgba(255, 255, 220,',
    galaxyPos: [0.85, 0.78], galaxyCore: 'rgba(220, 245, 255,', galaxyMid: 'rgba(140, 210, 255,', galaxyArm: 'rgba(150, 210, 255,',
  },
  { // Corridor — the original blue ringed planet / gold-violet galaxy
    planetPos: [0.87, 0.16], planetColor: '#5d7ea8',
    ringColor: 'rgba(190, 210, 255,', ringAccent: 'rgba(255, 224, 190,',
    galaxyPos: [0.13, 0.74], galaxyCore: 'rgba(255, 228, 205,', galaxyMid: 'rgba(200, 165, 255,', galaxyArm: 'rgba(190, 160, 255,',
  },
  { // Gauntlet — crimson dying world, deep-violet galaxy for the finale
    planetPos: [0.86, 0.8], planetColor: '#8a3a4a',
    ringColor: 'rgba(255, 120, 140,', ringAccent: 'rgba(255, 200, 80,',
    galaxyPos: [0.13, 0.16], galaxyCore: 'rgba(255, 210, 220,', galaxyMid: 'rgba(150, 80, 200,', galaxyArm: 'rgba(170, 90, 220,',
  },
];
function currentBackdrop() {
  const idx = state.mode === 'menu' ? state.mapSelect : state.mapIndex;
  // cycle the hand-tuned backdrops across all levels so each sector still has
  // its own look without needing a bespoke entry per level
  return SECTOR_BACKDROPS[idx % SECTOR_BACKDROPS.length];
}

function drawPlanet() {
  const b = currentBackdrop();
  const r = Math.min(W, H) * 0.09;
  const cx = W * b.planetPos[0], cy = H * b.planetPos[1];
  const tilt = -0.34;
  const ringRx = r * 2.05, ringRy = r * 0.52;

  bgCtx.save();
  bgCtx.translate(cx, cy);
  bgCtx.rotate(tilt);
  // back half of the rings, behind the planet body
  bgCtx.strokeStyle = b.ringColor + '0.32)';
  bgCtx.lineWidth = r * 0.13;
  bgCtx.beginPath(); bgCtx.ellipse(0, 0, ringRx, ringRy, 0, Math.PI, Math.PI * 2); bgCtx.stroke();
  bgCtx.strokeStyle = b.ringAccent + '0.22)';
  bgCtx.lineWidth = r * 0.05;
  bgCtx.beginPath(); bgCtx.ellipse(0, 0, ringRx * 0.8, ringRy * 0.8, 0, Math.PI, Math.PI * 2); bgCtx.stroke();
  bgCtx.restore();

  // planet body — flat fill with a clipped darker crescent for a terminator
  bgCtx.beginPath(); bgCtx.arc(cx, cy, r, 0, Math.PI * 2);
  bgCtx.fillStyle = b.planetColor;
  bgCtx.fill();
  bgCtx.save();
  bgCtx.beginPath(); bgCtx.arc(cx, cy, r, 0, Math.PI * 2); bgCtx.clip();
  bgCtx.beginPath(); bgCtx.arc(cx + r * 0.55, cy - r * 0.35, r * 1.05, 0, Math.PI * 2);
  bgCtx.fillStyle = 'rgba(18, 24, 54, 0.55)';
  bgCtx.fill();
  bgCtx.strokeStyle = 'rgba(255,255,255,0.07)';
  bgCtx.lineWidth = r * 0.09;
  for (let i = -1; i <= 1; i++) {
    bgCtx.beginPath(); bgCtx.ellipse(cx, cy + i * r * 0.5, r * 1.1, r * 0.2, 0.12, 0, Math.PI * 2); bgCtx.stroke();
  }
  bgCtx.restore();

  bgCtx.save();
  bgCtx.translate(cx, cy);
  bgCtx.rotate(tilt);
  // front half of the rings, over the planet body
  bgCtx.strokeStyle = b.ringColor + '0.45)';
  bgCtx.lineWidth = r * 0.13;
  bgCtx.beginPath(); bgCtx.ellipse(0, 0, ringRx, ringRy, 0, 0, Math.PI); bgCtx.stroke();
  bgCtx.strokeStyle = b.ringAccent + '0.35)';
  bgCtx.lineWidth = r * 0.05;
  bgCtx.beginPath(); bgCtx.ellipse(0, 0, ringRx * 0.8, ringRy * 0.8, 0, 0, Math.PI); bgCtx.stroke();
  bgCtx.restore();
}

// Distant spiral galaxy — a soft glow core with a couple of faint tilted
// arm smudges. Also fixed in place per map, same reasoning as the planet.
function drawGalaxy() {
  const b = currentBackdrop();
  const cx = W * b.galaxyPos[0], cy = H * b.galaxyPos[1];
  const r = Math.min(W, H) * 0.24;
  const g = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, b.galaxyCore + '0.5)');
  g.addColorStop(0.15, b.galaxyMid + '0.3)');
  g.addColorStop(0.5, b.galaxyMid + '0.12)');
  g.addColorStop(1, b.galaxyMid + '0)');
  bgCtx.fillStyle = g;
  bgCtx.beginPath(); bgCtx.arc(cx, cy, r, 0, Math.PI * 2); bgCtx.fill();

  bgCtx.save();
  bgCtx.translate(cx, cy);
  [0.4, -0.55].forEach((rot) => {
    bgCtx.rotate(rot);
    bgCtx.beginPath();
    bgCtx.ellipse(r * 0.15, 0, r * 0.85, r * 0.2, 0, 0, Math.PI * 2);
    bgCtx.fillStyle = b.galaxyArm + '0.06)';
    bgCtx.fill();
    bgCtx.rotate(-rot);
  });
  bgCtx.restore();

  bgCtx.beginPath(); bgCtx.arc(cx, cy, r * 0.07, 0, Math.PI * 2);
  bgCtx.fillStyle = b.galaxyCore + '0.85)';
  bgCtx.shadowColor = b.galaxyCore + '0.8)';
  bgCtx.shadowBlur = r * 0.22;
  bgCtx.fill();
  bgCtx.shadowBlur = 0;
}

// Comets: small, occasional, streak-and-fade — spawned on a random timer.
let comets = [];
let cometClock = 0, nextCometAt = 5 + Math.random() * 8;
function updateComets(dt) {
  cometClock += dt;
  if (cometClock >= nextCometAt) {
    cometClock = 0;
    nextCometAt = 8 + Math.random() * 14;
    const fromLeft = Math.random() < 0.5;
    const speed = 240 + Math.random() * 140;
    const angle = 0.3 + Math.random() * 0.25;
    comets.push({
      x: fromLeft ? -20 : W + 20,
      y: Math.random() * H * 0.55,
      vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      trail: [],
    });
  }
  for (const c of comets) {
    c.trail.unshift({ x: c.x, y: c.y });
    if (c.trail.length > 9) c.trail.pop();
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.life -= dt * 0.3;
  }
  comets = comets.filter((c) => c.life > 0 && c.x > -60 && c.x < W + 60 && c.y < H + 60);
}
function drawComets() {
  for (const c of comets) {
    for (let i = c.trail.length - 1; i >= 0; i--) {
      const p = c.trail[i];
      const k = 1 - i / c.trail.length;
      bgCtx.globalAlpha = k * c.life * 0.55;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, 1.8 * k + 0.3, 0, Math.PI * 2);
      bgCtx.fillStyle = '#cdeeff';
      bgCtx.fill();
    }
    bgCtx.globalAlpha = c.life;
    bgCtx.shadowColor = '#bfe8ff';
    bgCtx.shadowBlur = 9;
    bgCtx.beginPath();
    bgCtx.arc(c.x, c.y, 2.4, 0, Math.PI * 2);
    bgCtx.fillStyle = '#eaffff';
    bgCtx.fill();
    bgCtx.shadowBlur = 0;
  }
  bgCtx.globalAlpha = 1;
}

function drawStarfield(dt) {
  bgCtx.clearRect(0, 0, W, H);
  const grad = bgCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050619');
  grad.addColorStop(0.5, '#080a2a');
  grad.addColorStop(1, '#0c0e33');
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, W, H);
  drawGalaxy();
  drawPlanet();
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
  updateComets(dt);
  drawComets();
}

/* ======================================================================
   MAPS — one per campaign level (30 waves each, no resets: your build
   lives from wave 1 to 30). Waypoints are grid cells; enemies travel
   between cell centers. Off-board waypoints (-1 / 22) make ships fly in
   from and out past the board edge.
   ====================================================================== */
// The campaign is LEVEL_COUNT numbered levels. Most are procedurally
// generated serpentine layouts (deterministic per index, so everyone's
// "Level 23" is identical); a handful of hand-crafted layouts are folded in
// at set indices for variety. The last level is the symmetric dual-lane
// Super Dreadnought finale.
const LEVEL_COUNT = 40;

// Seeded serpentine generator: an x-monotonic path (x only ever increases)
// so it can never self-cross. It enters at the left edge, makes `turns`
// vertical jogs at evenly spread columns, and exits at the right edge. Turn
// count grows with the level index, so later levels are longer and jaggier.
function genLayout(i) {
  const rng = mulberry32((((i + 1) * 2654435761) >>> 0));
  const minR = 2, maxR = ROWS - 3;           // rows 2..8 — leaves carrier headroom
  const turns = Math.min(2 + Math.floor(i / 5), 6);
  const wp = [];
  let r = minR + ((rng() * (maxR - minR + 1)) | 0);
  wp.push([-1, r]);
  for (let k = 0; k < turns; k++) {
    const x = Math.round(2 + (k + 1) * (COLS - 4) / (turns + 1)); // spread cols 2..COLS-2
    wp.push([x, r]);
    let nr, tries = 0;
    do { nr = minR + ((rng() * (maxR - minR + 1)) | 0); }
    while (Math.abs(nr - r) < 3 && ++tries < 24); // meaningful vertical jog
    wp.push([x, nr]);
    r = nr;
  }
  wp.push([COLS, r]);                          // exit off the right edge
  return wp;
}

// Hand-crafted layouts folded into the numbered set at these indices; every
// other index (except the finale) is generated.
const HANDCRAFTED = new Map([
  [1,  [[-1, 2], [10, 2], [10, 7], [18, 7]]],                                  // Corridor
  [5,  [[-1, 3], [5, 3], [5, 8], [12, 8], [12, 2], [18, 2]]],                  // Serpent
  [12, [[-1, 9], [4, 9], [4, 2], [8, 2], [8, 9], [12, 9], [12, 2], [18, 2]]],  // Zigzag
  [19, [[-1, 1], [11, 1], [11, 4], [3, 4], [3, 7], [11, 7], [11, 9], [18, 9]]],// Switchback
]);

const MAPS = [];
for (let i = 0; i < LEVEL_COUNT; i++) {
  const m = { name: 'Level ' + (i + 1) };
  if (i === LEVEL_COUNT - 1) {
    // symmetric dual-lane finale: top (row 2) and bottom (row 8) lanes,
    // mirrored about the middle row 5, merging at col 6 and exiting right
    // along that middle row into Earth. The merge sits left-of-center so
    // the shared trunk is long enough to actually defend — with a late
    // merge the beatability sim showed enemies spent too little time under
    // fire for ANY board to clear the back waves.
    m.wp = [[-1, 2], [6, 2], [6, 5], [18, 5]];
    m.wp2 = [[-1, 8], [6, 8], [6, 5], [18, 5]];
  } else {
    m.wp = HANDCRAFTED.get(i) || genLayout(i);
  }
  MAPS.push(m);
}

// Turns a waypoint list into the {pts, segLen, totalLen, cells} shape that
// pathPoint()/strokeRoad()/drawPortal()/drawBase() all just need duck-typed —
// none of them care whether they're looking at a map's primary path or a
// secondary one, which is what lets Gauntlet's second lane reuse all of
// them unchanged.
function buildPath(wp) {
  const p = { pts: wp.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 })), segLen: [], totalLen: 0, cells: new Set() };
  for (let i = 0; i < p.pts.length - 1; i++) {
    const a = p.pts[i], b = p.pts[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y); // axis-aligned
    p.segLen.push(len);
    p.totalLen += len;
    const [c0, r0] = wp[i], [c1, r1] = wp[i + 1];
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    let c = c0, r = r0;
    while (true) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) p.cells.add(c + ',' + r);
      if (c === c1 && r === r1) break;
      c += dc; r += dr;
    }
  }
  return p;
}

// A multi-spawn map's lanes share a trailing run of identical waypoints (the
// merged trunk). Drawing each full lane separately would stroke that shared
// stretch once per lane, doubling its glow and chevrons where they meet.
// This splits the lanes into their unique entries plus the shared trunk
// exactly once, purely for rendering — movement still uses each lane's full
// waypoint list (m.lanes), unaffected.
function splitSharedTrunk(wps) {
  let n = 0;
  while (true) {
    const a = wps[0][wps[0].length - 1 - n];
    if (!a) break;
    let all = true;
    for (const wp of wps) {
      const b = wp[wp.length - 1 - n];
      if (!b || b[0] !== a[0] || b[1] !== a[1]) { all = false; break; }
    }
    if (!all) break;
    n++;
  }
  if (n < 2) return wps.slice(); // no shared segment worth splitting out
  const trunk = wps[0].slice(wps[0].length - n);
  // each entry ends exactly at the junction, so it still connects visually
  const entries = wps.map((wp) => wp.slice(0, wp.length - n + 1));
  return [...entries, trunk];
}

for (const m of MAPS) {
  Object.assign(m, buildPath(m.wp)); // primary lane's data lives on the map, unchanged
  const wps = [m.wp];
  if (m.wp2) wps.push(m.wp2);
  if (m.wp3) wps.push(m.wp3);
  m.lanes = wps.map(buildPath);      // lanes[0] = primary; lanes[1..] = extra spawn lanes
  m.path2 = m.lanes[1] || null;      // kept for existing references
  m.path3 = m.lanes[2] || null;
  for (const lane of m.lanes.slice(1)) for (const c of lane.cells) m.cells.add(c); // one shared build-blocking set
  m.renderPaths = (wps.length > 1 ? splitSharedTrunk(wps) : [m.wp]).map(buildPath);
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
    desc: 'Basic all-around shooter', cost: 50, dmg: 13, rate: 1.6, range: 2.7, upCost: [40, 80],
  },
  {
    id: 'frost', name: 'Frost Emitter', icon: '❄️', color: '#9fd8ff', glow: 'rgba(159,216,255,0.45)',
    desc: 'Slows every ship it hits', cost: 75, dmg: 5, rate: 1.1, range: 2.5, upCost: [60, 115],
  },
  {
    id: 'gatling', name: 'Gatling Array', icon: '🌀', color: '#5dffb0', glow: 'rgba(93,255,176,0.45)',
    desc: 'Rapid fire — melts fast, light ships', cost: 110, dmg: 6, rate: 5.5, range: 2.4, upCost: [85, 165],
  },
  {
    id: 'mortar', name: 'Plasma Mortar', icon: '💥', color: '#ff4ecb', glow: 'rgba(255,78,203,0.45)',
    desc: 'Splash damage hits a whole cluster', cost: 160, dmg: 42, rate: 0.55, range: 3.7, upCost: [130, 250],
  },
  {
    id: 'tesla', name: 'Tesla Coil', icon: '⚡', color: '#b46dff', glow: 'rgba(180,109,255,0.45)',
    desc: 'Lightning chains between ships', cost: 220, dmg: 24, rate: 1.1, range: 2.7, upCost: [175, 340],
    // TEMP: hidden from the shop for now. Left in place at its existing
    // array index (not deleted) so t.type on any already-placed/saved
    // tower and every other tower's index stay stable — only
    // buildShopCards() below skips rendering a card for it.
    hidden: true,
  },
  {
    id: 'rail', name: 'Rail Cannon', icon: '🎯', color: '#ffe74b', glow: 'rgba(255,231,75,0.45)',
    desc: 'Heavy shot pierces straight down the line', cost: 320, dmg: 95, rate: 0.45, range: 5.2, upCost: [255, 490],
  },
  {
    id: 'beacon', name: 'Command Beacon', icon: '🛰️', color: '#ffaa33', glow: 'rgba(255,170,51,0.45)',
    desc: 'Boosts damage & fire rate nearby', cost: 140, dmg: 0, rate: 0, range: 4, upCost: [110, 210],
    buffDmg: 0.15, buffRate: 0.15,
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
    buffDmg: ty.buffDmg ? ty.buffDmg + 0.05 * l : 0,   // beacon
    buffRate: ty.buffRate ? ty.buffRate + 0.05 * l : 0, // beacon
    upCost: t.level < 3 ? ty.upCost[t.level - 1] : null,
  };
}

/* ======================================================================
   ENEMY TYPES
   Each type is designed to counter a specific tower habit:
   · shieldHits — Warden's shield blocks the first N hits outright, so
     rapid fire strips it and single big shots are wasted on it.
   · armor — Aegis deflects a flat amount from EVERY hit, so light rapid
     rounds bounce off and heavy shots punch through.
   · cloak — Phantoms can't be targeted until slowed; Frost sees through.
   · heal — Menders repair nearby hulls; pierce/chain reach them mid-pack.
   `debutMap`/`debutWave` mark where the type first appears (drives NEW
   tags + banners); each map after the first debuts one new threat.
   `announce`d types get a NEW CONTACT banner explaining their trait.
   ====================================================================== */
const ENEMY_TYPES = {
  scout:   { name: 'Scout',   icon: '▸', hp: 22,   speed: 2.2, reward: 4,  leak: 1,  radius: 0.26, color: '#ffb84b', shape: 'dart', debutMap: 0, debutWave: 1,
             trait: 'Quick, fragile line ship.' },
  raider:  { name: 'Raider',  icon: '▶', hp: 60,   speed: 1.6, reward: 7,  leak: 1,  radius: 0.3,  color: '#ff4ecb', shape: 'dart', debutMap: 0, debutWave: 2,
             trait: 'Tougher assault ship.' },
  brute:   { name: 'Brute',   icon: '⬢', hp: 170,  speed: 1.0, reward: 13, leak: 2,  radius: 0.36, color: '#ff8c3c', shape: 'hex', fireShield: true, debutMap: 0, debutWave: 5,
             trait: 'Wrapped in a fire shield that cuts all other damage by 75% — only Frost\'s chill can extinguish it.' },
  swarm:   { name: 'Swarmer', icon: '▴', hp: 10,   speed: 2.7, reward: 2,  leak: 1,  radius: 0.17, color: '#5dffb0', shape: 'tri', debutMap: 0, debutWave: 6, announce: true,
             trait: 'Tiny and fast, attacks in tight packs — splash and chains shred them.' },
  shield:  { name: 'Warden',  icon: '◈', hp: 95,   speed: 1.4, reward: 12, leak: 2,  radius: 0.32, color: '#4bf5ff', shape: 'diamond', shieldHits: 6, debutMap: 0, debutWave: 8, announce: true,
             trait: 'Energy shield blocks the first hits outright — rapid fire strips it, heavy shots are wasted on it.' },
  // debutMap indices spread the special threats across the 40-level
  // campaign (levels 7 / 14 / 21) instead of the old 5-map spacing
  aegis:   { name: 'Aegis',   icon: '⬟', hp: 150,  speed: 1.05, reward: 15, leak: 2, radius: 0.34, color: '#8fa8ff', shape: 'pentagon', armor: 6, debutMap: 6, debutWave: 8, announce: true,
             trait: 'Plating deflects flat damage from every hit — light rounds bounce off, heavy shots punch through.' },
  phantom: { name: 'Phantom', icon: '◌', hp: 75,   speed: 1.9, reward: 12, leak: 1,  radius: 0.28, color: '#c58bff', shape: 'ring', cloak: true, debutMap: 13, debutWave: 8, announce: true,
             trait: 'Cloaked — turrets can\'t lock on until it\'s slowed. Frost sees through the cloak.' },
  mender:  { name: 'Mender',  icon: '✚', hp: 110,  speed: 1.25, reward: 18, leak: 1, radius: 0.3,  color: '#59ffb6', shape: 'orb', heal: 8, healRange: 1.6, debutMap: 20, debutWave: 8, announce: true,
             trait: 'Repairs nearby hulls — focus it down first. Pierce and chain hits reach it mid-pack.' },
  // Boss leak costs are budgeted against the 20-life bar: late-campaign
  // bosses are tanky enough that one often walks through even a maxed
  // board, so boss(8) + superboss(10) must stay under 20 or the finale
  // (where both can leak) becomes mathematically unwinnable.
  boss:    { name: 'Dreadnought', icon: '☠', hp: 1500, speed: 0.7, reward: 150, leak: 8, radius: 0.55, color: '#ff5566', shape: 'boss', debutMap: 0, debutWave: 10,
             trait: 'Massive command ship. Enrages below half health.' },
  splinter: { name: 'Splinter', icon: '✦', hp: 9, speed: 2.5, reward: 1, leak: 1, radius: 0.16, color: '#ffb37a', shape: 'tri', debutMap: 0, debutWave: 5,
              trait: 'Debris from a shattered Brute — weak alone, dangerous in a pack. Never spawns in a wave directly.' },
  superboss: { name: 'Super Dreadnought', icon: '☠', hp: 3600, speed: 0.6, reward: 260, leak: 10, radius: 0.85, color: '#c81c46', shape: 'superboss', debutMap: LEVEL_COUNT - 1, debutWave: 30,
               trait: 'The campaign\'s flagship threat. Splits into two full-strength Dreadnoughts on death — killing it is only half the fight.' },
};

/* Difficulty scaling. HP grows quadratically within a level so a board of
   never-upgraded cheap towers starts leaking around wave 15 — upgrading
   (or buying the expensive types) is the only way through the back half.
   Later levels stack a flat multiplier on top (levelMult ramps 1x → ~4x
   across the campaign); starting credits rise with it to keep wave 1
   buildable. Both are index formulas so any LEVEL_COUNT works. */
const TOTAL_WAVES = 30;
// The 2.5x cap is empirical, from a full-sim beatability sweep: a maxed-out
// board (all tiles worth building on filled, all upgrades bought) clears
// wave 30 up to roughly a 2.5x HP multiplier, goes borderline around
// 2.6-2.9x, and cannot win at 3x+ no matter how much money income provides
// — the board's DPS ceiling is the binding constraint, not economy. So the
// campaign ramps to just under that ceiling and the last levels are won on
// tight play rather than being mathematically impossible.
// The finale gets a reduced multiplier: even with the earlier merge, its
// dual-lane layout still has less total time-under-fire than a serpentine
// level, and it ends in the Super Dreadnought fight — layout + boss are its
// difficulty. 1.8x is the sim-tuned value where a maxed board clears it.
function levelMult(i) { return i === LEVEL_COUNT - 1 ? 1.8 : 1 + 1.5 * i / (LEVEL_COUNT - 1); }
function levelStartMoney(i) { return Math.round(200 * levelMult(i)) + 20; } // 220 → 520
function hpMult(w) { return (1 + 0.28 * (w - 1) + 0.022 * (w - 1) * (w - 1)) * levelMult(state.mapIndex); }
function speedMult(w) { return 1 + 0.005 * w; }
// Kill rewards also scale partially with the level multiplier (exponent
// < 1), so mid-campaign economy keeps pace while later levels still bite:
// at levelMult 2.5x, income is ~1.7x, a net ~1.5x difficulty climb on top
// of the fixed board ceiling.
function rewardMult(w) { return (1 + 0.03 * w) * Math.pow(levelMult(state.mapIndex), 0.6); }

// Deterministic per-wave RNG — wave N is always the same wave N, so the
// build-phase preview matches what actually spawns and retries are fair.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Build the spawn list for wave w of a map: [{type, t}] sorted by spawn
   time. Waves are composed of squadron blocks (probe line, debut block,
   main body, closer) and the mix tilts heavier as the map progresses —
   chaff early, brutes/shielded/armored hulls late — so raw enemy strength
   (not gimmicks) is what forces upgrades. Must stay pure/deterministic:
   the preview UI calls it early. */
function buildWave(mapIdx, w) {
  const rng = mulberry32((mapIdx * 997 + w) * 7919 + 1);
  const list = [];
  let t = 0.5;
  const gap = Math.max(0.3, 1.0 - w * 0.02); // spawns tighten as waves go up
  // On a multi-lane map each spawn independently rolls which lane it comes
  // from, so a wave reads as "ships from every front", not a clean split.
  const laneCount = MAPS[mapIdx].lanes ? MAPS[mapIdx].lanes.length : 1;
  const pickPath = () => (laneCount > 1 ? 1 + ((rng() * laneCount) | 0) : 1);
  const push = (type, extraGap = 0) => { list.push({ type, t, path: pickPath() }); t += gap + extraGap; };
  const rest = (d) => { t += d; };
  const lineOf = (type, n) => { for (let i = 0; i < n; i++) push(type); };
  const packOf = (type, n, tight = 0.14) => { const p = pickPath(); for (let k = 0; k < n; k++) { list.push({ type, t, path: p }); t += tight; } t += gap; };
  const mixed = (types, n) => { for (let i = 0; i < n; i++) push(types[(rng() * types.length) | 0]); };
  const avail = (type) => { const d = ENEMY_TYPES[type]; return d.debutMap < mapIdx || (d.debutMap === mapIdx && w >= d.debutWave); };

  if (w % 10 === 0) {
    // Boss wave: escorts drawn from the strongest special this map knows.
    const specials = ['shield', 'aegis', 'phantom'].filter(avail);
    lineOf(specials.length ? specials[specials.length - 1] : 'raider', 5 + Math.floor(w / 4) + mapIdx);
    if (avail('mender')) { rest(0.8); lineOf('mender', w === TOTAL_WAVES ? 3 : 1); }
    // brute escort spawns BEFORE the boss so the boss is the last thing to
    // launch from the carrier — the carrier hides the moment the boss
    // undocks (see drawPortal), so nothing must spawn after it
    lineOf(w >= 5 ? 'brute' : 'scout', 3 + Math.floor(w / 5));
    rest(1.5);
    // the true final wave of the campaign gets the flagship instead of a
    // regular Dreadnought — every other boss wave (including wave 30 on
    // earlier maps) keeps the normal one
    const isCampaignFinale = w === TOTAL_WAVES && mapIdx === MAPS.length - 1;
    push(isCampaignFinale ? 'superboss' : 'boss', 2);
    return list;
  }

  // Weighted pool: chaff ages out, heavies and specials stack up late.
  const pool = [];
  if (w < 20) pool.push('scout');
  if (w >= 2) pool.push('raider');
  if (w >= 4) pool.push('raider');
  if (w >= 5) pool.push('brute');
  if (w >= 14) pool.push('brute');
  if (w >= 24) pool.push('brute');
  // specials join the mix a few waves in, even on maps that already know
  // them — wave 2 shouldn't demand counters you can't afford yet
  for (const s of ['shield', 'aegis', 'phantom']) {
    if (!avail(s) || w < 5) continue;
    pool.push(s);
    if (w >= 15) pool.push(s);
    if (w >= 23) pool.push(s);
  }
  if (!pool.length) pool.push('scout');

  let budget = Math.min(10 + Math.floor(w * 1.9) + mapIdx * 3, 64);

  // probe line
  const openN = 4 + Math.floor(w / 6);
  lineOf(w >= 6 && rng() < 0.5 ? 'swarm' : (w >= 20 ? 'raider' : 'scout'), openN);
  budget -= openN;
  rest(0.8);

  // this level's new enemy debuts as a showcased block (keys match the
  // types' debutMap indices)
  const debut = ({ 0: 'shield', 6: 'aegis', 13: 'phantom', 20: 'mender' })[mapIdx];
  if (debut && ENEMY_TYPES[debut].debutMap === mapIdx && w === ENEMY_TYPES[debut].debutWave) {
    if (debut === 'mender') { push('mender'); lineOf('raider', 3); push('mender'); lineOf('raider', 3); }
    else lineOf(debut, 4);
    budget -= 6;
    rest(1);
  }

  // main body
  const mainN = Math.max(6, Math.floor(budget * 0.7));
  mixed(pool, Math.floor(mainN / 2));
  // Swarm surge — the deliberate "AoE matters" moment. Several dense packs
  // of low-HP swarmers arrive tightly enough that single-target fire can't
  // keep up with the throughput, but splash/aura shreds them. Scales with
  // wave so it stays a real threat as HP climbs; without at least one AoE
  // (or slowing) tower a single-target board leaks hard here. See the
  // balance sim that motivated this — pure single-target boards go from
  // best to worst once a surge is present, and mixed boards win.
  if (w >= 6) {
    const packs = 2 + Math.floor(w / 15);       // 2 early, 3 mid, 4 at wave 30
    const packSize = 8 + Math.floor(w * 0.45);  // ~10 at wave 6 up to ~21 by wave 30
    for (let p = 0; p < packs; p++) packOf('swarm', packSize, 0.1);
  }
  if (avail('mender') && w >= 12 && rng() < 0.3 + w * 0.01) push('mender');
  mixed(pool, Math.ceil(mainN / 2));

  // closer
  rest(0.8);
  if (w >= 5) lineOf('brute', 1 + Math.floor(w / 8));
  else lineOf('scout', 3);

  return list;
}

/* ======================================================================
   GAME STATE
   ====================================================================== */
/* Campaign progress: maps unlock in order, beating one unlocks the next.
   Mid-map auto-checkpoints (waves 11/21) snapshot money/lives/towers so a
   30-wave run never has to restart from scratch after a defeat. */
const KEY_SCORE = 'stardefense_hiScore';
const KEY_PROGRESS = 'stardefense_mapProgress';
const KEY_CP = 'stardefense_cp_';

let mapProgress = {};
try { mapProgress = JSON.parse(localStorage.getItem(KEY_PROGRESS)) || {}; } catch (e) { mapProgress = {}; }
function progFor(i) { return mapProgress[i] || (mapProgress[i] = { beaten: false, best: 0 }); }
function saveProgress() { try { localStorage.setItem(KEY_PROGRESS, JSON.stringify(mapProgress)); } catch (e) { /* ignore */ } }
// TEMP (testing): all maps unlocked regardless of progress. Flip to false
// to restore normal beat-the-previous-map-to-unlock progression.
const UNLOCK_ALL_MAPS = true;
function mapUnlocked(i) { return UNLOCK_ALL_MAPS || i === 0 || !!(mapProgress[i - 1] && mapProgress[i - 1].beaten); }
function mapsBeaten() { return MAPS.filter((m, i) => mapProgress[i] && mapProgress[i].beaten).length; }

function saveMapCheckpoint() {
  const snap = {
    wave: state.level, money: Math.floor(state.money), lives: state.lives,
    towers: towers.map((t) => ({ type: t.type, col: t.col, row: t.row, level: t.level, invested: t.invested })),
  };
  try { localStorage.setItem(KEY_CP + state.mapIndex, JSON.stringify(snap)); } catch (e) { /* ignore */ }
}
function loadMapCheckpoint(i) {
  try { return JSON.parse(localStorage.getItem(KEY_CP + i)); } catch (e) { return null; }
}
function clearMapCheckpoint(i) { try { localStorage.removeItem(KEY_CP + i); } catch (e) { /* ignore */ } }

const state = {
  mode: 'menu',        // menu | playing | paused | over
  phase: 'build',      // build | wave
  mapIndex: 0,         // map being played
  mapSelect: 0,        // map highlighted on the menu
  level: 1,            // wave number within the map (1..TOTAL_WAVES)
  money: 220,
  lives: 20,
  score: 0,
  kills: 0,
  earned: 0,
  speed: 1,
  auto: false,
  autoTimer: 0,
  waveTime: 0,
  hiScore: parseInt(localStorage.getItem(KEY_SCORE) || '0', 10),
  seen: new Set(),     // enemy types encountered this run (NEW tags/banners)
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

function currentMap() { return MAPS[state.mapIndex]; }

/* ======================================================================
   DOM REFS
   ====================================================================== */
const $ = (id) => document.getElementById(id);
const menuEl = $('menu'), topbarEl = $('topbar'), leftRailEl = $('leftRail'), shopEl = $('shop'),
  bannerEl = $('banner'), pauseEl = $('pauseOverlay'), overEl = $('gameOver'),
  towerCardsEl = $('towerCards'), upPanelEl = $('upgradePanel');

// The main menu is split across a few overlay screens (home, level select,
// settings, about) — only one shows at a time while state.mode === 'menu'.
const MENU_SCREENS = ['menu', 'levelSelect', 'settings', 'about'];
function showMenuScreen(id) {
  for (const s of MENU_SCREENS) $(s).classList.toggle('hidden', s !== id);
}
function hideAllMenuScreens() {
  for (const s of MENU_SCREENS) $(s).classList.add('hidden');
}

/* ======================================================================
   ENTITY HELPERS
   ====================================================================== */
// pathNum selects which lane a spawned enemy walks — 1 (the default, and
// the only option on every map but Gauntlet) or 2 for a map's second lane.
function enemyPath(map, pathNum) { return (map.lanes && map.lanes[pathNum - 1]) || map; }

function spawnEnemy(type, pathNum = 1, startS = 0) {
  const def = ENEMY_TYPES[type];
  const lvl = state.level;
  const hp = def.hp * hpMult(lvl);
  const shieldHits = def.shieldHits ? def.shieldHits + Math.floor(lvl / 10) : 0;
  const e = {
    type, def,
    path: pathNum,
    s: startS,
    hp, maxHp: hp,
    speed: def.speed * speedMult(lvl),
    reward: Math.ceil(def.reward * rewardMult(lvl)),
    slowUntil: 0, slowPct: 0,
    shieldHits, shieldHitsMax: shieldHits, shieldRegen: 0,
    armor: def.armor ? def.armor * (1 + 0.06 * lvl) : 0,
    fireShield: !!def.fireShield,
    healPulse: 0,
    lastHit: -99,
    x: 0, y: 0, angle: 0,
    wob: Math.random() * Math.PI * 2,
    dead: false,
    enraged: false,
  };
  const p = pathPoint(enemyPath(currentMap(), pathNum), startS);
  e.x = p.x; e.y = p.y; e.angle = p.angle;
  enemies.push(e);
  if (type === 'boss') { Sound.boss(); showBanner('⚠ DREADNOUGHT INBOUND ⚠', ENEMY_TYPES.boss.name); }
  else if (type === 'superboss') { Sound.boss(); showBanner('☠ SUPER DREADNOUGHT INBOUND ☠', ENEMY_TYPES.superboss.name); }
}

function damageEnemy(e, dmg, color, fromFrost = false) {
  if (e.dead) return;
  e.lastHit = state.waveTime;
  // Warden shield: each charge eats one full hit, regardless of damage.
  if (e.shieldHits > 0) {
    e.shieldHits--;
    fx.push({ kind: 'ring', x: e.x, y: e.y, life: 0.18, maxLife: 0.18, r: e.def.radius * 1.9, color: '#4bf5ff' });
    if (e.shieldHits === 0) addFloat(e.x, e.y, 'SHIELD DOWN', '#4bf5ff');
    return;
  }
  // Aegis armor: flat reduction per hit. Fully-blocked hits show a
  // throttled DEFLECTED float so the player can see why it isn't dying.
  if (e.armor) {
    dmg = Math.max(0, dmg - e.armor);
    if (dmg === 0) {
      if (state.waveTime - (e.lastDeflect || -9) > 0.6) {
        e.lastDeflect = state.waveTime;
        addFloat(e.x, e.y, 'DEFLECTED', '#8fa8ff');
      }
      return;
    }
  }
  // Brute fire shield: cuts non-Frost damage by 75%. A Frost hit
  // extinguishes it for good (and still deals its own damage in full).
  if (e.fireShield) {
    if (fromFrost) {
      e.fireShield = false;
      addFloat(e.x, e.y, 'EXTINGUISHED', '#9fd8ff');
      fx.push({ kind: 'ring', x: e.x, y: e.y, life: 0.2, maxLife: 0.22, r: e.def.radius * 1.8, color: '#9fd8ff' });
    } else {
      dmg *= 0.25;
    }
  }
  e.hp -= dmg;
  if ((e.type === 'boss' || e.type === 'superboss') && !e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    e.speed *= 1.6;
    showBanner(e.def.name.toUpperCase() + ' ENRAGED!', 'it\'s speeding up');
  }
  if (e.hp <= 0) {
    e.dead = true;
    state.money += e.reward;
    state.earned += e.reward;
    state.score += e.reward * 10;
    state.kills++;
    addFloat(e.x, e.y, '+$' + e.reward, '#ffe74b');
    const big = e.type === 'boss' || e.type === 'superboss';
    burst(e.x, e.y, e.def.color, e.type === 'superboss' ? 60 : big ? 40 : 10, e.type === 'superboss' ? 3 : big ? 2.2 : 1);
    if (big) Sound.bigExplosion(); else Sound.explosion();

    // Brute cracks apart into a pack of weak Splinters right where it died —
    // the clumped low-HP burst is exactly what splash damage should punish.
    if (e.type === 'brute') {
      for (let k = 0; k < 10; k++) {
        spawnEnemy('splinter', e.path, Math.max(0, e.s + (k - 4.5) * 0.09));
      }
    }
    // Super Dreadnought's death spawns two full-strength Dreadnoughts —
    // beating it is only the first half of the fight.
    if (e.type === 'superboss') {
      spawnEnemy('boss', e.path, e.s);
      spawnEnemy('boss', e.path, Math.max(0, e.s - 0.35));
    }
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
    case 'frost': {
      // aura pulse: no projectile — every enemy currently in range (cloaked
      // ones included) is slowed and drained at once, at the same per-tick
      // dmg/rate as a single-target shot would have been
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) > st.range) continue;
        damageEnemy(e, st.dmg, ty.color, true);
        if (!e.dead) {
          e.slowPct = Math.max(e.slowPct * (state.waveTime < e.slowUntil ? 1 : 0), st.slowPct);
          e.slowUntil = state.waveTime + st.slowDur;
        }
      }
      fx.push({ kind: 'ring', x: t.x, y: t.y, life: 0.3, maxLife: 0.3, r: st.range, color: ty.color });
      Sound.shotFrost();
      break;
    }
    case 'mortar': {
      // Lead the target: aim where it will be when the shell lands.
      // Uses the target's own lane, not always the map's primary one.
      const flight = 0.5;
      const lead = pathPoint(enemyPath(currentMap(), target.path), target.s + target.speed * effSlow(target) * flight);
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
          if (e.dead || hitSet.has(e) || !revealed(e)) continue;
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

// Cloaked ships can't be targeted until slowed; frost towers see through.
function revealed(e) { return !e.def.cloak || state.waveTime < e.slowUntil; }

/* ======================================================================
   WAVE FLOW
   ====================================================================== */
function startWave() {
  if (state.phase !== 'build' || state.mode !== 'playing') return;
  state.phase = 'wave';
  state.waveTime = 0;
  spawnQueue = buildWave(state.mapIndex, state.level);
  // first-ever sighting of an announced type gets its intro banner instead
  // of the generic wave banner
  let debut = null;
  for (const s of spawnQueue) {
    if (!state.seen.has(s.type)) {
      state.seen.add(s.type);
      if (!debut && ENEMY_TYPES[s.type].announce) debut = ENEMY_TYPES[s.type];
    }
  }
  if (debut) showBanner('⚠ NEW CONTACT: ' + debut.name.toUpperCase(), debut.trait);
  else showBanner('WAVE ' + state.level, currentMap().name.toUpperCase());
  updateWavePreview();
  updateHUD();
}

function waveComplete() {
  const bonus = 50 + state.level * 8;
  state.money += bonus;
  state.earned += bonus;
  state.score += bonus * 5;
  Sound.waveClear();
  addFloat(COLS / 2, ROWS / 2, 'WAVE BONUS +$' + bonus, '#5dffb0');

  const prog = progFor(state.mapIndex);
  if (state.level > prog.best) { prog.best = state.level; saveProgress(); }

  if (state.level >= TOTAL_WAVES) { endGame(true); return; }

  state.level++;
  state.phase = 'build';

  // auto-checkpoint after each boss so a defeat never costs the whole map
  if (state.level === 11 || state.level === 21) {
    saveMapCheckpoint();
    showBanner('WAVE ' + (state.level - 1) + ' CLEAR', 'checkpoint saved — +$' + bonus + ' bonus');
  } else {
    showBanner('WAVE ' + (state.level - 1) + ' CLEAR', '+$' + bonus + ' bonus');
  }

  if (state.auto) state.autoTimer = 2.4;
  updateWavePreview();
  updateHUD();
}

function endGame(victory) {
  state.mode = 'over';
  state.phase = 'build';
  Sound.stopMusic();
  if (victory) Sound.victory(); else Sound.gameOver();

  if (victory) {
    const prog = progFor(state.mapIndex);
    prog.beaten = true;
    prog.best = TOTAL_WAVES;
    saveProgress();
    clearMapCheckpoint(state.mapIndex);
  }

  const title = $('endTitle');
  title.textContent = victory
    ? (mapsBeaten() >= MAPS.length ? '🏆 GALAXY SAVED!' : '🏆 ' + currentMap().name.toUpperCase() + ' CLEARED!')
    : 'LINE BREACHED';
  title.className = 'title ' + (victory ? 'victory-title' : 'gameover-title');
  $('finalWave').textContent = (victory ? TOTAL_WAVES : state.level) + ' / ' + TOTAL_WAVES;
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

  // after a win the primary button advances the campaign; after a loss it
  // resumes from the mid-map checkpoint if one was saved
  state.lastVictory = victory;
  const cp = victory ? null : loadMapCheckpoint(state.mapIndex);
  $('retryBtn').textContent = victory
    ? (state.mapIndex + 1 < MAPS.length ? 'NEXT MAP ▶' : 'DEFEND AGAIN ▶')
    : (cp ? '▶ RETRY FROM WAVE ' + cp.wave : 'DEFEND AGAIN ▶');
  $('restartBtn').classList.toggle('hidden', !(!victory && cp));

  topbarEl.classList.add('hidden');
  leftRailEl.classList.add('hidden');
  shopEl.classList.add('hidden');
  $('waveBtn').classList.add('hidden');
  overEl.classList.remove('hidden');
  updateWavePreview();
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
   WAVE PREVIEW + INTEL — build-phase strip showing exactly what the next
   wave contains (buildWave is deterministic, so the preview is honest).
   Tapping a chip opens an intel card with the type's stats and trait.
   ====================================================================== */
const previewEl = $('wavePreview'), chipsEl = $('wpChips'), intelEl = $('intelCard');

function updateWavePreview() {
  if (state.mode !== 'playing' || state.phase !== 'build') {
    previewEl.classList.add('hidden');
    hideIntel();
    return;
  }
  const counts = {};
  for (const s of buildWave(state.mapIndex, state.level)) counts[s.type] = (counts[s.type] || 0) + 1;
  $('wpLabel').textContent = 'WAVE ' + state.level;
  chipsEl.innerHTML = '';
  for (const type of Object.keys(ENEMY_TYPES)) {
    if (!counts[type]) continue;
    const def = ENEMY_TYPES[type];
    const isNew = !state.seen.has(type);
    const chip = document.createElement('button');
    chip.className = 'wp-chip' + (isNew ? ' new' : '');
    chip.style.setProperty('--ec', def.color);
    chip.innerHTML = '<span class="wp-icon">' + def.icon + '</span>×' + counts[type] +
      (isNew ? '<span class="wp-newtag">NEW</span>' : '');
    chip.addEventListener('click', (ev) => { ev.stopPropagation(); toggleIntel(type); });
    chipsEl.appendChild(chip);
  }
  previewEl.classList.remove('hidden');
}

function toggleIntel(type) {
  if (intelEl.dataset.type === type && !intelEl.classList.contains('hidden')) { hideIntel(); return; }
  const def = ENEMY_TYPES[type];
  intelEl.dataset.type = type;
  intelEl.innerHTML =
    '<div class="ic-name" style="color:' + def.color + '">' + def.icon + ' ' + def.name.toUpperCase() + '</div>' +
    '<div class="ic-stats">HP ' + Math.round(def.hp * hpMult(state.level)) +
    ' · SPEED ' + def.speed.toFixed(1) +
    ' · LEAK −' + def.leak +
    ' · BOUNTY $' + Math.ceil(def.reward * rewardMult(state.level)) + '</div>' +
    (def.trait ? '<div class="ic-trait">' + def.trait + '</div>' : '');
  intelEl.classList.remove('hidden');
}

function hideIntel() { intelEl.classList.add('hidden'); }

document.addEventListener('click', (ev) => {
  if (intelEl.classList.contains('hidden')) return;
  if (ev.target.closest('#intelCard') || ev.target.closest('.wp-chip')) return;
  hideIntel();
});

/* ======================================================================
   SHOP / UPGRADE UI
   ====================================================================== */
// Drag-to-place: press a card and drag it onto the board, release to drop.
// A plain tap (no meaningful movement) falls back to the old arm-then-tap-
// the-board flow, so both placement styles keep working side by side.
const dragGhostEl = $('dragGhost');
let cardDrag = null; // { type, pointerId, startX, startY, moved }

function showDragGhost(typeIndex, x, y) {
  const ty = TOWER_TYPES[typeIndex];
  drawShopIcon(dragGhostEl, ty);
  dragGhostEl.style.left = x + 'px';
  dragGhostEl.style.top = y + 'px';
  dragGhostEl.classList.remove('hidden');
}
function moveDragGhost(x, y) {
  dragGhostEl.style.left = x + 'px';
  dragGhostEl.style.top = y + 'px';
}
function hideDragGhost() { dragGhostEl.classList.add('hidden'); }

function buildShopCards() {
  towerCardsEl.innerHTML = '';
  TOWER_TYPES.forEach((ty, i) => {
    if (ty.hidden) return; // e.g. Tesla, temporarily — see its TOWER_TYPES entry
    const card = document.createElement('div');
    card.className = 'tower-card';
    card.style.setProperty('--tc', ty.color);
    card.style.setProperty('--tc-glow', ty.glow);
    card.dataset.index = i;
    card.innerHTML =
      '<div class="tw-name">' + ty.name + '</div>' +
      '<div class="tw-row">' +
        '<canvas class="tw-icon" width="72" height="72"></canvas>' +
        '<div class="tw-cost">$' + ty.cost + '</div>' +
      '</div>';
    drawShopIcon(card.querySelector('.tw-icon'), ty);

    card.addEventListener('pointerdown', (ev) => {
      if (state.mode !== 'playing' || ev.button > 0) return;
      if (state.money < ty.cost) { Sound.invalid(); return; }
      ev.preventDefault();
      try { card.setPointerCapture(ev.pointerId); } catch (e) { /* ignore — rare, but shouldn't block the tap/arm below */ }
      // remember whether this card was already armed *before* this
      // pointerdown arms it — a plain tap needs that to decide whether to
      // toggle off (tapping an already-armed card) or leave it armed
      // (tapping a fresh one), same semantics as the old click handler.
      const wasArmed = state.placing === i;
      cardDrag = { type: i, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, moved: false, wasArmed };
      closeUpgradePanel();
      setPlacing(i);
      showDragGhost(i, ev.clientX, ev.clientY);
    }, { passive: false }); // must be non-passive or preventDefault() above is silently ignored
    card.addEventListener('pointermove', (ev) => {
      if (!cardDrag || ev.pointerId !== cardDrag.pointerId) return;
      if (Math.hypot(ev.clientX - cardDrag.startX, ev.clientY - cardDrag.startY) > 6) cardDrag.moved = true;
      moveDragGhost(ev.clientX, ev.clientY);
      state.hover = cellFromEvent(ev);
    });
    card.addEventListener('pointerup', (ev) => {
      if (!cardDrag || ev.pointerId !== cardDrag.pointerId) return;
      try { card.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      hideDragGhost();
      const { type, moved, wasArmed } = cardDrag;
      cardDrag = null;
      if (!moved) {
        // simple tap: disarm if it was already armed, otherwise leave it
        // armed (pointerdown already did the arming)
        if (wasArmed) setPlacing(null);
        return;
      }
      const c = cellFromEvent(ev);
      setPlacing(null);
      if (c) placeTowerAt(type, c.col, c.row);
    });
    card.addEventListener('pointercancel', (ev) => {
      if (!cardDrag || ev.pointerId !== cardDrag.pointerId) return;
      cardDrag = null;
      hideDragGhost();
      setPlacing(null);
    });
    // long-press must never open the native context menu — it would
    // hijack the touch sequence mid-drag (see the global handler in BOOT)
    card.addEventListener('contextmenu', (ev) => ev.preventDefault());

    towerCardsEl.appendChild(card);
  });
}

function setPlacing(i) {
  state.placing = i;
  state.selected = null;
  // dataset.index (the tower's true TOWER_TYPES index), not DOM child
  // position — those diverge as soon as any card is skipped (hidden)
  [...towerCardsEl.children].forEach((c) => c.classList.toggle('selected', Number(c.dataset.index) === i));
  if (i == null) hideTowerIntel(); else showTowerIntel(i);
}

const towerIntelEl = $('towerIntel');
function showTowerIntel(i) {
  const ty = TOWER_TYPES[i];
  const card = towerCardsEl.querySelector('[data-index="' + i + '"]');
  if (!ty || !card) { hideTowerIntel(); return; }
  towerIntelEl.innerHTML =
    '<div class="ti-name" style="color:' + ty.color + '">' + ty.icon + ' ' + ty.name + '</div>' +
    '<div class="ti-desc">' + ty.desc + '</div>';
  towerIntelEl.classList.remove('hidden');
  const r = card.getBoundingClientRect();
  const top = Math.min(
    Math.max(8, r.top + r.height / 2 - towerIntelEl.offsetHeight / 2),
    window.innerHeight - towerIntelEl.offsetHeight - 8
  );
  towerIntelEl.style.top = top + 'px';
}
function hideTowerIntel() { towerIntelEl.classList.add('hidden'); }

function refreshShopAfford() {
  [...towerCardsEl.children].forEach((c) => {
    c.classList.toggle('broke', state.money < TOWER_TYPES[Number(c.dataset.index)].cost);
  });
}

function openUpgradePanel(t) {
  setPlacing(null); // must come first — it clears state.selected
  state.selected = t;
  const ty = TOWER_TYPES[t.type];
  const st = towerStats(t);
  $('upName').textContent = ty.icon + ' ' + ty.name + ' — LVL ' + t.level;
  $('upStats').textContent = ty.id === 'beacon'
    ? 'DMG +' + Math.round(st.buffDmg * 100) + '% · RATE +' + Math.round(st.buffRate * 100) + '% · RNG ' + st.range.toFixed(1)
    : 'DMG ' + Math.round(st.dmg) + ' · RATE ' + st.rate.toFixed(1) + '/s · RNG ' + st.range.toFixed(1);
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

// Shared by both placement paths: tap-to-arm-then-tap-the-board, and
// drag-a-card-and-drop-it-on-a-tile. Returns whether the tower was placed.
function placeTowerAt(typeIndex, col, row) {
  const ty = TOWER_TYPES[typeIndex];
  if (!canBuildAt(col, row) || state.money < ty.cost) { Sound.invalid(); return false; }
  const t = {
    type: typeIndex,
    col, row,
    x: col + 0.5, y: row + 0.5,
    level: 1, invested: ty.cost,
    cool: 0, angle: -Math.PI / 2, target: null,
  };
  towers.push(t);
  grid[col + ',' + row] = t;
  state.money -= ty.cost;
  Sound.place();
  burst(t.x, t.y, ty.color, 10);
  updateHUD();
  return true;
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
    const type = state.placing;
    if (placeTowerAt(type, c.col, c.row) && state.money < TOWER_TYPES[type].cost) setPlacing(null); // can't afford another
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
  if (n >= 1 && n <= TOWER_TYPES.length && !TOWER_TYPES[n - 1].hidden) {
    closeUpgradePanel();
    if (state.money >= TOWER_TYPES[n - 1].cost) setPlacing(n - 1); else Sound.invalid();
  }
  if (DEBUG) {
    if (ev.key === 'm') { state.money += 5000; updateHUD(); }
    if (ev.key === 'k') { for (const e of enemies) { e.shieldHits = 0; e.armor = 0; damageEnemy(e, 1e9); } }
    if (ev.key === 'j' && state.phase === 'build') { state.level = Math.min(TOTAL_WAVES, state.level + 9); updateHUD(); updateWavePreview(); }
  }
});

/* ======================================================================
   HUD
   ====================================================================== */
function updateHUD() {
  $('moneyVal').textContent = '$' + Math.floor(state.money).toLocaleString();
  $('livesVal').textContent = state.lives;
  $('waveVal').textContent = state.level + ' / ' + TOTAL_WAVES;
  document.querySelector('.lives-stat').classList.toggle('danger', state.lives <= 5);
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
function buildMapCards() {
  const wrap = $('mapSelect');
  wrap.innerHTML = '';
  if (!mapUnlocked(state.mapSelect)) state.mapSelect = 0;
  MAPS.forEach((m, i) => {
    const unlocked = mapUnlocked(i);
    const prog = mapProgress[i];
    const beaten = !!(prog && prog.beaten);
    const cp = unlocked ? loadMapCheckpoint(i) : null;
    const cell = document.createElement('div');
    cell.className = 'level-cell' + (unlocked ? '' : ' locked') + (beaten ? ' beaten' : '') +
      (cp ? ' checkpoint' : '') + (state.mapSelect === i && unlocked ? ' selected' : '');
    const badge = beaten ? '★' : cp ? '◈' : !unlocked ? '🔒' : '';
    cell.innerHTML = '<span class="lc-num">' + (i + 1) + '</span>' +
      (badge ? '<span class="lc-badge">' + badge + '</span>' : '');
    if (unlocked) cell.addEventListener('click', () => { state.mapSelect = i; buildMapCards(); });
    wrap.appendChild(cell);
  });
  // selected-level detail line
  {
    const prog = mapProgress[state.mapSelect];
    const cp = loadMapCheckpoint(state.mapSelect);
    let detail;
    if (prog && prog.beaten) detail = '★ cleared';
    else if (cp) detail = 'checkpoint — wave ' + cp.wave;
    else if (prog && prog.best > 0) detail = 'best wave ' + prog.best;
    else detail = TOTAL_WAVES + ' waves';
    const info = $('levelInfo');
    if (info) info.textContent = 'LEVEL ' + (state.mapSelect + 1) +
      (state.mapSelect === LEVEL_COUNT - 1 ? ' — FINAL' : '') + ' · ' + detail;
  }
  $('bestStats').textContent =
    'Levels cleared: ' + mapsBeaten() + ' / ' + LEVEL_COUNT + '  •  High Score: ' + state.hiScore.toLocaleString();
  const sel = wrap.querySelector('.level-cell.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function startGame(mapIdx) {
  state.mapIndex = mapIdx;
  state.mapSelect = mapIdx;
  const cp = loadMapCheckpoint(mapIdx);
  state.mode = 'playing';
  state.phase = 'build';
  state.level = cp ? cp.wave : 1;
  state.money = DEBUG ? 999999 : (cp ? cp.money : levelStartMoney(mapIdx));
  state.lives = cp ? cp.lives : 20;
  state.score = 0;
  state.kills = 0;
  state.earned = 0;
  state.autoTimer = 0;
  state.placing = null;
  state.selected = null;
  hideTowerIntel();
  // types debuted on earlier maps (or before this checkpoint) skip banners
  state.seen = new Set(Object.keys(ENEMY_TYPES).filter((k) => {
    const d = ENEMY_TYPES[k];
    return d.debutMap < mapIdx || (d.debutMap === mapIdx && d.debutWave < state.level);
  }));
  towers = []; grid = {};
  if (cp) {
    // rebuild the saved defense exactly as it stood after the last boss
    for (const s of cp.towers) {
      const t = {
        type: s.type, col: s.col, row: s.row,
        x: s.col + 0.5, y: s.row + 0.5,
        level: s.level, invested: s.invested,
        cool: 0, angle: -Math.PI / 2, target: null,
      };
      towers.push(t);
      grid[s.col + ',' + s.row] = t;
    }
  }
  enemies = []; bolts = []; shells = []; fx = []; parts = []; floats = [];
  spawnQueue = [];

  hideAllMenuScreens();
  overEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  topbarEl.classList.remove('hidden');
  leftRailEl.classList.remove('hidden');
  shopEl.classList.remove('hidden');
  $('waveBtn').classList.remove('hidden');
  closeUpgradePanel();
  resize();
  Sound.startMusic();
  updateHUD();
  updateWavePreview();
  showBanner(currentMap().name.toUpperCase(), cp ? 'resuming from checkpoint — wave ' + cp.wave : 'build turrets, then start the wave');
}

function goToMenu() {
  state.mode = 'menu';
  Sound.stopMusic();
  showMenuScreen('menu');
  overEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  topbarEl.classList.add('hidden');
  leftRailEl.classList.add('hidden');
  shopEl.classList.add('hidden');
  $('waveBtn').classList.add('hidden');
  buildMapCards();
  updateWavePreview();
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

// Home-menu navigation between the overlay screens.
$('levelSelectBtn').addEventListener('click', () => { buildMapCards(); showMenuScreen('levelSelect'); });
$('settingsBtn').addEventListener('click', () => showMenuScreen('settings'));
$('aboutBtn').addEventListener('click', () => showMenuScreen('about'));
document.querySelectorAll('[data-back]').forEach((btn) =>
  btn.addEventListener('click', () => { buildMapCards(); showMenuScreen('menu'); }));

$('startBtn').addEventListener('click', () => startGame(state.mapSelect));
$('retryBtn').addEventListener('click', () => {
  // after a win: advance to the next map; after a loss: retry this one
  // (startGame resumes from the mid-map checkpoint if one exists)
  const next = state.mapIndex + 1;
  if (state.lastVictory && next < MAPS.length && mapUnlocked(next)) startGame(next);
  else startGame(state.mapIndex);
});
$('restartBtn').addEventListener('click', () => {
  clearMapCheckpoint(state.mapIndex);
  startGame(state.mapIndex);
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
  $('autoBtn').textContent = 'AUTO'; // on/off is shown by the .on glow, not text
  $('autoBtn').classList.toggle('on', state.auto);
});

// Sound/music toggles exist in two places (main menu + in-game pause menu);
// keep all four buttons showing the same state.
function refreshAudioButtons() {
  const s = Sound.isEnabled(), m = Sound.isMusicEnabled();
  $('muteBtn').textContent = s ? '🔊 Sound On' : '🔇 Sound Off';
  $('musicBtn').textContent = m ? '🎵 Music On' : '🎵 Music Off';
  $('sfxBtnPause').textContent = s ? '🔊 Sound On' : '🔇 Sound Off';
  $('musicBtnPause').textContent = m ? '🎵 Music On' : '🎵 Music Off';
}
function toggleSfx() { Sound.setEnabled(!Sound.isEnabled()); refreshAudioButtons(); }
function toggleMusic() { Sound.setMusicEnabled(!Sound.isMusicEnabled()); refreshAudioButtons(); }
$('muteBtn').addEventListener('click', toggleSfx);
$('musicBtn').addEventListener('click', toggleMusic);
$('sfxBtnPause').addEventListener('click', toggleSfx);
$('musicBtnPause').addEventListener('click', toggleMusic);
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

  // Keep the buffed-tower outline accurate even during the build phase —
  // the combat loop below (which also sets t.buffed while applying the
  // actual damage/rate multiplier) only runs mid-wave, but a player
  // placing towers should see the effect land immediately, not just once
  // the next wave starts.
  const liveBeacons = towers.filter((tw) => TOWER_TYPES[tw.type].id === 'beacon');
  for (const tw of towers) {
    if (TOWER_TYPES[tw.type].id === 'beacon') { tw.buffed = false; continue; }
    tw.buffed = liveBeacons.some((b) => Math.hypot(b.x - tw.x, b.y - tw.y) <= towerStats(b).range);
  }

  if (state.phase !== 'wave') {
    updateParticlesOnly(dt);
    return;
  }

  state.waveTime += dt;

  // spawn
  while (spawnQueue.length && spawnQueue[0].t <= state.waveTime) {
    const next = spawnQueue.shift();
    spawnEnemy(next.type, next.path);
  }

  const map = currentMap();

  // enemies
  for (const e of enemies) {
    if (e.dead) continue;
    const ePath = enemyPath(map, e.path);
    e.s += e.speed * effSlow(e) * dt;
    if (e.s >= ePath.totalLen) { leak(e); continue; }
    const p = pathPoint(ePath, e.s);
    e.wob += dt * 6;
    e.x = p.x; e.y = p.y; e.angle = p.angle;
    // shield charges regen one at a time after 2.5s without being hit
    if (e.shieldHitsMax > 0 && e.shieldHits < e.shieldHitsMax && state.waveTime - e.lastHit > 2.5) {
      e.shieldRegen += dt;
      if (e.shieldRegen >= 0.9) { e.shieldRegen = 0; e.shieldHits++; }
    } else e.shieldRegen = 0;
  }
  enemies = enemies.filter((e) => !e.dead);

  // menders repair nearby hulls (not themselves, not each other)
  for (const m of enemies) {
    if (!m.def.heal) continue;
    const rate = m.def.heal * hpMult(state.level);
    for (const e of enemies) {
      if (e === m || e.def.heal || e.hp >= e.maxHp) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) <= m.def.healRange) e.hp = Math.min(e.maxHp, e.hp + rate * dt);
    }
    m.healPulse -= dt;
    if (m.healPulse <= 0) {
      m.healPulse = 1.1;
      fx.push({ kind: 'ring', x: m.x, y: m.y, life: 0.55, maxLife: 0.55, r: m.def.healRange, color: '#59ffb6' });
    }
  }

  // towers
  const beacons = towers.filter((t) => TOWER_TYPES[t.type].id === 'beacon');
  for (const t of towers) {
    const tty = TOWER_TYPES[t.type];
    if (tty.id === 'beacon') continue; // pure support — never targets or fires
    t.cool -= dt;
    const st = towerStats(t);
    // Command Beacon aura: deliberately does NOT stack — only the single
    // strongest beacon in range applies, so clustering several beacons on
    // one chokepoint tower can't compound into an easy power spike.
    // t.buffed just records whether one applied, for drawTower's benefit —
    // otherwise a buffed tower looks no different from an unbuffed one.
    t.buffed = false;
    let bestBuffDmg = 0, bestBuffRate = 0;
    for (const b of beacons) {
      const bst = towerStats(b);
      if (Math.hypot(b.x - t.x, b.y - t.y) > bst.range) continue;
      if (bst.buffDmg > bestBuffDmg) bestBuffDmg = bst.buffDmg;
      if (bst.buffRate > bestBuffRate) bestBuffRate = bst.buffRate;
      t.buffed = true;
    }
    st.dmg *= 1 + bestBuffDmg;
    st.rate *= 1 + bestBuffRate;
    const seesCloaked = tty.id === 'frost';
    let best = null, bestS = -1;
    for (const e of enemies) {
      if (e.dead) continue;
      if (!revealed(e) && !seesCloaked) continue;
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
// Road rendering is done in ordered layers ACROSS ALL path pieces, not
// piece-by-piece: every piece's outer glow is stroked first, then every
// piece's dark fill on top, then the chevrons. On a dual-lane map the
// pieces meet at a shared junction (see splitSharedTrunk); if a piece drew
// its own glow-then-fill before the next piece, a later piece's bright glow
// cap would paint over an earlier piece's dark fill and leave a stray
// "pill" outline poking out of the merge point. Filling everything only
// after all glows are down means the dark fills cover those internal bright
// arcs, so only the outer edge of the merged shape glows — a clean union.
function strokeRoad(map, layer) {
  // butt caps (not round): a round cap on the trunk piece where it starts
  // at the shared junction pokes a rounded "pill" out past the merged road;
  // a flat cap lets the pieces butt together seamlessly. Round line-JOINS
  // still keep every elbow corner rounded, and the outer road ends are off
  // the board edge, so nothing visible loses its rounded look.
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(px(map.pts[0].x), py(map.pts[0].y));
  for (let i = 1; i < map.pts.length; i++) ctx.lineTo(px(map.pts[i].x), py(map.pts[i].y));
  if (layer === 'glow') {
    ctx.strokeStyle = 'rgba(75, 245, 255, 0.28)';
    ctx.lineWidth = cell * 0.92;
    ctx.shadowColor = 'rgba(75,245,255,0.5)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = 'rgba(7, 9, 30, 0.94)';
    ctx.lineWidth = cell * 0.8;
    ctx.stroke();
  }
}

function drawRoadChevrons(map) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // flowing energy chevrons — a lane, not a road with lane-marking dashes.
  // Only shown during the build phase; once a wave is live there's enough
  // going on (enemies, shots, effects) that they're just clutter.
  if (state.phase !== 'wave') {
    const spacing = cell * 0.62;
    const phase = (performance.now() / 380) % spacing;
    const halfW = cell * 0.13, tip = cell * 0.17;
    // A dual-spawn map's rendered path is split into several pieces that
    // meet at shared junction points (see splitSharedTrunk) — each piece
    // still draws its own chevron run from s=0, so without this margin two
    // pieces meeting at a junction each drop a chevron right on top of it,
    // reading as one arrow pointing into another.
    const margin = spacing * 0.55;
    ctx.strokeStyle = 'rgba(75, 245, 255, 0.55)';
    ctx.lineWidth = 2;
    for (let s = phase; s < map.totalLen; s += spacing) {
      if (s < margin || s > map.totalLen - margin) continue;
      const p = pathPoint(map, s);
      ctx.save();
      ctx.translate(px(p.x), py(p.y));
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(-tip, -halfW);
      ctx.lineTo(tip * 0.4, 0);
      ctx.lineTo(-tip, halfW);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// The base at path's end — Earth, facing the Western Hemisphere, ringed by
// the defense shield the player is protecting it with.
function drawBase(map) {
  const p = pathPoint(map, map.totalLen - 0.9);
  const t = performance.now() / 1000;
  const r = cell * (0.55 + Math.sin(t * 2.4) * 0.05);
  const x = px(p.x), y = py(p.y);
  ctx.save();
  // pulsing defense-shield rings
  for (let i = 3; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(x, y, r * (0.5 + i * 0.28), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(93, 255, 176, ' + (0.38 - i * 0.09) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // ocean sphere
  const globeR = r * 0.72;
  ctx.shadowColor = '#5dffb0';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x, y, globeR, 0, Math.PI * 2);
  ctx.fillStyle = '#1f5fae';
  ctx.fill();
  ctx.shadowBlur = 0;
  // continents + clouds, clipped to the globe
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, globeR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#3ba55c';
  // North America
  ctx.beginPath();
  ctx.moveTo(x - globeR * 0.5, y - globeR * 0.55);
  ctx.lineTo(x + globeR * 0.15, y - globeR * 0.62);
  ctx.lineTo(x + globeR * 0.3, y - globeR * 0.3);
  ctx.lineTo(x - globeR * 0.05, y - globeR * 0.05);
  ctx.lineTo(x - globeR * 0.3, y - globeR * 0.1);
  ctx.closePath();
  ctx.fill();
  // South America — kept visibly separate from North America by a thin
  // strait of ocean, so the two read as distinct landmasses at a glance
  ctx.beginPath();
  ctx.moveTo(x - globeR * 0.08, y + globeR * 0.12);
  ctx.lineTo(x + globeR * 0.06, y + globeR * 0.16);
  ctx.lineTo(x + globeR * 0.12, y + globeR * 0.38);
  ctx.lineTo(x - globeR * 0.05, y + globeR * 0.65);
  ctx.lineTo(x - globeR * 0.18, y + globeR * 0.42);
  ctx.lineTo(x - globeR * 0.1, y + globeR * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(x + globeR * 0.35, y - globeR * 0.3, globeR * 0.22, globeR * 0.08, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x - globeR * 0.35, y + globeR * 0.25, globeR * 0.18, globeR * 0.07, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, globeR, 0, Math.PI * 2);
  ctx.strokeStyle = '#5dffb0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// The spawn point is a Dreadnought "carrier" that hovers ABOVE the lane and
// drops ships onto it (they materialise in the emergence pool below it — see
// the fade-in in drawEnemy), replacing the old pink saucer portal. On a boss
// wave the carrier IS the boss: it rolls in from off-board (s 0) toward the
// carrier's dock (~s 0.9); we keep drawing the carrier until the boss reaches
// it — animating a launch build-up (shudder + thruster ignition + glow surge)
// as it approaches — then hand off to the moving boss for a clean undock.
function drawPortal(map, lane) {
  const boss = enemies.find((e) => !e.dead && e.path === lane &&
    (e.type === 'boss' || e.type === 'superboss'));
  if (boss && boss.s >= 0.9) return;      // undocked — the boss IS the carrier now
  const charge = boss ? Math.min(1, boss.s / 0.9) : 0; // 0..1 launch build-up

  // carrier matches the boss this map launches: a heavier Super Dreadnought
  // on the campaign finale, a regular Dreadnought on the earlier maps
  const isFinale = state.mapIndex === MAPS.length - 1;
  const big = isFinale;
  const edge = isFinale ? '#c81c46' : '#ff5566';
  const core = isFinale ? '#ff2a3d' : '#ff5a8a';
  const r = cell * (isFinale ? 0.95 : 0.8) * (1 + charge * 0.08);

  const t = performance.now() / 1000;
  const p = pathPoint(map, 0.9);          // where ships emerge onto the lane
  const sx = px(p.x), sy = py(p.y);       // spawn point, down on the road
  const hover = cell * (1.15 + Math.sin(t * 1.6) * 0.05);
  const jx = charge * cell * 0.06 * Math.sin(t * 47); // launch shudder
  const jy = charge * cell * 0.06 * Math.cos(t * 41);
  const cx = sx + jx, cy = sy - hover + jy;           // carrier hovers above

  // deploy beam: a soft column of light from the carrier's belly down to the
  // lane, so ships read as dropping OUT of the carrier onto the road
  const beam = ctx.createLinearGradient(cx, cy, sx, sy);
  beam.addColorStop(0, 'rgba(255,90,120,' + (0.3 + charge * 0.3) + ')');
  beam.addColorStop(1, 'rgba(255,90,120,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.45, cy);
  ctx.lineTo(cx + r * 0.45, cy);
  ctx.lineTo(sx + cell * 0.3, sy);
  ctx.lineTo(sx - cell * 0.3, sy);
  ctx.closePath();
  ctx.fill();

  // emergence pool on the lane where ships materialise
  const eg = 0.4 + Math.sin(t * 4) * 0.18;
  const pool = ctx.createRadialGradient(sx, sy, 0, sx, sy, cell * 0.5);
  pool.addColorStop(0, 'rgba(255,120,150,' + eg + ')');
  pool.addColorStop(1, 'rgba(255,120,150,0)');
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.arc(sx, sy, cell * 0.5, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  // rear thruster ignition — flares up as the carrier powers to launch
  if (charge > 0) {
    const rx = -cos * r * 1.4, ry = -sin * r * 1.4, rr = r * (0.8 + charge);
    const rg = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
    rg.addColorStop(0, 'rgba(255,180,60,' + (0.6 * charge) + ')');
    rg.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
  }
  drawWarship(r, p.angle, edge, core, big);
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

// Draws a turret's identifying shape — no pad, no aim rotation, no level
// pips — into context g, centered at (0,0) at scale s. Shared by the
// on-map tower (drawTower) and the shop-card/drag-ghost icons
// (drawShopIcon) so the two can never visually drift apart: fix a shape
// once here and every place it appears updates together.
function drawTurretShape(g, ty, s, blur = 10) {
  g.shadowColor = ty.color;
  g.shadowBlur = blur; // defaults to the on-map towers' original fixed value;
  g.fillStyle = ty.color; // drawShopIcon passes a smaller one for its canvas
  switch (ty.id) {
    case 'blaster':
      // compact blaster pistol: blocky body, short barrel, bright muzzle tip
      // (kept inside the s*0.82 pad radius so it doesn't poke past the edge)
      roundRect(-s * 0.32, -s * 0.26, s * 0.5, s * 0.52, s * 0.1, g);
      g.fill();
      g.fillRect(s * 0.1, -s * 0.1, s * 0.6, s * 0.2);
      circle(s * 0.72, 0, s * 0.08, '#ffffff', g);
      break;
    case 'frost':
      // snowflake: six-pointed star with an icy core
      star(6, s * 0.48, s * 0.16, ty.color, g);
      circle(0, 0, s * 0.16, '#ffffff', g);
      break;
    case 'gatling':
      // ring of stubby barrels around a hub — reads as a spinning cluster
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.save();
        g.translate(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
        g.rotate(a);
        g.fillStyle = ty.color;
        g.fillRect(0, -s * 0.07, s * 0.34, s * 0.14);
        g.restore();
      }
      circle(0, 0, s * 0.24, ty.color, g);
      break;
    case 'mortar': {
      // wide muzzle bore with a burst of spikes around the rim
      circle(0, 0, s * 0.44, ty.color, g);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.save();
        g.translate(Math.cos(a) * s * 0.44, Math.sin(a) * s * 0.44);
        g.rotate(a);
        poly(3, s * 0.13, '#ffe74b', g);
        g.restore();
      }
      circle(0, 0, s * 0.2, '#0a0e28', g);
      break;
    }
    case 'tesla':
      // jagged lightning bolt with a bright spark core
      lightningBolt(s * 0.55, ty.color, g);
      circle(s * 0.05, 0, s * 0.12, '#ffffff', g);
      break;
    case 'rail':
      // long pierce barrel, plus a small bullseye scope mounted above it —
      // kept clear of the barrel silhouette so it reads as a scope/reticle
      // rather than a key (a ring beside or around the barrel reads as one).
      // Shortened to stay inside the s*0.82 pad radius.
      g.fillStyle = ty.color;
      g.fillRect(-s * 0.15, -s * 0.09, s * 0.85, s * 0.18);
      g.fillRect(s * 0.55, -s * 0.16, s * 0.2, s * 0.32);
      ringDonut(-s * 0.05, -s * 0.34, s * 0.16, s * 0.09, ty.color, g);
      circle(-s * 0.05, -s * 0.34, s * 0.045, '#ffffff', g);
      break;
    case 'beacon': {
      // command beacon: a core with three relay nodes slowly orbiting it,
      // always broadcasting — never aims, so this spins independently of
      // the tower's (unused) aim angle
      const spin = performance.now() / 900;
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * Math.PI * 2;
        const nx = Math.cos(a) * s * 0.42, ny = Math.sin(a) * s * 0.42;
        g.strokeStyle = ty.color;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(nx, ny);
        g.stroke();
        circle(nx, ny, s * 0.1, ty.color, g);
      }
      circle(0, 0, s * 0.22, ty.color, g);
      circle(0, 0, s * 0.1, '#ffffff', g);
      break;
    }
  }
}

// Renders a turret's shape into a small dedicated <canvas> — used for the
// shop cards and the drag ghost, so what you see there is the same shape
// and color as the tower you actually get on the board, not an unrelated
// emoji locked to whatever color the OS's emoji font happens to draw it in.
function drawShopIcon(canvasEl, ty) {
  const g = canvasEl.getContext('2d');
  const w = canvasEl.width, h = canvasEl.height;
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  drawTurretShape(g, ty, Math.min(w, h) * 0.42, 5);
  g.restore();
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

  // currently boosted by a Command Beacon — a pulsing amber outline on the
  // pad itself, so the buff has visible proof rather than being inferred
  // purely from standing inside the beacon's aura ring
  if (t.buffed) {
    const bp = 0.5 + Math.sin(performance.now() / 200) * 0.3;
    ctx.strokeStyle = 'rgba(255, 170, 51, ' + bp + ')';
    ctx.lineWidth = 2.5;
    roundRect(x - s * 0.82, y - s * 0.82, s * 1.64, s * 1.64, s * 0.3);
    ctx.stroke();
  }

  // turret (rotates toward target)
  ctx.translate(x, y);
  ctx.rotate(t.angle);
  drawTurretShape(ctx, ty, s);
  ctx.restore();

  // frost and the command beacon are auras, not aimed guns — always show
  // their reach so the player can see coverage without selecting each one.
  // Deliberately NOT a dashed ring: that pattern is reserved for the
  // placement-preview and selected-tower UI, so an aura drawn the same way
  // reads as "you're interacting with this" instead of "this is always on."
  // A soft fill + faint solid rim + a slow outward ripple reads as an
  // ambient field instead.
  if (ty.id === 'frost' || ty.id === 'beacon') {
    const rng = towerStats(t).range;
    const auraColor = ty.id === 'frost' ? '159, 216, 255' : '255, 170, 51';
    const seed = t.col * 0.37 + t.row * 0.61;
    ctx.beginPath();
    ctx.arc(x, y, rng * cell, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + auraColor + ', 0.045)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + auraColor + ', 0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const period = 2.6;
    const k = ((performance.now() / 1000 + seed * period) % period) / period;
    ctx.beginPath();
    ctx.arc(x, y, rng * cell * k, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + auraColor + ', ' + (0.4 * (1 - k)) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // level pips
  for (let i = 0; i < t.level; i++) {
    circle(x - s * 0.5 + i * s * 0.32 + s * 0.18, y + s * 0.68, 2.2, ty.color);
  }

  // selected: show range — skipped for aura towers, which already draw
  // their own persistent range visual above; adding the generic dashed
  // selection ring on top just doubles up in a mismatched color
  if (state.selected === t && ty.id !== 'frost' && ty.id !== 'beacon') {
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

// All shape helpers below take an optional trailing context `g`, defaulting
// to the main game canvas — this lets drawTurretShape() reuse the exact
// same drawing code for a small offscreen canvas (shop card icons, the
// drag ghost) as it does for the on-map tower, so the two can never
// visually drift apart again.
function roundRect(x, y, w, h, r, g = ctx) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function circle(x, y, r, color, g = ctx) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function poly(n, r, color, g = ctx) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function star(n, rOuter, rInner, color, g = ctx) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const px_ = Math.cos(a) * r, py_ = Math.sin(a) * r;
    if (i === 0) g.moveTo(px_, py_); else g.lineTo(px_, py_);
  }
  g.closePath();
  g.fill();
}

// donut ring — used for the rail cannon's targeting-reticle hub
function ringDonut(x, y, rOuter, rInner, color, g = ctx) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, rOuter, 0, Math.PI * 2);
  g.arc(x, y, rInner, 0, Math.PI * 2, true);
  g.fill('evenodd');
}

// jagged flash-bolt silhouette (long axis along local +x) for the tesla coil.
// The pinched waist near the origin (vs. the wide arm tips) is what reads as
// a lightning zigzag instead of a smooth dart once the glow blur softens it.
function lightningBolt(r, color, g = ctx) {
  const pts = [
    [0.6, -0.1], [0.05, -0.55], [0.15, -0.08],
    [-0.6, 0.1], [-0.05, 0.55], [-0.15, 0.08],
  ];
  g.fillStyle = color;
  g.beginPath();
  pts.forEach(([px_, py_], i) => {
    const X = px_ * r, Y = py_ * r;
    if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
  });
  g.closePath();
  g.fill();
}

// Shared menacing-warship silhouette, used by both the Dreadnought enemy and
// the spawn "carrier" (drawPortal). Draws at the CURRENT transform origin —
// the caller sets up translate() and its own save/restore; this only adds a
// rotate. A dark armored hull outlined in neon, a sharp prow, forward weapon
// prongs (pincers past the nose), back-swept wing blades, twin engine tails,
// and a glowing diamond core "eye". big = the heavier Super Dreadnought.
function drawWarship(r, angle, edgeColor, coreColor, big) {
  const t = performance.now() / 1000;
  const pulse = 1 + Math.sin(t * 3) * 0.05;
  const wt = (big ? 1.35 : 1.12) * pulse; // wing-blade reach
  ctx.rotate(angle);
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 6;

  // darkened hull tone derived from the neon edge color
  const cn = parseInt(edgeColor.slice(1), 16);
  const hull = 'rgb(' + (((cn >> 16 & 255) * 0.26) | 0) + ',' +
    (((cn >> 8 & 255) * 0.26) | 0) + ',' + (((cn & 255) * 0.26) | 0) + ')';

  // rear engine flares (twin tails)
  ctx.fillStyle = 'rgba(255,140,50,0.6)';
  for (const sy of [-0.34, 0.34]) {
    ctx.beginPath();
    ctx.ellipse(-r * 1.05, r * sy, r * 0.3, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // main hull — sleek dark arrow with wings swept BACK (so forward reads
  // clearly), a concave twin-tail rear notch
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(r * 1.7 * pulse, 0);            // sharp prow
  ctx.lineTo(r * 0.6, -r * 0.3);
  ctx.lineTo(-r * 0.8 * wt, -r * 1.05 * wt); // upper wing tip, swept back
  ctx.lineTo(-r * 0.5, -r * 0.34);
  ctx.lineTo(-r * 1.05, -r * 0.34);
  ctx.lineTo(-r * 0.72, 0);                  // concave rear notch
  ctx.lineTo(-r * 1.05, r * 0.34);
  ctx.lineTo(-r * 0.5, r * 0.34);
  ctx.lineTo(-r * 0.8 * wt, r * 1.05 * wt);  // lower wing tip, swept back
  ctx.lineTo(r * 0.6, r * 0.3);
  ctx.closePath();
  ctx.fill();
  // neon edge highlight
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.shadowColor = edgeColor; ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // inner plating ridges for depth
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r * 0.6, 0);
  ctx.moveTo(r * 0.25, -r * 0.5); ctx.lineTo(-r * 0.3, -r * 0.22);
  ctx.moveTo(r * 0.25, r * 0.5); ctx.lineTo(-r * 0.3, r * 0.22);
  ctx.stroke();

  // glowing diamond core "eye"
  const er = r * (big ? 0.34 : 0.28);
  ctx.fillStyle = coreColor;
  ctx.shadowColor = coreColor; ctx.shadowBlur = big ? 20 : 14;
  ctx.beginPath();
  ctx.moveTo(r * 0.12 + er, 0);
  ctx.lineTo(r * 0.12, -er * 0.72);
  ctx.lineTo(r * 0.12 - er, 0);
  ctx.lineTo(r * 0.12, er * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawEnemy(e) {
  const x = px(e.x), y = py(e.y);
  const r = e.def.radius * cell;
  const bob = Math.sin(e.wob) * r * 0.12;
  ctx.save();
  ctx.translate(x, y + bob);
  // cloaked phantoms render as a faint shimmer until slowed/revealed
  if (!revealed(e)) ctx.globalAlpha = 0.3 + Math.sin(e.wob * 1.7) * 0.12;
  // materialise out of the spawn carrier: fade in over the first stretch of
  // the lane, so ships appear IN the emergence pool below the carrier rather
  // than sliding on from off the board edge
  const emerge = Math.min(1, Math.max(0, (e.s - 0.4) / 0.8));
  if (emerge < 1) ctx.globalAlpha *= emerge;
  ctx.shadowColor = e.def.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = e.def.color;

  if (e.def.shape === 'boss' || e.def.shape === 'superboss') {
    const big = e.def.shape === 'superboss';
    const coreCol = e.enraged ? '#ffe74b' : (big ? '#ff2a3d' : '#ff5a8a');
    drawWarship(r, e.angle, e.def.color, coreCol, big);
  } else if (e.def.shape === 'hex') {
    ctx.rotate(e.angle);
    poly(6, r, e.def.color);
    circle(0, 0, r * 0.4, '#3a1c0e');
  } else if (e.def.shape === 'pentagon') {
    ctx.rotate(e.angle);
    poly(5, r, e.def.color);
    circle(0, 0, r * 0.35, '#0f1640');
  } else if (e.def.shape === 'diamond') {
    ctx.rotate(e.angle);
    ctx.beginPath();
    ctx.moveTo(r * 1.1, 0);
    ctx.lineTo(0, -r * 0.85);
    ctx.lineTo(-r * 1.1, 0);
    ctx.lineTo(0, r * 0.85);
    ctx.closePath();
    ctx.fill();
    circle(0, 0, r * 0.2, '#eaffff');
  } else if (e.def.shape === 'ring') {
    ctx.rotate(e.angle);
    ctx.strokeStyle = e.def.color;
    ctx.lineWidth = Math.max(2, r * 0.32);
    ctx.setLineDash([r * 0.35, r * 0.3]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    circle(0, 0, r * 0.22, e.def.color);
  } else if (e.def.shape === 'orb') {
    circle(0, 0, r, e.def.color);
    ctx.fillStyle = '#0b3524';
    ctx.fillRect(-r * 0.6, -r * 0.17, r * 1.2, r * 0.34);
    ctx.fillRect(-r * 0.17, -r * 0.6, r * 0.34, r * 1.2);
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

  // shield charges drawn as arc segments — one pip per remaining hit
  if (e.shieldHitsMax > 0 && e.shieldHits > 0) {
    const seg = (Math.PI * 2) / e.shieldHitsMax;
    ctx.strokeStyle = 'rgba(75, 245, 255, 0.85)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < e.shieldHits; i++) {
      ctx.beginPath();
      ctx.arc(x, y + bob, r * 1.5, i * seg + seg * 0.12, (i + 1) * seg - seg * 0.12);
      ctx.stroke();
    }
  }

  // fire shield — pulsing ember ring, gone for good once Frost extinguishes it
  if (e.fireShield) {
    const pulse = 0.55 + Math.sin(performance.now() / 180 + e.wob) * 0.25;
    ctx.beginPath();
    ctx.arc(x, y + bob, r * 1.4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 130, 40, ' + pulse + ')';
    ctx.lineWidth = 3;
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
  // renderPaths already dedupes a dual-spawn map's shared trunk (see
  // splitSharedTrunk) so it's stroked once, not once per lane. Draw in
  // layers across all pieces (all glows, then all fills, then chevrons) so
  // the pieces merge cleanly at a shared junction — see strokeRoad().
  for (const p of map.renderPaths) strokeRoad(p, 'glow');
  for (const p of map.renderPaths) strokeRoad(p, 'fill');
  for (const p of map.renderPaths) drawRoadChevrons(p);
  (map.lanes || [map]).forEach((lane, i) => drawPortal(lane, i + 1)); // each lane's own carrier
  drawBase(map); // every lane converges on the same base — one is enough

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
buildMapCards();
requestAnimationFrame(loop);

// Belt-and-suspenders zoom lock — the viewport meta tag and CSS
// touch-action already block most zoom gestures, but some browsers
// (notably older Safari, and a few Android builds) still need these
// caught directly to fully kill pinch-zoom and double-tap-zoom.
document.addEventListener('gesturestart', (ev) => ev.preventDefault());
document.addEventListener('gesturechange', (ev) => ev.preventDefault());
document.addEventListener('touchmove', (ev) => { if (ev.touches.length > 1) ev.preventDefault(); }, { passive: false });
let lastTouchEndAt = 0;
document.addEventListener('touchend', (ev) => {
  const now = Date.now();
  if (now - lastTouchEndAt < 300) ev.preventDefault();
  lastTouchEndAt = now;
}, { passive: false });

// Never show the native long-press context menu anywhere in the app — on
// a real phone this was hijacking the tower-card drag gesture entirely
// (the OS's own menu steals the touch sequence before our drag code sees
// any movement). The canvas has its own contextmenu handler with extra
// cancel-placement logic; this is the blanket fallback for everything else.
document.addEventListener('contextmenu', (ev) => ev.preventDefault());

// PWA: offline cache + installability (required for the Android TWA wrap)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* file:// or unsupported */ });
  });
}
