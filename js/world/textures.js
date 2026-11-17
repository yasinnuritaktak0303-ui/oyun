// Kanvas ile üretilen dokular (dış dosya gerektirmez)
import * as THREE from 'three';

const cache = {};
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noiseFill(ctx, w, h, base, amt, n = 3000) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.random() * amt;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

// Yol dokusu: u = genişlik boyunca, v = yol boyunca (12 m periyot)
export function roadTexture(kind, lanes) {
  const key = 'road_' + kind + lanes;
  if (cache[key]) return cache[key];
  const W = 128, H = 256;
  const c = canvas(W, H), x = c.getContext('2d');
  if (kind === 'dirt') {
    noiseFill(x, W, H, '#8a6a46', 0.18, 4000);
    x.fillStyle = 'rgba(60,40,20,0.35)'; x.fillRect(W * 0.2, 0, W * 0.12, H); x.fillRect(W * 0.68, 0, W * 0.12, H);
  } else {
    noiseFill(x, W, H, kind === 'track' ? '#3a3a3e' : '#46464a', 0.08, 5000);
    x.fillStyle = '#e8e8e8';
    const edge = 3;
    x.fillRect(2, 0, edge, H); x.fillRect(W - 2 - edge, 0, edge, H);
    if (kind === 'runway') {
      for (let y = 0; y < H; y += 64) x.fillRect(W / 2 - 2, y, 4, 36);
    } else if (kind === 'drag') {
      x.fillRect(W / 2 - 1, 0, 3, H);
    } else if (kind === 'track') {
      // pist: sadece kenar çizgileri
    } else if (lanes >= 4) {
      x.fillStyle = '#f2c94c'; x.fillRect(W / 2 - 5, 0, 3, H); x.fillRect(W / 2 + 2, 0, 3, H);
      x.fillStyle = '#e8e8e8';
      for (let y = 0; y < H; y += 128) { x.fillRect(W / 4 - 1, y, 3, 64); x.fillRect((W * 3) / 4 - 1, y, 3, 64); }
    } else {
      x.fillStyle = '#e8e8e8';
      for (let y = 0; y < H; y += 128) x.fillRect(W / 2 - 1.5, y, 3, 70);
    }
  }
  return (cache[key] = tex(c));
}

export function curbTexture() {
  if (cache.curb) return cache.curb;
  const c = canvas(16, 64), x = c.getContext('2d');
  x.fillStyle = '#d62828'; x.fillRect(0, 0, 16, 32); x.fillStyle = '#f1f1f1'; x.fillRect(0, 32, 16, 32);
  return (cache.curb = tex(c));
}

export function crosswalkTexture() {
  if (cache.cross) return cache.cross;
  const c = canvas(128, 128), x = c.getContext('2d');
  noiseFill(x, 128, 128, '#46464a', 0.08, 1500);
  x.fillStyle = '#eeeeee';
  for (let i = 0; i < 8; i++) { x.fillRect(4 + i * 15.5, 2, 9, 14); x.fillRect(4 + i * 15.5, 112, 9, 14); x.fillRect(2, 4 + i * 15.5, 14, 9); x.fillRect(112, 4 + i * 15.5, 14, 9); }
  return (cache.cross = tex(c, false));
}

