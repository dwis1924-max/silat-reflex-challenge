'use strict';

const $ = id => document.getElementById(id);
const canvas = $('arena');
const ctx = canvas.getContext('2d');
const background = document.createElement('canvas');
const art = background.getContext('2d');
const levels = { easy: 800, normal: 600, hard: 400 };
const attacks = [
  { pose: 'punch', ready: 'punchReady', response: 'guard', sound: 'punch' },
  { pose: 'kick', ready: 'kickReady', response: 'dodge', sound: 'kick' },
  { pose: 'sweep', ready: 'sweepReady', response: 'jump', sound: 'sweep' }
];
const keys = { a: 'guard', s: 'dodge', d: 'jump' };
const levelButtons = [...document.querySelectorAll('[data-level]')];
const actionButtons = [...document.querySelectorAll('[data-action]')];
const views = { menu: $('menu'), pause: $('pause-panel'), results: $('results') };
const duration = 30_000;
const recovery = 340;
const padScore = score => String(score).padStart(3, '0');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (from, to, fraction) => from + (to - from) * fraction;
const ease = fraction => fraction * fraction * (3 - 2 * fraction);
const idleDelay = () => 800 + Math.random() * 1700;
const compactPortrait = matchMedia('(orientation: portrait) and (max-width: 360px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const portrait = matchMedia('(orientation: portrait)');

function readLocal(key, fallback) {
  try { return localStorage.getItem('silat.' + key) ?? fallback; }
  catch { return fallback; }
}

function saveLocal(key, value) {
  try { localStorage.setItem('silat.' + key, String(value)); }
  catch { /* Play continues with the in-memory record if storage is blocked. */ }
}

let best = Math.max(0, Number(readLocal('best', 0)) || 0);
let muted = readLocal('muted', 'false') === 'true';
let level = 'normal';
let screen = 'menu';
let round;
let audio;
let previousFrame = performance.now();
let sceneTime = 0;
let particles = [];
let pressedUntil = new Map();

function setScreen(next) {
  screen = next;
  $('stage').dataset.screen = next;
  $('match').hidden = next !== 'match' && next !== 'pause';
  $('match').inert = next !== 'match';
  for (const [name, view] of Object.entries(views)) view.hidden = name !== next;
}

function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(!muted));
  $('sound-icon').textContent = muted ? '×' : '♪';
  $('sound-text').textContent = muted ? 'SUARA NONAKTIF' : 'SUARA AKTIF';
}

function unlockAudio() {
  if (muted || !window.AudioContext) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* Audio availability does not affect the round. */ }
}

// Short one-shot sounds synthesized on demand, with no downloaded tracks.
function playSound(name, delay = 0) {
  if (muted || audio?.state !== 'running') return;
  const sounds = {
    start: ['sine', 310, 610, .13, .12],
    guard: ['triangle', 510, 185, .19, .21],
    dodge: ['sine', 890, 470, .13, .14],
    jump: ['triangle', 280, 720, .16, .13],
    punch: ['triangle', 155, 55, .13, .25],
    kick: ['sawtooth', 128, 40, .18, .14],
    sweep: ['triangle', 97, 34, .23, .24],
    ko: ['square', 200, 36, .39, .10],
    end: ['sine', 460, 660, .21, .14]
  };
  const [wave, from, to, length, loudness] = sounds[name];
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
  envelope.gain.setValueAtTime(.001, start);
  envelope.gain.exponentialRampToValueAtTime(loudness, start + .012);
  envelope.gain.exponentialRampToValueAtTime(.001, start + length);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + length);
}

function updateHud() {
  $('hp-value').textContent = round.hp + ' HP';
  $('hp-track').setAttribute('aria-valuenow', round.hp);
  $('hp-fill').style.width = round.hp + '%';
  $('hp-fill').classList.toggle('low', round.hp <= 40);
  $('score').textContent = padScore(round.score);
  updateTimer();
}

function updateTimer() {
  const seconds = Math.max(0, Math.ceil((duration - round.time) / 1000));
  if ($('time').textContent !== String(seconds)) {
    $('time').textContent = seconds;
    $('time').classList.toggle('urgent', seconds <= 5);
  }
}

