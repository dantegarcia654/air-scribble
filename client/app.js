const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyWrapper   = document.getElementById('lobby-wrapper');
const gameScreen     = document.getElementById('game-screen');
const nameInput      = document.getElementById('name-input');
const codeInput      = document.getElementById('code-input');
const createBtn      = document.getElementById('create-btn');
const joinBtn        = document.getElementById('join-btn');
const errorMsg       = document.getElementById('error-msg');

const pregameOverlay = document.getElementById('pregame-overlay');
const pgCode         = document.getElementById('pg-code');
const pgPlayers      = document.getElementById('pg-players');
const pgStatus       = document.getElementById('pg-status');
const startBtn       = document.getElementById('start-btn');

const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutWebcam       = document.getElementById('tut-webcam');
const tutIcon         = document.getElementById('tut-icon');
const tutTitle        = document.getElementById('tut-title');
const tutDesc         = document.getElementById('tut-desc');
const tutDots         = document.getElementById('tut-dots');
const tutNextBtn      = document.getElementById('tut-next-btn');
const tutSkipBtn      = document.getElementById('tut-skip-btn');
const tutWaiting      = document.getElementById('tut-waiting');

const toolbar        = document.getElementById('toolbar');
const riCode         = document.getElementById('ri-code');
const riPlayers      = document.getElementById('ri-players');
const timerDisplay   = document.getElementById('timer-display');
const timerNum       = document.getElementById('timer-num');
const wordDisplay    = document.getElementById('word-display');
const scoreboard     = document.getElementById('scoreboard');
const guessArea      = document.getElementById('guess-area');
const guessInput     = document.getElementById('guess-input');
const bubblesArea    = document.getElementById('bubbles-area');
const roundOverlay   = document.getElementById('round-overlay');
const roundMsg       = document.getElementById('round-msg');
const winnerScreen   = document.getElementById('winner-screen');
const winnerTitle    = document.getElementById('winner-title');
const winnerSubtitle = document.getElementById('winner-subtitle');
const winnerScores   = document.getElementById('winner-scores');
const sessionWinsEl  = document.getElementById('session-wins');
const invitePanel    = document.getElementById('invite-panel');
const inviteCode     = document.getElementById('invite-code');
const inviteBtn      = document.getElementById('invite-btn');
const playAgainBtn   = document.getElementById('play-again-btn');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const confettiCanvas = document.getElementById('confetti-canvas');

const video         = document.getElementById('webcam');
const paintCanvas   = document.getElementById('paintCanvas');
const overlayCanvas = document.getElementById('overlay');
const streamCanvas  = document.getElementById('streamCanvas');
const pCtx  = paintCanvas.getContext('2d');
const oCtx  = overlayCanvas.getContext('2d');
const cfCtx = confettiCanvas.getContext('2d');
const sCtx  = streamCanvas.getContext('2d');

// ── Hand skeleton connections ─────────────────────────────────────────────────
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

// ── Constants ─────────────────────────────────────────────────────────────────
const DRAW_STABILIZE  = 5;
const HOVER_STABILIZE = 5;
const FIST_CLEAR      = 45;
const GESTURE_FIRE    = 15;
const SCREENSHOT_FIRE = 75;
const REPEAT_INTERVAL = 12;
const MIN_BRUSH       = 2;
const MAX_BRUSH       = 20;
const TOAST_MS        = 2200;
const WIN_SCORE       = 5;

// ── Color config ──────────────────────────────────────────────────────────────
const COLOR_ORDER = ['#3b82f6', '#ef4444', '#22c55e', '#facc15', '#a855f7'];
const COLOR_NAMES = { '#3b82f6':'Blue', '#ef4444':'Red', '#22c55e':'Green', '#facc15':'Yellow', '#a855f7':'Purple' };

// ── Drawing state ─────────────────────────────────────────────────────────────
let activeColor = '#3b82f6';
let isErasing   = false;
let isDrawing   = false;
let lastPos     = null;
let brushSize   = 5;

// ── Gesture state ─────────────────────────────────────────────────────────────
let drawFrames  = 0;
let hoverFrames = 0;

const gState = {
  fist:         { frames: 0, fired: false },
  threeFingers: { frames: 0, fired: false },
  peace:        { frames: 0, fired: false },
  middleFinger: { frames: 0, fired: false },
  pinkyUp:      { frames: 0, fired: false },
};

const CONTINUOUS_GESTURES = new Set(['threeFingers', 'middleFinger', 'pinkyUp']);

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastText    = '';
let toastEndTime = 0;
function showToast(text) { toastText = text; toastEndTime = Date.now() + TOAST_MS; }

// ── Room / game state ─────────────────────────────────────────────────────────
let myRoomCode      = null;
let isCreator       = false;
let amDrawer        = false;
let gameActive      = false;
let currentDrawerId = null;
let lobbyPlayers    = [];
let lobbyCreatorId  = null;

