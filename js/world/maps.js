// 7 harita üreticisi (deterministik)
import { MapBuilder, SURF, catmull } from './builder.js';
import { MAP } from '../data/content.js';

function commonPois(b, x, z, rot = 0, set = ['fuel', 'repair', 'wash', 'gallery', 'garage', 'teleport', 'house', 'clothes']) {
  // POI'leri bir sokak boyunca diz
  const c = Math.cos(rot), s = Math.sin(rot);
  set.forEach((type, i) => {
    const lx = (i - (set.length - 1) / 2) * 34, lz = 0;
    const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
    b.flatten(px, pz, 14, b.h(px, pz), 10);
    b.poi(type, px, pz, rot);
  });
}

function scatter(b, n, fn, avoidRoad = true, rng = b.rng) {
  let tries = 0;
  while (n > 0 && tries++ < n * 30) {
    const x = (rng() - 0.5) * b.size * 0.96, z = (rng() - 0.5) * b.size * 0.96;
    if (avoidRoad && nearRoad(b, x, z, 9)) continue;
    if (fn(x, z) !== false) n--;
  }
}
export function nearRoad(b, x, z, r) {
  const sc = b.scs, h = b.half;
  for (let dz = -r; dz <= r; dz += sc) for (let dx = -r; dx <= r; dx += sc) {
    const i = Math.floor((x + dx + h) / sc), j = Math.floor((z + dz + h) / sc);
    if (i < 0 || j < 0 || i >= b.SN || j >= b.SN) continue;
    if (b.R[j * b.SN + i]) return true;
  }
  return false;
}
function nearPoi(b, x, z, r) {
  for (const p of b.pois) if (Math.hypot(p.x - x, p.z - z) < r) return true;
  for (const bl of b.buildings) if (Math.abs(bl.x - x) < bl.w / 2 + r * 0.3 && Math.abs(bl.z - z) < bl.d / 2 + r * 0.3) return true;
  return false;
}

// Duvarlı içine girilebilir yapı (galeri, garaj, kafe, hangar)
export function hollow(b, x, z, w, d, h, rot, color, o = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const y = b.h(x, z);
  const T = 0.5, door = o.door || 9;
  const W = (lx, lz, ww, dd, hh = h) => {
    const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
    b.building(px, pz, ww, dd, hh, { rot, y, color, style: 2 });
  };
  W(0, -d / 2, w, T); // arka
  W(-w / 2, 0, T, d); W(w / 2, 0, T, d); // yanlar
  const side = (w - door) / 2;
  W(-w / 2 + side / 2, d / 2, side, T); W(w / 2 - side / 2, d / 2, side, T); // ön (kapı boşluklu)
  // üst kapı lentosu (sadece görsel)
  const lx = 0, lz = d / 2;
  b.buildings.push({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, w: door, d: T, h: h - 4.5, rot, y: y + 4.5, color, style: 2 });
  // çatı
  b.buildings.push({ x, z, w: w + 0.6, d: d + 0.6, h: 0.4, rot, y: y + h, color: o.roofColor || '#555', style: 3 });
  b.interiors.push({ x, z, w, d, h, rot, y, kind: o.kind || 'room', floor: o.floor || '#d9d9d9' });
  b.flatten(x, z, Math.max(w, d) * 0.7, y, 12);
  b.setSurfRect(x - w / 2 - 4, z - d / 2 - 4, x + w / 2 + 4, z + d / 2 + 4, SURF.CONCRETE);
  return { x, z, y };
}