function showFeedback(message, good) {
  $('feedback').textContent = message;
  $('feedback').classList.toggle('good', good);
  round.feedbackEnd = round.time + 420;
}

function startRound() {
  unlockAudio();
  round = {
    time: 0, hp: 100, score: 0, launched: 0, defended: 0, reactions: 0,
    next: idleDelay(), attack: null, feedbackEnd: 0, shakeEnd: 0,
    defense: null, hitAt: -Infinity, koAt: null
  };
  previousFrame = performance.now();
  particles = [];
  pressedUntil.clear();
  for (const button of actionButtons) button.classList.remove('pressed');
  $('feedback').textContent = '';
  updateHud();
  setScreen('match');
  $('pause').focus({ preventScroll: true });
  playSound('start');
}

function openMenu() {
  setScreen('menu');
  round = null;
  particles = [];
  $('menu-best').textContent = padScore(best);
  $('play').focus({ preventScroll: true });
}

function pauseRound() {
  if (screen !== 'match' || round.koAt !== null) return;
  advanceClock(performance.now());
  if (screen !== 'match' || round.koAt !== null) return;
  setScreen('pause');
  $('resume').focus({ preventScroll: true });
}

function resumeRound() {
  unlockAudio();
  previousFrame = performance.now();
  setScreen('match');
  $('pause').focus({ preventScroll: true });
}

function finishRound(ko) {
  $('result-level').textContent = level.toUpperCase();
  $('result-title').textContent = ko ? 'KO!' : 'Waktu Habis';
  $('result-score').textContent = padScore(round.score);
  $('result-hp').textContent = round.hp + ' HP';
  $('result-best').textContent = padScore(best);
  $('result-accuracy').textContent = round.launched ? Math.round(100 * round.defended / round.launched) + '%' : '—';
  $('result-reaction').textContent = round.defended ? Math.round(round.reactions / round.defended) + ' ms' : '—';
  $('result-count').textContent = round.defended + ' pertahanan berhasil dari ' + round.launched + ' serangan';
  setScreen('results');
  $('again').focus({ preventScroll: true });
  if (!ko) playSound('end');
}

function startAttack() {
  const start = round.next;
  const impact = start + levels[level];
  round.attack = {
    ...attacks[Math.floor(Math.random() * attacks.length)],
    start, impact, end: impact + recovery, choice: null, resolved: false
  };
  round.launched++;
}

function applyImpact(attack) {
  attack.resolved = true;
  const success = attack.choice?.action === attack.response;
  round.shakeEnd = attack.impact + (success ? 110 : 185);
  burst(attack, success);
  if (success) {
    round.defended++;
    round.reactions += attack.choice.at - attack.start;
    round.score += 10;
    if (round.score > best) {
      best = round.score;
      saveLocal('best', best);
    }
    showFeedback('BERTAHAN! +10', true);
    playSound(attack.response);
  } else {
    round.hp = Math.max(0, round.hp - 20);
    round.hitAt = attack.impact;
    showFeedback('TERKENA −20 HP', false);
    playSound(attack.sound);
    if (!round.hp) {
      round.koAt = attack.impact;
      showFeedback('KO!', false);
      playSound('ko', .09);
    }
  }
  updateHud();
}

function tickRound(delta) {
  if (round.koAt !== null) {
    round.time += delta;
    if (round.time >= round.koAt + 580) finishRound(true);
    return;
  }
  round.time = Math.min(duration, round.time + delta);
  updateTimer();
  if (!round.attack && round.time >= round.next && round.next + levels[level] <= duration) startAttack();
  const attack = round.attack;
  if (attack && !attack.resolved && round.time >= attack.impact) applyImpact(attack);
  if (round.koAt !== null) return;
  if (attack && round.time >= attack.end) {
    round.next = attack.end + idleDelay();
    round.attack = null;
    round.defense = null;
  }
  if (round.feedbackEnd && round.time >= round.feedbackEnd) {
    round.feedbackEnd = 0;
    $('feedback').textContent = '';
  }
  if (round.time >= duration) finishRound(false);
}