// ── Camera / broadcast state ──────────────────────────────────────────────────
let mpCamera      = null;
let cameraActive  = true;  // false → skip hands.send() without stopping the stream
let frameInterval = null;

const captureCanvas = document.createElement('canvas');
const captureCtx = captureCanvas.getContext('2d');

// ── Session wins tracker ──────────────────────────────────────────────────────
const sessionWins = {};

// ── Tutorial state ────────────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  { icon: '☝️', title: 'Draw',         desc: 'Point your index finger up to draw on the canvas.' },
  { icon: '🤚', title: 'Hover',        desc: 'Open your palm to hover and rest without drawing.' },
  { icon: '✌️', title: 'Cycle Colors', desc: 'Hold a peace sign to cycle through drawing colors.' },
  { icon: '✊', title: 'Clear Canvas', desc: 'Hold a fist for 1.5 seconds to wipe the canvas clean.' },
  { icon: '⌨️', title: 'Guess',        desc: 'Type your guess in the box at the bottom and press Enter.' },
  { icon: '🏆', title: 'Win',          desc: `First player to ${WIN_SCORE} points wins the game!` },
];

let tutStep = 0;
let tutDone = false;

// ── Screen transition helpers ─────────────────────────────────────────────────
function showEl(el) {
  el.classList.remove('hidden', 'screen-exit', 'fade-exit');
  void el.offsetWidth; // force reflow so animation restarts
  el.classList.add('screen-enter');
}

function hideEl(el, cb) {
  el.classList.remove('screen-enter', 'fade-enter');
  void el.offsetWidth;
  el.classList.add('screen-exit');
  const done = () => {
    el.classList.add('hidden');
    el.classList.remove('screen-exit');
    cb?.();
  };
  // Fall back to immediate hide if animation doesn't fire
  const t = setTimeout(done, 280);
  el.addEventListener('animationend', () => { clearTimeout(t); done(); }, { once: true });
}

function showElFade(el) {
  el.classList.remove('hidden', 'screen-exit', 'fade-exit');
  void el.offsetWidth;
  el.classList.add('fade-enter');
}

// ── Canvas sizing ─────────────────────────────────────────────────────────────
function resizeCanvases() {
  paintCanvas.width  = overlayCanvas.width  = streamCanvas.width  = window.innerWidth;
  paintCanvas.height = overlayCanvas.height = streamCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvases);

// ── Coordinate mapping ────────────────────────────────────────────────────────
function toScreen(lm) {
  const vw = video.videoWidth  || 1280;
  const vh = video.videoHeight || 720;
  const cw = overlayCanvas.width;
  const ch = overlayCanvas.height;
  const scale = Math.max(cw / vw, ch / vh);
  const rw = vw * scale, rh = vh * scale;
  const ox = (cw - rw) / 2, oy = (ch - rh) / 2;
  return { x: (1 - lm.x) * rw + ox, y: lm.y * rh + oy };
}

// ── Gesture classification ────────────────────────────────────────────────────
function isFingerUp(lm, tip, pip) { return lm[tip].y < lm[pip].y; }

function getFingers(lm) {
  return {
    index:  isFingerUp(lm, 8,  6),
    middle: isFingerUp(lm, 12, 10),
    ring:   isFingerUp(lm, 16, 14),
    pinky:  isFingerUp(lm, 20, 18),
  };
}

function classifyGesture(lm) {
  const f = getFingers(lm);
  const noFour = !f.index && !f.middle && !f.ring && !f.pinky;
  if (f.index && f.middle && f.ring  && !f.pinky)  return 'threeFingers';
  if (f.index && f.middle && !f.ring && !f.pinky)  return 'peace';
  if (!f.index && f.middle && !f.ring && !f.pinky) return 'middleFinger';
  if (!f.index && !f.middle && !f.ring && f.pinky) return 'pinkyUp';
  if (noFour)                                       return 'fist';
  if (f.index && !f.middle && !f.ring && !f.pinky) return 'draw';
  return 'hover';
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
let prevHoveredBtn = null;

function hitTestToolbar(screenPos) {
  for (const btn of document.querySelectorAll('.tool-btn')) {
    const r = btn.getBoundingClientRect();
    if (screenPos.x >= r.left && screenPos.x <= r.right &&
        screenPos.y >= r.top  && screenPos.y <= r.bottom) return btn;
  }
  return null;
}

function updateToolbarHover(btn) {
  if (btn === prevHoveredBtn) return;
  if (prevHoveredBtn) prevHoveredBtn.classList.remove('hovered');
  if (btn) btn.classList.add('hovered');
  prevHoveredBtn = btn;
}

function selectColor(color) {
  if (color === activeColor) return;
  activeColor = color;
  isErasing   = (color === 'eraser');
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.color === color));
}