// ===================== ŞEHİR =====================
function city(b) {
  b.groundColor = '#6a9a4a';
  b.setHeights(() => 0);
  b.fillSurf((x, z) => (Math.abs(x) < 640 && Math.abs(z) < 640 ? SURF.CONCRETE : SURF.GRASS));
  const step = 120, L = 600;
  const lines = [];
  for (let v = -L; v <= L; v += step) lines.push(v);
  const isAve = (v) => v === 0 || Math.abs(v) === 360 || Math.abs(v) === 600;
  for (const v of lines) {
    for (let k = 0; k < lines.length - 1; k++) {
      const a = lines[k], c = lines[k + 1];
      const av = isAve(v);
      b.road([[v, a], [v, c]], { width: av ? 16 : 11, lanes: av ? 4 : 2, limit: av ? 70 : 50, y: 0, sidewalk: true });
      b.road([[a, v], [c, v]], { width: av ? 16 : 11, lanes: av ? 4 : 2, limit: av ? 70 : 50, y: 0, sidewalk: true });
    }
  }
  for (const x of lines) for (const z of lines) {
    if (Math.abs(x) < L && Math.abs(z) < L) b.trafficLight(x, z, isAve(x) || isAve(z) ? 16 : 11);
  }
  // sokak lambaları
  for (const v of lines) for (let u = -L; u < L; u += 40) {
    if (lines.includes(u)) continue;
    b.lamp(v + 9.5, u + 20, -Math.PI / 2); b.lamp(u + 20, v - 9.5, 0);
  }
  const special = {
    '5,5': 'garage', '4,5': 'gallery', '5,4': 'cafe', '4,4': 'fuel', '6,5': 'repair', '6,4': 'park1', '3,6': 'park2',
    '7,7': 'park3', '2,2': 'park4', '5,7': 'park5', '7,3': 'pgarage', '2,6': 'green', '8,2': 'green', '1,1': 'green',
    '6,6': 'house', '3,5': 'clothes', '4,6': 'teleport', '9,0': 'hidden', '0,9': 'jump', '8,8': 'green', '5,6': 'wash',
    '3,3': 'park6', '6,3': 'tuning',
  };
  const rng = b.rng;
  const colors = ['#c9c4b8', '#9aa5b1', '#b88b6a', '#d8d2c2', '#7d8a96', '#a3b18a', '#e0c9a6', '#8d99ae', '#cdb4a0', '#6c7a89'];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const cx = -540 + i * step, cz = -540 + j * step;
    const typ = special[i + ',' + j];
    const inner = 45;
    if (!typ) {
      // binalar
      const dist = Math.hypot(cx, cz);
      const tall = Math.max(10, 90 - dist / 7);
      const alley = rng() < 0.35;
      const n = 2 + Math.floor(rng() * 2);
      const cell = (inner * 2) / n;
      for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
        let bx = cx - inner + cell * (a + 0.5), bz = cz - inner + cell * (c + 0.5);
        let bw = cell - 3, bd = cell - 3;
        if (alley) { // ortadan ara sokak
          if (a < n / 2) bx -= 3; else bx += 3;
          bw -= 3;
        }
        const hh = tall * (0.4 + rng() * 0.8);
        b.building(bx, bz, bw, bd, hh, { color: colors[Math.floor(rng() * colors.length)], style: hh > 30 ? 1 : 0, y: 0 });
      }
      if (alley) {
        b.hidden.push({ x: cx, z: cz, kind: 'alley' });
        if (rng() < 0.6) b.chest(rng() < 0.3 ? 1 : 0, cx, cz + (rng() - 0.5) * 60);
      }
      continue;
    }
    if (typ === 'garage') { hollow(b, cx, cz - 10, 40, 30, 9, 0, '#e9ecef', { kind: 'garage' }); b.poi('garage', cx, cz + 12, 0); b.spawn = { x: cx + 2, z: cz + 40, rot: Math.PI / 2 }; }
    else if (typ === 'gallery') { hollow(b, cx, cz - 6, 56, 40, 10, 0, '#dee2e6', { kind: 'gallery', floor: '#f1f3f5' }); b.poi('gallery', cx, cz + 10, 0); }
    else if (typ === 'cafe') {
      hollow(b, cx, cz, 30, 22, 6, Math.PI, '#e8d5b5', { kind: 'cafe', floor: '#b08968', door: 7 });
      for (let k = 0; k < 6; k++) b.prop('table', cx - 9 + (k % 3) * 9, cz - 3 + Math.floor(k / 3) * 7);
      b.box(cx, cz - 7, 14, 1.2, 0, -1, 1.1, 'counter'); b.prop('counter', cx, cz - 7);
      b.poi('cafe', cx, cz - 2, Math.PI);
      b.chest(0, cx + 11, cz - 8);
    }
    else if (typ === 'fuel') { b.poi('fuel', cx, cz, 0); b.parking(cx, cz + 30, 0, 8); }
    else if (typ === 'repair') { b.poi('repair', cx - 20, cz, 0); b.parking(cx + 20, cz + 10, Math.PI / 2, 6); }
    else if (typ === 'wash') { b.poi('wash', cx, cz, 0); b.parking(cx, cz + 30, 0, 6); }
    else if (typ === 'house') { b.poi('house', cx, cz, 0); b.building(cx, cz - 30, 30, 20, 9, { color: '#f4a261', y: 0 }); }
    else if (typ === 'clothes') { b.poi('clothes', cx, cz, 0); b.building(cx, cz - 25, 40, 25, 8, { color: '#cdb4db', y: 0 }); b.poi('tuning', cx + 30, cz + 20, 0); }
    else if (typ === 'tuning') { b.poi('tuning', cx, cz, 0); b.building(cx, cz - 25, 40, 25, 8, { color: '#adb5bd', y: 0 }); b.parking(cx, cz + 28, 0, 6); }
    else if (typ === 'teleport') { b.poi('teleport', cx, cz, 0); for (let k = 0; k < 10; k++) b.tree(cx + (rng() - 0.5) * 80, cz + (rng() - 0.5) * 80, 0.8 + rng() * 0.6); }
    else if (typ.startsWith('park')) {
      const n = +typ.slice(4);
      b.parking(cx, cz - 22, 0, 12, 1, { angle: n % 3 === 0 ? 0 : 0 });
      b.parking(cx, cz + 22, Math.PI, 12, 1);
      if (n === 2 || n === 5) b.chest(0, cx + 40, cz + 40);
      if (n === 4) b.key(cx - 42, cz - 42);
    }
    else if (typ === 'pgarage') {
      // katlı otopark: rampa ile çatıya çık, çatıda altın sandık
      b.building(cx + 10, cz, 60, 70, 12, { color: '#868e96', y: 0, roofDeck: true, style: 4 });
      b.ramp(cx - 33, cz - 8, Math.PI, 54, 8, 12, { color: '#6c757d' });
      b.box(cx - 37.5, cz - 8, 1, 54, 0, 0, 13, 'rail'); b.box(cx - 28.5, cz - 8, 1, 54, 0, 0, 13, 'rail');
      b.chest(2, cx + 25, cz + 20, 12.05);
      b.chest(1, cx - 5, cz - 25, 12.05);
      b.key(cx + 30, cz - 28, 12.05);
    }
    else if (typ === 'green') {
      b.setSurfRect(cx - inner, cz - inner, cx + inner, cz + inner, SURF.GRASS);
      b.paint.push({ type: 'grass', x: cx, z: cz, w: inner * 2, d: inner * 2 });
      for (let k = 0; k < 30; k++) b.tree(cx + (rng() - 0.5) * 84, cz + (rng() - 0.5) * 84, 0.7 + rng() * 0.8);
      b.chest(0, cx + (rng() - 0.5) * 60, cz + (rng() - 0.5) * 60);
      b.zones.push({ x: cx, z: cz, r: 75, limit: 30, name: 'Okul bölgesi' });
      b.bumps.push({ x: cx - 60, z: cz, rot: Math.PI / 2, w: 11 }, { x: cx + 60, z: cz, rot: Math.PI / 2, w: 11 });
    }
    else if (typ === 'hidden') {
      // gizli bölge: duvarlarla çevrili, dar bir girişi var
      const s = 44;
      b.building(cx, cz - s, s * 2, 2, 6, { color: '#6c584c', y: 0 });
      b.building(cx, cz + s, s * 2, 2, 6, { color: '#6c584c', y: 0 });
      b.building(cx - s, cz - 6, 2, s * 2 - 12, 6, { color: '#6c584c', y: 0 });
      b.building(cx + s, cz, 2, s * 2, 6, { color: '#6c584c', y: 0 });
      b.chest(3, cx + 10, cz);
      b.diamond = { x: cx + 10, z: cz, y: 0 };
      b.chests.pop();
      b.chest(1, cx - 20, cz + 30);
      b.hidden.push({ x: cx, z: cz, kind: 'secret' });
    }
    else if (typ === 'jump') {
      b.ramp(cx, cz + 30, Math.PI, 18, 7, 3.5, { color: '#ffb703' });
      b.ramp(cx, cz - 25, 0, 14, 7, 2.5, { color: '#fb8500' });
      b.chest(2, cx, cz - 45, 0);
      b.key(cx + 40, cz + 40);
    }
  }
  // dış çevre: ağaçlar ve duvar
  scatter(b, 260, (x, z) => { if (Math.abs(x) < 660 && Math.abs(z) < 660) return false; b.tree(x, z, 0.8 + b.rng() * 0.8); });
  const E = 695;
  b.box(0, -E, 1400, 4); b.box(0, E, 1400, 4); b.box(-E, 0, 4, 1400); b.box(E, 0, 4, 1400);
  b.chest(1, 650, -650); b.chest(0, -660, 300); b.chest(1, 300, 660);
  b.cams.push({ x: 0, z: -200, rot: 0, limit: 70 }, { x: 360, z: 100, rot: 0, limit: 70 }, { x: -200, z: 0, rot: Math.PI / 2, limit: 70 });
  b.tracks.push({ id: 'city_loop', closed: true, pts: [[0, 0], [360, 0], [360, 360], [0, 360], [0, 0]] });
  b.tracks.push({ id: 'city_big', closed: true, pts: [[-360, -360], [360, -360], [360, 360], [-360, 360], [-360, -360]] });
  b.tracks.push({ id: 'city_sprint', closed: false, pts: [[-600, -600], [-600, 0], [0, 0], [0, 600], [600, 600]] });
  b.driftZone = { x: -540, z: 540, r: 50 };
  b.setSurfRect(-585, 495, -495, 585, SURF.ASPHALT); b.paint.push({ type: 'pad', x: -540, z: 540, w: 90, d: 90 });
  b.drag = null;
  b.water = null;
}