function advanceClock(now) {
  const delta = Math.max(0, now - previousFrame);
  previousFrame = Math.max(now, previousFrame);
  // Bound the step size so a dropped frame processes each crossed phase in order.
  let remaining = delta;
  while (remaining > 0 && screen === 'match') {
    const step = Math.min(remaining, 35);
    tickRound(step);
    remaining -= step;
  }
}

function defend(action) {
  if (screen !== 'match') return;
  advanceClock(performance.now());
  if (screen !== 'match' || round.koAt !== null) return;
  const attack = round.attack;
  if (!attack || attack.choice || round.time >= attack.impact) return;
  attack.choice = { action, at: round.time };
  round.defense = attack.choice;
  pressedUntil.set(action, round.time + 170);
}

for (const button of levelButtons) {
  button.addEventListener('click', () => {
    level = button.dataset.level;
    for (const option of levelButtons) option.setAttribute('aria-pressed', String(option === button));
  });
}
for (const button of actionButtons) {
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    defend(button.dataset.action);
  });
  // Keyboard and assistive activation produce a click without a pointer count.
  button.addEventListener('click', event => {
    if (event.detail === 0) defend(button.dataset.action);
  });
}
const heldKeys = new Set();
window.addEventListener('keydown', event => {
  if ($('help').open) return;
  if (event.key === 'Escape' && !event.repeat) {
    if (screen === 'match') pauseRound();
    else if (screen === 'pause') resumeRound();
    return;
  }
  const key = event.key.toLowerCase();
  if (screen !== 'match' || !Object.hasOwn(keys, key)) return;
  event.preventDefault();
  if (event.repeat || heldKeys.has(key)) return;
  heldKeys.add(key);
  defend(keys[key]);
});
window.addEventListener('keyup', event => heldKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => heldKeys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseRound();
});
$('sound').addEventListener('click', () => {
  muted = !muted;
  saveLocal('muted', muted);
  updateSoundButton();
  unlockAudio();
  if (!muted) playSound('start');
});
$('play').addEventListener('click', startRound);
$('again').addEventListener('click', startRound);
$('back').addEventListener('click', openMenu);
$('quit').addEventListener('click', openMenu);
$('pause').addEventListener('click', pauseRound);
$('resume').addEventListener('click', resumeRound);
$('help-open').addEventListener('click', () => $('help').showModal());
$('help-close').addEventListener('click', () => $('help').close());
updateSoundButton();
$('menu-best').textContent = padScore(best);

// The stage is drawn in original low-resolution pixels, then scaled up by CSS.
function polygon(target, points, color) {
  target.fillStyle = color;
  target.beginPath();
  target.moveTo(...points[0]);
  for (const point of points.slice(1)) target.lineTo(...point);
  target.closePath();
  target.fill();
}

function box(target, x, y, width, height, color) {
  target.fillStyle = color;
  target.fillRect(Math.round(x), Math.round(y), Math.ceil(width), Math.ceil(height));
}

function pixelDisc(target, x, y, radius, color) {
  for (let row = -radius; row <= radius; row += 2) {
    const width = Math.floor(Math.sqrt(radius ** 2 - row ** 2));
    if (width) box(target, x - width, y + row, width * 2, 2, color);
  }
}

function mountain(w, h, ridge, color) {
  const points = ridge.map(([x, y]) => [Math.round(x * w), Math.round(y * h)]);
  points.push([w, h], [0, h]);
  polygon(art, points, color);
}

function roof(x, y, span, color, trim) {
  for (let row = 0; row < 11; row++) {
    const half = Math.round(span * (.22 + .78 * (row / 10) ** 1.6));
    box(art, x - half, y + row, half * 2, 1, color);
  }
  box(art, x - span, y + 11, span * 2, 2, trim);
}

