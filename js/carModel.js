// Prosedürel araç modelleri: sınıfa özel gövde, kokpit, ışıklar, modifiye, hasar
import * as THREE from 'three';
import { BODY_DIMS, CAR } from './data/cars.js';
import { PAINT_TYPES, PLATES, NEONS } from './data/content.js';
import * as TX from './world/textures.js';
import { clamp } from './core.js';

// Gövde silüet oranları (z: uzunluğa oran, ön +)
const SHAPES = {
  hatch: { belt: 0.56, hood: 0.47, nose: 0.32, tail: 0.55, ws: 0.17, rf: 0.0, rr: -0.4, rw: -0.48, noseLen: 0.08 },
  sedan: { belt: 0.55, hood: 0.46, nose: 0.3, tail: 0.5, ws: 0.2, rf: 0.03, rr: -0.2, rw: -0.31, noseLen: 0.07 },
  suv: { belt: 0.58, hood: 0.55, nose: 0.42, tail: 0.58, ws: 0.24, rf: 0.14, rr: -0.46, rw: -0.49, noseLen: 0.06 },
  pickup: { belt: 0.58, hood: 0.55, nose: 0.42, tail: 0.56, ws: 0.24, rf: 0.14, rr: -0.06, rw: -0.08, noseLen: 0.06, bed: true },
  sport: { belt: 0.52, hood: 0.42, nose: 0.3, tail: 0.5, ws: 0.13, rf: -0.04, rr: -0.2, rw: -0.42, noseLen: 0.09 },
  drift: { belt: 0.53, hood: 0.45, nose: 0.33, tail: 0.5, ws: 0.16, rf: 0.0, rr: -0.18, rw: -0.31, noseLen: 0.08 },
  muscle: { belt: 0.56, hood: 0.52, nose: 0.42, tail: 0.52, ws: 0.07, rf: -0.06, rr: -0.22, rw: -0.33, noseLen: 0.05 },
  super: { belt: 0.5, hood: 0.36, nose: 0.25, tail: 0.5, ws: 0.24, rf: 0.04, rr: -0.12, rw: -0.36, noseLen: 0.12 },
  hyper: { belt: 0.5, hood: 0.33, nose: 0.22, tail: 0.48, ws: 0.27, rf: 0.07, rr: -0.1, rw: -0.4, noseLen: 0.14 },
  van: { belt: 0.48, hood: 0.45, nose: 0.4, tail: 0.95, ws: 0.4, rf: 0.33, rr: -0.5, rw: -0.5, noseLen: 0.04, box: true },
  tow: { belt: 0.48, hood: 0.46, nose: 0.4, tail: 0.32, ws: 0.4, rf: 0.33, rr: 0.12, rw: 0.1, noseLen: 0.04, bed: true, boom: true },
  truck: { belt: 0.45, hood: 0.42, nose: 0.4, tail: 0.95, ws: 0.47, rf: 0.43, rr: 0.22, rw: 0.21, noseLen: 0.02, cargo: true },
};

const geoCache = new Map();
const sharedMats = {};
function mat(key, make) { return (sharedMats[key] ||= make()); }

function lowerShape(d, s) {
  const L = d.L, H = d.H, clr = d.clr;
  const by = clr + 0.08;
  const belt = clr + (H - clr) * s.belt;
  const hoodY = clr + (H - clr) * s.hood;
  const noseY = clr + (H - clr) * s.nose;
  const tailY = s.box || s.cargo ? belt : clr + (H - clr) * s.tail;
  const shape = new THREE.Shape();
  const hz = L / 2;
  const rWheel = d.r + 0.06;
  const fz = d.wb / 2, rz = -d.wb / 2;
  // alt kenar arka -> ön, tekerlek kemerleri ile
  shape.moveTo(-hz, by + 0.05);
  shape.lineTo(rz - rWheel, by);
  shape.absarc(rz, d.r, rWheel, Math.PI, 0, true);
  shape.lineTo(rz + rWheel, by);
  shape.lineTo(fz - rWheel, by);
  shape.absarc(fz, d.r, rWheel, Math.PI, 0, true);
  shape.lineTo(fz + rWheel, by);
  shape.lineTo(hz, by + 0.05);
  shape.lineTo(hz, noseY);
  shape.lineTo(hz - L * s.noseLen, hoodY);
  shape.lineTo(L * s.ws, belt);
  if (s.rw * L > -hz + 0.2) shape.lineTo(L * s.rw, belt);
  shape.lineTo(-hz + 0.12, tailY);
  shape.lineTo(-hz, tailY - 0.1);
  shape.lineTo(-hz, by + 0.05);
  return { shape, belt, hoodY, noseY, tailY };
}