// ===================== OTOBAN VE ÇÖL =====================
function highway(b) {
  b.groundColor = '#d9b26f';
  const n = b.noise;
  b.setHeights((x, z) => 6 * n.fbm(x / 160, z / 160, 3) + 3 * n(x / 40 + 9, z / 40) + 2);
  b.fillSurf(() => SURF.SAND);
  // otoyol halkası
  const loop = [];
  for (let x = -600; x <= 600; x += 50) loop.push([x, 0]);
  for (let a = -80; a <= 80; a += 20) { const r = (a * Math.PI) / 180; loop.push([600 + 300 * Math.cos(r), 300 + 300 * Math.sin(r - Math.PI / 2 + Math.PI / 2) * 0 + 300 * Math.sin(r)]); }
  for (let x = 600; x >= -600; x -= 50) loop.push([x, 600]);
  for (let a = 100; a <= 260; a += 20) { const r = (a * Math.PI) / 180; loop.push([-600 + 300 * Math.cos(r), 300 + 300 * Math.sin(r)]); }
  // düzelt: yay noktaları
  const pts = [];
  for (let x = -600; x < 600; x += 40) pts.push([x, 0]);
  for (let a = -90; a < 90; a += 15) { const r = (a * Math.PI) / 180; pts.push([600 + 300 * Math.cos(r), 300 + 300 * Math.sin(r)]); }
  for (let x = 600; x > -600; x -= 40) pts.push([x, 600]);
  for (let a = 90; a < 270; a += 15) { const r = (a * Math.PI) / 180; pts.push([-600 + 300 * Math.cos(r), 300 + 300 * Math.sin(r)]); }
  pts.push([-600, 0]);
  b.flattenRect(-950, -40, 950, 640, 3, 40);
  b.road(pts, { width: 22, lanes: 4, limit: 120, closed: true, smoothH: 10, maxGrade: 0.04, name: 'Otoyol' });
  // kasaba bağlantısı
  b.flattenRect(-260, 240, 260, 360, 3, 20);
  b.road([[0, 0], [0, 300]], { width: 12, limit: 50 });
  b.road([[0, 300], [0, 600]], { width: 12, limit: 50 });
  b.road([[-250, 300], [0, 300]], { width: 12, limit: 50, sidewalk: true });
  b.road([[0, 300], [250, 300]], { width: 12, limit: 50, sidewalk: true });
  b.setSurfRect(-260, 260, 260, 340, SURF.CONCRETE);
  // drag pisti
  b.flattenRect(-560, -430, 420, -370, 3, 25);
  b.road([[-520, -400], [-520, -200], [-520, 0]], { width: 12, limit: 80 });
  b.road([[-520, -400], [400, -400]], { width: 20, limit: 400, traffic: false, y: 3, kind: 'drag' });
  b.drag = { x: -480, z: -400, rot: Math.PI / 2, len: 402 };
  b.prop('dragtree', -484, -411, { rot: Math.PI / 2 });
  for (let i = 0; i < 6; i++) b.building(-300 + i * 120, -425, 40, 6, 5, { color: '#ced4da', style: 5 });
  // çöl patikaları
  b.road(catmull([[250, 0], [300, -250], [100, -650], [-200, -800], [-600, -700]], false, 6), { width: 8, kind: 'dirt', limit: 60, traffic: false });
  b.road(catmull([[300, 600], [400, 800], [0, 900], [-400, 820], [-600, 600]], false, 6), { width: 8, kind: 'dirt', limit: 60, traffic: false });
  b.finalizeRoads = b.finalizeRoads.bind(b);
  // gişeler
  b.tolls.push({ x: -300, z: 0, rot: Math.PI / 2, w: 22 });
  for (const zz of [-5.5, 0, 5.5]) b.box(-300, zz, 8, 1.2, 0, -5, 1.2, 'toll');
  b.tolls.push({ x: 300, z: 600, rot: Math.PI / 2, w: 22 });
  for (const zz of [594.5, 600, 605.5]) b.box(300, zz, 8, 1.2, 0, -5, 1.2, 'toll');
  // kasaba POI
  commonPois(b, 0, 330, 0, ['fuel', 'repair', 'wash', 'gallery', 'garage', 'teleport', 'house']);
  b.parking(-150, 270, Math.PI, 10); b.parking(150, 270, Math.PI, 10);
  b.spawn = { x: -60, z: 300, rot: Math.PI / 2 };
  for (let i = 0; i < 6; i++) b.building(-230 + i * 90, 380, 30, 18, 6 + b.rng() * 6, { color: '#e9c46a', style: 0 });
  for (let x = -240; x <= 240; x += 30) { b.lamp(x, 292, 0); b.lamp(x, 308, Math.PI); }
  // rampalar
  b.ramp(200, -150, 0, 20, 8, 4, { color: '#e76f51' });
  b.ramp(-200, 800, Math.PI, 22, 8, 5, { color: '#e76f51' });
  b.ramp(700, 800, Math.PI / 4, 24, 8, 6, { color: '#f4a261' });
  b.ramp(-700, -700, -Math.PI / 4, 18, 8, 3.5, { color: '#f4a261' });
  // kaktüs ve kayalar
  scatter(b, 260, (x, z) => b.tree(x, z, 0.7 + b.rng() * 0.6, 2));
  scatter(b, 90, (x, z) => b.rock(x, z, 0.8 + b.rng() * 2));
  // sandıklar
  b.chest(0, 220, -175); b.chest(0, -150, 450); b.chest(1, 820, 900); b.chest(0, -900, 200); b.chest(1, 0, -900);
  b.chest(0, 500, 300); b.chest(2, 760, 840); b.chest(1, -880, -880); b.chest(0, 400, -380); b.chest(2, -230, 820);
  b.key(880, -880); b.key(-940, 940); b.key(250, 900);
  b.diamond = { x: 0, z: -700, y: null };
  b.cams.push({ x: 200, z: 0, rot: Math.PI / 2, limit: 120 }, { x: -200, z: 600, rot: Math.PI / 2, limit: 120 }, { x: 0, z: 150, rot: 0, limit: 50 });
  b.tracks.push({ id: 'hw_loop', closed: true, pts: pts.filter((_, i) => i % 3 === 0).concat([[-600, 0]]) });
  b.tracks.push({ id: 'desert', closed: false, pts: [[250, 0], [300, -250], [100, -650], [-200, -800], [-600, -700]] });
  b.driftZone = { x: 150, z: 450, r: 50 };
  b.flatten(150, 450, 55, 3, 20);
  b.setSurfRect(100, 400, 200, 500, SURF.ASPHALT); b.paint.push({ type: 'pad', x: 150, z: 450, w: 100, d: 100 });
  const E = b.half - 4;
  b.box(0, -E, b.size, 4); b.box(0, E, b.size, 4); b.box(-E, 0, 4, b.size); b.box(E, 0, 4, b.size);
}

