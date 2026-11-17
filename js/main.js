// Başlangıç: renderer, döngü (FPS sınırı), dinamik çözünürlük, uyarlanabilir kalite
import * as THREE from 'three';
import { G, on, clamp } from './core.js';
import { loadSettings, saveSettings, guessTier, applyPreset } from './settings.js';
import { initInput } from './input.js';
import { UI } from './ui/ui.js';
import { Game } from './game.js';
import { initAudio, suspendAudio, radio } from './audio.js';
import { t } from './i18n.js';

const S = loadSettings();
document.documentElement.style.setProperty('--ts', S.textSize);
if (S.colorblind) document.body.classList.add('cb');

// ilk açılış: cihaz gücüne göre ön ayar
if (!S.benchmarked && !S._guessed) {
  const sc = guessTier();
  applyPreset(sc > 12 ? 'high' : sc > 7 ? 'medium' : sc > 3 ? 'low' : 'verylow');
  S.fpsCap = sc > 12 ? 90 : sc > 3 ? 60 : 30;
  S._guessed = true;
  saveSettings();
}

const renderer = new THREE.WebGLRenderer({ antialias: !!S.aa, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

let dynScale = 1;
function resize() {
  const base = Math.min(window.devicePixelRatio || 1, 2);
  const pr = base * S.resScale * dynScale;
  renderer.setPixelRatio(Math.max(0.35, pr));
  renderer.setSize(innerWidth, innerHeight);
  if (G.camera) { G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix(); }
  if (ui && ui.composer) ui.composer.setSize(innerWidth, innerHeight);
  if (G.renderPipe) G.renderPipe.setSize(innerWidth, innerHeight);
}
on('resize', resize);
addEventListener('resize', resize);

initInput();
const ui = new UI(renderer);
const game = new Game(renderer, ui);
resize();

// ilk etkileşimde ses
const unlock = () => { initAudio(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

// ekran yenileme hızını ölç
G.refresh = 60;
(function measure() {
  let n = 0, t0 = 0;
  const f = (t) => { if (!t0) t0 = t; n++; if (n < 30) requestAnimationFrame(f); else G.refresh = Math.round((n - 1) / ((t - t0) / 1000)); };
  requestAnimationFrame(f);
})();

// arka plana alınınca tamamen dur
let hidden = false;
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  suspendAudio(hidden);
  if (!hidden) { last = performance.now(); nextDue = last; }
  if (hidden && G.profile) { try { game.save(); } catch (e) { /* */ } }
});

// ---------------- döngü ----------------
let last = performance.now(), nextDue = last;
let fpsFrames = 0, fpsT = 0, lowT = 0, highT = 0, adaptT = 0, playT = 0, fpsHist = [];
function loop(now) {
  requestAnimationFrame(loop);
  if (hidden) return;
  const cap = S.batterySaver ? 30 : S.fpsCap;
  if (cap > 0) {
    const interval = 1000 / cap;
    if (now < nextDue - 1.5) return;
    nextDue = Math.max(nextDue + interval, now - interval);
  }
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  // FPS ölçümü
  fpsFrames++; fpsT += dt;
  if (fpsT >= 0.5) {
    const fps = fpsFrames / fpsT;
    G.fps = Math.round(fps);
    fpsHist.push(fps); if (fpsHist.length > 10) fpsHist.shift();
    G.fpsAvg = fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length;
    fpsFrames = 0; fpsT = 0;
    if (G.mode === 'play') adaptive(fps, 0.5);
    if (game.hud) game.hud.showFps(S.showFps && G.mode !== 'menu', G.fps, `• ${Math.round(S.resScale * dynScale * 100)}%`);
  }
  if (G.mode === 'menu') {
    ui.stage.render(dt, innerWidth > 900 ? { ox: -innerWidth * 0.26 } : innerHeight < 500 ? { ox: -innerWidth * 0.3 } : { ox: 0, oy: innerHeight * 0.25 });
  } else if (G.mode === 'play' || G.mode === 'photo' || G.mode === 'drone') {
    game.frame(dt);
    if (G.profile && G.mode === 'play' && !G.paused) { G.profile.playTime = (G.profile.playTime || 0) + dt; }
  }
}

// Dinamik çözünürlük ve uyarlanabilir kalite
function adaptive(fps, dt) {
  const target = (S.batterySaver ? 30 : S.fpsCap) || Math.min(G.refresh || 60, 120);
  if (S.dynamicRes) {
    if (fps < target * 0.9) { lowT += dt; highT = 0; } else if (fps > target * 0.97) { highT += dt; lowT = 0; } else { lowT = highT = 0; }
    if (lowT > 1.5 && dynScale > 0.6) { dynScale = Math.max(0.6, dynScale - 0.08); lowT = 0; resize(); }
    if (highT > 4 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); highT = 0; resize(); }
  }
  if (S.adaptive) {
    // uzun süre düşük FPS: gölge, trafik, efektleri azalt (ısınma dahil)
    if (fps < target * 0.75 && (dynScale <= 0.62 || !S.dynamicRes)) adaptT += dt; else adaptT = Math.max(0, adaptT - dt * 0.5);
    if (adaptT > 6) {
      adaptT = 0;
      if ((game.adaptShadow ?? S.shadows) > 0 && S.shadows > 0) { game.adaptShadow = Math.max(0, (game.adaptShadow ?? S.shadows) - 1); game.applyShadowQuality(); game.toast('⚙️ ' + t('Performans için gölgeler azaltıldı')); }
      else if ((G.adaptTraffic ?? 1) > 0.5) { G.adaptTraffic = (G.adaptTraffic ?? 1) - 0.25; S.particles = Math.max(0.25, S.particles - 0.25); game.toast('⚙️ ' + t('Performans için efektler azaltıldı')); }
    }
  }
}

requestAnimationFrame(loop);
ui.title();
G.mode = 'menu';
document.getElementById('boot').remove();

// çevrimdışı destek
if (!window.__SINGLE__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__game = game;
window.__G = G;