// ── Actions ───────────────────────────────────────────────────────────────────
function clearCanvas() {
  if (!amDrawer) return;
  pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  socket.emit('clear-canvas');
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'c' || e.key === 'C') && amDrawer) clearCanvas();
});

function cycleColor() {
  const next = COLOR_ORDER[(COLOR_ORDER.indexOf(activeColor) + 1) % COLOR_ORDER.length];
  selectColor(next);
  showToast(COLOR_NAMES[next]);
}

function adjustBrush(delta) {
  brushSize = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, brushSize + delta));
  showToast(`Brush: ${brushSize}px`);
}

function captureScreenshot() {
  const temp = document.createElement('canvas');
  temp.width = paintCanvas.width; temp.height = paintCanvas.height;
  const tCtx = temp.getContext('2d');
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const sc = Math.max(temp.width / vw, temp.height / vh);
  const rw = vw * sc, rh = vh * sc;
  const ox = (temp.width - rw) / 2, oy = (temp.height - rh) / 2;
  tCtx.save(); tCtx.translate(ox + rw, oy); tCtx.scale(-1, 1);
  tCtx.drawImage(video, 0, 0, rw, rh); tCtx.restore();
  tCtx.drawImage(paintCanvas, 0, 0);
  temp.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'scwibble.png'; a.href = url; a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
  showToast('Screenshot saved!');
}

// ── Stroke drawing ────────────────────────────────────────────────────────────
function applyStrokeToCtx(ctx, from, to, color, bs, ie) {
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  if (ie) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = 40;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth   = bs;
  }
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.restore();
}

function drawStroke(from, to) {
  applyStrokeToCtx(pCtx, from, to, activeColor, brushSize, isErasing);
  socket.emit('draw-stroke', {
    from: { x: from.x / paintCanvas.width,  y: from.y / paintCanvas.height },
    to:   { x: to.x   / paintCanvas.width,  y: to.y   / paintCanvas.height },
    color: activeColor, brushSize, isErasing,
  });
}

// ── Overlay rendering ─────────────────────────────────────────────────────────
function drawSkeleton(lm) {
  oCtx.strokeStyle = 'rgba(0,180,100,0.6)';
  oCtx.lineWidth   = 1.8;
  oCtx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    const p1 = toScreen(lm[a]), p2 = toScreen(lm[b]);
    oCtx.moveTo(p1.x, p1.y); oCtx.lineTo(p2.x, p2.y);
  }
  oCtx.stroke();
  for (const pt of lm) {
    const { x, y } = toScreen(pt);
    oCtx.beginPath(); oCtx.arc(x, y, 3.5, 0, Math.PI * 2);
    oCtx.fillStyle = 'rgba(255,255,255,0.9)'; oCtx.fill();
    oCtx.strokeStyle = 'rgba(0,160,80,0.8)'; oCtx.lineWidth = 1.5; oCtx.stroke();
  }
}

function drawProgressRing(cx, cy, radius, progress, strokeColor, label, sublabel) {
  const alpha = 0.5 + 0.5 * progress;
  oCtx.save();
  oCtx.beginPath(); oCtx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
  oCtx.fillStyle = `rgba(255,255,255,${0.88 * progress + 0.08})`; oCtx.fill();
  oCtx.beginPath(); oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  oCtx.strokeStyle = 'rgba(0,0,0,0.08)'; oCtx.lineWidth = 6; oCtx.stroke();
  oCtx.beginPath();
  oCtx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  oCtx.strokeStyle = strokeColor; oCtx.lineWidth = 6; oCtx.lineCap = 'round'; oCtx.stroke();
  oCtx.font = 'bold 15px system-ui,sans-serif'; oCtx.textAlign = 'center'; oCtx.textBaseline = 'middle';
  oCtx.fillStyle = `rgba(17,17,17,${alpha})`; oCtx.fillText(label, cx, cy);
  if (sublabel) {
    oCtx.font = '12px system-ui,sans-serif';
    oCtx.fillStyle = `rgba(80,80,80,${alpha})`;
    oCtx.fillText(sublabel, cx, cy + radius + 16);
  }
  oCtx.restore();
}

function drawFistProgress(frames) {
  const cx = overlayCanvas.width / 2, cy = overlayCanvas.height / 2;
  drawProgressRing(cx, cy, 64, frames / FIST_CLEAR,
    `rgba(220,38,38,${0.5 + 0.5 * frames / FIST_CLEAR})`,
    `${Math.round((frames / FIST_CLEAR) * 100)}%`, 'hold fist to clear');
}

const GESTURE_META = {
  threeFingers: { label: 'next color', color: '#5bb8f5', hint: '3 fingers → cycle' },
  peace:        { label: 'capture',    color: '#f59e0b', hint: 'peace → screenshot' },
  middleFinger: { label: 'brush +',   color: '#22c55e', hint: 'middle → size up'  },
  pinkyUp:      { label: 'brush −',   color: '#f87171', hint: 'pinky → size down' },
};