// ===================== DAĞ =====================
function mountain(b) {
  b.groundColor = '#4f7942';
  const n = b.noise;
  const river = (x, z) => Math.abs(z - (0.35 * x + 40 * Math.sin(x / 120)));
  b.setHeights((x, z) => {
    const r = Math.hypot(x, z);
    const k = Math.max(0, 1 - r / 470);
    let hgt = 40 * n.fbm(x / 420, z / 420, 5) + 50 + k * k * (3 - 2 * k) * 140;
    const rv = river(x, z);
    if (rv < 60) hgt -= (1 - rv / 60) ** 2 * 40;
    return hgt;
  });
  b.fillSurf((x, z) => SURF.GRASS);
  const ctrl = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 560 + (i % 2 ? 60 : -40) + n(i * 3.1, 7) * 60;
    ctrl.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const loopPts = catmull(ctrl, true, 6);
  b.road(loopPts, { width: 10, limit: 60, closed: true, structures: true, smoothH: 12, maxGrade: 0.11, name: 'Dağ yolu' });
  // köy (yolun iç tarafında)
  const v = ctrl[0];
  const vx = v[0] - 90, vz = v[1];
  const vy = b.h(vx, vz) * 0.5 + b.h(v[0], v[1]) * 0.5;
  b.flatten(vx, vz, 90, vy, 40);
  b.road([[v[0], v[1]], [vx + 40, vz]], { width: 10, limit: 40 });
  b.road([[vx + 40, vz], [vx - 80, vz]], { width: 10, limit: 40, sidewalk: true });
  // orta geçit (tünel olasılığı yüksek)
  const c1 = ctrl[4], c2 = ctrl[11];
  b.road(catmull([c1, [c1[0] * 0.5, c1[1] * 0.4], [0, 40], [c2[0] * 0.5, c2[1] * 0.5], c2], false, 6), { width: 10, limit: 60, structures: true, smoothH: 12, maxGrade: 0.11 });
  b.finalizeRoadsLate = true;
  // POI'ler köyde
  commonPois(b, vx - 30, vz + 40, Math.PI / 2 * 0, ['fuel', 'repair', 'wash', 'gallery']);
  commonPois(b, vx - 30, vz - 45, 0, ['garage', 'teleport', 'house']);
  b.spawn = { x: vx + 20, z: vz + 5, rot: Math.PI / 2 };
  b.parking(vx - 20, vz + 80, Math.PI, 8);
  for (let i = 0; i < 5; i++) b.building(vx - 120 + i * 0, vz - 80 + i * 40, 14, 12, 6, { color: '#a47148', style: 0 });
  // ağaçlar
  scatter(b, 900, (x, z) => { if (b.h(x, z) > 190) return false; b.tree(x, z, 0.8 + b.rng() * 0.9, 1); });
  scatter(b, 120, (x, z) => b.rock(x, z, 1 + b.rng() * 2.5));
  // zirve sandıkları
  let peaks = [];
  for (let i = 0; i < 400; i++) { const x = (b.rng() - 0.5) * 1200, z = (b.rng() - 0.5) * 1200; peaks.push([b.h(x, z), x, z]); }
  peaks.sort((a, c) => c[0] - a[0]);
  b.chest(2, peaks[0][1], peaks[0][2]); b.chest(2, peaks[5][1], peaks[5][2]); b.chest(1, peaks[12][1], peaks[12][2]);
  b.key(peaks[20][1], peaks[20][2]);
  for (let i = 0; i < 9; i++) { const p = loopPts[(i * 61 + 17) % loopPts.length]; b.chest(i % 3 === 0 ? 1 : 0, p[0] * 1.06, p[1] * 1.06); }
  b.key(loopPts[200][0] * 0.9, loopPts[200][1] * 0.9);
  b.key(-600, 600);
  b.diamond = { x: peaks[2][1], z: peaks[2][2], y: null };
  b.ramp(loopPts[90][0] * 0.93, loopPts[90][1] * 0.93, Math.atan2(-loopPts[90][0], -loopPts[90][1]), 18, 7, 3.5, { color: '#e76f51' });
  b.cams.push({ x: loopPts[50][0], z: loopPts[50][1], rot: 0, limit: 60 }, { x: loopPts[300][0], z: loopPts[300][1], rot: 0, limit: 60 });
  b.tracks.push({ id: 'mt_loop', closed: true, pts: ctrl.concat([ctrl[0]]), smooth: true });
  b.tracks.push({ id: 'mt_pass', closed: false, pts: [c1, [c1[0] * 0.5, c1[1] * 0.4], [0, 40], [c2[0] * 0.5, c2[1] * 0.5], c2], smooth: true });
  b.driftZone = { x: vx + 40, z: vz + 140, r: 40 };
  b.flatten(vx + 40, vz + 140, 45, vy, 30);
  b.setSurfRect(vx, vz + 100, vx + 80, vz + 180, SURF.ASPHALT); b.paint.push({ type: 'pad', x: vx + 40, z: vz + 140, w: 80, d: 80 });
  b.road([[vx + 40, vz], [vx + 40, vz + 100]], { width: 10, limit: 40, traffic: false });
  b.water = { level: b.h(0, 40) - 30 > 0 ? 20 : 20, river: true };
  const E = b.half - 4;
  b.box(0, -E, b.size, 4); b.box(0, E, b.size, 4); b.box(-E, 0, 4, b.size); b.box(E, 0, 4, b.size);
}