function buildBackground(w, h) {
  background.width = w;
  background.height = h;
  art.imageSmoothingEnabled = false;
  const sky = ['#302443', '#482e52', '#62405d', '#854e66', '#aa606d', '#c57770', '#db8b72', '#eda077', '#f1b181', '#f6c28b'];
  sky.forEach((color, i) => box(art, 0, h * i * .075, w, h * .076, color));
  const sunX = Math.round(w * .72);
  const sunY = Math.round(h * .32);
  const sunR = Math.max(18, Math.round(Math.min(w, h) * .153));
  pixelDisc(art, sunX, sunY, sunR, '#ffd091');
  for (let step = 0; step < 6; step++) {
    const y = sunY + Math.round(sunR * (.18 + step * .13));
    const half = Math.sqrt(sunR ** 2 - (y - sunY) ** 2) * .97;
    box(art, sunX - half, y, half * 2, 2, '#ee9b74');
  }
  for (let i = 0; i < 27; i++) {
    const x = ((i * 83 + 21) % 277) / 277 * w;
    const y = (.10 + ((i * 19) % 79) / 210) * h;
    if (Math.hypot(x - sunX, y - sunY) < sunR + 3) continue;
    box(art, x, y, 8 + (i * 11) % 27, i % 3 + 1, i % 4 ? '#d2858073' : '#ffd5a684');
  }
  mountain(w, h, [[0,.54],[.10,.40],[.17,.43],[.28,.30],[.38,.43],[.44,.40],[.54,.52],[.64,.46],[.74,.55],[.85,.42],[.92,.44],[1,.35]], '#89526b');
  mountain(w, h, [[0,.49],[.08,.51],[.16,.48],[.28,.57],[.39,.53],[.49,.61],[.62,.53],[.70,.58],[.82,.51],[.91,.59],[1,.48]], '#66425e');
  mountain(w, h, [[0,.61],[.13,.58],[.21,.63],[.32,.58],[.43,.66],[.56,.62],[.70,.61],[.79,.63],[.91,.57],[1,.60]], '#47354f');
  const horizon = Math.round(h * .67);
  for (let i = 0; i < 33; i++) {
    const x = Math.round(w * i / 32);
    const height = 4 + i * 13 % 14;
    box(art, x, horizon - height, 2, height, '#392b46');
    box(art, x - 4, horizon - height + 2, 10, 3, '#392b46');
    box(art, x - 6, horizon - height + 6, 13, 4, '#392b46');
  }
  const templeX = w * .80;
  const templeY = horizon - 3;
  const silhouette = '#37263d';
  box(art, templeX - 22, templeY - 17, 44, 16, silhouette);
  box(art, templeX - 14, templeY - 33, 28, 21, silhouette);
  roof(templeX, templeY - 51, 24, silhouette, '#664054');
  roof(templeX, templeY - 37, 32, silhouette, '#664054');
  roof(templeX, templeY - 22, 41, silhouette, '#664054');
  box(art, templeX - 3, templeY - 12, 6, 13, '#a96565');
  box(art, templeX - 1, templeY - 57, 2, 7, silhouette);
  for (const direction of [-1, 1]) {
    const x = templeX + direction * 52;
    box(art, x - 5, templeY - 9, 10, 12, silhouette);
    roof(x, templeY - 21, 11, silhouette, '#664054');
  }
  box(art, 0, horizon, w, 9, '#3a2942');
  box(art, 0, horizon + 2, w, 2, '#93616e');
  for (let x = 5; x < w; x += 17) {
    box(art, x, horizon + 4, 2, 3, '#bd826e');
    box(art, x + 2, horizon + 5, 3, 1, '#bd826e');
  }
  const ground = horizon + 9;
  const bands = ['#604454', '#674958', '#6e4d5a', '#73515d', '#7c5861', '#855b63', '#8c6065'];
  let y = ground;
  for (let index = 0; y < h; index++) {
    const band = 4 + index * 2;
    box(art, 0, y, w, band, bands[Math.min(index, bands.length - 1)]);
    box(art, 0, y + band - 1, w, 1, '#4b344675');
    for (let k = -16; k <= 16; k++) {
      const x = w / 2 + k * (10 + index * 5) + (index % 2) * (4 + index * 2);
      box(art, x, y, 1, band, '#533a4b70');
      if ((k + index) % 3 === 0) box(art, x + 4, y + 2, 4 + index, 1, '#b47a734f');
    }
    y += band;
  }
  const rimY = Math.round(h * .93);
  box(art, 0, rimY, w, 2, '#402b42');
  box(art, 0, rimY + 2, w, 2, '#c88b78');
  box(art, 0, rimY + 4, w, h - rimY - 4, '#3f2a40');
  for (let x = 0; x < w; x += 16) {
    box(art, x, rimY + 8, 8, 2, '#a36a6d');
    box(art, x + 2, rimY + 6, 4, 6, '#a36a6d');
  }
}