function drawGestureProgress(gesture, frames, threshold) {
  const { label, color, hint } = GESTURE_META[gesture];
  const cx = overlayCanvas.width / 2, cy = overlayCanvas.height / 2;
  drawProgressRing(cx, cy, 48, Math.min(frames / threshold, 1), color, label, hint);
}

function drawCursor(pos, drawing) {
  oCtx.save();
  oCtx.beginPath(); oCtx.arc(pos.x, pos.y, drawing ? 11 : 7, 0, Math.PI * 2);
  if (drawing) {
    oCtx.fillStyle   = isErasing ? 'rgba(255,255,255,0.35)' : activeColor + '40'; oCtx.fill();
    oCtx.strokeStyle = isErasing ? '#333' : activeColor; oCtx.lineWidth = 2.5;
  } else {
    oCtx.strokeStyle = 'rgba(17,17,17,0.45)'; oCtx.lineWidth = 2;
  }
  oCtx.stroke(); oCtx.restore();
}

function drawToast() {
  if (!toastText || Date.now() >= toastEndTime) return;
  const alpha = Math.min(1, (toastEndTime - Date.now()) / 350);
  const cx = overlayCanvas.width / 2, cy = overlayCanvas.height - 108;
  oCtx.save();
  oCtx.font = '600 16px system-ui,sans-serif'; oCtx.textAlign = 'center'; oCtx.textBaseline = 'middle';
  const tw = oCtx.measureText(toastText).width + 32, th = 38;
  oCtx.fillStyle = `rgba(255,255,255,${0.94 * alpha})`;
  oCtx.strokeStyle = `rgba(0,0,0,${0.07 * alpha})`; oCtx.lineWidth = 1;
  oCtx.beginPath(); oCtx.roundRect(cx - tw / 2, cy - th / 2, tw, th, 19);
  oCtx.fill(); oCtx.stroke();
  oCtx.fillStyle = `rgba(17,17,17,${alpha})`; oCtx.fillText(toastText, cx, cy);
  oCtx.restore();
}

function drawBrushIndicator() {
  if (!amDrawer) return;
  const cx = 34, cy = overlayCanvas.height - 40;
  oCtx.save();
  oCtx.fillStyle = 'rgba(255,255,255,0.92)';
  oCtx.strokeStyle = 'rgba(0,0,0,0.09)'; oCtx.lineWidth = 1;
  oCtx.beginPath(); oCtx.roundRect(cx - 22, cy - 30, 44, 52, 8);
  oCtx.fill(); oCtx.stroke();
  oCtx.beginPath(); oCtx.arc(cx, cy - 10, Math.max(brushSize / 2, 2), 0, Math.PI * 2);
  oCtx.fillStyle = isErasing ? 'rgba(0,0,0,0.12)' : activeColor; oCtx.fill();
  oCtx.font = 'bold 10px system-ui,sans-serif'; oCtx.textAlign = 'center'; oCtx.textBaseline = 'middle';
  oCtx.fillStyle = 'rgba(80,80,80,0.9)'; oCtx.fillText(`${brushSize}px`, cx, cy + 15);
  oCtx.restore();
}

// ── Main frame handler ────────────────────────────────────────────────────────
function onResults(results) {
  oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  drawBrushIndicator();
  drawToast();

  if (!results.multiHandLandmarks?.length) {
    drawFrames = hoverFrames = 0;
    for (const g of Object.values(gState)) { g.frames = 0; g.fired = false; }
    isDrawing = false; lastPos = null;
    updateToolbarHover(null);
    return;
  }

  const lm      = results.multiHandLandmarks[0];
  const tipPos  = toScreen(lm[8]);
  const gesture = classifyGesture(lm);

  for (const [key, g] of Object.entries(gState)) {
    if (key !== gesture) { g.frames = 0; g.fired = false; }
  }

  if (gesture === 'draw') {
    drawFrames  = Math.min(drawFrames + 1, DRAW_STABILIZE);
    hoverFrames = 0;
  } else {
    hoverFrames = Math.min(hoverFrames + 1, HOVER_STABILIZE);
    drawFrames  = 0;
  }

  if (drawFrames  >= DRAW_STABILIZE)                    isDrawing = true;
  if (hoverFrames >= HOVER_STABILIZE && isDrawing) { isDrawing = false; lastPos = null; }

  if (gesture in gState) {
    const g = gState[gesture];
    const threshold = gesture === 'fist'  ? FIST_CLEAR
                    : gesture === 'peace' ? SCREENSHOT_FIRE
                    : GESTURE_FIRE;
    g.frames++;

    if (CONTINUOUS_GESTURES.has(gesture)) {
      if (g.frames >= threshold && (g.frames - threshold) % REPEAT_INTERVAL === 0) {
        if (gesture === 'threeFingers' && amDrawer) cycleColor();
        if (gesture === 'middleFinger' && amDrawer) adjustBrush(+2);
        if (gesture === 'pinkyUp'      && amDrawer) adjustBrush(-2);
      }
      if (g.frames < threshold && amDrawer) drawGestureProgress(gesture, g.frames, threshold);
    } else {
      if (!g.fired && g.frames >= threshold) {
        g.fired = true;
        if (gesture === 'fist'  && amDrawer) clearCanvas();
        if (gesture === 'peace')             captureScreenshot();
      }
      if (!g.fired && g.frames > 0 && amDrawer) {
        gesture === 'fist' ? drawFistProgress(g.frames) : drawGestureProgress(gesture, g.frames, threshold);
      }
    }
  }

  const isActiveGesture = gesture !== 'draw' && gesture !== 'hover';
  let overToolbar = false;

  if (!isActiveGesture && amDrawer) {
    const hitBtn = hitTestToolbar(tipPos);
    updateToolbarHover(hitBtn);
    if (hitBtn) { selectColor(hitBtn.dataset.color); overToolbar = true; lastPos = null; }
  } else {
    updateToolbarHover(null);
  }

  if (isDrawing && !overToolbar && amDrawer && gameActive) {
    if (lastPos) drawStroke(lastPos, tipPos);
    lastPos = { ...tipPos };
  } else if (!isDrawing || !amDrawer) {
    lastPos = null;
  }

  drawSkeleton(lm);
  drawCursor(tipPos, isDrawing && !overToolbar && amDrawer && gameActive);
}