// ===================== ARAZİ =====================
function offroad(b) {
  b.groundColor = '#7a8b46';
  const n = b.noise;
  b.setHeights((x, z) => 26 * n.fbm(x / 260, z / 260, 4) + 9 * n(x / 55, z / 55) + 20);
  b.fillSurf((x, z) => (n(x / 90 + 3, z / 90) > 0.35 ? SURF.DIRT : SURF.GRASS));
  const ctrl = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const r = 420 + n(i, 3) * 120; ctrl.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const loopPts = catmull(ctrl, true, 6);
  b.road(loopPts, { width: 9, kind: 'dirt', limit: 60, closed: true, traffic: false, smoothH: 4, maxGrade: 0.25 });
  b.road(catmull([[0, 0], [150, -120], [300, -150], ctrl[9]], false, 6), { width: 8, kind: 'dirt', traffic: false, smoothH: 3, maxGrade: 0.3 });
  b.road(catmull([[0, 0], [-120, 160], [-200, 300], ctrl[3]], false, 6), { width: 8, kind: 'dirt', traffic: false, smoothH: 3, maxGrade: 0.3 });
  b.road(catmull([[0, 0], [-200, -100], [-350, -50], ctrl[5]], false, 6), { width: 8, kind: 'dirt', traffic: false, smoothH: 3, maxGrade: 0.3 });
  // çiftlik
  const fy = b.h(0, 0);
  b.flatten(0, 0, 70, fy, 30);
  b.road([[ -60, 40], [60, 40]], { width: 10, kind: 'dirt', y: undefined, traffic: false });
  commonPois(b, 0, 70, 0, ['fuel', 'repair', 'wash', 'gallery', 'garage', 'teleport', 'house']);
  hollow(b, -35, -25, 30, 22, 9, 0, '#9d0208', { kind: 'barn', floor: '#7f5539' });
  b.flattenRect(30, 100, 130, 140, fy, 15);
  b.parking(80, 120, Math.PI, 12);
  b.building(35, -25, 10, 10, 14, { color: '#adb5bd', style: 0 });
  b.spawn = { x: 0, z: 40, rot: Math.PI / 2 };
  // çamur
  for (let i = 0; i < 18; i++) {
    const p = loopPts[(i * 37 + 11) % loopPts.length];
    const r = 10 + b.rng() * 18;
    b.setSurfCircle(p[0], p[1], r, SURF.MUD);
    b.zones.push({ x: p[0], z: p[1], r, mud: true });
    b.flatten(p[0], p[1], r * 0.8, b.h(p[0], p[1]) - 0.5, r * 0.4);
  }
  scatter(b, 260, (x, z) => b.rock(x, z, 0.6 + b.rng() * 2.4));
  scatter(b, 450, (x, z) => b.tree(x, z, 0.8 + b.rng() * 0.9, b.rng() < 0.5 ? 1 : 0));
  for (let i = 0; i < 10; i++) {
    const k = (i * 53 + 20) % loopPts.length, p = loopPts[k], q = loopPts[(k + 2) % loopPts.length];
    b.ramp(p[0], p[1], Math.atan2(q[0] - p[0], q[1] - p[1]), 10, 7, 1.6 + (i % 3) * 0.6, { color: '#8d6e63' });
  }
  b.chest(0, 200, 200); b.chest(0, -300, 100); b.chest(1, 500, -500); b.chest(0, -500, 450); b.chest(1, 0, -600);
  b.chest(2, 600, 600); b.chest(0, -150, -350); b.chest(1, -620, -200); b.chest(2, -560, 560);
  b.key(640, -100); b.key(-640, 640); b.key(100, 640);
  b.diamond = { x: -600, z: -600, y: null };
  b.tracks.push({ id: 'off_loop', closed: true, pts: ctrl.concat([ctrl[0]]), smooth: true });
  b.driftZone = { x: 80, z: 0, r: 30 };
  b.cams.push({ x: loopPts[40][0], z: loopPts[40][1], rot: 0, limit: 50 });
  const E = b.half - 4;
  b.box(0, -E, b.size, 4); b.box(0, E, b.size, 4); b.box(-E, 0, 4, b.size); b.box(E, 0, 4, b.size);
}