// Bina cepheleri: stil başına renk dokusu + gece pencere ışık dokusu
export function facadeTextures(style) {
  const key = 'fac' + style;
  if (cache[key]) return cache[key];
  const S = 256;
  const c = canvas(S, S), x = c.getContext('2d');
  const e = canvas(S, S), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  noiseFill(x, S, S, '#ffffff', 0.06, 2000);
  const win = (wx, wy, ww, wh, glass = '#3d5a80') => {
    x.fillStyle = glass; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(wx, wy, ww, wh * 0.3);
    if (Math.random() < 0.38) { ex.fillStyle = Math.random() < 0.8 ? '#ffd27a' : '#bde0fe'; ex.fillRect(wx, wy, ww, wh); }
  };
  if (style === 0) { // konut: 2x2 kat/pencere (8m x 8m)
    for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) win(28 + fx * 128, 30 + fy * 128, 70, 64);
  } else if (style === 1) { // ofis cam
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) win(8 + fx * 64, 6 + fy * 64, 54, 50, '#5c7fa3');
  } else if (style === 4) { // katlı otopark
    x.fillStyle = '#2b2b2b'; x.fillRect(0, 40, S, 50); x.fillRect(0, 168, S, 50);
  } else if (style === 5) { // tribün/hangar
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < S; i += 16) x.fillRect(i, 0, 3, S);
  } else if (style === 6) { // konteyner
    x.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < S; i += 12) x.fillRect(i, 0, 5, S);
  } else if (style === 7) { // fener/kule şerit
    x.fillStyle = '#d62828'; x.fillRect(0, 64, S, 64); x.fillRect(0, 192, S, 64);
  }
  // sol alt köşe düz kalsın (çatı uv)
  x.fillStyle = '#ffffff'; x.fillRect(0, S - 12, 12, 12);
  ex.fillStyle = '#000'; ex.fillRect(0, S - 12, 12, 12);
  const out = { map: tex(c), emissive: tex(e) };
  return (cache[key] = out);
}

export function radialTexture(color = '#ffffff', inner = 0.0) {
  const key = 'rad' + color + inner;
  if (cache[key]) return cache[key];
  const c = canvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, inner * 32, 32, 32, 32);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (cache[key] = tex(c, false));
}

export function smokeTexture() {
  if (cache.smoke) return cache.smoke;
  const c = canvas(64, 64), x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const px = 20 + Math.random() * 24, py = 20 + Math.random() * 24, r = 10 + Math.random() * 14;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  return (cache.smoke = tex(c, false));
}

export function skidTexture() {
  if (cache.skid) return cache.skid;
  const c = canvas(32, 32), x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 32; i += 4) { x.fillStyle = 'rgba(15,15,15,0.85)'; x.fillRect(i, 0, 3, 32); }
  return (cache.skid = tex(c));
}

export function iconTexture(emoji, bg = '#1d3557') {
  const key = 'icon' + emoji + bg;
  if (cache[key]) return cache[key];
  const c = canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
  x.font = '64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 64, 70);
  return (cache[key] = tex(c, false));
}