function resizeArena() {
  const bounds = canvas.getBoundingClientRect();
  const pixelScale = Math.max(1.3, Math.min(bounds.height, bounds.width / 1.42) / 208);
  const w = Math.max(1, Math.round(bounds.width / pixelScale));
  const h = Math.max(1, Math.round(bounds.height / pixelScale));
  if (w === background.width && h === background.height && w === canvas.width && h === canvas.height) return;
  canvas.width = w;
  canvas.height = h;
  ctx.imageSmoothingEnabled = false;
  buildBackground(w, h);
}

new ResizeObserver(resizeArena).observe(canvas);
resizeArena();


/*
 * Pose values are hip offset, hip height, torso lean, then upper/lower
 * angles for far arm, near arm, far leg and near leg. Limb lengths stay fixed.
 */
const poses = {
  idle:       [  0,   0,  8,  17, -53,  -8, -62, 120,  96,  52, 100],
  punchReady: [ -5,   1, -9,  28, -75, 160, -53, 118,  90,  53, 111],
  punch:      [ 14,  -2, 22,  35, -69,  -7,  -5, 146, 133,  61,  93],
  kickReady:  [ -6,   2,-15, -16, -71, 102, -36,  96,  89, -28,  97],
  kick:       [ 12,  -1,-18,  25, -75, 138, -95, 121,  99,  -8,  -4],
  sweepReady: [ -6,  12, 15,  19, -32, 150, 123, 125,  57,  38, 119],
  sweep:      [ 11,  15, 25,  -8, -42, 151, 123, 127,  59,   9,   8],
  guard:      [  2,   2, 11,  17, -72, -18, -81, 123,  92,  58, 102],
  dodge:      [-13,   3,-27,  18, -45,  37, -79, 119,  80,  53,  99],
  jump:       [ -2, -24,  3, -27, -87, -22, -91,  23, 130, -23, 105],
  hit:        [-12,   2,-32, 117, 153,  38,   7, 125,  88,  53, 113],
  ko:         [-20,  21,-83,  23,  87,  72, 155,  23,  -8, -13,   8]
};
const blue = {
  edge: '#171c34', far: '#276387', near: '#52c9f7', light: '#9be9ff',
  head: '#8adafa', wrap: '#258af0', sash: '#e3f8ff'
};
const red = {
  edge: '#331a2e', far: '#973b57', near: '#f66a72', light: '#ffb397',
  head: '#ff9687', wrap: '#cf3b56', sash: '#ffe0b2'
};

function blendPose(from, to, progress) {
  return from.map((value, index) => mix(value, to[index], ease(clamp(progress, 0, 1))));
}

function idlePose(time, phase) {
  const pose = poses.idle.slice();
  const pulse = Math.sin(time / 260 + phase);
  pose[1] += pulse * 1.1;
  pose[2] += pulse * 2;
  pose[5] += pulse * 3;
  pose[6] += pulse * 3;
  return pose;
}

function opponentPose(time) {
  const attack = round?.attack;
  if (!attack) return idlePose(time, 2);
  const progress = (time - attack.start) / (attack.impact - attack.start);
  if (progress < .38) return blendPose(poses.idle, poses[attack.ready], progress / .38);
  if (time < attack.impact) return blendPose(poses[attack.ready], poses[attack.pose], (progress - .38) / .62);
  if (time < attack.impact + 55) return poses[attack.pose];
  return blendPose(poses[attack.pose], poses.idle, (time - attack.impact - 55) / (recovery - 55));
}

