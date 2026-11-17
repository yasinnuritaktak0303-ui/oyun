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

// ---- yardımcı: değer gürültüsü ve normal haritası ----
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const P = (a, b) => hash2(((a % period) + period) % period, ((b % period) + period) % period);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (P(xi, yi) * (1 - u) + P(xi + 1, yi) * u) * (1 - v) + (P(xi, yi + 1) * (1 - u) + P(xi + 1, yi + 1) * u) * v;
}
// Döşenebilir fbm yükseklik alanı (0..1)
function heightField(W, H, scale, oct = 5, seed = 0) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, a = 1, n = 0, f = scale;
    for (let o = 0; o < oct; o++) { s += vnoise((x / W) * f + seed * 17, (y / H) * f * (H / W), f * 1) * a; n += a; a *= 0.5; f *= 2; }
    out[y * W + x] = s / n;
  }
  return out;
}
function normalFromHeight(h, W, H, strength) {
  const c = canvas(W, H), x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const l = h[y * W + ((xx - 1 + W) % W)], r = h[y * W + ((xx + 1) % W)], u = h[((y - 1 + H) % H) * W + xx], d = h[((y + 1) % H) * W + xx];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const o = (y * W + xx) * 4;
    img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, true, false);
}
function paintHeight(ctx, h, W, H, f) {
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const [r, g, b] = f(h[i], i % W, Math.floor(i / W)); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

// Yol dokusu: u = genişlik boyunca, v = yol boyunca (12 m periyot)
export function roadTexture(kind, lanes) {
  const key = 'road_' + kind + lanes;
  if (cache[key]) return cache[key];
  const W = 256, H = 512;
  const c = canvas(W, H), x = c.getContext('2d');
  const h = cache.roadH || (cache.roadH = heightField(W, H, 24, 5, 3));
  if (kind === 'dirt') {
    paintHeight(x, h, W, H, (v, px) => { const rut = Math.abs(px / W - 0.27) < 0.06 || Math.abs(px / W - 0.73) < 0.06 ? 0.82 : 1; const k = (0.75 + v * 0.45) * rut; return [138 * k, 106 * k, 72 * k]; });
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${90 + Math.random() * 80},${70 + Math.random() * 50},${50 + Math.random() * 30},0.8)`; x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  } else {
    const base = kind === 'track' ? 52 : kind === 'runway' ? 72 : 60;
    paintHeight(x, h, W, H, (v, px) => {
      const wear = 1 - 0.08 * (Math.exp(-((px / W - 0.25) ** 2) / 0.004) + Math.exp(-((px / W - 0.75) ** 2) / 0.004));
      const k = (base + (v - 0.5) * 34) * wear + (Math.random() < 0.04 ? 25 : 0);
      return [k, k, k * 1.03];
    });
    // çatlaklar ve yamalar
    x.strokeStyle = 'rgba(15,15,17,0.55)'; x.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) { x.beginPath(); let px = Math.random() * W, py = Math.random() * H; x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += (Math.random() - 0.5) * 24; py += (Math.random() - 0.3) * 18; x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(30,30,33,0.35)'; x.fillRect(Math.random() * W, Math.random() * H, 30 + Math.random() * 50, 20 + Math.random() * 40); }
    const line = (lx, ly, lw, lh, col) => { x.fillStyle = col; x.fillRect(lx, ly, lw, lh); x.fillStyle = 'rgba(80,80,80,0.25)'; for (let i = 0; i < lh / 3; i++) x.fillRect(lx + Math.random() * lw, ly + Math.random() * lh, 1.5, 1.5); };
    const wht = 'rgba(236,236,230,0.92)', yel = 'rgba(242,190,40,0.95)';
    line(5, 0, 5, H, wht); line(W - 10, 0, 5, H, wht);
    if (kind === 'runway') { for (let y = 0; y < H; y += 128) line(W / 2 - 4, y, 8, 72, wht); }
    else if (kind === 'drag') line(W / 2 - 2, 0, 5, H, wht);
    else if (kind === 'track') { /* pist: kenar çizgileri */ }
    else if (lanes >= 4) {
      line(W / 2 - 9, 0, 5, H, yel); line(W / 2 + 4, 0, 5, H, yel);
      for (let y = 0; y < H; y += 256) { line(W / 4 - 2, y, 5, 128, wht); line((W * 3) / 4 - 2, y, 5, 128, wht); }
    } else for (let y = 0; y < H; y += 256) line(W / 2 - 3, y, 6, 140, wht);
  }
  const t = tex(c);
  t.userData = { normal: cache.roadN || (cache.roadN = normalFromHeight(h, W, H, 3.5)) };
  return (cache[key] = t);
}

export function curbTexture() {
  if (cache.curb) return cache.curb;
  const c = canvas(16, 64), x = c.getContext('2d');
  x.fillStyle = '#c1121f'; x.fillRect(0, 0, 16, 32); x.fillStyle = '#efefef'; x.fillRect(0, 32, 16, 32);
  return (cache.curb = tex(c));
}

export function crosswalkTexture() {
  if (cache.cross) return cache.cross;
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  const h = cache.roadH || (cache.roadH = heightField(256, 512, 24, 5, 3));
  paintHeight(x, h, S, S, (v) => { const k = 58 + (v - 0.5) * 30; return [k, k, k * 1.03]; });
  x.fillStyle = 'rgba(236,236,230,0.9)';
  for (let i = 0; i < 8; i++) { x.fillRect(8 + i * 31, 4, 18, 30); x.fillRect(8 + i * 31, S - 34, 18, 30); x.fillRect(4, 8 + i * 31, 30, 18); x.fillRect(S - 34, 8 + i * 31, 30, 18); }
  return (cache.cross = tex(c, false));
}

// Bina cepheleri: renk + gece ışığı + pürüzlülük/metallik (camlar yansıtır)
export function facadeTextures(style) {
  const key = 'fac' + style;
  if (cache[key]) return cache[key];
  const S = 512;
  const c = canvas(S, S), x = c.getContext('2d');
  const e = canvas(S, S), ex = e.getContext('2d');
  const r = canvas(S, S), rx = r.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  rx.fillStyle = 'rgb(0,235,0)'; rx.fillRect(0, 0, S, S); // G=pürüzlülük, B=metallik
  const h = heightField(128, 128, 16, 4, style + 1);
  const tmp = canvas(128, 128); paintHeight(tmp.getContext('2d'), h, 128, 128, (v) => { const k = 205 + (v - 0.5) * 70; return [k, k, k]; });
  x.drawImage(tmp, 0, 0, S, S);
  const win = (wx, wy, ww, wh, frame = '#2c2f36', glassTint = [70, 95, 125]) => {
    x.fillStyle = frame; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
    g.addColorStop(0, `rgb(${glassTint[0] + 40},${glassTint[1] + 45},${glassTint[2] + 50})`); g.addColorStop(1, `rgb(${glassTint[0] - 30},${glassTint[1] - 30},${glassTint[2] - 25})`);
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = frame; x.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    rx.fillStyle = 'rgb(0,18,200)'; rx.fillRect(wx, wy, ww, wh);
    if (Math.random() < 0.4) {
      const warm = Math.random() < 0.75;
      ex.fillStyle = warm ? `rgb(255,${190 + Math.random() * 40},${110 + Math.random() * 40})` : '#cfe6ff';
      ex.fillRect(wx, wy, ww, wh);
      ex.fillStyle = 'rgba(0,0,0,0.35)'; ex.fillRect(wx, wy + wh * 0.65, ww, wh * 0.35);
    }
  };
  const ledge = (y) => { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, y, S, 6); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, y - 2, S, 2); };
  if (style === 0) { // konut: 2x2 pencere (8m x 8m)
    for (let fy = 0; fy < 2; fy++) { ledge(fy * 256 + 228); for (let fx = 0; fx < 2; fx++) { win(56 + fx * 256, 60 + fy * 256, 140, 132); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(50 + fx * 256, 196 + fy * 256, 152, 8); } }
  } else if (style === 1) { // ofis: cam giydirme
    x.fillStyle = '#3a4250'; x.fillRect(0, 0, S, S);
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) win(10 + fx * 128, 8 + fy * 128, 108, 104, '#5b6472', [80, 110, 145]);
  } else if (style === 2) { // düz duvar (galeri/garaj)
    for (let y = 0; y < S; y += 64) ledge(y + 60);
  } else if (style === 4) { // katlı otopark
    x.fillStyle = '#1e1f22'; x.fillRect(0, 80, S, 110); x.fillRect(0, 336, S, 110);
    for (let i = 0; i < S; i += 64) { x.fillStyle = '#8f9399'; x.fillRect(i, 80, 10, 110); x.fillRect(i, 336, 10, 110); }
  } else if (style === 5) { // tribün/hangar oluklu
    for (let i = 0; i < S; i += 24) { const g = x.createLinearGradient(i, 0, i + 24, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); x.fillStyle = g; x.fillRect(i, 0, 24, S); }
    rx.fillStyle = 'rgb(0,120,180)'; rx.fillRect(0, 0, S, S);
  } else if (style === 6) { // konteyner
    for (let i = 0; i < S; i += 20) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(i, 0, 8, S); }
    rx.fillStyle = 'rgb(0,140,150)'; rx.fillRect(0, 0, S, S);
  } else if (style === 7) { // fener/kule şerit
    x.fillStyle = '#c1121f'; x.fillRect(0, 128, S, 128); x.fillRect(0, 384, S, 128);
  }
  // sol alt köşe düz kalsın (çatı uv)
  x.fillStyle = '#e8e8e8'; x.fillRect(0, S - 24, 24, 24);
  ex.fillStyle = '#000'; ex.fillRect(0, S - 24, 24, 24);
  rx.fillStyle = 'rgb(0,235,0)'; rx.fillRect(0, S - 24, 24, 24);
  const out = { map: tex(c), emissive: tex(e), rough: tex(r, true, false), normal: style <= 2 ? (cache.wallN ||= normalFromHeight(heightField(128, 128, 24, 4, 9), 128, 128, 2)) : null };
  return (cache[key] = out);
}

export function groundTexture() {
  if (cache.ground) return cache.ground;
  const W = 512, H = 512;
  const h = heightField(W, H, 64, 6, 7);
  const c = canvas(W, H), x = c.getContext('2d');
  paintHeight(x, h, W, H, (v) => { const k = 0.78 + v * 0.26; return [255 * k * 0.98, 255 * k, 255 * k * 0.95]; });
  for (let i = 0; i < 6000; i++) { const k = Math.random(); x.fillStyle = k < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; x.fillRect(Math.random() * W, Math.random() * H, 1, 2 + Math.random() * 3); }
  const t = tex(c);
  t.userData = { normal: normalFromHeight(h, W, H, 4) };
  return (cache.ground = t);
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

export function crackTexture() {
  if (cache.crack) return cache.crack;
  const c = canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#dfe7ec'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(40,50,60,0.8)'; x.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2; x.beginPath(); x.moveTo(128, 128); let px = 128, py = 128; for (let k = 0; k < 6; k++) { px += Math.cos(a + (Math.random() - 0.5)) * 25; py += Math.sin(a + (Math.random() - 0.5)) * 25; x.lineTo(px, py); } x.stroke(); }
  for (let r = 20; r < 140; r += 28) { x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke(); }
  return (cache.crack = tex(c, false));
}
export function checkerTexture() {
  if (cache.checker) return cache.checker;
  const c = canvas(256, 32), x = c.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; x.fillRect(i * 16, j * 16, 16, 16); }
  return (cache.checker = tex(c));
}
export function carbonTexture() {
  if (cache.carbon) return cache.carbon;
  const c = canvas(64, 64), x = c.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const g = x.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8); const on = (i + j) % 2; g.addColorStop(0, on ? '#2a2b2f' : '#121315'); g.addColorStop(1, on ? '#121315' : '#2a2b2f'); x.fillStyle = g; x.fillRect(i * 8, j * 8, 8, 8); }
  const t = tex(c); t.repeat.set(6, 6); return (cache.carbon = t);
}
export function blobShadowTexture() {
  if (cache.blob) return cache.blob;
  const c = canvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return (cache.blob = tex(c, false));
}
export function tireTexture() {
  if (cache.tire) return cache.tire;
  const c = canvas(64, 256), x = c.getContext('2d');
  x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, 64, 256);
  x.fillStyle = '#0c0c0c';
  for (let i = 0; i < 64; i += 4) { x.fillRect(i, 70, 2, 116); }
  x.fillStyle = '#222'; x.fillRect(0, 60, 64, 6); x.fillRect(0, 190, 64, 6);
  const t = tex(c); return (cache.tire = t);
}
export function waterNormal() {
  if (cache.waterN) return cache.waterN;
  return (cache.waterN = normalFromHeight(heightField(128, 128, 8, 4, 21), 128, 128, 6));
}
export function cloudTexture() {
  if (cache.cloud) return cache.cloud;
  const W = 512;
  const h = heightField(W, W, 6, 6, 33);
  const c = canvas(W, W), x = c.getContext('2d'), img = x.createImageData(W, W);
  for (let i = 0; i < W * W; i++) {
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = Math.min(255, h[i] * 255);
  }
  x.putImageData(img, 0, 0);
  const t = tex(c); t.repeat.set(2, 2);
  return (cache.cloud = t);
}