// ===================== ADA =====================
function island(b) {
  b.groundColor = '#78a85a';
  const n = b.noise;
  const coast = (a) => 540 + 70 * n(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5);
  b.setHeights((x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const R = coast(a);
    let hgt = (R - r) / R;
    hgt = hgt > 0 ? 3 + Math.pow(hgt, 1.3) * 60 * (0.6 + 0.6 * n.fbm(x / 200, z / 200, 3)) : -2 + hgt * 60;
    // adacık
    const d2 = Math.hypot(x - 690, z - 330);
    if (d2 < 80) hgt = Math.max(hgt, 5 * (1 - d2 / 80) + 2 - 0.0);
    return Math.max(hgt, -14);
  });
  b.fillSurf((x, z) => (b.h(x, z) < 5 ? SURF.SAND : SURF.GRASS));
  const ctrl = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const R = coast(a) - 75; ctrl.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const loopPts = catmull(ctrl, true, 6);
  b.road(loopPts, { width: 11, limit: 70, closed: true, smoothH: 12, maxGrade: 0.08, name: 'Sahil yolu' });
  // kasaba ve liman (güney)
  const tz = 330;
  b.flattenRect(-180, tz - 60, 180, tz + 70, 5, 25);
  b.road([[ctrl[4][0], ctrl[4][1]], [0, tz], [0, 0], [ctrl[12][0], ctrl[12][1]]].map((p) => p), { width: 11, limit: 50 });
  b.road([[-170, tz], [0, tz]], { width: 11, limit: 40, sidewalk: true });
  b.road([[0, tz], [170, tz]], { width: 11, limit: 40, sidewalk: true });
  b.setSurfRect(-180, tz - 40, 180, tz + 60, SURF.CONCRETE);
  commonPois(b, 0, tz + 40, 0, ['fuel', 'repair', 'wash', 'gallery', 'garage', 'teleport', 'house']);
  b.spawn = { x: -80, z: tz, rot: Math.PI / 2 };
  b.parking(-110, tz + 22, Math.PI, 8); b.parking(110, tz + 22, Math.PI, 8);
  for (let i = 0; i < 7; i++) b.building(-160 + i * 52, tz - 40, 28, 16, 6 + b.rng() * 10, { color: ['#ffffff', '#caf0f8', '#ffd6a5', '#fdffb6'][i % 4], style: 0 });
  for (let x = -160; x <= 160; x += 32) { b.lamp(x, tz - 8, 0); b.lamp(x, tz + 8, Math.PI); }
  // liman: güney kıyısı
  const hy = 1.6;
  const dockZ = coast(Math.PI / 2) + 10;
  b.road([[0, tz + 70], [0, dockZ - 20]], { width: 12, limit: 30, traffic: false });
  b.deck(0, dockZ + 40, 0, 120, 60, hy, hy, { dock: true });
  b.deck(-70, dockZ + 70, 0, 60, 14, hy, hy, { dock: true });
  b.deck(70, dockZ + 70, 0, 60, 14, hy, hy, { dock: true });
  for (let i = 0; i < 8; i++) {
    const cx = -20 + (i % 4) * 13, cz = dockZ + 20 + Math.floor(i / 4) * 30;
    b.building(cx, cz, 12, 2.6, 2.7, { y: hy, color: ['#d62828', '#003049', '#f77f00', '#2a9d8f'][i % 4], style: 6 });
  }
  b.prop('crane', 25, dockZ + 60, { y: hy });
  b.prop('boat', -70, dockZ + 110, { y: 0 });
  b.prop('boat', 90, dockZ + 115, { y: 0, rot: 0.4 });
  b.chest(1, -70, dockZ + 95, hy); b.chest(0, 70, dockZ + 95, hy);
  // deniz feneri (kuzey)
  const ln = coast(-Math.PI / 2) - 30;
  b.building(0, -ln, 6, 6, 22, { color: '#f8f9fa', style: 7 });
  b.chest(2, 6, -ln - 8);
  // adacık köprüsü
  const ai = Math.round((Math.atan2(330, 690) / (Math.PI * 2)) * loopPts.length);
  const ap = loopPts[(ai + loopPts.length) % loopPts.length];
  b.road([[ap[0], ap[1]], [690, 330]], { width: 9, limit: 40, structures: true, smoothH: 6, maxGrade: 0.06, traffic: false });
  b.chest(2, 700, 345); b.key(680, 310);
  // plajlar
  scatter(b, 420, (x, z) => { const hh = b.h(x, z); if (hh < 6) return false; b.tree(x, z, 0.8 + b.rng() * 0.8, hh < 14 ? 3 : 0); });
  scatter(b, 60, (x, z) => { const hh = b.h(x, z); if (hh < 1 || hh > 5) return false; b.prop('umbrella', x, z); });
  for (let i = 0; i < 10; i++) { const a = i * 0.63; const R = coast(a) - 20; b.chest(i % 4 === 0 ? 1 : 0, Math.cos(a) * R, Math.sin(a) * R); }
  b.key(Math.cos(2.2) * (coast(2.2) - 10), Math.sin(2.2) * (coast(2.2) - 10));
  b.key(-300, -200);
  b.diamond = { x: -120, z: -80, y: null };
  b.ramp(loopPts[60][0] * 0.95, loopPts[60][1] * 0.95, 0, 18, 7, 3.5, { color: '#00b4d8' });
  b.ramp(-100, 0, Math.PI / 2, 20, 8, 4, { color: '#00b4d8' });
  b.water = { level: 0, sea: true };
  b.cams.push({ x: loopPts[100][0], z: loopPts[100][1], rot: 0, limit: 70 }, { x: loopPts[300][0], z: loopPts[300][1], rot: 0, limit: 70 });
  b.tracks.push({ id: 'isl_loop', closed: true, pts: ctrl.concat([ctrl[0]]), smooth: true });
  b.driftZone = { x: 120, z: tz + 0, r: 40 };
  const E = b.half - 4;
  b.box(0, -E, b.size, 4); b.box(0, E, b.size, 4); b.box(-E, 0, 4, b.size); b.box(E, 0, 4, b.size);
}

