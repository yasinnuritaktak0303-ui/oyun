// Prosedürel araç modelleri (v2): pürüzsüz "loft" gövde, çamurluk kabartmaları, gerçek camlı kabin,
// detaylı jant/fren, aynalar, ışık grupları, kokpit, modifiye ve hasar.
import * as THREE from 'three';
import { BODY_DIMS, CAR } from './data/cars.js';
import { PAINT_TYPES, PLATES, NEONS } from './data/content.js';
import * as TX from './world/textures.js';
import { clamp, lerp } from './core.js';

// Gövde silüet oranları (z: uzunluğa oran, ön +; yükseklikler (H - clr) oranı)
const SHAPES = {
  hatch: { belt: 0.56, hood: 0.47, nose: 0.33, tail: 0.6, ws: 0.17, rf: 0.0, rr: -0.38, rw: -0.47, noseLen: 0.1, round: 4.5 },
  sedan: { belt: 0.55, hood: 0.47, nose: 0.32, tail: 0.53, ws: 0.2, rf: 0.03, rr: -0.18, rw: -0.31, noseLen: 0.08, round: 4.5 },
  suv: { belt: 0.58, hood: 0.55, nose: 0.44, tail: 0.6, ws: 0.24, rf: 0.14, rr: -0.44, rw: -0.48, noseLen: 0.07, round: 5.5 },
  pickup: { belt: 0.58, hood: 0.55, nose: 0.45, tail: 0.56, ws: 0.24, rf: 0.14, rr: -0.06, rw: -0.08, noseLen: 0.06, bed: true, round: 6 },
  sport: { belt: 0.5, hood: 0.4, nose: 0.27, tail: 0.5, ws: 0.13, rf: -0.04, rr: -0.2, rw: -0.42, noseLen: 0.12, round: 3.6 },
  drift: { belt: 0.53, hood: 0.44, nose: 0.3, tail: 0.5, ws: 0.16, rf: 0.0, rr: -0.17, rw: -0.31, noseLen: 0.09, round: 4.2 },
  muscle: { belt: 0.56, hood: 0.53, nose: 0.42, tail: 0.53, ws: 0.07, rf: -0.06, rr: -0.22, rw: -0.33, noseLen: 0.05, round: 5.5 },
  super: { belt: 0.47, hood: 0.33, nose: 0.2, tail: 0.5, ws: 0.24, rf: 0.04, rr: -0.12, rw: -0.36, noseLen: 0.15, round: 3.2 },
  hyper: { belt: 0.46, hood: 0.3, nose: 0.17, tail: 0.48, ws: 0.27, rf: 0.07, rr: -0.1, rw: -0.4, noseLen: 0.17, round: 3.0 },
  van: { belt: 0.48, hood: 0.45, nose: 0.4, tail: 0.95, ws: 0.4, rf: 0.33, rr: -0.5, rw: -0.5, noseLen: 0.04, box: true, round: 7 },
  tow: { belt: 0.48, hood: 0.46, nose: 0.42, tail: 0.32, ws: 0.4, rf: 0.33, rr: 0.12, rw: 0.1, noseLen: 0.04, bed: true, boom: true, round: 7 },
  truck: { belt: 0.45, hood: 0.42, nose: 0.42, tail: 0.95, ws: 0.47, rf: 0.43, rr: 0.22, rw: 0.21, noseLen: 0.02, cargo: true, round: 8 },
};

const geoCache = new Map();
const sharedMats = {};
const mat = (key, make) => (sharedMats[key] ||= make());
const ss = (t) => t * t * (3 - 2 * t);

// Kosinüs ara değerli profil
function profileAt(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) {
      const t = (z - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1);
      return lerp(pts[i - 1][1], pts[i][1], ss(t));
    }
  }
  return pts[pts.length - 1][1];
}

// Gövde şekil fonksiyonları
function shapeFns(body) {
  const d = BODY_DIMS[body], s = SHAPES[body];
  const L = d.L, H = d.H, clr = d.clr, hz = L / 2;
  const Y = (f) => clr + (H - clr) * f;
  const belt = Y(s.belt);
  const tailTop = s.box || s.cargo ? belt : Y(s.tail);
  const zWs = L * s.ws, zRw = L * s.rw;
  const top = [[-hz, tailTop - 0.16], [-hz + 0.1, tailTop]];
  if (zRw - 0.04 > -hz + 0.2) top.push([zRw - 0.04, belt]);
  top.push([zWs + 0.06, belt]);
  top.push([hz - L * s.noseLen, Y(s.hood)]);
  top.push([hz - 0.09, Y(s.nose)]);
  top.push([hz, Y(s.nose) - 0.14]);
  const wheelsZ = [d.wb / 2, -d.wb / 2];
  const archR = d.r + 0.09;
  const arch = (z) => { let a = 0; for (const wz of wheelsZ) { const dz = Math.abs(z - wz); if (dz < archR) a = Math.max(a, d.r + Math.sqrt(archR * archR - dz * dz)); } return a; };
  const halfW = (z) => { const zn = Math.abs(z) / hz; const f = Math.max(0, (zn - 0.62) / 0.38); return (d.W / 2) * (1 - 0.13 * f * f * (z > 0 ? 1 : 0.8)); };
  const y1 = (z) => profileAt(top, z);
  const y0 = (z) => {
    const e = Math.max(0, 1 - (hz - Math.abs(z)) / 0.35);
    let y = clr + 0.05 + e * e * 0.12;
    const a = arch(z);
    if (a > 0) y = Math.max(y, a);
    return Math.min(y, y1(z) - 0.1);
  };
  // çamurluk kabartması: tekerlek kemeri gövde üstünü aşıyorsa
  const bulge = (z) => { const a = arch(z); return a > 0 ? Math.min(0.13, Math.max(0, a + 0.05 - y1(z))) : 0; };
  return { d, s, L, H, clr, belt, tailTop, Y, y0, y1, halfW, bulge, zWs, zRw, zRf: L * s.rf, zRr: L * s.rr, roofY: H, noseY: Y(s.nose), hoodY: Y(s.hood) };
}