// ── MediaPipe setup ───────────────────────────────────────────────────────────
function startMediaPipe() {
  const hands = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  hands.onResults(onResults);

  mpCamera = new Camera(video, {
    onFrame: async () => {
      if (cameraActive) await hands.send({ image: video });
    },
    width: 1280, height: 720,
  });
  mpCamera.start().catch(() => showToast('Camera access denied — reload and allow camera.'));
}

function stopCamera() {
  cameraActive = false;
  oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function resumeCamera() {
  cameraActive = true;
}

function showWebcam() {
  video.style.display = '';
  streamCanvas.style.display = 'none';
}

function showStream() {
  video.style.display = 'none';
  streamCanvas.style.display = 'none';
}

function captureAndEmitFrame() {
  if (!amDrawer || !gameActive) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  console.log('[capture] readyState:', video.readyState, 'vw:', vw, 'vh:', vh);
  if (!vw || !vh || video.readyState < 2) return;

  if (captureCanvas.width !== vw || captureCanvas.height !== vh) {
    captureCanvas.width  = vw;
    captureCanvas.height = vh;
  }

  captureCtx.save();
  captureCtx.translate(vw, 0);
  captureCtx.scale(-1, 1);
  captureCtx.drawImage(video, 0, 0, vw, vh);
  captureCtx.restore();

  captureCtx.drawImage(paintCanvas, 0, 0, vw, vh);

  socket.emit('canvas-frame', captureCanvas.toDataURL('image/jpeg', 0.35));
}

function startFrameBroadcast() {
  stopFrameBroadcast();
  const begin = () => {
    if (amDrawer && gameActive) frameInterval = setInterval(captureAndEmitFrame, 100);
  };
  if (video.readyState >= 2 && video.videoWidth > 0) {
    begin();
  } else {
    video.addEventListener('canplay', begin, { once: true });
  }
}

function stopFrameBroadcast() {
  if (frameInterval) { clearInterval(frameInterval); frameInterval = null; }
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function getInitials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ── Tutorial ──────────────────────────────────────────────────────────────────
function renderTutStep(step) {
  const s = TUTORIAL_STEPS[step];
  tutIcon.textContent  = s.icon;
  tutTitle.textContent = s.title;
  tutDesc.textContent  = s.desc;

  tutDots.innerHTML = TUTORIAL_STEPS.map((_, i) => {
    const cls = i < step ? 'tut-dot done' : i === step ? 'tut-dot active' : 'tut-dot';
    return `<div class="${cls}"></div>`;
  }).join('');

  tutNextBtn.textContent = step === TUTORIAL_STEPS.length - 1 ? 'finish ✓' : 'next →';

  // Re-trigger step animations
  [tutIcon, tutTitle, tutDesc].forEach(el => {
    el.classList.remove('screen-enter');
    void el.offsetWidth;
    el.classList.add('screen-enter');
  });
}

function completeTutorial() {
  if (tutDone) return;
  tutDone = true;
  tutNextBtn.classList.add('hidden');
  tutSkipBtn.classList.add('hidden');
  tutWaiting.classList.remove('hidden');
  tutWaiting.textContent = 'waiting for other players…';
  socket.emit('tutorial-ready');
}

tutNextBtn.addEventListener('click', () => {
  if (tutStep < TUTORIAL_STEPS.length - 1) {
    tutStep++;
    renderTutStep(tutStep);
  } else {
    completeTutorial();
  }
});

tutSkipBtn.addEventListener('click', completeTutorial);

socket.on('tutorial-progress', ({ ready, total }) => {
  if (!tutDone) return;
  tutWaiting.textContent = `waiting for other players… (${ready}/${total})`;
});

// ── Session wins ──────────────────────────────────────────────────────────────
function renderSessionWins(scores) {
  const totalWins = Object.values(sessionWins).reduce((a, b) => a + b, 0);
  if (totalWins === 0) {
    sessionWinsEl.classList.add('hidden');
    return;
  }
  sessionWinsEl.classList.remove('hidden');
  sessionWinsEl.innerHTML = `
    <p class="session-wins-label">session wins</p>
    <div class="session-wins-row">
      ${scores.map(s => `
        <div class="sw-player">
          <div class="sw-avatar">${getInitials(s.name)}</div>
          <div class="sw-crown">
            ${sessionWins[s.name]
              ? `👑 <span>${sessionWins[s.name]}</span>`
              : `<span class="sw-zero">—</span>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Pregame overlay ───────────────────────────────────────────────────────────
function renderPregamePlayers(players, creatorId) {
  lobbyPlayers   = players;
  lobbyCreatorId = creatorId;

  const rows = players.map(p => `
    <li class="player-item">
      <div class="avatar">${getInitials(p.name)}</div>
      <span class="player-name">${p.name}</span>
      ${p.id === creatorId ? '<span class="host-badge">host</span>' : ''}
    </li>
  `);

  if (players.length < 2) {
    rows.push(`
      <li class="player-item player-empty">
        <div class="avatar avatar-empty"></div>
        <span class="player-name-empty">waiting for a friend…</span>
      </li>
    `);
  }

  pgPlayers.innerHTML = rows.join('');

  const canStart = isCreator && players.length >= 2;
  startBtn.classList.toggle('hidden', !canStart);
  pgStatus.textContent = isCreator
    ? (players.length < 2 ? 'need at least 2 players to start' : '')
    : 'waiting for the host to start…';
}

// ── Scoreboard ────────────────────────────────────────────────────────────────
function renderScoreboard(scores) {
  scoreboard.innerHTML = scores.map(s => `
    <div class="score-row${s.id === currentDrawerId ? ' is-drawer' : ''}">
      <span class="score-name">${s.name}</span>
      <span class="score-pips">${
        Array.from({ length: WIN_SCORE }, (_, i) =>
          `<span class="${i < s.score ? 'pip-on' : 'pip-off'}">●</span>`
        ).join('')
      }</span>
    </div>
  `).join('');
}

// ── Guess bubbles ─────────────────────────────────────────────────────────────
function spawnBubble(playerName, guess, isCorrect) {
  const el = document.createElement('div');
  el.className = `bubble${isCorrect ? ' bubble-correct' : ''}`;
  el.innerHTML = `<span class="bubble-name">${playerName}</span> ${isCorrect ? '✓ ' : ''}${guess}`;

  // Random horizontal position (32–68% of viewport width), centered on that point
  const leftPct = 32 + Math.random() * 36;
  el.style.left = `${leftPct}%`;

  // Slightly randomized float duration
  const dur = 4.8 + Math.random() * 1.8;
  el.style.setProperty('--bdur', `${dur}s`);

  bubblesArea.appendChild(el);
  setTimeout(() => el.remove(), (dur + 0.5) * 1000);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function updateTimer(t) {
  timerNum.textContent = t;
  timerDisplay.classList.toggle('urgent', t <= 10);
}

// ── Confetti ──────────────────────────────────────────────────────────────────
let confettiRaf   = null;
let confettiParts = [];
const CF_COLORS   = ['#5bb8f5', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#f97316'];

function startConfetti() {
  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confettiParts = Array.from({ length: 130 }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: -20 - Math.random() * 200,
    w: 6 + Math.random() * 8, h: 4 + Math.random() * 5,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3.5,
    rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 7,
    color: CF_COLORS[Math.floor(Math.random() * CF_COLORS.length)],
  }));

  (function draw() {
    cfCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    for (const p of confettiParts) {
      cfCtx.save();
      cfCtx.translate(p.x, p.y); cfCtx.rotate(p.rot * Math.PI / 180);
      cfCtx.fillStyle = p.color; cfCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cfCtx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
      if (p.y > confettiCanvas.height + 20) { p.y = -20; p.x = Math.random() * confettiCanvas.width; }
    }
    confettiRaf = requestAnimationFrame(draw);
  })();
}

function stopConfetti() {
  if (confettiRaf) { cancelAnimationFrame(confettiRaf); confettiRaf = null; }
  cfCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

// ── Lobby UI ──────────────────────────────────────────────────────────────────
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
});

function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); }
function clearError()   { errorMsg.classList.add('hidden'); }
function getName()      { return nameInput.value.trim(); }

function enterGame(code, players, creatorId) {
  myRoomCode = code;

  hideEl(lobbyWrapper, () => {
    gameScreen.classList.remove('hidden');
    showEl(pregameOverlay);
  });

  riCode.textContent    = code;
  riPlayers.textContent = `${players.length} player${players.length !== 1 ? 's' : ''}`;

  pgCode.textContent = code;
  renderPregamePlayers(players, creatorId);

  resizeCanvases();
  startMediaPipe();
}

createBtn.addEventListener('click', () => {
  const name = getName();
  if (!name) return showError('enter your name first');
  clearError();
  socket.emit('create-room', { name }, ({ code, players, creatorId, error }) => {
    if (error) return showError(error);
    isCreator = true;
    enterGame(code, players, creatorId);
  });
});

joinBtn.addEventListener('click', () => {
  const name = getName();
  const code = codeInput.value.trim();
  if (!name)             return showError('enter your name first');
  if (code.length !== 4) return showError('room code must be 4 letters');
  clearError();
  socket.emit('join-room', { name, code }, ({ code: joined, players, creatorId, error }) => {
    if (error) return showError(error);
    isCreator = false;
    enterGame(joined, players, creatorId);
  });
});

startBtn.addEventListener('click', () => socket.emit('start-game'));

document.getElementById('room-info').addEventListener('click', () => {
  if (!myRoomCode) return;
  navigator.clipboard.writeText(myRoomCode).then(() => showToast('code copied!'));
});

// ── Invite button ─────────────────────────────────────────────────────────────
inviteBtn.addEventListener('click', () => {
  const isHidden = invitePanel.classList.contains('hidden');
  if (isHidden) {
    inviteCode.textContent = myRoomCode;
    showEl(invitePanel);
    inviteBtn.textContent = 'hide invite';
  } else {
    invitePanel.classList.add('hidden');
    inviteBtn.textContent = 'invite a friend +';
  }
});

// ── Socket: room events ───────────────────────────────────────────────────────
socket.on('player-joined', ({ players, creatorId }) => {
  // Detect who just joined (not in current lobbyPlayers)
  const prevIds = new Set(lobbyPlayers.map(p => p.id));
  const newPlayer = players.find(p => !prevIds.has(p.id));

  lobbyPlayers   = players;
  lobbyCreatorId = creatorId;
  riPlayers.textContent = `${players.length} player${players.length !== 1 ? 's' : ''}`;

  // Toast if a new player joined while on winner screen
  if (newPlayer && !winnerScreen.classList.contains('hidden')) {
    showToast(`${newPlayer.name} joined the room`);
  }

  if (!gameActive) renderPregamePlayers(players, creatorId);
});

socket.on('player-left', ({ players, creatorId }) => {
  lobbyPlayers   = players;
  lobbyCreatorId = creatorId;
  riPlayers.textContent = `${players.length} player${players.length !== 1 ? 's' : ''}`;
  if (!gameActive) renderPregamePlayers(players, creatorId);
  else             renderScoreboard(players.map(p => ({ id: p.id, name: p.name, score: p.score })));
});

// ── Socket: game events ───────────────────────────────────────────────────────
socket.on('game-started', ({ players, showTutorial }) => {
  stopConfetti();
  stopFrameBroadcast();
  resumeCamera();
  showWebcam();
  pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  winnerScreen.classList.add('hidden');
  invitePanel.classList.add('hidden');
  inviteBtn.textContent = 'invite a friend +';
  roundOverlay.classList.add('hidden');
  gameActive = true;
  scoreboard.classList.remove('hidden');
  renderScoreboard(players.map(p => ({ ...p, score: 0 })));

  if (showTutorial) {
    hideEl(pregameOverlay, () => {
      tutStep = 0;
      tutDone = false;
      tutNextBtn.classList.remove('hidden');
      tutSkipBtn.classList.remove('hidden');
      tutWaiting.classList.add('hidden');
      renderTutStep(0);
      // Mirror the camera stream into the tutorial webcam preview
      tutWebcam.srcObject = video.srcObject;
      showElFade(tutorialOverlay);
    });
  } else {
    pregameOverlay.classList.add('hidden');
    // startRound already called server-side for non-first games
  }
});

socket.on('round-start', ({ drawerId, drawerName, timeLeft, scores }) => {
  currentDrawerId = drawerId;
  amDrawer        = (drawerId === socket.id);

  // Manage camera and stream based on role
  if (amDrawer) {
    showWebcam();
    resumeCamera();
    pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    startFrameBroadcast();
  } else {
    stopFrameBroadcast();
    stopCamera();
    showStream();
    pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  }

  // Hide tutorial overlay if it's up
  if (!tutorialOverlay.classList.contains('hidden')) {
    hideEl(tutorialOverlay);
  }

  roundOverlay.classList.add('hidden');
  timerDisplay.classList.remove('hidden');
  wordDisplay.classList.remove('hidden');

  toolbar.classList.toggle('hidden', !amDrawer);
  guessArea.classList.toggle('hidden', amDrawer);
  if (!amDrawer) { guessInput.value = ''; guessInput.focus(); }

  wordDisplay.textContent = amDrawer ? '…' : `${drawerName} is drawing!`;
  updateTimer(timeLeft);
  renderScoreboard(scores);

  // Reset brush to defaults each round
  isDrawing = false; lastPos = null;
  activeColor = '#3b82f6'; isErasing = false;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.color === '#3b82f6'));
});

socket.on('your-word', ({ word }) => {
  wordDisplay.innerHTML = `draw: <strong>${word}</strong>`;
});

socket.on('tick', ({ timeLeft }) => updateTimer(timeLeft));

socket.on('guess-bubble', ({ playerName, guess, isCorrect }) => {
  spawnBubble(playerName, guess, isCorrect);
});

socket.on('round-end', ({ word, reason, guesserName, scores }) => {
  amDrawer = false;
  toolbar.classList.add('hidden');
  guessArea.classList.add('hidden');
  timerDisplay.classList.add('hidden');
  wordDisplay.classList.add('hidden');

  let msg = '';
  if (reason === 'correct') {
    msg = `✓ <strong>${guesserName}</strong> got it!<br>the word was <strong>${word}</strong>`;
  } else if (reason === 'timeout') {
    msg = `⏰ time's up!<br>the word was <strong>${word}</strong>`;
  } else {
    msg = `the drawer left.<br>the word was <strong>${word}</strong>`;
  }

  roundMsg.innerHTML = msg;
  showElFade(roundOverlay);
  renderScoreboard(scores);
});

socket.on('game-over', ({ winner, scores }) => {
  gameActive = false; amDrawer = false;
  toolbar.classList.add('hidden');
  guessArea.classList.add('hidden');
  timerDisplay.classList.add('hidden');
  wordDisplay.classList.add('hidden');
  roundOverlay.classList.add('hidden');
  scoreboard.classList.add('hidden');

  // Keep lobbyPlayers current for "back to lobby"
  lobbyPlayers = scores.map(s => ({ id: s.id, name: s.name }));

  // Track session wins
  sessionWins[winner] = (sessionWins[winner] || 0) + 1;

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  winnerTitle.textContent    = `${winner} wins!`;
  winnerSubtitle.textContent = `first to ${WIN_SCORE} points`;

  winnerScores.innerHTML = sorted.map((s, i) => `
    <div class="ws-row${i === 0 ? ' ws-winner' : ''}">
      <span>${s.name}</span>
      <span class="ws-pts">${s.score} pt${s.score !== 1 ? 's' : ''}</span>
    </div>
  `).join('');

  renderSessionWins(scores);

  playAgainBtn.classList.toggle('hidden', !isCreator);
  invitePanel.classList.add('hidden');
  inviteBtn.textContent = 'invite a friend +';

  stopFrameBroadcast();
  resumeCamera();
  showWebcam();

  showEl(winnerScreen);
  startConfetti();
});

socket.on('game-aborted', ({ reason }) => {
  gameActive = false; amDrawer = false;
  toolbar.classList.add('hidden');
  guessArea.classList.add('hidden');
  timerDisplay.classList.add('hidden');
  wordDisplay.classList.add('hidden');
  roundOverlay.classList.add('hidden');
  scoreboard.classList.add('hidden');
  tutorialOverlay.classList.add('hidden');
  stopFrameBroadcast();
  resumeCamera();
  showWebcam();
  showEl(pregameOverlay);
  renderPregamePlayers(lobbyPlayers, lobbyCreatorId);
  showToast(reason);
});

playAgainBtn.addEventListener('click', () => socket.emit('start-game'));

backToLobbyBtn.addEventListener('click', () => {
  stopConfetti();
  hideEl(winnerScreen, () => {
    showEl(pregameOverlay);
    renderPregamePlayers(lobbyPlayers, lobbyCreatorId);
  });
});

// ── Remote drawing sync ───────────────────────────────────────────────────────
// Guessers receive the drawer's composite frame (webcam + drawing) directly,
// so remote-stroke and remote-clear are no-ops on the guesser side.
socket.on('remote-stroke', () => {});
socket.on('remote-clear',  () => {});

// ── Composite frame receiver (guessers only) ──────────────────────────────────
socket.on('canvas-frame', (dataURL) => {
  if (amDrawer) return;
  console.log('frame received, size:', dataURL.length);
  const img = new Image();
  img.onload = () => {
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    oCtx.drawImage(img, 0, 0, overlayCanvas.width, overlayCanvas.height);
  };
  img.src = dataURL;
});

// ── Guess submission ──────────────────────────────────────────────────────────
guessInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const guess = guessInput.value.trim();
  if (!guess) return;
  socket.emit('submit-guess', { guess });
  guessInput.value = '';
});
