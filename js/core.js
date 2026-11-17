// Ortak durum, yardımcılar ve olay yolu
export const G = {
  scene: null, renderer: null, camera: null,
  world: null, player: null, car: null,
  settings: null, profile: null,
  mode: 'menu', // menu | play | garage | photo | drone
  paused: false,
  time: 0, // oyun zamanı (sn)
  dayTime: 0.35, // 0..1 gün döngüsü
  weather: 'sunny',
  mapId: 'city',
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
export const sign = (v) => (v < 0 ? -1 : 1);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  const f = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + f() * (b - a);
  f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// 2B değer gürültüsü (arazi için)
export function makeNoise(seed) {
  const r = seeded(seed);
  const P = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const V = new Float32Array(256);
  for (let i = 0; i < 256; i++) V[i] = r() * 2 - 1;
  const fade = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = V[P[(P[xi & 255] + yi) & 511] & 255];
    const b = V[P[(P[(xi + 1) & 255] + yi) & 511] & 255];
    const c = V[P[(P[xi & 255] + yi + 1) & 511] & 255];
    const d = V[P[(P[(xi + 1) & 255] + yi + 1) & 511] & 255];
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  n2.fbm = (x, y, oct = 4) => {
    let s = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += n2(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };
  return n2;
}

export const fmt = (n) => Math.round(n).toLocaleString('tr-TR');

// Basit olay yolu
const listeners = {};
export const on = (ev, fn) => { (listeners[ev] ||= []).push(fn); };
export const off = (ev, fn) => { const l = listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
export const emit = (ev, ...args) => { const l = listeners[ev]; if (l) for (const fn of l.slice()) fn(...args); };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

export function vibrate(pattern) {
  if (G.settings && !G.settings.vibration) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* yok */ }
}

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${w}`;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