// Alt gövde (pürüzsüz, indeksli)
function lowerBodyGeo(body, low) {
  const key = 'lb' + body + (low ? 'L' : '');
  if (geoCache.has(key)) return geoCache.get(key);
  const F = shapeFns(body);
  const NS = low ? 26 : 56, NR = low ? 16 : 30;
  const n = F.s.round;
  const pos = [], uv = [], idx = [];
  const hz = F.L / 2;
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1);
    const z = -hz + F.L * (0.5 - 0.5 * Math.cos(t * Math.PI)); // uçlarda sık
    const w = F.halfW(z), a = F.y0(z), b = F.y1(z), bu = F.bulge(z);
    for (let k = 0; k < NR; k++) {
      const ang = (k / NR) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      let x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const yn = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      let y = (a + b) / 2 + ((b - a) / 2) * yn;
      x *= 1 - 0.07 * Math.max(0, yn) ** 2;
      if (yn > 0 && bu > 0) y += bu * Math.pow(Math.abs(x) / w, 2) * Math.sqrt(yn);
      pos.push(x, y, z);
      uv.push((z + hz) / F.L, y / F.H);
    }
  }
  for (let i = 0; i < NS - 1; i++) for (let k = 0; k < NR; k++) {
    const a = i * NR + k, b = (i + 1) * NR + k, c = (i + 1) * NR + ((k + 1) % NR), d2 = i * NR + ((k + 1) % NR);
    idx.push(a, d2, c, a, c, b);
  }
  // uç kapakları
  for (const [i, front] of [[0, false], [NS - 1, true]]) {
    let cx = 0, cy = 0;
    for (let k = 0; k < NR; k++) cy += pos[(i * NR + k) * 3 + 1];
    cy /= NR;
    const ci = pos.length / 3;
    pos.push(cx, cy, pos[i * NR * 3 + 2]); uv.push(front ? 1 : 0, cy / F.H);
    for (let k = 0; k < NR; k++) {
      const p = i * NR + k, q = i * NR + ((k + 1) % NR);
      if (front) idx.push(ci, p, q); else idx.push(ci, q, p);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

// Kabin: boya (tavan/direkler), trim, ön cam, arka cam, yan camlar
function cabinGeos(body, low) {
  const key = 'cab' + body + (low ? 'L' : '');
  if (geoCache.has(key)) return geoCache.get(key);
  const F = shapeFns(body);
  const { belt, roofY } = F;
  const zFront = F.zWs, zBack = F.zRw;
  const roofPts = [[zBack, belt + 0.02], [F.zRr, roofY], [F.zRf, roofY], [zFront, belt + 0.02]];
  if (F.zRr - zBack < 0.05) roofPts[0] = [zBack, roofY - 0.02];
  const NS = low ? 14 : 30, NR = low ? 9 : 15;
  const zB = (F.zRf + F.zRr) / 2;
  const buckets = { paint: [], trim: [], ws: [], rear: [], sideLF: [], sideLR: [], sideRF: [], sideRR: [] };
  const ring = [];
  for (let i = 0; i < NS; i++) {
    const z = lerp(zBack, zFront, i / (NS - 1));
    const top = profileAt(roofPts, z);
    const wB = F.halfW(z) * 0.93, wT = F.halfW(z) * 0.74;
    const r = [];
    for (let k = 0; k < NR; k++) {
      const ang = (k / (NR - 1)) * Math.PI;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const yn = Math.pow(sn, 2 / 3.4);
      const w = lerp(wB, wT, yn);
      const x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / 3.4);
      r.push([x, belt + Math.max(0.02, top - belt) * yn, z]);
    }
    ring.push(r);
  }
  const v = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < NS - 1; i++) for (let k = 0; k < NR - 1; k++) {
    const a = ring[i][k], b = ring[i + 1][k], c = ring[i + 1][k + 1], d2 = ring[i][k + 1];
    e1.set(d2[0] - a[0], d2[1] - a[1], d2[2] - a[2]); e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    v.crossVectors(e1, e2).normalize();
    if (!isFinite(v.x)) continue;
    const zc = (a[2] + c[2]) / 2, yMin = Math.min(a[1], d2[1]);
    let bucket;
    const nearBelt = yMin < belt + 0.05;
    if (v.y > 0.82 && zc < F.zRf + 0.15 && zc > F.zRr - 0.15) bucket = 'paint';
    else if (Math.abs(v.x) > 0.62) {
      if (nearBelt) bucket = 'trim';
      else if (Math.abs(zc - zB) < 0.06 || zc > zFront - 0.12 || zc < zBack + 0.12) bucket = 'paint';
      else bucket = (v.x > 0 ? 'sideL' : 'sideR') + (zc > zB ? 'F' : 'R');
    } else if (v.z > 0.3) bucket = Math.abs(a[0]) > F.halfW(zc) * 0.62 && Math.abs(d2[0]) > F.halfW(zc) * 0.55 ? 'paint' : nearBelt ? 'trim' : 'ws';
    else if (v.z < -0.3) bucket = Math.abs(a[0]) > F.halfW(zc) * 0.62 && Math.abs(d2[0]) > F.halfW(zc) * 0.55 ? 'paint' : nearBelt ? 'trim' : 'rear';
    else bucket = 'paint';
    buckets[bucket].push(...a, ...d2, ...c, ...a, ...c, ...b);
  }
  const out = {};
  for (const k in buckets) {
    if (!buckets[k].length) { out[k] = null; continue; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buckets[k], 3));
    g.computeVertexNormals();
    if (k === 'paint') {
      const p = g.attributes.position, uvs = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uvs[i * 2] = (p.getZ(i) + F.L / 2) / F.L; uvs[i * 2 + 1] = p.getY(i) / F.H; }
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    g.computeBoundingSphere();
    out[k] = g;
  }
  geoCache.set(key, out);
  return out;
}