function extrudeSide(shape, width, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}

function quadGeo(pts) {
  // pts: 4 köşe [x,y,z]
  const g = new THREE.BufferGeometry();
  const p = new Float32Array([...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
  g.computeVertexNormals();
  return g;
}

export function bodyGeometry(body) {
  if (geoCache.has(body)) return geoCache.get(body);
  const d = BODY_DIMS[body], s = SHAPES[body];
  const ls = lowerShape(d, s);
  const g = extrudeSide(ls.shape, d.W, 0.1);
  g.computeBoundingBox();
  const out = { body: g, ...ls, d, s };
  geoCache.set(body, out);
  return out;
}

// --------------------------------------------------------------
export function buildCar(entry, o = {}) {
  const spec = CAR[entry.id];
  const body = spec.body;
  const d = BODY_DIMS[body], s = SHAPES[body];
  const cos = entry.cos || {};
  const low = !!o.low;
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const bg = bodyGeometry(body);
  const L = d.L, W = d.W, H = d.H;
  // --- boya ---
  const paintColor = cos.paint || spec.color;
  let paintMat;
  if (low) {
    paintMat = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.35, metalness: 0.35 });
  } else {
    const pt = PAINT_TYPES.find((p) => p.id === (cos.paintType || 'gloss')) || PAINT_TYPES[0];
    paintMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: pt.rough, metalness: pt.metal, clearcoat: pt.id === 'matte' ? 0 : 0.8, clearcoatRoughness: 0.15 });
    if (pt.pearl) { paintMat.iridescence = 0.8; paintMat.iridescenceIOR = 1.6; paintMat.sheen = 0.6; paintMat.sheenColor = new THREE.Color(cos.paint2 || '#ffffff'); }
    const vc = TX.vinylCanvas(cos.vinyl, paintColor);
    const vt = new THREE.CanvasTexture(vc);
    vt.colorSpace = THREE.SRGBColorSpace;
    vt.wrapS = vt.wrapT = THREE.ClampToEdgeWrapping;
    vt.repeat.set(1 / L, 1 / H); vt.offset.set(0.5, 0);
    paintMat.map = vt;
  }
  const baseColor = new THREE.Color(low ? paintColor : '#ffffff');
  const dark = mat('dark', () => new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.7 }));
  const chromeM = mat('chrome', () => new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.15, metalness: 1 }));
  const tint = cos.tint || 0;
  const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9fb7c9').lerp(new THREE.Color('#0b0f14'), 0.35 + tint * 0.6), roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55 + tint * 0.4, side: THREE.DoubleSide });
  const crackMat = mat('crack', () => new THREE.MeshStandardMaterial({ color: '#d9e3ea', roughness: 0.6, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  // --- alt gövde ---
  const bodyGeo = low ? bg.body : bg.body.clone();
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
  bodyMesh.castShadow = true;
  model.add(bodyMesh);
  const belt = bg.belt, hoodY = bg.hoodY;
  const roofY = H;
  const zWs = L * s.ws, zRf = L * s.rf, zRr = L * s.rr, zRw = L * s.rw;
  const cw = W * 0.86 / 2, rw = W * 0.78 / 2;
  // --- kabin (camlar ve tavan) ---
  const glass = { ws: null, rear: null, sides: [] };
  const pillarM = mat('pillar', () => new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.5 }));
  {
    // tavan
    const roof = new THREE.Mesh(new THREE.BoxGeometry(rw * 2 + 0.04, 0.07, zRf - zRr + 0.1), paintMat);
    roof.position.set(0, roofY - 0.035, (zRf + zRr) / 2);
    roof.castShadow = true;
    model.add(roof);
    // ön cam
    glass.ws = new THREE.Mesh(quadGeo([[-cw, belt, zWs], [cw, belt, zWs], [rw, roofY - 0.06, zRf], [-rw, roofY - 0.06, zRf]]), glassMat);
    model.add(glass.ws);
    // arka cam
    glass.rear = new THREE.Mesh(quadGeo([[cw, belt, zRw], [-cw, belt, zRw], [-rw, roofY - 0.06, zRr], [rw, roofY - 0.06, zRr]]), glassMat);
    model.add(glass.rear);
    // yan camlar (sabit arka parça)
    for (const sd of [-1, 1]) {
      const zB = (zRf + zRr) / 2 + (s.bed || s.cargo ? 1 : 0) * 0;
      const rearQ = quadGeo(sd > 0 ? [[cw * sd, belt, zRw], [cw * sd, belt, zB], [rw * sd, roofY - 0.06, zB], [rw * sd, roofY - 0.06, zRr]] : [[cw * sd, belt, zB], [cw * sd, belt, zRw], [rw * sd, roofY - 0.06, zRr], [rw * sd, roofY - 0.06, zB]]);
      const rm = new THREE.Mesh(rearQ, glassMat);
      model.add(rm);
      glass.sides.push(rm);
      // direkler
      const aP = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, Math.hypot(zWs - zRf, roofY - belt) + 0.05), pillarM);
      aP.position.set(((cw + rw) / 2) * sd, (belt + roofY) / 2, (zWs + zRf) / 2);
      aP.rotation.x = Math.atan2(roofY - belt, zWs - zRf);
      model.add(aP);
    }
  }
  // --- kapılar (açılabilir, camlı) ---
  const doors = [];
  if (!low) {
    const zDf = zWs + 0.05, zDr = (zRf + zRr) / 2 - 0.05;
    const doorH = belt - d.clr - 0.15;
    for (const sd of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set((W / 2 + 0.005) * sd, d.clr + 0.12, zDf);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH, zDf - zDr), paintMat);
      panel.position.set(0, doorH / 2, -(zDf - zDr) / 2);
      pivot.add(panel);
      // kapı kolu
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.18), chromeM);
      handle.position.set(0.03 * sd, doorH * 0.78, -(zDf - zDr) + 0.25);
      pivot.add(handle);
      // kapı camı (iner/kalkar)
      const winH = roofY - belt - 0.08;
      const zRfx = zRf;
      const win = new THREE.Mesh(quadGeo(sd > 0
        ? [[0, 0, -(zDf - zDr)], [0, 0, 0], [(rw - cw) * sd, winH, zRfx - zDf], [(rw - cw) * sd, winH, -(zDf - zDr)]]
        : [[0, 0, 0], [0, 0, -(zDf - zDr)], [(rw - cw) * sd, winH, -(zDf - zDr)], [(rw - cw) * sd, winH, zRfx - zDf]]), glassMat);
      const winG = new THREE.Group();
      winG.position.set((cw - W / 2) * sd, belt - (d.clr + 0.12), 0);
      winG.add(win);
      pivot.add(winG);
      model.add(pivot);
      doors.push({ pivot, side: sd, open: 0, target: 0, win: winG, winMesh: win, winDown: 0, winTarget: 0, winH });
    }
  }
  // --- kaput ve bagaj ---
  let hood = null, trunk = null;
  if (!low) {
    const hzF = L / 2 - L * s.noseLen;
    const hl = hzF - zWs - 0.05;
    hood = { pivot: new THREE.Group(), open: 0, target: 0 };
    hood.pivot.position.set(0, (belt + hoodY) / 2 + 0.02, zWs + 0.05);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.03, hl), paintMat);
    hm.position.set(0, 0, hl / 2);
    hm.rotation.x = Math.atan2(belt - hoodY, hl);
    hood.pivot.add(hm);
    model.add(hood.pivot);
    // motor bloğu (kaput açılınca görünür)
    const eng = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.3, hl * 0.6), dark);
    eng.position.set(0, hoodY - 0.2, zWs + hl / 2);
    model.add(eng);
    if (!s.box && !s.cargo && zRw > -L / 2 + 0.3) {
      const tl = zRw - (-L / 2 + 0.12);
      trunk = { pivot: new THREE.Group(), open: 0, target: 0 };
      trunk.pivot.position.set(0, (belt + bg.tailY) / 2 + 0.02, zRw - 0.03);
      const tm = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.03, tl), paintMat);
      tm.position.set(0, 0, -tl / 2);
      tm.rotation.x = -Math.atan2(belt - bg.tailY, tl);
      trunk.pivot.add(tm);
      model.add(trunk.pivot);
    }
  }
  // --- kasa / kargo / çekici bomu ---
  let cargoBoxes = null;
  if (s.bed) {
    const bz0 = -L / 2 + 0.05, bz1 = zRw - 0.1, bl = bz1 - bz0;
    const wallM = paintMat;
    for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, bl), wallM); w.position.set((W / 2 - 0.04) * sd, belt + 0.2, (bz0 + bz1) / 2); model.add(w); }
    const tg = new THREE.Mesh(new THREE.BoxGeometry(W, 0.45, 0.08), wallM); tg.position.set(0, belt + 0.2, bz0 + 0.04); model.add(tg);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.05, bl), dark); floor.position.set(0, belt - 0.02, (bz0 + bz1) / 2); model.add(floor);
    cargoBoxes = new THREE.Group();
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), mat('cardboard', () => new THREE.MeshStandardMaterial({ color: '#b08458', roughness: 0.9 }))); b.position.set(i % 2 ? 0.4 : -0.4, belt + 0.27, (bz0 + bz1) / 2 + (i < 2 ? -0.45 : 0.45)); cargoBoxes.add(b); }
    cargoBoxes.visible = false;
    model.add(cargoBoxes);
    if (s.boom) {
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2.6), mat('boom', () => new THREE.MeshStandardMaterial({ color: '#333' })));
      boom.position.set(0, belt + 1.0, bz0 + 1.0); boom.rotation.x = -0.45; model.add(boom);
      const hookG = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.3), mat('boom', () => new THREE.MeshStandardMaterial({ color: '#333' })));
      hookG.position.set(0, d.clr + 0.5, -L / 2 - 0.2); model.add(hookG);
    }
  }
  if (s.box || s.cargo) {
    const z0 = -L / 2, z1 = s.cargo ? zRw - 0.25 : zRw;
    if (s.cargo) {
      const cb = new THREE.Mesh(new THREE.BoxGeometry(W, H - d.clr - 0.25, z1 - z0), mat('cargo', () => new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.6 })));
      cb.position.set(0, d.clr + 0.25 + (H - d.clr - 0.25) / 2, (z0 + z1) / 2);
      cb.castShadow = true; model.add(cb);
    }
  }
  // --- ızgara, tamponlar ---
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, (bg.noseY - d.clr) * 0.45, 0.04), dark);
  grille.position.set(0, d.clr + (bg.noseY - d.clr) * 0.45, L / 2 + 0.11); model.add(grille);
  // plakalar
  const plateDef = PLATES[(cos.plate && cos.plate.type) || 0];
  const plateTex = low ? mat('plateTex', () => TX.plateTexture({ text: '34 TR 00' }, PLATES[0])) : TX.plateTexture(cos.plate || { text: '' }, plateDef);
  const plateM = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateM); pf.position.set(0, d.clr + 0.18, L / 2 + 0.12); model.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateM); pr.position.set(0, d.clr + 0.3, -L / 2 - 0.12); pr.rotation.y = Math.PI; model.add(pr);
  // --- ışıklar ---
  const lightColor = cos.light || '#ffffff';
  const headM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: new THREE.Color(lightColor), emissiveIntensity: 0.4 });
  const tailM = new THREE.MeshStandardMaterial({ color: '#550000', emissive: new THREE.Color('#ff1a1a'), emissiveIntensity: 0.3 });
  const revM = new THREE.MeshStandardMaterial({ color: '#ddd', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  const indM = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: '#7a4a00', emissive: new THREE.Color('#ffa000'), emissiveIntensity: 0 }));
  const hy = (bg.noseY + hoodY) / 2 - 0.04;
  for (const sd of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, 0.09, 0.06), headM); h.position.set(sd * W * 0.32, hy, L / 2 - L * s.noseLen * 0.4 + 0.08); model.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, 0.08, 0.05), tailM); t.position.set(sd * W * 0.33, bg.tailY - 0.14, -L / 2 - 0.1); model.add(t);
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), revM); rv.position.set(sd * W * 0.17, bg.tailY - 0.14, -L / 2 - 0.1); model.add(rv);
    const im = indM[sd > 0 ? 0 : 1];
    const i1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), im); i1.position.set(sd * W * 0.46, hy, L / 2 - L * s.noseLen * 0.5); model.add(i1);
    const i2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), im); i2.position.set(sd * W * 0.44, bg.tailY - 0.14, -L / 2 - 0.1); model.add(i2);
  }
  if (spec.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: '#ffd60a', emissive: new THREE.Color('#ffd60a'), emissiveIntensity: 0.5 }));
    sign.position.set(0, roofY + 0.11, (zRf + zRr) / 2); model.add(sign);
  }
  let siren = null;
  if (spec.police) {
    siren = [new THREE.MeshBasicMaterial({ color: '#0033ff' }), new THREE.MeshBasicMaterial({ color: '#ff0022' })];
    for (const [i, sd] of [[0, -1], [1, 1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), siren[i]); m.position.set(sd * 0.3, roofY + 0.06, (zRf + zRr) / 2); model.add(m); }
    // polis şeridi
    for (const sd of [-1, 1]) { const stp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.15, L * 0.7), mat('police', () => new THREE.MeshStandardMaterial({ color: '#1d4ed8' }))); stp.position.set((W / 2 + 0.02) * sd, (belt + d.clr) / 2 + 0.05, 0); model.add(stp); }
  }
  // --- spoiler ---
  if (!low && cos.spoiler) {
    const sp = cos.spoiler;
    const zT = -L / 2 + 0.2, yT = bg.tailY;
    if (sp === 1) { const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.05, 0.12), paintMat); m.position.set(0, yT + 0.03, zT); model.add(m); }
    else if (sp === 2) { const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.12, 0.3), paintMat); m.position.set(0, yT + 0.05, zT + 0.05); m.rotation.x = -0.35; model.add(m); }
    else {
      const big = sp === 4;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(W * (big ? 1.02 : 0.9), 0.05, big ? 0.45 : 0.32), sp === 3 ? dark : paintMat);
      wing.position.set(0, yT + (big ? 0.55 : 0.32), zT - 0.05); wing.rotation.x = 0.12; model.add(wing);
      for (const sd of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, big ? 0.55 : 0.32, 0.12), dark); st.position.set(sd * W * 0.3, yT + (big ? 0.27 : 0.16), zT); model.add(st); }
      if (big) for (const sd of [-1, 1]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.5), dark); ep.position.set(sd * W * 0.51, yT + 0.55, zT - 0.05); model.add(ep); }
    }
  }
  // --- body kit ---
  if (!low && cos.kit) {
    const k = cos.kit;
    const kitM = k === 2 ? dark : paintMat;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W * (k === 3 ? 1.1 : 0.98), 0.05, k === 2 ? 0.35 : 0.2), kitM);
    lip.position.set(0, d.clr + 0.04, L / 2 - 0.05); model.add(lip);
    for (const sd of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, d.wb - d.r * 2.2), kitM); sk.position.set((W / 2 + (k === 3 ? 0.08 : 0.03)) * sd, d.clr + 0.1, 0); model.add(sk); }
    if (k >= 2) { const df = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.06, 0.4), dark); df.position.set(0, d.clr + 0.05, -L / 2 + 0.1); df.rotation.x = 0.25; model.add(df); }
    if (k === 3) for (const zz of [d.wb / 2, -d.wb / 2]) for (const sd of [-1, 1]) { const fl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, d.r * 2.3), paintMat); fl.position.set((W / 2 + 0.06) * sd, d.r * 2 + 0.05, zz); model.add(fl); }
    if (k >= 1) { const scoop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.25, 0.08, 0.5), dark); scoop.position.set(0, (belt + hoodY) / 2 + 0.06, zWs + 0.5); model.add(scoop); }
  }
  // --- neon ---
  let neon = null;
  const nDef = NEONS[cos.neon || 0];
  if (!low && nDef && nDef.c) {
    const nm = new THREE.MeshBasicMaterial({ map: TX.radialTexture('#ffffff'), color: nDef.c === 'rainbow' ? '#ff00ff' : nDef.c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    neon = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L * 1.4).rotateX(-Math.PI / 2), nm);
    neon.position.y = 0.04; neon.rainbow = nDef.c === 'rainbow';
    model.add(neon);
  }
  // --- tekerlekler ---
  const wheels = [];
  const tireM = mat('tire', () => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }));
  const rimM = new THREE.MeshStandardMaterial({ color: cos.rimColor || '#c0c0c0', roughness: 0.25, metalness: 0.9 });
  const rimType = cos.rim || 0;
  const rimScale = 0.62 + (cos.rimSize || 0) * 0.06;
  const wr = d.r, ww = Math.min(0.32, d.W * 0.13) * (cos.kit === 3 ? 1.25 : 1);
  const tireG = (geoCache.get('tire' + wr + ww) || (geoCache.set('tire' + wr + ww, new THREE.CylinderGeometry(wr, wr, ww, low ? 12 : 20).rotateZ(Math.PI / 2)), geoCache.get('tire' + wr + ww)));
  const tw = d.W * 0.84 / 2;
  for (const [lx, lz, front] of [[tw, d.wb / 2, true], [-tw, d.wb / 2, true], [tw, -d.wb / 2, false], [-tw, -d.wb / 2, false]]) {
    const steerG = new THREE.Group();
    steerG.position.set(lx, wr, lz);
    const spinG = new THREE.Group();
    steerG.add(spinG);
    const tire = new THREE.Mesh(tireG, tireM);
    tire.castShadow = true;
    spinG.add(tire);
    if (!low || true) {
      const side = Math.sign(lx);
      const rimG = new THREE.Group();
      rimG.position.x = side * (ww / 2 + 0.002);
      const rr = wr * rimScale;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(rr, low ? 8 : 16).rotateY(side * Math.PI / 2), rimType === 3 || low ? rimM : mat('rimDark', () => new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 })));
      rimG.add(disc);
      if (!low && rimType !== 3) {
        const spokes = rimType === 2 ? 10 : rimType === 5 ? 14 : 5;
        for (let i = 0; i < spokes; i++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, rr * 1.9, rimType === 4 ? 0.05 : 0.035), rimM);
          sp.rotation.x = (i / spokes) * Math.PI; sp.position.x = side * 0.012;
          if (rimType === 5) sp.rotation.z = 0.3 * side;
          rimG.add(sp);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.22, rr * 0.22, 0.04, 10).rotateZ(Math.PI / 2), rimM); hub.position.x = side * 0.02; rimG.add(hub);
        if (rimType === 4) { const lipR = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.02, 4, 20).rotateY(Math.PI / 2), chromeM); rimG.add(lipR); }
      }
      spinG.add(rimG);
    }
    model.add(steerG);
    wheels.push({ steerG, spinG, front, baseY: wr });
  }
  // --- iç mekân / kokpit ---
  let cockpit = null;
  if (!low) {
    cockpit = buildCockpit(model, d, s, belt, zWs, cw, o.char);
  }
  // sürücü (dışarıdan görünen)
  let driver = null;
  if (!low && o.driver !== false) {
    driver = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: (o.char && o.char.skin) || '#e0ac69' }));
    head.position.set(0.36, belt + 0.38, (zRf + zRr) / 2 + 0.05);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.25), new THREE.MeshStandardMaterial({ color: (o.char && o.char.shirt) || '#ddd' }));
    torso.position.set(0.36, belt + 0.05, (zRf + zRr) / 2 + 0.05);
    driver.add(head, torso);
    model.add(driver);
  }
  // hasar için orijinal pozisyonlar
  const origPos = low ? null : Float32Array.from(bodyGeo.attributes.position.array);

  const api = {
    root, model, wheels, doors, hood, trunk, glass, cockpit, driver, neon, siren, cargoBoxes,
    paintMat, glassMat, headM, tailM, revM, indM, spec, body, d, belt, roofY, zWs, zRf, zRr,
    baseColor, paintColor, broken: 0, low,
    // fizik zemin ofseti ayarla
    setGroundY(y) { model.position.y = y; },
    update(st, dt) {
      // st: {steer, spins[4], comps[4], lights, brake, reverse, indL, indR, hazard, t, dirt}
      for (let i = 0; i < 4; i++) {
        const w = wheels[i];
        if (st.wheelY) w.steerG.position.y = st.wheelY[i];
        if (w.front) w.steerG.rotation.y = st.steer || 0;
        if (st.spins) w.spinG.rotation.x = st.spins[i];
      }
      const blink = Math.floor((st.t || 0) * 2.5) % 2 === 0;
      headM.emissiveIntensity = st.lights ? (st.high ? 3.2 : 2.2) : 0.15;
      tailM.emissiveIntensity = st.brake ? 2.8 : st.lights ? 1.0 : 0.15;
      revM.emissiveIntensity = st.reverse ? 2 : 0;
      indM[0].emissiveIntensity = (st.indL || st.hazard) && blink ? 3 : 0; // sol = +x tarafı
      indM[1].emissiveIntensity = (st.indR || st.hazard) && blink ? 3 : 0;
      if (siren) { const f = Math.floor((st.t || 0) * 6) % 2; siren[0].color.set(st.siren && f ? '#3355ff' : '#001055'); siren[1].color.set(st.siren && !f ? '#ff2233' : '#400010'); }
      if (neon && neon.rainbow) neon.material.color.setHSL(((st.t || 0) * 0.2) % 1, 1, 0.5);
      // kapılar
      for (const dr of doors) {
        dr.open += (dr.target - dr.open) * Math.min(1, dt * 5);
        dr.pivot.rotation.y = dr.open * 1.1 * dr.side;
        dr.winDown += (dr.winTarget - dr.winDown) * Math.min(1, dt * 3);
        dr.win.position.y = (api.belt - (d.clr + 0.12)) - dr.winDown * (dr.winH - 0.02);
        dr.win.visible = dr.winDown < 0.98 && !(api.broken > 1);
      }
      if (hood) { hood.open += (hood.target - hood.open) * Math.min(1, dt * 4); hood.pivot.rotation.x = -hood.open * 1.1; }
      if (trunk) { trunk.open += (trunk.target - trunk.open) * Math.min(1, dt * 4); trunk.pivot.rotation.x = trunk.open * 1.1; }
      if (cockpit) cockpit.update(st, dt);
    },
    setDirt(v) {
      const c = new THREE.Color(api.low ? api.paintColor : '#ffffff').lerp(new THREE.Color('#6b5a45'), v * 0.65);
      paintMat.color.copy(c);
      paintMat.roughness = Math.min(1, (PAINT_TYPES.find((p) => p.id === (cos.paintType || 'gloss')) || PAINT_TYPES[0]).rough + v * 0.5);
    },
    // yerel noktaya hasar uygula
    dent(lx, ly, lz, amount) {
      if (!origPos) return;
      const pos = bodyGeo.attributes.position;
      const a = pos.array;
      const R = 0.9;
      for (let i = 0; i < a.length; i += 3) {
        const dx = a[i] - lx, dy = a[i + 1] - ly, dz = a[i + 2] - lz;
        const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dd > R) continue;
        const k = (1 - dd / R) * amount;
        // içe doğru (merkeze) it
        a[i] -= Math.sign(a[i]) * k * 0.6 * (Math.abs(lx) > W * 0.35 ? 1 : 0.2);
        a[i + 2] -= Math.sign(a[i + 2]) * k * 0.6 * (Math.abs(lz) > L * 0.4 ? 1 : 0.2);
        a[i + 1] -= k * 0.15;
      }
      pos.needsUpdate = true;
      bodyGeo.computeVertexNormals();
    },
    setBroken(level) {
      // 0 sağlam, 1 çatlak ön cam, 2 yan camlar kırık
      api.broken = level;
      glass.ws.material = level >= 1 ? crackMat : glassMat;
      glass.rear.material = level >= 2 ? crackMat : glassMat;
      for (const sm of glass.sides) sm.visible = level < 2;
    },
    repair() {
      if (origPos) { bodyGeo.attributes.position.array.set(origPos); bodyGeo.attributes.position.needsUpdate = true; bodyGeo.computeVertexNormals(); }
      api.setBroken(0);
    },
    showCockpit(v) { if (cockpit) cockpit.group.visible = true; if (driver) driver.visible = !v; },
    dispose() {
      root.traverse((ob) => {
        if (ob.isMesh) {
          if (ob.geometry !== tireG && ob.geometry !== bg.body) ob.geometry.dispose();
        }
      });
      if (!low && paintMat.map) paintMat.map.dispose();
      paintMat.dispose(); glassMat.dispose(); headM.dispose(); tailM.dispose(); revM.dispose(); rimM.dispose(); plateM.dispose();
      if (!low) plateTex.dispose();
      if (cockpit) cockpit.dispose();
    },
  };
  return api;
}