// ===================== YARIŞ PİSTİ =====================
function track(b) {
  b.groundColor = '#5f9c45';
  const n = b.noise;
  b.setHeights((x, z) => 4 * n.fbm(x / 200, z / 200, 3) + 4);
  b.fillSurf(() => SURF.GRASS);
  const ctrl = [[-300, 300], [300, 300], [420, 220], [430, 60], [300, 0], [200, 60], [80, -20], [140, -200], [380, -260], [380, -420], [0, -440], [-250, -380], [-200, -150], [-420, -40], [-440, 200]];
  const pts = catmull(ctrl, true, 5);
  b.road(pts, { width: 14, kind: 'track', limit: 400, closed: true, traffic: false, curbs: true, smoothH: 20, maxGrade: 0.04 });
  // pit
  b.flattenRect(-250, 320, 250, 400, b.h(0, 300), 20);
  b.road([[-250, 340], [250, 340]], { width: 12, limit: 60, traffic: false });
  b.road([[-280, 300], [-250, 340]], { width: 10, limit: 60, traffic: false });
  b.road([[250, 340], [280, 300]], { width: 10, limit: 60, traffic: false });
  commonPois(b, 0, 375, 0, ['fuel', 'repair', 'wash', 'gallery', 'garage', 'teleport', 'house']);
  b.spawn = { x: -200, z: 340, rot: Math.PI / 2 };
  b.parking(-160, 318, 0, 10); b.parking(160, 318, 0, 10);
  for (let i = 0; i < 6; i++) b.building(-250 + i * 100, 255, 70, 12, 8, { color: '#adb5bd', style: 5 });
  // drift parkuru
  const dy = b.h(-50, -200);
  b.flattenRect(-120, -270, 20, -130, dy, 20);
  b.setSurfRect(-120, -270, 20, -130, SURF.ASPHALT);
  b.paint.push({ type: 'pad', x: -50, z: -200, w: 140, d: 140, y: dy });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.cones.push({ x: -50 + Math.cos(a) * 30, z: -200 + Math.sin(a) * 30 }); }
  for (let i = 0; i < 6; i++) b.cones.push({ x: -100 + i * 18, z: -150 });
  b.road([[-50, -130], [80, -20]], { width: 10, limit: 60, traffic: false });
  b.driftZone = { x: -50, z: -200, r: 65 };
  b.ramp(-430, -300, 0, 16, 8, 3, { color: '#e63946' });
  scatter(b, 250, (x, z) => b.tree(x, z, 0.8 + b.rng() * 0.8));
  b.chest(0, 470, 300); b.chest(0, -480, -200); b.chest(1, 0, -500); b.chest(0, 200, -100); b.chest(1, -100, 100);
  b.chest(2, -430, -330); b.chest(0, 450, -450); b.chest(1, 500, 0);
  b.key(-520, 500); b.key(520, -520); b.key(0, 0);
  b.diamond = { x: 300, z: 140, y: null };
  b.tracks.push({ id: 'circuit', closed: true, pts: ctrl.concat([ctrl[0]]), smooth: true });
  b.drag = { x: -280, z: 300, rot: Math.PI / 2, len: 402, onTrack: true };
  b.cams.push({ x: 0, z: 300, rot: Math.PI / 2, limit: 200 });
  const E = b.half - 4;
  b.box(0, -E, b.size, 4); b.box(0, E, b.size, 4); b.box(-E, 0, 4, b.size); b.box(E, 0, 4, b.size);
}