function playerPose(time) {
  if (!round) return idlePose(time, 0);
  if (round.koAt !== null) return blendPose(poses.hit, poses.ko, (time - round.koAt) / 310);
  if (time - round.hitAt < 290) return blendPose(poses.hit, poses.idle, (time - round.hitAt) / 290);
  const attack = round.attack;
  const defense = round.defense;
  if (!attack || !defense) return idlePose(time, 0);
  if (time <= attack.impact + 32) {
    const reach = Math.max(16, Math.min(120, attack.impact - defense.at));
    return blendPose(poses.idle, poses[defense.action], (time - defense.at) / reach);
  }
  return blendPose(poses[defense.action], poses.idle, (time - attack.impact - 32) / 220);
}

function ray([x, y], length, angle) {
  const radians = angle * Math.PI / 180;
  return [x + Math.cos(radians) * length, y + Math.sin(radians) * length];
}

function stroke(a, b, size, color) {
  const segments = Math.max(1, Math.ceil(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))));
  for (let index = 0; index <= segments; index++) {
    const fraction = index / segments;
    box(ctx, mix(a[0], b[0], fraction) - size / 2, mix(a[1], b[1], fraction) - size / 2, size, size, color);
  }
}

function fighter(x, groundY, direction, scale, pose, colors) {
  const [advance, lift, lean, farArm, farElbow, nearArm, nearElbow, farLeg, farKnee, nearLeg, nearKnee] = pose;
  const hip = [advance, -26 + lift];
  const collar = ray(hip, 18, -90 + lean);
  const neck = ray(collar, 3, -90 + lean);
  const head = ray(neck, 6, -90 + lean);
  const joint = (origin, upper, lower, a, b) => {
    const middle = ray(origin, upper, a);
    return [origin, middle, ray(middle, lower, b)];
  };
  const [farHip, farK, farFoot] = joint([hip[0] - 2, hip[1]], 14, 14, farLeg, farKnee);
  const [nearHip, nearK, nearFoot] = joint([hip[0] + 2, hip[1]], 14, 14, nearLeg, nearKnee);
  const [farShoulder, farE, farHand] = joint([collar[0] - 2, collar[1] + 1], 11, 11, farArm, farElbow);
  const [nearShoulder, nearE, nearHand] = joint([collar[0] + 1, collar[1] + 1], 11, 11, nearArm, nearElbow);

  ctx.save();
  ctx.translate(Math.round(x + direction * advance * scale * .4), Math.round(groundY + 3));
  ctx.scale(scale, scale);
  box(ctx, -21, -1, 42, 3, '#382435a1');
  box(ctx, -16, -3, 32, 6, '#38243578');
  ctx.restore();

  ctx.save();
  ctx.translate(Math.round(x), Math.round(groundY));
  ctx.scale(direction * scale, scale);
  for (const [root, middle, end, color, width] of [
    [farHip, farK, farFoot, colors.far, 5],
    [farShoulder, farE, farHand, colors.far, 4],
    [nearHip, nearK, nearFoot, colors.near, 5]
  ]) {
    stroke(root, middle, width + 2, colors.edge);
    stroke(middle, end, width + 2, colors.edge);
    stroke(root, middle, width, color);
    stroke(middle, end, width, color);
    box(ctx, end[0] - 2, end[1] - 2, 7, 4, color);
  }

  stroke(hip, collar, 10, colors.edge);
  stroke(hip, collar, 7, colors.near);
  stroke([hip[0] + 2, hip[1] - 3], [collar[0] + 2, collar[1] + 3], 2, colors.light);
  box(ctx, hip[0] - 4, hip[1] - 4, 9, 3, colors.sash);
  box(ctx, hip[0] - 4, hip[1] - 1, 3, 5, colors.sash);
  stroke(collar, neck, 5, colors.edge);
  stroke(nearShoulder, nearE, 6, colors.edge);
  stroke(nearE, nearHand, 6, colors.edge);
  stroke(nearShoulder, nearE, 4, colors.near);
  stroke(nearE, nearHand, 4, colors.near);
  box(ctx, nearHand[0] - 2, nearHand[1] - 2, 5, 4, colors.light);

  const [hx, hy] = head.map(Math.round);
  box(ctx, hx - 5, hy - 6, 10, 12, colors.edge);
  box(ctx, hx - 6, hy - 4, 12, 8, colors.edge);
  box(ctx, hx - 4, hy - 5, 8, 10, colors.head);
  box(ctx, hx + 3, hy - 2, 2, 5, colors.head);
  box(ctx, hx - 5, hy - 4, 10, 3, colors.wrap);
  box(ctx, hx - 9, hy - 3, 5, 2, colors.wrap);
  box(ctx, hx + 2, hy, 2, 1, colors.edge);
  ctx.restore();
}