function buildCockpit(model, d, s, belt, zWs, cw, char) {
  const group = new THREE.Group();
  model.add(group);
  const W = d.W;
  const seatZ = (d.L * s.rf + d.L * s.rr) / 2 + 0.05;
  const dashM = new THREE.MeshStandardMaterial({ color: '#202024', roughness: 0.8 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.25, 0.5), dashM);
  dash.position.set(0, belt - 0.02, zWs - 0.25); group.add(dash);
  // gösterge paneli (kanvas)
  const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 96;
  const gtex = new THREE.CanvasTexture(cvs); gtex.colorSpace = THREE.SRGBColorSpace;
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: gtex }));
  const dx = 0.36; // sürücü sol tarafta (+x)
  gauge.position.set(dx, belt + 0.12, zWs - 0.48); gauge.rotation.y = Math.PI; gauge.rotation.x = 0.25;
  group.add(gauge);
  // direksiyon
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 6, 24), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }));
  wheel.add(rim);
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02), rim.material); sp.position.y = -0.09; sp.rotation.z = 0; const sg = new THREE.Group(); sg.rotation.z = (i / 3) * Math.PI * 2 + Math.PI; sg.add(sp); wheel.add(sg); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#333' }));
  wheel.add(hub);
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(dx, belt + 0.12, zWs - 0.62);
  wheelPivot.rotation.x = -0.35;
  wheelPivot.add(wheel);
  group.add(wheelPivot);
  // koltuklar
  const seatM = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.9 });
  for (const sx of [dx, -dx]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.5), seatM); seat.position.set(sx, d.clr + 0.35, seatZ); group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.1), seatM); back.position.set(sx, d.clr + 0.65, seatZ - 0.28); back.rotation.x = -0.15; group.add(back);
  }
  // vites kolu
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18), new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.8 }));
  gear.position.set(0, d.clr + 0.5, seatZ + 0.35); group.add(gear);
  let gT = 0;
  return {
    group, wheel, gauge,
    eye: new THREE.Vector3(dx, belt + 0.38, seatZ - 0.05),
    update(st, dt) {
      wheel.rotation.z = -(st.steer || 0) * 6;
      gT -= dt;
      if (gT <= 0) {
        gT = 1 / 15;
        const x = cvs.getContext('2d');
        x.fillStyle = '#05070a'; x.fillRect(0, 0, 256, 96);
        const dial = (cx, val, max, label, red) => {
          x.strokeStyle = '#334'; x.lineWidth = 6; x.beginPath(); x.arc(cx, 52, 36, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
          x.strokeStyle = red ? '#e63946' : '#4cc9f0';
          x.beginPath(); x.arc(cx, 52, 36, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * clamp(val / max, 0, 1)); x.stroke();
          x.fillStyle = '#fff'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.fillText(label, cx, 58);
        };
        dial(60, st.kmh || 0, 300, String(Math.round(st.kmh || 0)), false);
        dial(196, st.rpm || 0, st.red || 7000, st.gearTxt || 'N', (st.rpm || 0) > (st.red || 7000) * 0.9);
        x.fillStyle = '#ffd166'; x.font = '12px sans-serif'; x.fillText('⛽' + Math.round((st.fuel || 0) * 100) + '%', 128, 88);
        gtex.needsUpdate = true;
      }
    },
    dispose() { gtex.dispose(); },
  };
}