function tireGeo(r, w, low) {
  const key = 'tire' + r + '_' + w + low;
  if (geoCache.has(key)) return geoCache.get(key);
  const pts = [];
  const rIn = r * 0.66, sw = w / 2, k = 0.035;
  pts.push(new THREE.Vector2(rIn, -sw + 0.01));
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - k + Math.cos(a) * k, -sw + k + Math.sin(a) * k)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - k + Math.cos(a) * k, sw - k + Math.sin(a) * k)); }
  pts.push(new THREE.Vector2(rIn, sw - 0.01));
  const g = new THREE.LatheGeometry(pts, low ? 14 : 30);
  g.rotateZ(Math.PI / 2);
  geoCache.set(key, g);
  return g;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function plate3(w, h, r, depth = 0.02) {
  return new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
}

// ------------------------------------------------------------------
export function buildCar(entry, o = {}) {
  const spec = CAR[entry.id];
  const body = spec.body;
  const F = shapeFns(body);
  const d = F.d, s = F.s;
  const cos = entry.cos || {};
  const low = !!o.low;
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const L = d.L, W = d.W, H = d.H;
  const { belt, roofY, zWs, zRf, zRr, zRw } = F;
  // --- malzemeler ---
  const paintColor = cos.paint || spec.color;
  const pt = PAINT_TYPES.find((p) => p.id === (cos.paintType || 'gloss')) || PAINT_TYPES[0];
  let paintMat;
  if (low) {
    paintMat = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.3, metalness: 0.45, envMapIntensity: 1.2 });
  } else {
    paintMat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: Math.max(0.12, pt.rough), metalness: pt.metal * 0.9 + 0.1,
      clearcoat: pt.id === 'matte' ? 0 : 1, clearcoatRoughness: 0.06, envMapIntensity: 1.35,
    });
    if (pt.pearl) { paintMat.iridescence = 0.9; paintMat.iridescenceIOR = 1.7; paintMat.sheen = 0.7; paintMat.sheenColor = new THREE.Color(cos.paint2 || '#ffffff'); }
    const vt = new THREE.CanvasTexture(TX.vinylCanvas(cos.vinyl, paintColor));
    vt.colorSpace = THREE.SRGBColorSpace;
    vt.anisotropy = 4;
    paintMat.map = vt;
  }
  const dark = mat('dark', () => new THREE.MeshStandardMaterial({ color: '#121316', roughness: 0.55, metalness: 0.2 }));
  const plastic = mat('plastic', () => new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.8 }));
  const chromeM = mat('chrome', () => new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.08, metalness: 1, envMapIntensity: 1.5 }));
  const tint = cos.tint || 0;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1a2430').lerp(new THREE.Color('#05070a'), tint), roughness: 0.03, metalness: 0.1,
    transparent: true, opacity: 0.5 + tint * 0.42, envMapIntensity: 2.2, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02,
  });
  const crackMat = mat('crack', () => new THREE.MeshStandardMaterial({ color: '#cfd9e0', roughness: 0.55, transparent: true, opacity: 0.85, side: THREE.DoubleSide, map: TX.crackTexture() }));
  // --- alt gövde ---
  const baseGeo = lowerBodyGeo(body, low);
  const bodyGeo = low ? baseGeo : baseGeo.clone();
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  model.add(bodyMesh);
  // alt etek / şasi (koyu)
  const under = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.12, L * 0.86), dark);
  under.position.set(0, d.clr + 0.08, 0); model.add(under);
  // --- kabin ---
  const cab = cabinGeos(body, low);
  const glass = { ws: null, rear: null, sides: [], front: { L: null, R: null } };
  if (cab.paint) { const m = new THREE.Mesh(cab.paint, paintMat); m.castShadow = true; model.add(m); }
  if (cab.trim) model.add(new THREE.Mesh(cab.trim, dark));
  if (cab.ws) { glass.ws = new THREE.Mesh(cab.ws, glassMat); model.add(glass.ws); }
  if (cab.rear) { glass.rear = new THREE.Mesh(cab.rear, glassMat); model.add(glass.rear); }
  for (const k of ['sideLF', 'sideLR', 'sideRF', 'sideRR']) {
    if (!cab[k]) continue;
    const m = new THREE.Mesh(cab[k], glassMat);
    model.add(m); glass.sides.push(m);
    if (k === 'sideLF') glass.front.L = m;
    if (k === 'sideRF') glass.front.R = m;
  }
  // kabin içi koyu siluet (camlardan içi boş görünmesin)
  const innerCab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.74, Math.max(0.1, roofY - belt - 0.12), Math.max(0.2, zWs - zRw - 0.3)), mat('cabin', () => new THREE.MeshStandardMaterial({ color: '#0d0e11', roughness: 0.9 })));
  innerCab.position.set(0, belt + (roofY - belt - 0.12) / 2 - 0.05, (zWs + zRw) / 2);
  innerCab.visible = low;
  model.add(innerCab);

  // --- detaylar: ön ---
  const frontZ = L / 2, rearZ = -L / 2;
  const noseW = F.halfW(frontZ - 0.05), tailW = F.halfW(rearZ + 0.05);
  const lightColor = cos.light || '#ffffff';
  const headM = new THREE.MeshStandardMaterial({ color: '#dfe6ee', emissive: new THREE.Color(lightColor), emissiveIntensity: 0.2, roughness: 0.1, metalness: 0.5 });
  const tailM = new THREE.MeshStandardMaterial({ color: '#4a0006', emissive: new THREE.Color('#ff1a1a'), emissiveIntensity: 0.25, roughness: 0.2 });
  const revM = new THREE.MeshStandardMaterial({ color: '#cfcfcf', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.2 });
  const indM = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: '#6a3c00', emissive: new THREE.Color('#ff9a00'), emissiveIntensity: 0, roughness: 0.3 }));
  const sportish = ['sport', 'super', 'hyper', 'drift'].includes(body);
  const hy = F.noseY - 0.11;
  const frontFaceY0 = F.y0(frontZ - 0.02);
  // ızgara
  const grilleH = Math.max(0.08, (F.noseY - 0.18 - frontFaceY0) * 0.7);
  const grille = new THREE.Mesh(plate3(noseW * (sportish ? 1.1 : 0.95), grilleH, 0.03, 0.01), mat('grille', () => new THREE.MeshStandardMaterial({ color: '#08090b', roughness: 0.4, metalness: 0.6 })));
  grille.position.set(0, frontFaceY0 + 0.04 + grilleH / 2, frontZ - 0.005); model.add(grille);
  for (const sd of [-1, 1]) {
    const hl = new THREE.Mesh(plate3(sportish ? noseW * 0.5 : noseW * 0.42, sportish ? 0.06 : 0.11, sportish ? 0.025 : 0.035, 0.012), headM);
    hl.position.set(sd * noseW * 0.58, hy, frontZ - 0.012); hl.rotation.y = sd * 0.12; model.add(hl);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(noseW * 0.35, 0.012, 0.01), indM[sd > 0 ? 0 : 1]);
    drl.position.set(sd * noseW * 0.6, hy - (sportish ? 0.05 : 0.08), frontZ); model.add(drl);
    // sis farı / hava girişi
    const fog = new THREE.Mesh(plate3(noseW * 0.25, 0.06, 0.02, 0.008), plastic);
    fog.position.set(sd * noseW * 0.7, frontFaceY0 + 0.1, frontZ - 0.008); model.add(fog);
  }
  // ön tampon alt dudak
  const lipF = new THREE.Mesh(new THREE.BoxGeometry(noseW * 1.9, 0.04, 0.12), plastic);
  lipF.position.set(0, F.y0(frontZ - 0.1) + 0.0, frontZ - 0.08); model.add(lipF);
  // --- arka ---
  const rearFaceY0 = F.y0(rearZ + 0.02);
  const ty = F.tailTop - 0.2;
  if (sportish || body === 'muscle') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(tailW * 1.7, 0.05, 0.02), tailM);
    bar.position.set(0, ty, rearZ - 0.01); model.add(bar);
  }
  for (const sd of [-1, 1]) {
    const tl = new THREE.Mesh(plate3(tailW * 0.42, 0.1, 0.025, 0.012), tailM);
    tl.position.set(sd * tailW * 0.66, ty, rearZ + 0.012); tl.rotation.y = Math.PI; model.add(tl);
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.012), revM);
    rv.position.set(sd * tailW * 0.35, ty - 0.08, rearZ - 0.005); model.add(rv);
    const ir = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.012), indM[sd > 0 ? 0 : 1]);
    ir.position.set(sd * tailW * 0.8, ty - 0.08, rearZ - 0.005); model.add(ir);
  }
  const diff = new THREE.Mesh(new THREE.BoxGeometry(tailW * 1.6, 0.09, 0.1), plastic);
  diff.position.set(0, rearFaceY0 + 0.04, rearZ + 0.05); model.add(diff);
  // egzoz uçları
  if (!low && spec.engine !== 'ev' && !(entry.engineSwap === 'ev')) {
    const tips = sportish || body === 'muscle' ? [-1, 1] : [1];
    for (const sd of tips) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 12, 1, true).rotateX(Math.PI / 2), chromeM);
      ex.position.set(sd * tailW * 0.55, rearFaceY0 + 0.07, rearZ - 0.03); model.add(ex);
    }
  }
  // plakalar
  const plateDef = PLATES[(cos.plate && cos.plate.type) || 0];
  const plateTex = low ? mat('plateTex', () => TX.plateTexture({ text: '34 TR 00' }, PLATES[0])) : TX.plateTexture(cos.plate || { text: '' }, plateDef);
  const plateM = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateM); pf.position.set(0, frontFaceY0 + 0.1, frontZ + 0.012); model.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateM); pr.position.set(0, rearFaceY0 + 0.2, rearZ - 0.012); pr.rotation.y = Math.PI; model.add(pr);
  // aynalar
  if (!low) {
    for (const sd of [-1, 1]) {
      const mz = zWs - 0.12, mx = F.halfW(mz) * 0.95;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.05), plastic); arm.position.set(sd * (mx + 0.04), belt + 0.06, mz); model.add(arm);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8).scale(1, 0.75, 1.15), paintMat); cap.position.set(sd * (mx + 0.11), belt + 0.08, mz); model.add(cap);
    }
  }
  // kapı aralıkları ve kollar (görsel detay)
  const zDf = zWs + 0.02, zDr = Math.max(zRw + 0.2, zRr - 0.05);
  if (!low) {
    const seamM = mat('seam', () => new THREE.MeshBasicMaterial({ color: '#050505' }));
    for (const sd of [-1, 1]) {
      for (const zz of [zDf, (zRf + zRr) / 2 - 0.03, zDr]) {
        const hw = F.halfW(zz);
        const sh = belt - (d.clr + 0.2);
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, sh, 0.008), seamM);
        seam.position.set(sd * (hw + 0.002), d.clr + 0.18 + sh / 2, zz); model.add(seam);
      }
      for (const zz of [(zDf + (zRf + zRr) / 2) / 2 - 0.15, ((zRf + zRr) / 2 + zDr) / 2 - 0.12]) {
        const hw = F.halfW(zz);
        const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.14), chromeM);
        h2.position.set(sd * (hw + 0.008), belt - 0.1, zz); model.add(h2);
      }
    }
  }
  // --- kapılar (açılınca görünen paneller) ---
  const doors = [];
  if (!low) {
    const zM = (zRf + zRr) / 2 - 0.03;
    const doorH = belt - d.clr - 0.15;
    for (const sd of [1, -1]) {
      const pivot = new THREE.Group();
      const hw = F.halfW(zDf);
      pivot.position.set(sd * (hw + 0.005), d.clr + 0.15, zDf);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH, zDf - zM), paintMat);
      panel.position.set(-sd * 0.03, doorH / 2, -(zDf - zM) / 2);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.02, doorH * 0.9, (zDf - zM) * 0.92), plastic);
      inner.position.set(-sd * 0.065, doorH / 2, -(zDf - zM) / 2);
      const dg = new THREE.Group(); dg.add(panel, inner); dg.visible = false;
      pivot.add(dg);
      model.add(pivot);
      doors.push({ pivot, panel: dg, side: sd, open: 0, target: 0, winDown: 0, winTarget: 0, winMesh: sd > 0 ? glass.front.L : glass.front.R });
    }
  }
  // --- kaput ve bagaj (açılınca görünen) ---
  let hood = null, trunk = null;
  if (!low) {
    const hzF = L / 2 - 0.1, hl = Math.max(0.3, hzF - zWs - 0.1);
    hood = { pivot: new THREE.Group(), open: 0, target: 0 };
    hood.pivot.position.set(0, belt + 0.01, zWs + 0.08);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.035, hl), paintMat);
    hm.position.set(0, 0, hl / 2); hm.rotation.x = Math.atan2(belt - F.hoodY, hl);
    hood.mesh = hm; hm.visible = false;
    hood.pivot.add(hm); model.add(hood.pivot);
    const eng = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.3, hl * 0.6), mat('engine', () => new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.4, metalness: 0.7 })));
    eng.position.set(0, F.hoodY - 0.25, zWs + hl / 2 + 0.05); model.add(eng);
    if (!s.box && !s.cargo && !s.bed && zRw > -L / 2 + 0.3) {
      const tl = zRw - (-L / 2 + 0.12);
      trunk = { pivot: new THREE.Group(), open: 0, target: 0 };
      trunk.pivot.position.set(0, belt + 0.01, zRw - 0.03);
      const tm = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.035, tl), paintMat);
      tm.position.set(0, 0, -tl / 2); tm.rotation.x = -Math.atan2(belt - F.tailTop, tl);
      trunk.mesh = tm; tm.visible = false;
      trunk.pivot.add(tm); model.add(trunk.pivot);
    }
  }
  // --- kasa / kargo / çekici bomu ---
  let cargoBoxes = null;
  if (s.bed) {
    const bz0 = -L / 2 + 0.08, bz1 = zRw - 0.12, bl = bz1 - bz0;
    for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, bl), paintMat); w.position.set((F.halfW(bz0 + bl / 2) - 0.04) * sd, belt + 0.18, (bz0 + bz1) / 2); w.castShadow = true; model.add(w); }
    const tg = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.42, 0.08), paintMat); tg.position.set(0, belt + 0.18, bz0 + 0.04); model.add(tg);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.04, bl), mat('bedfloor', () => new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.9 }))); floor.position.set(0, belt - 0.0, (bz0 + bz1) / 2); model.add(floor);
    cargoBoxes = new THREE.Group();
    const cbm = mat('cardboard', () => new THREE.MeshStandardMaterial({ color: '#b08458', roughness: 0.9 }));
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), cbm); b.position.set(i % 2 ? 0.4 : -0.4, belt + 0.29, (bz0 + bz1) / 2 + (i < 2 ? -0.45 : 0.45)); b.castShadow = true; cargoBoxes.add(b); }
    cargoBoxes.visible = false;
    model.add(cargoBoxes);
    if (s.boom) {
      const bm = mat('boom', () => new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.5, metalness: 0.6 }));
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.4), bm);
      boom.position.set(0, belt + 0.75, bz0 + 1.0); boom.rotation.x = -0.32; model.add(boom);
      const hk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.3), bm); hk.position.set(0, d.clr + 0.45, -L / 2 - 0.2); model.add(hk);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.2), indM[0]); lb.position.set(0, roofY + 0.05, zRr + 0.1); model.add(lb);
    }
  }
  if (s.cargo) {
    const z0 = -L / 2, z1 = zRw - 0.25;
    const cb = new THREE.Mesh(new THREE.BoxGeometry(W, H - d.clr - 0.3, z1 - z0), mat('cargo', () => new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.5, metalness: 0.1 })));
    cb.position.set(0, d.clr + 0.3 + (H - d.clr - 0.3) / 2, (z0 + z1) / 2);
    cb.castShadow = true; model.add(cb);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.25, (z1 - z0) * 0.9), paintMat); stripe.position.set(0, d.clr + 0.8, (z0 + z1) / 2); model.add(stripe);
  }
  if (spec.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.28), new THREE.MeshStandardMaterial({ color: '#ffd60a', emissive: new THREE.Color('#ffd60a'), emissiveIntensity: 0.6 }));
    sign.position.set(0, roofY + 0.1, (zRf + zRr) / 2); model.add(sign);
    for (const sd of [-1, 1]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, L * 0.5), mat('checker', () => new THREE.MeshStandardMaterial({ map: TX.checkerTexture() }))); ch.position.set(sd * (W / 2 + 0.005), belt - 0.15, 0); model.add(ch); }
  }
  let siren = null;
  if (spec.police) {
    siren = [new THREE.MeshBasicMaterial({ color: '#0033ff' }), new THREE.MeshBasicMaterial({ color: '#ff0022' })];
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.28), plastic); base.position.set(0, roofY + 0.03, (zRf + zRr) / 2); model.add(base);
    for (const [i, sd] of [[0, -1], [1, 1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), siren[i]); m.position.set(sd * 0.27, roofY + 0.1, (zRf + zRr) / 2); model.add(m); }
    for (const sd of [-1, 1]) { const stp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.16, L * 0.72), mat('police', () => new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.3 }))); stp.position.set(sd * (F.halfW(0) + 0.006), (belt + d.clr) / 2 + 0.05, 0); model.add(stp); }
  }
  // --- spoiler ---
  if (!low && cos.spoiler) {
    const sp = cos.spoiler;
    const zT = -L / 2 + 0.22, yT = F.tailTop;
    if (sp === 1) { const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.04, 0.12), paintMat); m.position.set(0, yT + 0.02, zT); model.add(m); }
    else if (sp === 2) { const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.1, 0.32), paintMat); m.position.set(0, yT + 0.04, zT + 0.05); m.rotation.x = -0.35; model.add(m); }
    else {
      const big = sp === 4;
      const wing = new THREE.Mesh(plate3(W * (big ? 1.0 : 0.88), big ? 0.42 : 0.3, 0.04, 0.03).rotateX(-Math.PI / 2 + 0.1), sp === 3 ? mat('carbon', () => new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.25, metalness: 0.5, map: TX.carbonTexture() })) : paintMat);
      wing.position.set(0, yT + (big ? 0.55 : 0.32), zT - 0.05); model.add(wing);
      for (const sd of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, big ? 0.55 : 0.32, 0.12), dark); st.position.set(sd * W * 0.28, yT + (big ? 0.27 : 0.16), zT); model.add(st); }
      for (const sd of [-1, 1]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.025, big ? 0.24 : 0.16, big ? 0.5 : 0.36), dark); ep.position.set(sd * W * (big ? 0.5 : 0.44), yT + (big ? 0.55 : 0.32), zT - 0.05); model.add(ep); }
    }
  }
  // --- body kit ---
  if (!low && cos.kit) {
    const k = cos.kit;
    const kitM = k === 2 ? mat('carbon', () => new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.25, metalness: 0.5, map: TX.carbonTexture() })) : paintMat;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(noseW * 2 * (k === 3 ? 1.15 : 1.02), 0.045, k === 2 ? 0.34 : 0.2), kitM);
    lip.position.set(0, F.y0(frontZ - 0.15) - 0.01, L / 2 - 0.06); model.add(lip);
    for (const sd of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, d.wb - d.r * 2.3), kitM); sk.position.set((F.halfW(0) + (k === 3 ? 0.07 : 0.025)) * sd, d.clr + 0.1, 0); model.add(sk); }
    if (k >= 2) { const df = new THREE.Mesh(new THREE.BoxGeometry(tailW * 1.6, 0.06, 0.38), kitM); df.position.set(0, rearFaceY0 + 0.02, -L / 2 + 0.12); df.rotation.x = 0.25; model.add(df); }
    if (k === 3) for (const zz of [d.wb / 2, -d.wb / 2]) for (const sd of [-1, 1]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(d.r + 0.12, d.r + 0.12, 0.12, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), paintMat); fl.position.set((F.halfW(zz) + 0.05) * sd, d.r, zz); model.add(fl); }
    const scoop = new THREE.Mesh(plate3(W * 0.22, 0.4, 0.04, 0.05).rotateX(-Math.PI / 2), dark); scoop.position.set(0, (belt + F.hoodY) / 2 + 0.03, zWs + 0.55); model.add(scoop);
  }
  // --- neon ---
  let neon = null;
  const nDef = NEONS[cos.neon || 0];
  if (!low && nDef && nDef.c) {
    const nm = new THREE.MeshBasicMaterial({ map: TX.radialTexture('#ffffff'), color: nDef.c === 'rainbow' ? '#ff00ff' : nDef.c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    neon = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.2, L * 1.4).rotateX(-Math.PI / 2), nm);
    neon.position.y = 0.04; neon.rainbow = nDef.c === 'rainbow';
    model.add(neon);
  }
  // temas gölgesi (araç yere otursun)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, L * 1.15).rotateX(-Math.PI / 2), mat('carShadow', () => new THREE.MeshBasicMaterial({ map: TX.blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 })));
  shadow.position.y = 0.025; shadow.renderOrder = 1;
  model.add(shadow);
  // --- tekerlekler ---
  const wheels = [];
  const tireM = mat('tire', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, map: TX.tireTexture() }));
  const rimM = new THREE.MeshStandardMaterial({ color: cos.rimColor || '#c8c8cc', roughness: 0.18, metalness: 1, envMapIntensity: 1.4 });
  const rimType = cos.rim || 0;
  const wr = d.r, ww = Math.min(0.32, d.W * 0.135) * (cos.kit === 3 ? 1.22 : 1);
  const rr = wr * (0.64 + (cos.rimSize || 0) * 0.05);
  const tireG = tireGeo(wr, ww, low);
  const tw = d.W * 0.84 / 2;
  const caliperM = mat('caliper' + (sportish ? 'r' : 'g'), () => new THREE.MeshStandardMaterial({ color: sportish ? '#d00000' : '#5a5f66', roughness: 0.35, metalness: 0.4 }));
  const discM = mat('disc', () => new THREE.MeshStandardMaterial({ color: '#8a8d93', roughness: 0.35, metalness: 0.9 }));
  for (const [lx, lz, front] of [[tw, d.wb / 2, true], [-tw, d.wb / 2, true], [tw, -d.wb / 2, false], [-tw, -d.wb / 2, false]]) {
    const steerG = new THREE.Group();
    steerG.position.set(lx, wr, lz);
    const spinG = new THREE.Group();
    steerG.add(spinG);
    const tire = new THREE.Mesh(tireG, tireM);
    tire.castShadow = true;
    spinG.add(tire);
    const side = Math.sign(lx);
    if (!low) {
      // fren diski ve kaliper (dönmez)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.03, 24).rotateZ(Math.PI / 2), discM);
      disc.position.x = side * 0.02; spinG.add(disc);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, rr * 0.55, 0.12), caliperM);
      cal.position.set(side * 0.05, rr * 0.45, -0.08); steerG.add(cal);
    }
    const rimG = new THREE.Group();
    rimG.position.x = side * (ww / 2 - 0.035);
    // jant kasnağı
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, ww * 0.85, low ? 12 : 28, 1, true).rotateZ(Math.PI / 2), low ? rimM : mat('barrel', () => new THREE.MeshStandardMaterial({ color: '#55585e', roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide })));
    barrel.position.x = -side * ww * 0.38; rimG.add(barrel);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.018, 6, low ? 14 : 32).rotateY(Math.PI / 2), rimType === 4 ? chromeM : rimM);
    rimG.add(lip);
    if (low) {
      rimG.add(new THREE.Mesh(new THREE.CircleGeometry(rr, 10).rotateY(side * Math.PI / 2), rimM));
    } else if (rimType === 3) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.98, rr * 0.9, 0.03, 28).rotateZ(Math.PI / 2), rimM); disc.position.x = -side * 0.01; rimG.add(disc);
      for (let i = 0; i < 6; i++) { const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8).rotateZ(Math.PI / 2), dark); const a = (i / 6) * Math.PI * 2; hole.position.set(side * 0.003, Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6); rimG.add(hole); }
    } else {
      const spokes = rimType === 2 ? 10 : rimType === 5 ? 12 : rimType === 4 ? 6 : 5;
      const sw = rimType === 2 ? 0.026 : rimType === 4 ? 0.06 : 0.05;
      for (let i = 0; i < spokes; i++) {
        const g = new THREE.Group(); g.rotation.x = (i / spokes) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, rr * 0.92, sw), rimM);
        sp.position.y = rr * 0.48; sp.position.x = -side * (rimType === 4 ? 0.03 : 0.01);
        if (rimType === 5) sp.rotation.x = 0.35;
        if (rimType === 4) sp.rotation.z = side * 0.25;
        g.add(sp); rimG.add(g);
      }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.2, rr * 0.22, 0.05, 12).rotateZ(Math.PI / 2), low ? rimM : chromeM); hub.position.x = side * 0.005; rimG.add(hub);
    spinG.add(rimG);
    model.add(steerG);
    wheels.push({ steerG, spinG, front, baseY: wr });
  }
  // --- iç mekân / kokpit ---
  let cockpit = null;
  if (!low) cockpit = buildCockpit(model, d, F, o.char);
  // sürücü (dışarıdan görünen)
  let driver = null;
  if (!low && o.driver !== false) {
    driver = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: (o.char && o.char.skin) || '#e0ac69', roughness: 0.7 }));
    head.position.set(0.36, belt + 0.36, (zRf + zRr) / 2 + 0.02);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.24), new THREE.MeshStandardMaterial({ color: (o.char && o.char.shirt) || '#ddd', roughness: 0.8 }));
    torso.position.set(0.36, belt + 0.05, (zRf + zRr) / 2 + 0.02);
    driver.add(head, torso);
    model.add(driver);
  }
  const origPos = low ? null : Float32Array.from(bodyGeo.attributes.position.array);

  const api = {
    root, model, wheels, doors, hood, trunk, glass, cockpit, driver, neon, siren, cargoBoxes,
    paintMat, glassMat, headM, tailM, revM, indM, spec, body, d, belt, roofY, zWs, zRf, zRr,
    paintColor, broken: 0, low,
    setGroundY(y) { model.position.y = y; },
    update(st, dt) {
      for (let i = 0; i < 4; i++) {
        const w = wheels[i];
        if (st.wheelY) w.steerG.position.y = st.wheelY[i];
        if (w.front) w.steerG.rotation.y = st.steer || 0;
        if (st.spins) w.spinG.rotation.x = st.spins[i];
      }
      const blink = Math.floor((st.t || 0) * 2.5) % 2 === 0;
      headM.emissiveIntensity = st.lights ? (st.high ? 3 : 2.2) : 0.2;
      tailM.emissiveIntensity = st.brake ? 3.2 : st.lights ? 1.4 : 0.3;
      revM.emissiveIntensity = st.reverse ? 4 : 0;
      indM[0].emissiveIntensity = (st.indL || st.hazard) && blink ? 5 : st.lights ? 0.6 : 0;
      indM[1].emissiveIntensity = (st.indR || st.hazard) && blink ? 5 : st.lights ? 0.6 : 0;
      if (siren) { const f = Math.floor((st.t || 0) * 6) % 2; siren[0].color.set(st.siren && f ? '#5577ff' : '#001055'); siren[1].color.set(st.siren && !f ? '#ff3344' : '#400010'); }
      if (neon && neon.rainbow) neon.material.color.setHSL(((st.t || 0) * 0.2) % 1, 1, 0.5);
      for (const dr of doors) {
        dr.open += (dr.target - dr.open) * Math.min(1, dt * 5);
        dr.pivot.rotation.y = dr.open * 1.1 * dr.side;
        dr.panel.visible = dr.open > 0.02;
        dr.winDown += (dr.winTarget - dr.winDown) * Math.min(1, dt * 3);
        if (dr.winMesh) dr.winMesh.visible = dr.winDown < 0.5 && dr.open < 0.02 && api.broken < 2;
      }
      if (hood) { hood.open += (hood.target - hood.open) * Math.min(1, dt * 4); hood.pivot.rotation.x = -hood.open * 1.1; hood.mesh.visible = hood.open > 0.02; }
      if (trunk) { trunk.open += (trunk.target - trunk.open) * Math.min(1, dt * 4); trunk.pivot.rotation.x = trunk.open * 1.1; trunk.mesh.visible = trunk.open > 0.02; }
      if (cockpit) cockpit.update(st, dt);
    },
    setDirt(v) {
      const c = new THREE.Color(low ? paintColor : '#ffffff').lerp(new THREE.Color('#6b5a45'), v * 0.65);
      paintMat.color.copy(c);
      paintMat.roughness = Math.min(1, Math.max(0.12, pt.rough) + v * 0.5);
      if (paintMat.clearcoat !== undefined && pt.id !== 'matte') paintMat.clearcoat = 1 - v * 0.8;
    },
    dent(lx, ly, lz, amount) {
      if (!origPos) return;
      const pos = bodyGeo.attributes.position, a = pos.array, R = 0.85;
      for (let i = 0; i < a.length; i += 3) {
        const dx = a[i] - lx, dy = a[i + 1] - ly, dz = a[i + 2] - lz;
        const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dd > R) continue;
        const k = (1 - dd / R) ** 2 * amount;
        a[i] -= Math.sign(a[i]) * k * 0.55 * (Math.abs(lx) > W * 0.35 ? 1 : 0.25);
        a[i + 2] -= Math.sign(a[i + 2]) * k * 0.55 * (Math.abs(lz) > L * 0.4 ? 1 : 0.25);
        a[i + 1] -= k * 0.12;
      }
      pos.needsUpdate = true;
      bodyGeo.computeVertexNormals();
    },
    setBroken(level) {
      api.broken = level;
      if (glass.ws) glass.ws.material = level >= 1 ? crackMat : glassMat;
      if (glass.rear) glass.rear.material = level >= 2 ? crackMat : glassMat;
      for (const sm of glass.sides) sm.visible = level < 2;
    },
    repair() {
      if (origPos) { bodyGeo.attributes.position.array.set(origPos); bodyGeo.attributes.position.needsUpdate = true; bodyGeo.computeVertexNormals(); }
      api.setBroken(0);
    },
    showCockpit(v) { if (driver) driver.visible = !v; },
    dispose() {
      const keep = new Set([baseGeo, tireG, ...Object.values(cab)]);
      root.traverse((ob) => { if (ob.isMesh && !keep.has(ob.geometry)) ob.geometry.dispose(); });
      if (!low && paintMat.map) paintMat.map.dispose();
      paintMat.dispose(); glassMat.dispose(); headM.dispose(); tailM.dispose(); revM.dispose(); rimM.dispose(); plateM.dispose();
      for (const m of indM) m.dispose();
      if (!low) plateTex.dispose();
      if (cockpit) cockpit.dispose();
    },
  };
  return api;
}