function battlefield(menu = screen === 'menu') {
  const { width: w, height: h } = canvas;
  if (menu && portrait.matches) {
    const scale = compactPortrait.matches ? clamp(w * .0038, .62, .88) : clamp(w * .0057, .86, 1.7);
    return { left: w * .50 - 29 * scale, right: w * .50 + 29 * scale, ground: h * (compactPortrait.matches ? .26 : .47), scale };
  }
  const scale = menu ? clamp(Math.min(w * .00325, h * .0115), .85, 1.83)
    : clamp(Math.min(w * .0044, h * .0087), .73, 1.40);
  const center = w * (menu ? .73 : portrait.matches ? .47 : .45);
  return { left: center - 29 * scale, right: center + 29 * scale, ground: h * .84, scale };
}

function burst(attack, success) {
  if (reducedMotion.matches) return;
  const { left, scale, ground } = battlefield(false);
  const center = {
    x: left + 20 * scale,
    y: ground - (attack.pose === 'sweep' ? 13 : 39) * scale
  };
  const color = success ? '#b7f8ff' : '#ffba89';
  for (let i = 0; i < 21; i++) {
    const angle = i / 21 * Math.PI * 2;
    const speed = 22 + Math.random() * 130;
    particles.push({
      x: center.x, y: center.y, vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed, start: attack.impact,
      size: 1 + Math.random() * 4, color
    });
  }
}

function paint(time, menu) {
  const { width: w, height: h } = canvas;
  const { left, right, ground, scale } = battlefield(menu);
  const shake = !menu && !reducedMotion.matches ? Math.max(0, round.shakeEnd - time) : 0;
  ctx.save();
  if (shake) ctx.translate(Math.round(Math.sin(time * .1) * shake / 44), Math.round(Math.cos(time * .09) * shake / 85));
  const showPortraitMenu = menu && portrait.matches;
  const portraitHeight = Math.round(h * (compactPortrait.matches ? .33 : .575));
  ctx.drawImage(background, -3, -3, w + 6, showPortraitMenu ? portraitHeight : h + 6);
  if (showPortraitMenu) box(ctx, 0, portraitHeight - 4, w, h - portraitHeight + 5, '#281b33');

  if (menu) {
    fighter(left, ground, 1, scale, idlePose(time, 0), blue);
    fighter(right, ground, -1, scale, idlePose(time, 2), red);
  } else {
    fighter(right, ground, -1, scale, opponentPose(time), red);
    fighter(left, ground, 1, scale, playerPose(time), blue);
    particles = particles.filter(particle => time - particle.start < 330);
    for (const particle of particles) {
      const age = Math.max(0, (time - particle.start) / 1000);
      ctx.globalAlpha = clamp(1 - age / .33, 0, 1);
      box(ctx, particle.x + particle.vx * age, particle.y + particle.vy * age + 125 * age ** 2,
        particle.size, particle.size, particle.color);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function frame(now) {
  const delta = Math.max(0, now - previousFrame);
  if (screen === 'match') advanceClock(now);
  else previousFrame = Math.max(now, previousFrame);
  sceneTime += Math.min(35, delta);
  const menu = screen === 'menu';
  const time = menu ? sceneTime : round.time;
  paint(time, menu);
  if (screen === 'match') {
    for (const button of actionButtons) {
      button.classList.toggle('pressed', (pressedUntil.get(button.dataset.action) ?? -1) > time);
    }
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

