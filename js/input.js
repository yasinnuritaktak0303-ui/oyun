// Giriş: klavye, oyun kolu, dokunmatik (butonlar / direksiyon / eğme)
import { G, clamp, $, el, emit } from './core.js';
import { saveSettings } from './settings.js';
import { t } from './i18n.js';

export const input = {
  throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, horn: false,
  moveX: 0, moveY: 0, run: false, lookX: 0, lookY: 0,
  actions: [],
  touch: false,
};
const keys = new Set();
const touchState = { gas: 0, brake: 0, left: 0, right: 0, hb: false, nitro: false, wheel: 0, horn: false, joyX: 0, joyY: 0, run: false, tilt: 0 };
let tiltRaw = 0;

const ACTION_KEYS = {
  KeyF: 'enter', KeyL: 'lights', KeyQ: 'indL', KeyE: 'indR', KeyC: 'camera', KeyM: 'map', KeyP: 'photo', Escape: 'pause',
  KeyR: 'shiftUp', KeyV: 'shiftDown', KeyG: 'interact', Enter: 'interact', KeyK: 'cruise', KeyZ: 'hazard', KeyT: 'emote',
  KeyB: 'lookBack', KeyX: 'hiBeam', KeyN: 'radio', KeyO: 'drone', KeyJ: 'police', Digit1: 'door', Digit2: 'hood', Digit3: 'trunk', Digit4: 'window', KeyU: 'recover',
};

export function pushAction(a) { input.actions.push(a); emit('action', a); }

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) {
      const a = ACTION_KEYS[e.code];
      if (a) pushAction(a);
      if (e.code === 'Space') pushAction('jump');
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('deviceorientation', (e) => {
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let v;
    if (ang === 90) v = e.beta; else if (ang === -90 || ang === 270) v = -e.beta; else v = e.gamma;
    tiltRaw = clamp((v || 0) / 28, -1, 1);
  });
  input.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export async function requestTilt() {
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      return r === 'granted';
    }
  } catch (e) { return false; }
  return true;
}

let gpPrev = {};
export function pollInput(dt) {
  const k = (c) => keys.has(c);
  let thr = k('KeyW') || k('ArrowUp') ? 1 : 0;
  let brk = k('KeyS') || k('ArrowDown') ? 1 : 0;
  let st = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  let hb = k('Space');
  let nitro = k('ShiftLeft') || k('ShiftRight');
  let hornK = k('KeyH');
  let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  let my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  let run = k('ShiftLeft') || k('ShiftRight');
  let lookX = 0, lookY = 0;
  // klavye direksiyonu yumuşatma
  const S = G.settings;
  // oyun kolu
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = (i) => (Math.abs(gp.axes[i] || 0) > 0.12 ? gp.axes[i] : 0);
    const bt = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    if (Math.abs(ax(0)) > 0) { st = ax(0); mx = ax(0); }
    if (Math.abs(ax(1)) > 0) my = -ax(1);
    lookX = ax(2); lookY = ax(3);
    thr = Math.max(thr, bt(7)); brk = Math.max(brk, bt(6));
    hb = hb || bt(0) > 0.5; nitro = nitro || bt(2) > 0.5 || bt(10) > 0.5; run = run || bt(2) > 0.5;
    hornK = hornK || bt(11) > 0.5;
    const edge = (i, a) => { const p = bt(i) > 0.5; if (p && !gpPrev[i]) pushAction(a); gpPrev[i] = p; };
    edge(3, 'enter'); edge(1, 'interact'); edge(9, 'pause'); edge(8, 'map'); edge(5, 'shiftUp'); edge(4, 'shiftDown');
    edge(12, 'lights'); edge(14, 'indL'); edge(15, 'indR'); edge(13, 'camera'); edge(0, 'jump');
    break;
  }
  // dokunmatik
  if (input.touch && G.touchUI && G.touchUI.visible) {
    const T = touchState;
    thr = Math.max(thr, T.gas); brk = Math.max(brk, T.brake);
    hb = hb || T.hb; nitro = nitro || T.nitro; hornK = hornK || T.horn;
    const mode = S.mobileControl;
    if (mode === 'buttons') { if (T.left || T.right) st = (T.right ? 1 : 0) - (T.left ? 1 : 0); }
    else if (mode === 'wheel') st = T.wheel;
    else if (mode === 'tilt') st = clamp(tiltRaw * S.tiltSens, -1, 1);
    if (T.joyX || T.joyY) { mx = T.joyX; my = T.joyY; run = run || Math.hypot(T.joyX, T.joyY) > 0.85; }
  }
  // dijital direksiyonu yumuşat
  const digital = st === 1 || st === -1 || st === 0;
  if (digital) {
    const rate = st === 0 ? 6 : Math.sign(st) !== Math.sign(input.steer) ? 9 : 3.2;
    input.steer += clamp(st - input.steer, -rate * dt, rate * dt);
  } else input.steer = st * S.steerSens;
  input.steer = clamp(input.steer, -1, 1);
  input.throttle = thr; input.brake = brk; input.handbrake = hb; input.nitro = nitro; input.horn = hornK;
  input.moveX = mx; input.moveY = my; input.run = run; input.lookX = lookX; input.lookY = lookY;
}