function buildCockpit(model, d, F, char) {
  const group = new THREE.Group();
  model.add(group);
  const W = d.W, belt = F.belt, zWs = F.zWs;
  const seatZ = (F.zRf + F.zRr) / 2 + 0.02;
  const dashM = new THREE.MeshStandardMaterial({ color: '#1c1d21', roughness: 0.75 });
  const trimM = new THREE.MeshStandardMaterial({ color: '#3b3f47', roughness: 0.35, metalness: 0.6 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.22, 0.55), dashM);
  dash.position.set(0, belt - 0.04, zWs - 0.22); group.add(dash);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.025, 0.02), trimM);
  strip.position.set(0, belt - 0.02, zWs - 0.5); group.add(strip);
  const cons = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.9), dashM);
  cons.position.set(0, d.clr + 0.38, seatZ + 0.25); group.add(cons);
  // gösterge paneli
  const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 192;
  const gtex = new THREE.CanvasTexture(cvs); gtex.colorSpace = THREE.SRGBColorSpace;
  const dx = 0.36;
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.165), new THREE.MeshBasicMaterial({ map: gtex, toneMapped: false }));
  gauge.position.set(dx, belt + 0.08, zWs - 0.5); gauge.rotation.y = Math.PI; gauge.rotation.x = 0.2;
  group.add(gauge);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.18), dashM); hood.position.set(dx, belt + 0.18, zWs - 0.46); group.add(hood);
  // orta ekran
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.15), new THREE.MeshBasicMaterial({ color: '#0f2a44', toneMapped: false }));
  scr.position.set(0, belt + 0.04, zWs - 0.5); scr.rotation.y = Math.PI; scr.rotation.x = 0.25; group.add(scr);
  // direksiyon
  const wheel = new THREE.Group();
  const rimM = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.024, 10, 32), rimM));
  for (const a of [Math.PI / 2, -Math.PI / 2 + 0.0, Math.PI]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), trimM); sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09 * (a === Math.PI ? 0 : 0), 0); sp.rotation.z = a === Math.PI ? Math.PI / 2 : 0; if (a !== Math.PI) sp.position.y = 0; wheel.add(sp); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 16).rotateX(Math.PI / 2), rimM); wheel.add(hub);
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(dx, belt + 0.1, zWs - 0.64);
  wheelPivot.rotation.x = -0.35;
  wheelPivot.add(wheel);
  group.add(wheelPivot);
  // koltuklar
  const seatM = new THREE.MeshStandardMaterial({ color: '#25272d', roughness: 0.9 });
  const stitch = new THREE.MeshStandardMaterial({ color: '#c1121f', roughness: 0.8 });
  for (const sx of [dx, -dx]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.5), seatM); seat.position.set(sx, d.clr + 0.34, seatZ); group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.12), seatM); back.position.set(sx, d.clr + 0.66, seatZ - 0.28); back.rotation.x = -0.15; group.add(back);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.125), stitch); st.position.copy(back.position); st.rotation.x = -0.15; group.add(st);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.1), seatM); head.position.set(sx, d.clr + 1.06, seatZ - 0.34); group.add(head);
  }
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16), trimM);
  gear.position.set(0, d.clr + 0.6, seatZ + 0.32); group.add(gear);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), rimM); knob.position.set(0, d.clr + 0.69, seatZ + 0.32); group.add(knob);
  let gT = 0;
  return {
    group, wheel, gauge,
    eye: new THREE.Vector3(dx, belt + 0.36, seatZ - 0.08),
    update(st, dt) {
      wheel.rotation.z = -(st.steer || 0) * 6;
      gT -= dt;
      if (gT > 0) return;
      gT = 1 / 15;
      const x = cvs.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#0a0d14'); g.addColorStop(1, '#020305');
      x.fillStyle = g; x.fillRect(0, 0, 512, 192);
      const dial = (cx, val, max, label, sub, red) => {
        const R = 74, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
        x.lineWidth = 10; x.lineCap = 'round';
        x.strokeStyle = '#1b2333'; x.beginPath(); x.arc(cx, 100, R, a0, a1); x.stroke();
        const k = clamp(val / max, 0, 1);
        const gr = x.createLinearGradient(cx - R, 0, cx + R, 0); gr.addColorStop(0, '#00d2ff'); gr.addColorStop(1, red ? '#ff2d55' : '#7b5cff');
        x.strokeStyle = gr; x.beginPath(); x.arc(cx, 100, R, a0, a0 + (a1 - a0) * k); x.stroke();
        x.fillStyle = '#fff'; x.font = '600 44px sans-serif'; x.textAlign = 'center'; x.fillText(label, cx, 112);
        x.fillStyle = '#7e8aa8'; x.font = '18px sans-serif'; x.fillText(sub, cx, 138);
      };
      dial(118, st.kmh || 0, 320, String(Math.round(st.kmh || 0)), 'km/h', false);
      dial(394, st.rpm || 0, st.red || 7000, st.gearTxt || 'N', 'x1000 rpm', (st.rpm || 0) > (st.red || 7000) * 0.9);
      x.fillStyle = '#ffd166'; x.font = '20px sans-serif'; x.textAlign = 'center'; x.fillText('⛽ ' + Math.round((st.fuel || 0) * 100) + '%', 256, 176);
      gtex.needsUpdate = true;
    },
    dispose() { gtex.dispose(); },
  };
}

export function bodyGeometry(body) { return { body: lowerBodyGeo(body, false) }; }