export function textTexture(text, o = {}) {
  const c = canvas(o.w || 256, o.h || 64), x = c.getContext('2d');
  if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, c.width, c.height); }
  x.font = `${o.weight || 'bold'} ${o.size || 34}px sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.stroke) { x.strokeStyle = o.stroke; x.lineWidth = 6; x.strokeText(text, c.width / 2, c.height / 2); }
  x.fillStyle = o.color || '#fff';
  x.fillText(text, c.width / 2, c.height / 2);
  return tex(c, false);
}

export function plateTexture(plate, def) {
  const c = canvas(256, 56), x = c.getContext('2d');
  x.fillStyle = def.bg; x.fillRect(0, 0, 256, 56);
  if (def.band) { x.fillStyle = def.band; x.fillRect(0, 0, 30, 56); x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.fillText('TR', 4, 36); }
  x.strokeStyle = '#000'; x.lineWidth = 3; x.strokeRect(1, 1, 254, 54);
  x.fillStyle = def.fg; x.font = 'bold 36px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText((plate.text || '').slice(0, 10).toUpperCase(), def.band ? 143 : 128, 30);
  return tex(c, false);
}

// Vinil desenleri (araç yan yüzeyi için şeffaf kanvas)
export function vinylCanvas(v, base) {
  const S = 512;
  const c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  if (!v || v.id === 'none') return c;
  x.save();
  x.translate(v.x * S, v.y * S);
  x.rotate((v.rot * Math.PI) / 180);
  x.scale(v.scale, v.scale);
  x.fillStyle = v.color; x.strokeStyle = v.color;
  const id = v.id;
  if (id === 'stripes') { x.fillRect(-S, -40, S * 2, 26); x.fillRect(-S, 14, S * 2, 26); }
  else if (id === 'flame') {
    for (let i = 0; i < 6; i++) {
      x.beginPath(); x.moveTo(-200, -60 + i * 24);
      x.bezierCurveTo(-60, -90 + i * 24, 20 + i * 15, -40 + i * 10, 120 + i * 18, -70 + i * 26);
      x.bezierCurveTo(40, -20 + i * 20, -40, 0 + i * 22, -200, -40 + i * 24); x.fill();
    }
  } else if (id === 'tribal') {
    x.lineWidth = 18;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(-120 + i * 60, 0, 50, Math.PI * 0.1, Math.PI * 1.2); x.stroke(); }
  } else if (id === 'checker') {
    for (let i = -8; i < 8; i++) for (let j = -2; j < 2; j++) if ((i + j) & 1) x.fillRect(i * 30, j * 30, 30, 30);
  } else if (id === 'number') {
    x.beginPath(); x.arc(0, 0, 90, 0, Math.PI * 2); x.fill();
    x.fillStyle = base; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('7', 0, 8);
  } else if (id === 'camo') {
    for (let i = 0; i < 60; i++) { x.globalAlpha = 0.6; x.beginPath(); x.ellipse((Math.random() - 0.5) * 500, (Math.random() - 0.5) * 300, 30 + Math.random() * 40, 15 + Math.random() * 25, Math.random() * 3, 0, Math.PI * 2); x.fill(); }
  } else if (id === 'lightning') {
    x.beginPath(); x.moveTo(-220, -10); x.lineTo(-40, -40); x.lineTo(-60, -5); x.lineTo(220, -50); x.lineTo(40, 20); x.lineTo(60, -10); x.lineTo(-220, 30); x.fill();
  } else if (id === 'stars') {
    for (let i = 0; i < 14; i++) {
      const px = (i % 7) * 70 - 210, py = Math.floor(i / 7) * 80 - 40, r = 22;
      x.beginPath();
      for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); }
      x.fill();
    }
  }
  x.restore();
  return c;
}

export function groundTexture() {
  if (cache.ground) return cache.ground;
  const c = canvas(256, 256), x = c.getContext('2d');
  noiseFill(x, 256, 256, '#ffffff', 0.12, 9000);
  return (cache.ground = tex(c));
}

export function faceTexture(face, skin) {
  const c = canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = skin; x.fillRect(0, 0, 128, 128);
  const eyeY = 54, eyes = [[40, eyeY], [88, eyeY]];
  x.fillStyle = '#fff';
  const f = face % 8;
  for (const [ex, ey] of eyes) { x.beginPath(); x.ellipse(ex, ey, f === 3 ? 10 : 8, f === 5 ? 4 : 7, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = ['#3e2723', '#1565c0', '#2e7d32', '#4e342e', '#212121', '#6d4c41', '#00838f', '#5d4037'][f];
  for (const [ex, ey] of eyes) { x.beginPath(); x.arc(ex + 1, ey + 1, f === 5 ? 3 : 4, 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = '#3b2a20'; x.lineWidth = 4;
  // kaşlar
  x.beginPath(); x.moveTo(30, 40 - (f === 2 ? 4 : 0)); x.lineTo(50, f === 6 ? 44 : 40); x.moveTo(78, f === 6 ? 44 : 40); x.lineTo(98, 40 - (f === 2 ? 4 : 0)); x.stroke();
  // ağız
  x.strokeStyle = '#8d3b3b'; x.lineWidth = 4; x.beginPath();
  if (f === 0 || f === 4) x.arc(64, 82, 16, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (f === 1) { x.moveTo(50, 92); x.lineTo(78, 92); }
  else if (f === 2) x.arc(64, 100, 14, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (f === 3) { x.ellipse(64, 92, 8, 6, 0, 0, Math.PI * 2); }
  else if (f === 7) { x.moveTo(50, 90); x.quadraticCurveTo(70, 100, 80, 86); }
  else x.arc(64, 84, 12, 0.2 * Math.PI, 0.8 * Math.PI);
  x.stroke();
  if (f === 4 || f === 7) { x.fillStyle = 'rgba(220,100,100,0.35)'; x.beginPath(); x.arc(30, 74, 9, 0, 7); x.arc(98, 74, 9, 0, 7); x.fill(); }
  return tex(c, false);
}