export function takeActions() { const a = input.actions; input.actions = []; return a; }

// ---------------- Dokunmatik arayüz ----------------
const DEFAULT_LAYOUT = {
  left: { x: 4, y: 72 }, right: { x: 20, y: 72 }, wheel: { x: 3, y: 52 },
  gas: { x: 88, y: 66 }, brake: { x: 76, y: 74 }, hb: { x: 88, y: 46 }, nitro: { x: 76, y: 54 },
  joy: { x: 5, y: 58 }, jump: { x: 86, y: 70 }, runb: { x: 74, y: 76 },
  enter: { x: 92, y: 28 }, cam: { x: 92, y: 14 }, horn: { x: 66, y: 84 }, gup: { x: 66, y: 60 }, gdn: { x: 66, y: 70 }, act: { x: 80, y: 28 },
};

export function createTouchUI(root) {
  const S = G.settings;
  const wrap = el('div', { class: 'touch-ui', id: 'touchUI' });
  root.appendChild(wrap);
  const items = {};
  const mk = (id, label, cls, hold) => {
    const b = el('div', { class: 'tbtn ' + (cls || ''), 'data-id': id }, label);
    wrap.appendChild(b);
    items[id] = b;
    const set = (v) => { hold(v); b.classList.toggle('on', v); };
    b.addEventListener('touchstart', (e) => { if (wrap.classList.contains('edit')) return; e.preventDefault(); set(true); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); set(false); });
    b.addEventListener('touchcancel', () => set(false));
    b.addEventListener('mousedown', () => { if (!wrap.classList.contains('edit')) set(true); });
    b.addEventListener('mouseup', () => set(false));
    b.addEventListener('mouseleave', () => set(false));
    return b;
  };
  const T = touchState;
  mk('left', '◀', 'big drive-btn', (v) => (T.left = v ? 1 : 0));
  mk('right', '▶', 'big drive-btn', (v) => (T.right = v ? 1 : 0));
  mk('gas', '⬆', 'big drive', (v) => (T.gas = v ? 1 : 0));
  mk('brake', '⬇', 'big drive', (v) => (T.brake = v ? 1 : 0));
  mk('hb', 'EL', 'drive', (v) => (T.hb = v));
  mk('nitro', 'N₂O', 'drive nitro', (v) => (T.nitro = v));
  mk('horn', '📯', 'drive small', (v) => (T.horn = v));
  mk('gup', '+', 'drive small manual', (v) => v && pushAction('shiftUp'));
  mk('gdn', '−', 'drive small manual', (v) => v && pushAction('shiftDown'));
  mk('enter', t('İn/Bin'), 'small any', (v) => v && pushAction('enter'));
  mk('cam', '🎥', 'small any', (v) => v && pushAction('camera'));
  mk('act', '✋', 'small any act', (v) => v && pushAction('interact'));
  mk('jump', '⤒', 'big foot', (v) => v && pushAction('jump'));
  mk('runb', '🏃', 'foot', (v) => (T.run = v));
  // direksiyon simidi
  const wheel = el('div', { class: 'tbtn wheel drive-wheel', 'data-id': 'wheel' }, el('div', { class: 'wheel-in' }, '◎'));
  wrap.appendChild(wheel); items.wheel = wheel;
  let wheelTouch = null, wheelStart = 0;
  const wheelAngle = (tch) => { const r = wheel.getBoundingClientRect(); return Math.atan2(tch.clientX - (r.left + r.width / 2), -(tch.clientY - (r.top + r.height / 2))); };
  wheel.addEventListener('touchstart', (e) => { if (wrap.classList.contains('edit')) return; e.preventDefault(); wheelTouch = e.changedTouches[0].identifier; wheelStart = wheelAngle(e.changedTouches[0]) - T.wheel * 1.6; }, { passive: false });
  wheel.addEventListener('touchmove', (e) => { e.preventDefault(); for (const tc of e.changedTouches) if (tc.identifier === wheelTouch) { let a = wheelAngle(tc) - wheelStart; T.wheel = clamp(a / 1.6, -1, 1); wheel.firstChild.style.transform = `rotate(${T.wheel * 90}deg)`; } }, { passive: false });
  const wEnd = (e) => { for (const tc of e.changedTouches) if (tc.identifier === wheelTouch) { wheelTouch = null; T.wheel = 0; wheel.firstChild.style.transform = ''; } };
  wheel.addEventListener('touchend', wEnd); wheel.addEventListener('touchcancel', wEnd);
  // yürüme joystick
  const joy = el('div', { class: 'tbtn joy foot', 'data-id': 'joy' }, el('div', { class: 'joy-knob' }));
  wrap.appendChild(joy); items.joy = joy;
  let joyTouch = null;
  const joyMove = (tc) => { const r = joy.getBoundingClientRect(); const dx = (tc.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (tc.clientY - (r.top + r.height / 2)) / (r.height / 2); const l = Math.max(1, Math.hypot(dx, dy)); T.joyX = dx / l; T.joyY = -dy / l; joy.firstChild.style.transform = `translate(${(dx / l) * 35}px, ${(dy / l) * 35}px)`; };
  joy.addEventListener('touchstart', (e) => { if (wrap.classList.contains('edit')) return; e.preventDefault(); joyTouch = e.changedTouches[0].identifier; joyMove(e.changedTouches[0]); }, { passive: false });
  joy.addEventListener('touchmove', (e) => { e.preventDefault(); for (const tc of e.changedTouches) if (tc.identifier === joyTouch) joyMove(tc); }, { passive: false });
  const jEnd = (e) => { for (const tc of e.changedTouches) if (tc.identifier === joyTouch) { joyTouch = null; T.joyX = T.joyY = 0; joy.firstChild.style.transform = ''; } };
  joy.addEventListener('touchend', jEnd); joy.addEventListener('touchcancel', jEnd);

  const ui = {
    wrap, items, visible: true,
    layout() {
      const L = { ...DEFAULT_LAYOUT, ...(S.btnLayout || {}) };
      for (const id in items) {
        const p = L[id] || { x: 50, y: 50 };
        items[id].style.left = p.x + '%'; items[id].style.top = p.y + '%';
        items[id].style.transform = `scale(${S.btnScale})`;
        items[id].style.opacity = S.btnOpacity;
      }
    },
    setMode(mode) { // 'car' | 'foot' | 'none'
      wrap.dataset.mode = mode;
      wrap.dataset.ctrl = S.mobileControl;
      wrap.dataset.gear = S.gearbox;
      ui.visible = mode !== 'none';
      wrap.style.display = mode === 'none' || !input.touch ? 'none' : '';
    },
    // düzenleme modu: butonları sürükle
    edit(on) {
      wrap.classList.toggle('edit', on);
      wrap.style.display = on ? '' : wrap.style.display;
      if (on) wrap.dataset.mode = 'edit';
    },
  };
  // sürükleme
  let drag = null;
  const startDrag = (id, cx, cy) => { drag = { id }; };
  const moveDrag = (cx, cy) => {
    if (!drag) return;
    const r = wrap.getBoundingClientRect();
    const x = clamp(((cx - r.left) / r.width) * 100 - 4, 0, 94), y = clamp(((cy - r.top) / r.height) * 100 - 5, 0, 92);
    S.btnLayout = { ...(S.btnLayout || {}), [drag.id]: { x: Math.round(x), y: Math.round(y) } };
    ui.layout();
  };
  wrap.addEventListener('touchstart', (e) => { if (!wrap.classList.contains('edit')) return; const tb = e.target.closest('.tbtn'); if (tb) { e.preventDefault(); startDrag(tb.dataset.id); } }, { passive: false });
  wrap.addEventListener('touchmove', (e) => { if (drag) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  wrap.addEventListener('touchend', () => { if (drag) { drag = null; saveSettings(); } });
  wrap.addEventListener('mousedown', (e) => { if (!wrap.classList.contains('edit')) return; const tb = e.target.closest('.tbtn'); if (tb) startDrag(tb.dataset.id); });
  window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => { if (drag) { drag = null; saveSettings(); } });
  ui.layout();
  G.touchUI = ui;
  return ui;
}
export function resetLayout() { G.settings.btnLayout = {}; saveSettings(); if (G.touchUI) G.touchUI.layout(); }