// ===================== HAVALİMANI =====================
function airport(b) {
  b.groundColor = '#6f9b4c';
  const n = b.noise;
  b.setHeights((x, z) => (Math.abs(x) < 800 && Math.abs(z) < 450 ? 2 : 2 + 6 * Math.max(0, n.fbm(x / 200, z / 200, 3))));
  b.fillSurf(() => SURF.GRASS);
  b.road([[-750, 0], [750, 0]], { width: 50, kind: 'runway', limit: 500, traffic: false, y: 2 });
  b.road([[-700, 120], [700, 120]], { width: 22, limit: 80, traffic: false, y: 2 });
  b.road([[-700, 0], [-700, 120]], { width: 22, limit: 80, traffic: false, y: 2 });
  b.road([[700, 0], [700, 120]], { width: 22, limit: 80, traffic: false, y: 2 });
  b.road([[0, 0], [0, 120]], { width: 22, limit: 80, traffic: false, y: 2 });
  b.setSurfRect(-320, 130, 320, 270, SURF.ASPHALT); b.paint.push({ type: 'pad', x: 0, z: 200, w: 640, d: 140, y: 2 });
  // terminal
  b.building(0, 330, 300, 50, 18, { color: '#dee2e6', style: 1, y: 2 });
  b.building(0, 300, 40, 12, 40, { color: '#adb5bd', style: 7, y: 2 });
  hollow(b, -480, 220, 90, 60, 20, 0, '#ced4da', { kind: 'hangar', door: 50 });
  hollow(b, 480, 220, 90, 60, 20, 0, '#ced4da', { kind: 'hangar', door: 50 });
  b.prop('plane', -480, 220, { y: 2 });
  b.prop('plane', 150, 200, { y: 2, rot: Math.PI / 2 });
  b.prop('plane', -150, 200, { y: 2, rot: Math.PI / 2 });
  // çevre yolu
  const P = [[-850, -500], [850, -500], [850, 500], [-850, 500], [-850, -500]];
  b.road(P, { width: 11, limit: 70, closed: true, smoothH: 4 });
  b.road([[0, 500], [0, 380]], { width: 12, limit: 50, y: 2 });
  b.road([[-300, 380], [0, 380]], { width: 12, limit: 50, y: 2, sidewalk: true });
  b.road([[0, 380], [300, 380]], { width: 12, limit: 50, y: 2, sidewalk: true });
  commonPois(b, 0, 425, 0, ['fuel', 'repair', 'wash', 'gallery', 'garage', 'teleport', 'house']);
  b.parking(-200, 395, 0, 14); b.parking(200, 395, 0, 14);
  b.spawn = { x: -100, z: 380, rot: Math.PI / 2 };
  for (let x = -280; x <= 280; x += 35) { b.lamp(x, 372, 0); b.lamp(x, 388, Math.PI); }
  // rampalar (pist kenarı)
  b.ramp(-300, -60, Math.PI / 2, 20, 10, 4, { color: '#ffd166' });
  b.ramp(200, -60, Math.PI / 2, 26, 10, 6, { color: '#ef476f' });
  b.ramp(500, 60, -Math.PI / 2, 16, 10, 3, { color: '#ffd166' });
  for (let x = -740; x <= 740; x += 60) { b.prop('rlight', x, -27, { y: 2 }); b.prop('rlight', x, 27, { y: 2 }); }
  scatter(b, 200, (x, z) => { if (Math.abs(x) < 820 && Math.abs(z) < 480) return false; b.tree(x, z, 0.8 + b.rng() * 0.8); });
  b.chest(0, 760, 60); b.chest(0, -760, -60); b.chest(1, -480, 240, 2); b.chest(1, 480, 240, 2); b.chest(0, 0, -300);
  b.chest(2, 200, -60, 8.2); b.chest(0, 800, -400); b.chest(1, -800, 400); b.chest(2, 0, 335, 20.05);
  b.decks.push({ x: 0, z: 330, rot: 0, len: 50, w: 300, y0: 20, y1: 20, roof: true });
  b.key(-860, -560 + 120); b.key(860, 560 - 120); b.key(0, -450);
  b.diamond = { x: 600, z: -300, y: null };
  b.tracks.push({ id: 'air_loop', closed: true, pts: P });
  b.tracks.push({ id: 'runway', closed: false, pts: [[-700, 0], [700, 0]] });
  b.drag = { x: -600, z: -10, rot: Math.PI / 2, len: 804, onTrack: true };
  b.driftZone = { x: 0, z: 200, r: 90 };
  b.cams.push({ x: 0, z: 0, rot: Math.PI / 2, limit: 250 }, { x: 400, z: -500, rot: Math.PI / 2, limit: 70 });
  const E = b.half - 4;
  b.box(0, -E, b.size, 4); b.box(0, E, b.size, 4); b.box(-E, 0, 4, b.size); b.box(E, 0, 4, b.size);
}

const GEN = { city, highway, mountain, offroad, island, track, airport };

export function generateMap(id, opts = {}) {
  const def = { ...MAP[id] };
  if (id === 'highway') def.size = 2000;
  const b = new MapBuilder(def);
  GEN[id](b);
  b.finalizeRoads();
  // POI ve rampa yükseklikleri arazi düzleştikten sonra güncellensin
  for (const p of b.pois) p.y = b.h(p.x, p.z);
  for (const c of b.chests) if (c.y === undefined || c.y === null || c.yAuto) c.y = b.h(c.x, c.z);
  for (const t of b.trees) t.y = b.h(t.x, t.z);
  for (const r of b.rocks) r.y = b.h(r.x, r.z);
  for (const l of b.lamps) l.y = b.h(l.x, l.z);
  for (const s of b.parkSpots) s.y = b.h(s.x, s.z);
  for (const d of b.decks) if (d.ramp) { const y = b.h(d.x - Math.sin(d.rot) * d.len / 2, d.z - Math.cos(d.rot) * d.len / 2); const hh = d.y1 - d.y0; d.y0 = y; d.y1 = y + hh; }
  if (b.diamond && (b.diamond.y === null || b.diamond.y === undefined)) b.diamond.y = b.h(b.diamond.x, b.diamond.z);
  for (const k of b.keys) if (k.y === undefined) k.y = b.h(k.x, k.z);
  // sandıklar: arazi yüksekliğini sonradan güncelle (yer seviyesindekiler)
  for (const c of b.chests) { const g = b.h(c.x, c.z); if (Math.abs(c.y - g) < 3 || c.y < g) c.y = Math.max(c.y, g); }
  b.snow = !!opts.snow;
  return b;
}
