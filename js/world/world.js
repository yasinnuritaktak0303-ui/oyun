// Dünya: haritadan 3D sahne üretir, zemin/çarpışma sorguları, gün-gece ve hava durumu
import * as THREE from 'three';
import { G, clamp, lerp } from '../core.js';
import { Geo, colorize } from './geo.js';
import { SURF, SURF_GRIP, SURF_ROLL } from './builder.js';
import { RoadGraph } from './graph.js';
import * as TX from './textures.js';

const CHUNK = 200;
const POI_ICONS = { fuel: ['⛽', '#e63946'], repair: ['🔧', '#457b9d'], wash: ['🧽', '#00b4d8'], gallery: ['🚗', '#8338ec'], garage: ['🔩', '#2a9d8f'], teleport: ['🌀', '#7209b7'], house: ['🏡', '#f4a261'], clothes: ['👕', '#ff006e'], cafe: ['☕', '#9c6644'], tuning: ['🛠️', '#fb8500'] };
export { POI_ICONS };

export class World {
  constructor(data) {
    this.d = data;
    this.root = new THREE.Group();
    this.chunks = new Map();
    this.colGrid = new Map();
    this.colCell = 32;
    this.dynamic = []; // her karede güncellenecek nesneler
    this.mats = {};
    this.lightState = [];
    this.graph = new RoadGraph(data);
    this.nightMats = [];
    this.g = { h: 0, nx: 0, ny: 1, nz: 0, surf: 1, grip: 1, roll: 1, deck: null, water: false };
  }

  chunkFor(x, z) {
    const i = Math.floor(x / CHUNK), j = Math.floor(z / CHUNK);
    const k = i + ',' + j;
    let c = this.chunks.get(k);
    if (!c) {
      c = { key: k, x: (i + 0.5) * CHUNK, z: (j + 0.5) * CHUNK, group: new THREE.Group(), geos: {}, hi: null, lo: null, far: [] };
      this.chunks.set(k, c);
      this.root.add(c.group);
    }
    return c;
  }
  geoFor(x, z, matKey) {
    const c = this.chunkFor(x, z);
    return (c.geos[matKey] ||= new Geo());
  }

  // ------------- İnşa -------------
  async build(progress = () => {}) {
    const d = this.d;
    const snow = d.snow;
    this.makeMaterials(snow);
    progress(0.1);
    this.buildTerrain(snow); progress(0.3); await tick();
    this.buildRoads(); progress(0.45); await tick();
    this.buildBuildings(); progress(0.6); await tick();
    this.buildDecks(); this.buildPaint(); this.buildInteriors();
    this.buildVegetation(snow); progress(0.75); await tick();
    this.buildLamps(); this.buildTrafficLights(); this.buildPois(); this.buildProps(); this.buildMisc();
    progress(0.85); await tick();
    this.buildColliders();
    this.finalizeChunks();
    this.buildSky();
    this.buildWater();
    this.buildWeather();
    progress(0.95);
  }

  makeMaterials(snow) {
    const M = this.mats;
    M.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
    M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: TX.groundTexture() });
    M.terrain.map.repeat.set(1, 1);
    for (const st of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const f = TX.facadeTextures(st);
      M['bld' + st] = new THREE.MeshStandardMaterial({ vertexColors: true, map: f.map, emissiveMap: f.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: st === 1 ? 0.4 : 0.8, metalness: st === 1 ? 0.3 : 0.05 });
      if (st === 0 || st === 1) this.nightMats.push(M['bld' + st]);
    }
    M.road = {};
    M.curb = new THREE.MeshStandardMaterial({ map: TX.curbTexture(), roughness: 0.7 });
    M.cross = new THREE.MeshStandardMaterial({ map: TX.crosswalkTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    M.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.glow = new THREE.MeshBasicMaterial({ color: '#fff4c2' });
    this.nightGlow = M.glow;
    M.lightPool = new THREE.MeshBasicMaterial({ map: TX.radialTexture('rgba(255,220,150,0.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    M.glass = new THREE.MeshStandardMaterial({ color: '#9ec9e8', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.5 });
    M.water = new THREE.MeshStandardMaterial({ color: '#1f7fb8', transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.35 });
  }

  roadMat(kind, lanes) {
    const k = kind + lanes;
    if (!this.mats.road[k]) {
      this.mats.road[k] = new THREE.MeshStandardMaterial({ map: TX.roadTexture(kind, lanes), roughness: 0.9, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    }
    return this.mats.road[k];
  }

  buildTerrain(snow) {
    const d = this.d, N = d.N, cs = d.cs, half = d.half;
    const per = CHUNK / cs; // hücre / parça
    const gc = new THREE.Color(d.groundColor);
    const cols = {
      [SURF.GRASS]: gc, [SURF.ASPHALT]: new THREE.Color('#555'), [SURF.DIRT]: new THREE.Color('#8b6d4a'), [SURF.SAND]: new THREE.Color('#dcc08a'),
      [SURF.MUD]: new THREE.Color('#5a4630'), [SURF.ROCK]: new THREE.Color('#8a8a84'), [SURF.CONCRETE]: new THREE.Color('#9b9b98'), [SURF.SNOW]: new THREE.Color('#f2f5f8'),
    };
    const rockC = new THREE.Color('#7d7a72'), snowC = new THREE.Color('#f4f6f8'), sandC = new THREE.Color('#d8c08a'), tmp = new THREE.Color();
    const makeTile = (ti, tj, step) => {
      const i0 = ti * per, j0 = tj * per;
      const n = Math.ceil(per / step) + 1;
      const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
      let k = 0;
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
        const i = Math.min(i0 + a * step, N), j = Math.min(j0 + b * step, N);
        const x = i * cs - half, z = j * cs - half;
        const y = d.H[j * (N + 1) + i];
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 24; uv[k * 2 + 1] = z / 24;
        // renk: yüzey + eğim
        const s = d.surf(x, z);
        tmp.copy(cols[s] || gc);
        const hx = d.h(x + 2, z) - d.h(x - 2, z), hz = d.h(x, z + 2) - d.h(x, z - 2);
        const slope = Math.hypot(hx, hz) / 4;
        if (slope > 0.5) tmp.lerp(rockC, clamp((slope - 0.5) * 2, 0, 1));
        if (d.water && d.water.sea && y < 2.5) tmp.lerp(sandC, 0.8);
        if (snow || (d.id === 'mountain' && y > 170)) tmp.lerp(snowC, snow ? 0.85 : clamp((y - 170) / 20, 0, 1));
        const v = 0.92 + ((Math.sin(x * 0.13) * Math.cos(z * 0.11)) * 0.06);
        col[k * 3] = tmp.r * v; col[k * 3 + 1] = tmp.g * v; col[k * 3 + 2] = tmp.b * v;
        k++;
      }
      const idx = [];
      for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
        const p = b * n + a;
        idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    };
    const tiles = Math.ceil(N / per);
    for (let tj = 0; tj < tiles; tj++) for (let ti = 0; ti < tiles; ti++) {
      const x = ti * CHUNK - half + 1, z = tj * CHUNK - half + 1;
      const c = this.chunkFor(x, z);
      const hi = new THREE.Mesh(makeTile(ti, tj, 1), this.mats.terrain);
      const lo = new THREE.Mesh(makeTile(ti, tj, 4), this.mats.terrain);
      hi.receiveShadow = true; lo.receiveShadow = true;
      hi.matrixAutoUpdate = lo.matrixAutoUpdate = false;
      c.group.add(hi); c.group.add(lo);
      lo.visible = false;
      (c.terrain ||= []).push({ hi, lo });
    }
  }

  buildRoads() {
    const d = this.d;
    for (const r of d.roads) {
      const hw = r.width / 2;
      const kind = r.kind === 'asphalt' ? 'asphalt' : r.kind;
      const lanes = kind === 'asphalt' ? (r.lanes >= 4 ? 4 : 2) : r.lanes;
      const mkey = 'road:' + kind + ':' + lanes;
      let acc = 0;
      const pts = r.pts, ys = r.ys;
      const perp = (i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        return [-dz / l, dx / l];
      };
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const pa = perp(i), pb = perp(i + 1);
        const ya = ys[i] + 0.06, yb = ys[i + 1] + 0.06;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const g = this.geoFor(mx, mz, mkey);
        const v0 = acc / 12, v1 = (acc + len) / 12;
        g.quad([a[0] - pa[0] * hw, ya, a[1] - pa[1] * hw], [a[0] + pa[0] * hw, ya, a[1] + pa[1] * hw], [b[0] + pb[0] * hw, yb, b[1] + pb[1] * hw], [b[0] - pb[0] * hw, yb, b[1] - pb[1] * hw], [0, 1, 0], [1, v0, 0, v0, 0, v1, 1, v1], '#ffffff');
        // kaldırımlar
        if (r.sidewalk) {
          const sg = this.geoFor(mx, mz, 'vc');
          for (const sd of [-1, 1]) {
            const o1 = hw * sd, o2 = (hw + 3) * sd;
            const P = (p, pp, o, y) => [p[0] + pp[0] * o, y, p[1] + pp[1] * o];
            const yA = ya + 0.1, yB = yb + 0.1;
            if (sd > 0) sg.quad(P(a, pa, o1, yA), P(a, pa, o2, yA), P(b, pb, o2, yB), P(b, pb, o1, yB), [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], '#a7a7a2');
            else sg.quad(P(a, pa, o2, yA), P(a, pa, o1, yA), P(b, pb, o1, yB), P(b, pb, o2, yB), [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], '#a7a7a2');
          }
        }
        // pist kenar bordürleri
        if (r.curbs) {
          const cg = this.geoFor(mx, mz, 'curb');
          for (const sd of [-1, 1]) {
            const o1 = hw * sd, o2 = (hw + 1.4) * sd;
            const P = (p, pp, o, y) => [p[0] + pp[0] * o, y, p[1] + pp[1] * o];
            const q = sd > 0 ? [P(a, pa, o1, ya + 0.02), P(a, pa, o2, ya + 0.02), P(b, pb, o2, yb + 0.02), P(b, pb, o1, yb + 0.02)] : [P(a, pa, o2, ya + 0.02), P(a, pa, o1, ya + 0.02), P(b, pb, o1, yb + 0.02), P(b, pb, o2, yb + 0.02)];
            cg.quad(q[0], q[1], q[2], q[3], [0, 1, 0], [0, v0 * 2, 1, v0 * 2, 1, v1 * 2, 0, v1 * 2], '#ffffff');
          }
        }
        // köprü korkulukları
        if (r.seg && (r.seg[i] === 1 || r.seg[i + 1] === 1)) {
          const bg = this.geoFor(mx, mz, 'vc');
          const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
          for (const sd of [-1, 1]) {
            const ox = pa[0] * (hw + 0.3) * sd, oz = pa[1] * (hw + 0.3) * sd;
            bg.box(mx + ox, Math.min(ya, yb) - 0.05, mz + oz, 0.3, 1.1 + Math.abs(yb - ya) / 2, len + 0.3, ang, '#c0c4c8');
          }
          // alt kiriş
          bg.box(mx, Math.min(ya, yb) - 1.4, mz, r.width + 1, 1.3, len + 0.3, ang, '#9aa0a6');
          if (i % 6 === 0) {
            const ground = d.h(mx, mz);
            if (ground < ya - 2) bg.box(mx, ground - 2, mz, 2.5, ya - ground, 2.5, ang, '#8d939a');
          }
        }
        // tünel kabuğu
        if (r.seg && r.seg[i] === 2) {
          const tg = this.geoFor(mx, mz, 'vc');
          const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
          for (const sd of [-1, 1]) tg.box(mx + pa[0] * (hw + 0.8) * sd, Math.min(ya, yb) - 0.2, mz + pa[1] * (hw + 0.8) * sd, 1.6, 7, len + 0.2, ang, '#6b6b6b');
          tg.box(mx, Math.min(ya, yb) + 6.8, mz, r.width + 3.2, 1.2, len + 0.2, ang, '#5a5a5a', { topCol: '#6f6a5c' });
          if (i % 3 === 0) {
            const lg = this.geoFor(mx, mz, 'glow');
            lg.box(mx, Math.min(ya, yb) + 6.6, mz, 0.6, 0.15, 2, ang, '#ffffff');
          }
          this.d.colliders.push({ x: mx + pa[0] * (hw + 0.8), z: mz + pa[1] * (hw + 0.8), hw: 0.8, hd: len / 2 + 0.1, rot: ang, y0: Math.min(ya, yb) - 2, y1: Math.max(ya, yb) + 7, tag: 'wall' });
          this.d.colliders.push({ x: mx - pa[0] * (hw + 0.8), z: mz - pa[1] * (hw + 0.8), hw: 0.8, hd: len / 2 + 0.1, rot: ang, y0: Math.min(ya, yb) - 2, y1: Math.max(ya, yb) + 7, tag: 'wall' });
        }
        acc += len;
      }
    }
    // şehir kavşak yamaları
    for (const L of d.lights) {
      const g = this.geoFor(L.x, L.z, 'cross');
      g.flat(L.x, 0.09, L.z, L.s + 7, L.s + 7, 0, '#ffffff');
    }
  }

  buildBuildings() {
    for (const b of this.d.buildings) {
      const st = b.style ?? 0;
      const g = this.geoFor(b.x, b.z, 'bld' + st);
      const col = b.color;
      if (st === 3 || st === 2) g.box(b.x, b.y, b.z, b.w, b.h, b.d, b.rot, col, { us: 1 / 4, vs: 1 / 4 });
      else g.box(b.x, b.y, b.z, b.w, b.h, b.d, b.rot, col, { topCol: '#6d6d6d' });
      // çatı detayı
      if (st <= 1 && b.h > 14 && b.w > 10) {
        const rg = this.geoFor(b.x, b.z, 'vc');
        rg.box(b.x, b.y + b.h, b.z, b.w * 0.3, 2.5, b.d * 0.3, b.rot, '#8a8a8a');
      }
    }
  }

  buildDecks() {
    for (const k of this.d.decks) {
      if (k.roof) continue;
      const g = this.geoFor(k.x, k.z, 'vc');
      if (k.ramp) {
        g.wedge(k.x, k.z, k.rot, k.len, k.w, k.y0 + 0.02, k.y1, k.color || '#f4a261', 0.3);
        // yan oklar
      } else if (k.dock) {
        g.box(k.x, k.y0 - 0.6, k.z, k.w, 0.6, k.len, k.rot, '#8d6e53', { us: 1 / 2 });
        for (let a = -1; a <= 1; a += 2) for (let b2 = -1; b2 <= 1; b2 += 2) {
          const cr = Math.cos(k.rot), sr = Math.sin(k.rot);
          const lx = a * (k.w / 2 - 1), lz = b2 * (k.len / 2 - 1);
          g.box(k.x + lx * cr + lz * sr, -8, k.z - lx * sr + lz * cr, 1, k.y0 + 8 - 0.6, 1, 0, '#5d4a3a');
        }
      } else if (k.bridge) {
        // yol yüzeyi zaten yol mesh'i ile çiziliyor
      } else {
        g.wedge(k.x, k.z, k.rot, k.len, k.w, k.y0, k.y1, k.color || '#9a9a9a', 0.5);
      }
    }
    // hız tümsekleri
    for (const b of this.d.bumps) {
      const g = this.geoFor(b.x, b.z, 'vc');
      for (let i = 0; i < 6; i++) {
        const cr = Math.cos(b.rot), sr = Math.sin(b.rot);
        const lx = -b.w / 2 + (i + 0.5) * (b.w / 6);
        g.box(b.x + lx * cr, this.d.h(b.x, b.z), b.z - lx * sr, b.w / 6, 0.1, 0.9, b.rot, i % 2 ? '#111' : '#f2c94c');
      }
    }
  }

  buildPaint() {
    for (const p of this.d.paint) {
      const y = (p.y ?? this.d.h(p.x, p.z)) + 0.08;
      if (p.type === 'lot') {
        const g = this.geoFor(p.x, p.z, 'paint');
        g.flat(p.x, y - 0.01, p.z, p.w, p.d, p.rot, '#4a4a4e');
      } else if (p.type === 'pad') {
        const g = this.geoFor(p.x, p.z, 'paint');
        g.flat(p.x, y - 0.01, p.z, p.w, p.d, 0, '#3d3d40');
      } else if (p.type === 'grass') {
        const g = this.geoFor(p.x, p.z, 'paint');
        g.flat(p.x, y - 0.015, p.z, p.w, p.d, 0, '#5d9445');
      } else if (p.type === 'spot') {
        const g = this.geoFor(p.x, p.z, 'paint');
        const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
        for (const s of [-1, 1]) {
          const lx = (s * p.w) / 2;
          g.flat(p.x + lx * cr, y, p.z - lx * sr, 0.12, p.l, p.rot, '#f1f1f1');
        }
        const lz = -p.l / 2;
        g.flat(p.x + lz * sr, y, p.z + lz * cr, p.w, 0.12, p.rot, '#f1f1f1');
      }
    }
  }

  buildInteriors() {
    for (const it of this.d.interiors) {
      const g = this.geoFor(it.x, it.z, 'paint');
      g.flat(it.x, it.y + 0.1, it.z, it.w - 0.6, it.d - 0.6, it.rot, it.floor);
      const lg = this.geoFor(it.x, it.z, 'glow');
      const cr = Math.cos(it.rot), sr = Math.sin(it.rot);
      for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
        const lx = a * it.w * 0.25, lz = b * it.d * 0.25;
        lg.box(it.x + lx * cr + lz * sr, it.y + it.h - 0.3, it.z - lx * sr + lz * cr, 3, 0.15, 0.6, it.rot, '#ffffff');
      }
      if (it.kind === 'garage') {
        // liftler (araçlar oyun sırasında üzerine yerleştirilir)
        const vg = this.geoFor(it.x, it.z, 'vc');
        it.lifts = [];
        for (let k = 0; k < 4; k++) {
          const lx = -it.w / 2 + 6 + k * ((it.w - 12) / 3), lz = -it.d / 2 + 8;
          const px = it.x + lx * cr + lz * sr, pz = it.z - lx * sr + lz * cr;
          vg.box(px, it.y, pz, 3.2, 1.4, 6, it.rot, '#f2c94c');
          vg.box(px - 1.8 * cr, it.y, pz + 1.8 * sr, 0.4, 3, 0.4, it.rot, '#555');
          it.lifts.push({ x: px, z: pz, y: it.y + 1.4, rot: it.rot });
        }
        vg.box(it.x - (it.w / 2 - 1.5) * cr, it.y, it.z + (it.w / 2 - 1.5) * sr, 1.5, 2.2, it.d * 0.6, it.rot, '#d62828');
      }
      if (it.kind === 'gallery') {
        const vg = this.geoFor(it.x, it.z, 'vc');
        it.stands = [];
        for (let k = 0; k < 3; k++) {
          const lx = -it.w / 2 + 10 + k * ((it.w - 20) / 2), lz = -4;
          const px = it.x + lx * cr + lz * sr, pz = it.z - lx * sr + lz * cr;
          vg.box(px, it.y, pz, 7, 0.4, 7, it.rot + 0.3, '#ced4da');
          it.stands.push({ x: px, z: pz, y: it.y + 0.4, rot: it.rot + 0.6 + k });
        }
      }
    }
  }

  buildVegetation(snow) {
    const leaf = snow ? '#dfe8e3' : '#3f7d3a';
    const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 2.6, 6).translate(0, 1.3, 0);
    const types = [
      mergeGeos([colorize(trunkG.clone(), '#6b4a2f'), colorize(new THREE.IcosahedronGeometry(2.0, 0).translate(0, 3.8, 0), leaf)]),
      mergeGeos([colorize(trunkG.clone(), '#5b3e28'), colorize(new THREE.ConeGeometry(1.9, 5.5, 7).translate(0, 4.6, 0), snow ? '#e3ece6' : '#2d5a32')]),
      mergeGeos([colorize(new THREE.CylinderGeometry(0.45, 0.5, 3.4, 7).translate(0, 1.7, 0), '#4f8a4b'), colorize(new THREE.CylinderGeometry(0.3, 0.32, 1.4, 6).rotateZ(Math.PI / 2).translate(0.7, 2.0, 0), '#4f8a4b')]),
      mergeGeos([colorize(new THREE.CylinderGeometry(0.2, 0.3, 6, 6).translate(0, 3, 0), '#8d6e4f'), colorize(new THREE.ConeGeometry(2.6, 1.0, 7).translate(0, 6.2, 0), '#4c9a3c')]),
    ];
    const byChunk = new Map();
    for (const t of this.d.trees) {
      const c = this.chunkFor(t.x, t.z);
      const k = c.key + '|' + t.type;
      if (!byChunk.has(k)) byChunk.set(k, { c, type: t.type, list: [] });
      byChunk.get(k).list.push(t);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const { c, type, list } of byChunk.values()) {
      const im = new THREE.InstancedMesh(types[type], this.mats.vc, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, (t.x * 13.7 + t.z) % 6.28);
        s.setScalar(t.s); p.set(t.x, t.y - 0.1, t.z);
        m.compose(p, q, s); im.setMatrixAt(i, m);
      });
      im.castShadow = true;
      im.computeBoundingSphere();
      c.group.add(im);
      c.far.push(im);
    }
    // kayalar
    const rockG = colorize(new THREE.DodecahedronGeometry(1, 0), '#8a8580');
    const rb = new Map();
    for (const r of this.d.rocks) { const c = this.chunkFor(r.x, r.z); if (!rb.has(c)) rb.set(c, []); rb.get(c).push(r); }
    for (const [c, list] of rb) {
      const im = new THREE.InstancedMesh(rockG, this.mats.vc, list.length);
      list.forEach((r, i) => { q.setFromAxisAngle(up, r.rot); s.set(r.s * 1.3, r.s, r.s * 1.1); p.set(r.x, r.y + r.s * 0.2, r.z); m.compose(p, q, s); im.setMatrixAt(i, m); });
      im.castShadow = true; im.computeBoundingSphere();
      c.group.add(im);
    }
  }

  buildLamps() {
    const poleG = mergeGeos([
      colorize(new THREE.CylinderGeometry(0.1, 0.14, 7, 6).translate(0, 3.5, 0), '#4a4f55'),
      colorize(new THREE.BoxGeometry(0.15, 0.15, 2.2).translate(0, 7, 0.9), '#4a4f55'),
    ]);
    const headG = new THREE.BoxGeometry(0.5, 0.15, 0.9).translate(0, 6.9, 1.9);
    const poolG = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(0, 0.12, 2.2);
    const by = new Map();
    for (const l of this.d.lamps) { const c = this.chunkFor(l.x, l.z); if (!by.has(c)) by.set(c, []); by.get(c).push(l); }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.lampPools = [];
    for (const [c, list] of by) {
      const a = new THREE.InstancedMesh(poleG, this.mats.vc, list.length);
      const h = new THREE.InstancedMesh(headG, this.mats.glow, list.length);
      const pl = new THREE.InstancedMesh(poolG, this.mats.lightPool, list.length);
      list.forEach((l, i) => { q.setFromAxisAngle(up, l.rot); p.set(l.x, l.y, l.z); m.compose(p, q, s); a.setMatrixAt(i, m); h.setMatrixAt(i, m); pl.setMatrixAt(i, m); });
      for (const im of [a, h, pl]) { im.computeBoundingSphere(); c.group.add(im); }
      a.castShadow = true;
      pl.visible = false;
      this.lampPools.push(pl);
      c.far.push(a, h, pl);
    }
  }

  buildTrafficLights() {
    const L = this.d.lights;
    if (!L.length) return;
    const poleG = colorize(new THREE.CylinderGeometry(0.1, 0.12, 5, 6).translate(0, 2.5, 0), '#33373b');
    const boxG = colorize(new THREE.BoxGeometry(0.45, 1.3, 0.4).translate(0, 4.6, 0), '#222');
    const bulbG = new THREE.SphereGeometry(0.17, 8, 6);
    const count = L.length * 4;
    const poles = new THREE.InstancedMesh(mergeGeos([poleG, boxG]), this.mats.vc, count);
    // her direkte 3 lamba: kırmızı/sarı/yeşil -> tek ampul, renk instance ile
    this.tlBulbs = new THREE.InstancedMesh(bulbG, new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let k = 0;
    this.tlInfo = [];
    for (const l of L) {
      const o = l.s / 2 + 1.2;
      const corners = [[o, o, 0, 'NS'], [-o, -o, Math.PI, 'NS'], [-o, o, -Math.PI / 2, 'EW'], [o, -o, Math.PI / 2, 'EW']];
      for (const [dx, dz, rot, axis] of corners) {
        q.setFromAxisAngle(up, rot);
        p.set(l.x + dx, 0, l.z + dz); m.compose(p, q, s); poles.setMatrixAt(k, m);
        const fx = Math.sin(rot) * 0.22, fz = Math.cos(rot) * 0.22;
        p.set(l.x + dx + fx, 4.6, l.z + dz + fz); m.compose(p, q, s); this.tlBulbs.setMatrixAt(k, m);
        this.tlInfo.push({ l, axis, k });
        this.tlBulbs.setColorAt(k, new THREE.Color('#ff0000'));
        k++;
      }
    }
    poles.computeBoundingSphere(); this.tlBulbs.computeBoundingSphere();
    this.root.add(poles); this.root.add(this.tlBulbs);
    this.tlBulbs.frustumCulled = false; poles.frustumCulled = false;
  }

  // Trafik ışığı durumu: 'g' | 'y' | 'r' (axis: NS ya da EW)
  lightAt(l, axis) {
    const cycle = 26;
    const t = (G.time + l.phase) % cycle;
    // 0-11 NS yeşil, 11-13 NS sarı, 13-24 EW yeşil, 24-26 EW sarı
    if (axis === 'NS') return t < 11 ? 'g' : t < 13 ? 'y' : 'r';
    return t >= 13 && t < 24 ? 'g' : t >= 24 ? 'y' : 'r';
  }

  buildPois() {
    this.poiObjs = [];
    const vc = this.mats.vc;
    for (const p of this.d.pois) {
      const grp = new THREE.Group();
      grp.position.set(p.x, p.y, p.z);
      grp.rotation.y = p.rot;
      const g = new Geo();
      const t = p.type;
      if (t === 'fuel') {
        g.box(0, 5, 0, 18, 0.8, 12, 0, '#e63946', { stretch: true });
        for (const [x, z] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) g.box(x, 0, z, 0.5, 5, 0.5, 0, '#ddd');
        for (const x of [-4, 4]) { g.box(x, 0, 0, 2.4, 0.3, 6, 0, '#bbb'); g.box(x, 0.3, 0, 0.9, 1.7, 1.2, 0, '#f1faee'); }
      } else if (t === 'repair' || t === 'tuning') {
        g.box(0, 0, -9, 16, 6, 8, 0, t === 'repair' ? '#457b9d' : '#495057', { stretch: true });
        g.box(0, 0.5, -4.95, 8, 4.5, 0.1, 0, '#1b1b1b');
      } else if (t === 'wash') {
        g.box(-3.4, 0, 0, 0.6, 4.5, 10, 0, '#00b4d8'); g.box(3.4, 0, 0, 0.6, 4.5, 10, 0, '#00b4d8'); g.box(0, 4.5, 0, 7.4, 0.6, 10, 0, '#0077b6');
        g.box(-2.5, 0.2, 0, 0.8, 3.5, 0.8, 0, '#4cc9f0'); g.box(2.5, 0.2, 0, 0.8, 3.5, 0.8, 0, '#4cc9f0');
      } else if (t === 'gallery' && this.d.id !== 'city') {
        g.box(0, 0, -11, 22, 7, 10, 0, '#e0e1dd', { stretch: true });
        g.box(0, 0.6, -5.95, 18, 5, 0.1, 0, '#9ec9e8');
      } else if (t === 'garage' && this.d.id !== 'city') {
        g.box(0, 0, -11, 18, 6.5, 10, 0, '#2a9d8f', { stretch: true });
        g.box(0, 0.2, -5.95, 9, 5, 0.1, 0, '#adb5bd');
      } else if (t === 'house') {
        g.box(0, 0, -11, 12, 5, 9, 0, '#f4a261', { stretch: true });
        g.box(0, 5, -11, 12.6, 0.3, 9.6, 0, '#9c4221');
        g.box(0, 0, -6.4, 1.6, 2.6, 0.1, 0, '#5c3d2e');
      } else if (t === 'teleport') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 32), new THREE.MeshBasicMaterial({ color: '#c77dff' }));
        ring.position.y = 3.6; grp.add(ring);
        this.dynamic.push((dt) => { ring.rotation.y += dt * 1.2; });
        g.box(0, 0, 0, 8, 0.15, 8, 0, '#3c096c');
      } else if (t === 'clothes' && this.d.id !== 'city') {
        g.box(0, 0, -6, 6, 3, 4, 0, '#ff8fab');
      } else if (t === 'cafe') {
        // kafe binası şehirde hollow
      }
      if (!g.empty) {
        const mesh = new THREE.Mesh(g.build(), vc);
        mesh.castShadow = true; mesh.receiveShadow = true;
        grp.add(mesh);
      }
      // zemin halkası + ikon
      const [emoji, color] = POI_ICONS[t] || ['❔', '#333'];
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      ring.position.y = 0.15; grp.add(ring);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.iconTexture(emoji, color), depthTest: true }));
      spr.scale.set(3, 3, 3); spr.position.y = t === 'fuel' ? 7.5 : 8;
      grp.add(spr);
      this.dynamic.push((dt) => { spr.position.y = (t === 'fuel' ? 7.5 : 8) + Math.sin(G.time * 2 + p.x) * 0.3; });
      const c = this.chunkFor(p.x, p.z);
      c.group.add(grp);
      this.poiObjs.push({ p, grp });
    }
  }

  buildProps() {
    const vc = this.mats.vc;
    for (const pr of this.d.props) {
      const g = new Geo();
      if (pr.kind === 'table') { g.box(0, 0, 0, 0.2, 0.75, 0.2, 0, '#5c4033'); g.box(0, 0.75, 0, 1.6, 0.08, 1.6, 0, '#deb887'); for (const [x, z] of [[1.3, 0], [-1.3, 0]]) g.box(x, 0, z, 0.5, 0.45, 0.5, 0, '#8b5a2b'); this.d.colliders.push({ x: pr.x, z: pr.z, r: 0.9, y0: pr.y - 1, y1: pr.y + 0.9, tag: 'prop' }); }
      else if (pr.kind === 'counter') { g.box(0, 0, 0, 14, 1.1, 1.2, 0, '#6f4e37', { topCol: '#d6ccc2' }); g.box(-4, 1.1, 0, 0.6, 0.6, 0.5, 0, '#adb5bd'); }
      else if (pr.kind === 'crane') { g.box(0, 0, 0, 2, 30, 2, 0, '#f4a261'); g.box(8, 30, 0, 26, 1.6, 1.6, 0, '#f4a261'); g.box(-4, 26, 0, 4, 4, 3, 0, '#e76f51'); this.d.colliders.push({ x: pr.x, z: pr.z, r: 1.4, y0: -5, y1: 60, tag: 'prop' }); }
      else if (pr.kind === 'boat') { g.box(0, 0, 0, 5, 1.6, 14, pr.rot || 0, '#f8f9fa', { topCol: '#8d6e53' }); g.box(0, 1.6, -1, 3, 2, 4, pr.rot || 0, '#ced4da'); }
      else if (pr.kind === 'plane') {
        g.box(0, 2, 0, 4, 4, 34, pr.rot || 0, '#f8f9fa'); g.box(0, 3, 2, 34, 0.5, 6, pr.rot || 0, '#dee2e6'); g.box(0, 6, -14, 0.5, 6, 4, pr.rot || 0, '#1d4ed8'); g.box(0, 4, -14, 12, 0.4, 3, pr.rot || 0, '#dee2e6');
        this.d.colliders.push({ x: pr.x, z: pr.z, hw: pr.rot ? 17 : 2, hd: pr.rot ? 2 : 17, rot: 0, y0: -2, y1: pr.y + 6, tag: 'plane' });
      }
      else if (pr.kind === 'umbrella') { g.box(0, 0, 0, 0.1, 2.4, 0.1, 0, '#eee'); const um = new THREE.Mesh(colorize(new THREE.ConeGeometry(1.6, 0.6, 8).translate(0, 2.5, 0), ['#e63946', '#ffb703', '#219ebc'][Math.floor(Math.abs(pr.x)) % 3]), vc); um.position.set(pr.x, pr.y, pr.z); this.chunkFor(pr.x, pr.z).group.add(um); }
      else if (pr.kind === 'dragtree') { g.box(0, 0, 0, 0.3, 3, 0.3, 0, '#222'); g.box(0, 3, 0, 0.8, 2.4, 0.4, 0, '#111'); }
      else if (pr.kind === 'rlight') { g.box(0, 0, 0, 0.3, 0.4, 0.3, 0, '#ffd166'); }
      if (!g.empty) {
        const mesh = new THREE.Mesh(g.build(), vc);
        mesh.position.set(pr.x, pr.y, pr.z);
        mesh.castShadow = true;
        this.chunkFor(pr.x, pr.z).group.add(mesh);
      }
    }
    // koniler
    if (this.d.cones.length) {
      const cg = colorize(new THREE.ConeGeometry(0.3, 0.8, 8).translate(0, 0.4, 0), '#ff6b00');
      const im = new THREE.InstancedMesh(cg, vc, this.d.cones.length);
      const m = new THREE.Matrix4();
      this.d.cones.forEach((c, i) => { c.y = this.d.h(c.x, c.z) + 0.05; m.makeTranslation(c.x, c.y, c.z); im.setMatrixAt(i, m); this.d.colliders.push({ x: c.x, z: c.z, r: 0.35, y0: c.y - 1, y1: c.y + 0.8, tag: 'cone' }); });
      im.computeBoundingSphere();
      this.root.add(im);
    }
  }

  buildMisc() {
    // hız kameraları
    for (const c of this.d.cams) {
      const y = this.d.h(c.x, c.z);
      const g = this.geoFor(c.x, c.z, 'vc');
      const ox = Math.cos(c.rot) * 12, oz = -Math.sin(c.rot) * 12;
      g.box(c.x + ox, y, c.z + oz, 0.25, 5, 0.25, c.rot, '#777');
      g.box(c.x + ox, y + 5, c.z + oz, 0.8, 0.6, 1, c.rot, '#3a3a3a');
    }
    // gişeler
    for (const t of this.d.tolls) {
      const y = this.d.h(t.x, t.z);
      const g = this.geoFor(t.x, t.z, 'vc');
      g.box(t.x, y + 6, t.z, 12, 1, t.w + 6, 0, '#2a9d8f', { stretch: true });
      for (const zz of [-5.5, 0, 5.5]) { g.box(t.x, y, t.z + zz, 8, 1.2, 1.2, 0, '#f1faee'); g.box(t.x, y + 1.2, t.z + zz, 2, 2.4, 1.2, 0, '#e9ecef'); g.box(t.x, y + 1.2, t.z + zz, 0.2, 4.8, 0.2, 0, '#bbb'); }
    }
    // drag ışık ağacı ve başlangıç/bitiş çizgileri
    const dr = this.d.drag;
    if (dr) {
      const y = this.d.h(dr.x, dr.z) + 0.1;
      const g = this.geoFor(dr.x, dr.z, 'paint');
      const fx = Math.sin(dr.rot), fz = Math.cos(dr.rot);
      g.flat(dr.x, y, dr.z, 20, 0.8, dr.rot, '#ffffff');
      g.flat(dr.x + fx * dr.len, y, dr.z + fz * dr.len, 20, 1.2, dr.rot, '#ffd60a');
    }
    // gizli anahtar ve elmas konumları sandık modülünde çiziliyor
    // harita sınırı (görsel çit)
    const E = this.d.half - 4;
    const g = new Geo();
    for (const [x, z, w, d] of [[0, -E, this.d.size, 1], [0, E, this.d.size, 1], [-E, 0, 1, this.d.size], [E, 0, 1, this.d.size]]) g.box(x, -20, z, w, 22.5, d, 0, '#5c5c5c');
    const fence = new THREE.Mesh(g.build(), this.mats.vc);
    this.root.add(fence);
  }

  buildColliders() {
    const cell = this.colCell;
    const add = (o, x, z, r) => {
      const i0 = Math.floor((x - r) / cell), i1 = Math.floor((x + r) / cell), j0 = Math.floor((z - r) / cell), j1 = Math.floor((z + r) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = i + ',' + j;
        let l = this.colGrid.get(k);
        if (!l) { l = { c: [], d: [] }; this.colGrid.set(k, l); }
        (o.isDeck ? l.d : l.c).push(o);
      }
    };
    for (const c of this.d.colliders) {
      if (c.r !== undefined) add(c, c.x, c.z, c.r);
      else { c.cr = Math.cos(c.rot || 0); c.sr = Math.sin(c.rot || 0); add(c, c.x, c.z, Math.hypot(c.hw, c.hd)); }
    }
    for (const d of this.d.decks) {
      d.isDeck = true; d.cr = Math.cos(d.rot); d.sr = Math.sin(d.rot);
      add(d, d.x, d.z, Math.hypot(d.w / 2, d.len / 2));
    }
    for (const b of this.d.bumps) { b.isDeck = true; b.bump = true; b.cr = Math.cos(b.rot); b.sr = Math.sin(b.rot); b.len = 1; b.y0 = b.y1 = this.d.h(b.x, b.z); add(b, b.x, b.z, b.w / 2 + 1); }
  }

  finalizeChunks() {
    for (const c of this.chunks.values()) {
      for (const key in c.geos) {
        const geo = c.geos[key];
        if (geo.empty) continue;
        let mat;
        if (key.startsWith('road:')) { const [, kind, lanes] = key.split(':'); mat = this.roadMat(kind, +lanes); }
        else mat = this.mats[key] || this.mats.vc;
        const mesh = new THREE.Mesh(geo.build(), mat);
        mesh.receiveShadow = true;
        mesh.castShadow = key.startsWith('bld') || key === 'vc';
        mesh.matrixAutoUpdate = false;
        c.group.add(mesh);
        if (key === 'vc' || key === 'paint') c.far.push(mesh);
      }
      c.geos = null;
    }
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(1, 32, 16);
    this.skyUniforms = {
      top: { value: new THREE.Color('#3a7bd5') }, bottom: { value: new THREE.Color('#cfe8ff') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 }, sunColor: { value: new THREE.Color('#fff2c4') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform float night; uniform vec3 sunColor; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){ float h = clamp(vDir.y*0.5+0.5,0.0,1.0); vec3 c = mix(bottom, top, pow(h, 1.4));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunColor * (pow(s, 600.0)*3.0 + pow(s, 12.0)*0.25) * (1.0-night*0.7);
          if(night>0.3){ float st = hash(floor(vDir*220.0)); c += vec3(step(0.996, st)) * (night-0.3) * step(0.0, vDir.y); }
          gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.scale.setScalar(3000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.root.add(this.sky);
  }

  buildWater() {
    const w = this.d.water;
    if (!w || !w.sea) return;
    const g = new THREE.PlaneGeometry(this.d.size * 2.5, this.d.size * 2.5, 1, 1).rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(g, this.mats.water);
    this.waterMesh.position.y = w.level;
    this.waterMesh.receiveShadow = true;
    this.root.add(this.waterMesh);
  }

  buildWeather() {
    const n = 2400;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x, y + 0.6, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainU = { time: { value: 0 }, cam: { value: new THREE.Vector3() }, speed: { value: 22 }, snow: { value: 0 }, opacity: { value: 0.5 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `uniform float time; uniform vec3 cam; uniform float speed; uniform float snow;
        void main(){ vec3 p = position; float base = mod(p.y - time*speed, 30.0);
          float top = fract(position.y) > 0.5 ? 0.0 : 0.0;
          p.y = base + cam.y - 8.0; p.y += (position.y - floor(position.y)) * (1.0 - snow);
          p.x = mod(p.x - cam.x + 30.0 + sin(time + position.z)*snow*2.0, 60.0) - 30.0 + cam.x;
          p.z = mod(p.z - cam.z + 30.0, 60.0) - 30.0 + cam.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); gl_PointSize = 3.0; }`,
      fragmentShader: `uniform float opacity; uniform float snow; void main(){ gl_FragColor = vec4(mix(vec3(0.75,0.8,0.9), vec3(1.0), snow), opacity); }`,
    });
    this.rain = new THREE.LineSegments(g, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.root.add(this.rain);
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) sp.set([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60], i * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snowPts = new THREE.Points(sg, mat.clone());
    this.snowPts.material.uniforms = this.rainU;
    this.snowPts.frustumCulled = false; this.snowPts.visible = false;
    this.root.add(this.snowPts);
  }

  // ------------- Sorgular -------------
  // Zemin yüksekliği ve normali. yHint: aracın mevcut yüksekliği (köprü/rampa seçimi için)
  ground(x, z, yHint = 1e9) {
    const d = this.d, g = this.g;
    let h = d.h(x, z);
    const e = 1.0;
    let nx = d.h(x - e, z) - d.h(x + e, z), nz = d.h(x, z - e) - d.h(x, z + e), ny = 2 * e;
    const il = 1 / Math.hypot(nx, ny, nz);
    nx *= il; ny *= il; nz *= il;
    let surf = d.surf(x, z);
    g.deck = null;
    const cell = this.colGrid.get(Math.floor(x / this.colCell) + ',' + Math.floor(z / this.colCell));
    if (cell) {
      for (const k of cell.d) {
        const dx = x - k.x, dz = z - k.z;
        const lx = dx * k.cr - dz * k.sr, lz = dx * k.sr + dz * k.cr;
        if (k.bump) {
          if (Math.abs(lx) < k.w / 2 && Math.abs(lz) < 0.5) { h += 0.09 * Math.cos(lz * Math.PI); }
          continue;
        }
        if (Math.abs(lx) > k.w / 2 || Math.abs(lz) > k.len / 2) continue;
        const t = (lz + k.len / 2) / k.len;
        const kh = k.y0 + (k.y1 - k.y0) * t;
        if (kh > h - 0.05 && kh <= yHint + 1.1) {
          h = kh;
          const s = (k.y1 - k.y0) / k.len, nl = Math.hypot(1, s);
          nx = (-s * k.sr) / nl; ny = 1 / nl; nz = (-s * k.cr) / nl;
          surf = k.dock ? SURF.CONCRETE : SURF.ASPHALT;
          g.deck = k;
        }
      }
    }
    g.h = h; g.nx = nx; g.ny = ny; g.nz = nz; g.surf = surf;
    g.water = !!(d.water && d.water.sea && h < d.water.level - 0.3 && !g.deck);
    g.waterLevel = d.water ? d.water.level : -1e9;
    let grip = SURF_GRIP[surf], roll = SURF_ROLL[surf];
    if (G.weather === 'rain') { grip *= surf === SURF.ASPHALT || surf === SURF.CONCRETE ? 0.78 : 0.85; }
    if (d.snow && !g.deck && surf !== SURF.ASPHALT) grip *= 0.8;
    if (d.snow && (surf === SURF.ASPHALT)) grip *= 0.82;
    g.grip = grip; g.roll = roll;
    return g;
  }

  // Daire - statik engel çarpışması. cb(nx, nz, depth, collider)
  collide(x, z, r, y, cb) {
    const c0 = this.colCell;
    const i0 = Math.floor((x - r) / c0), i1 = Math.floor((x + r) / c0), j0 = Math.floor((z - r) / c0), j1 = Math.floor((z + r) / c0);
    let hit = false;
    const seen = i0 !== i1 || j0 !== j1 ? new Set() : null;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = this.colGrid.get(i + ',' + j);
      if (!cell) continue;
      for (const c of cell.c) {
        if (seen) { if (seen.has(c)) continue; seen.add(c); }
        if (y > c.y1 - 0.15 || y + 1.6 < c.y0) continue;
        if (c.r !== undefined) {
          const dx = x - c.x, dz = z - c.z, dd = Math.hypot(dx, dz), m = r + c.r;
          if (dd < m && dd > 1e-4) { cb(dx / dd, dz / dd, m - dd, c); hit = true; }
        } else {
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * c.cr - dz * c.sr, lz = dx * c.sr + dz * c.cr;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
          let ex = lx - qx, ez = lz - qz;
          let dd = Math.hypot(ex, ez);
          let nlx, nlz, depth;
          if (dd > 1e-5) {
            if (dd >= r) continue;
            nlx = ex / dd; nlz = ez / dd; depth = r - dd;
          } else {
            // merkez kutunun içinde
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz + r; }
          }
          // yerel -> dünya
          const nx = nlx * c.cr + nlz * c.sr, nz = -nlx * c.sr + nlz * c.cr;
          cb(nx, nz, depth, c); hit = true;
        }
      }
    }
    return hit;
  }

  // Görev sırasında eklenen geçici engeller
  addCollider(c) {
    if (c.r === undefined) { c.cr = Math.cos(c.rot || 0); c.sr = Math.sin(c.rot || 0); }
    const r = c.r !== undefined ? c.r : Math.hypot(c.hw, c.hd), cell = this.colCell;
    c._cells = [];
    for (let j = Math.floor((c.z - r) / cell); j <= Math.floor((c.z + r) / cell); j++) for (let i = Math.floor((c.x - r) / cell); i <= Math.floor((c.x + r) / cell); i++) {
      const k = i + ',' + j;
      let l = this.colGrid.get(k);
      if (!l) { l = { c: [], d: [] }; this.colGrid.set(k, l); }
      l.c.push(c); c._cells.push(l);
    }
    return c;
  }
  removeCollider(c) {
    if (!c._cells) return;
    for (const l of c._cells) { const i = l.c.indexOf(c); if (i >= 0) l.c.splice(i, 1); }
    c._cells = null;
  }

  nearestRoadPoint(x, z) {
    const n = this.graph.nearest(x, z, 3000);
    return n;
  }

  // ------------- Güncelleme -------------
  update(dt, cam) {
    const s = G.settings;
    for (const f of this.dynamic) f(dt);
    // parça görünürlüğü ve LOD
    this._t = (this._t || 0) - dt;
    if (this._t <= 0) {
      this._t = 0.2;
      const vd = s.viewDist + CHUNK * 0.75;
      for (const c of this.chunks.values()) {
        const dist = Math.hypot(c.x - cam.x, c.z - cam.z);
        const vis = dist < vd;
        c.group.visible = vis;
        if (!vis) continue;
        const hi = dist < Math.max(260, s.viewDist * 0.45);
        if (c.terrain) for (const t of c.terrain) { t.hi.visible = hi; t.lo.visible = !hi; }
        const farHide = dist > s.viewDist * 0.7 + 100;
        for (const m of c.far) m.visible = !farHide || m.isMesh && !m.isInstancedMesh;
      }
    }
    this.sky.position.copy(cam);
    // trafik ışıkları renkleri
    if (this.tlBulbs) {
      this._lt = (this._lt || 0) - dt;
      if (this._lt <= 0) {
        this._lt = 0.25;
        const red = new THREE.Color('#ff2020'), yel = new THREE.Color('#ffc300'), grn = new THREE.Color('#20ff60');
        for (const info of this.tlInfo) {
          const st = this.lightAt(info.l, info.axis);
          this.tlBulbs.setColorAt(info.k, st === 'g' ? grn : st === 'y' ? yel : red);
        }
        this.tlBulbs.instanceColor.needsUpdate = true;
      }
    }
    // hava
    if (this.rain) {
      this.rainU.time.value = G.time;
      this.rainU.cam.value.copy(cam);
      const raining = G.weather === 'rain';
      const snowing = this.d.snow && G.weather !== 'sunny';
      this.rain.visible = raining && s.particles > 0;
      this.snowPts.visible = !!snowing && !raining;
      this.rainU.snow.value = snowing && !raining ? 1 : 0;
      this.rainU.speed.value = this.rainU.snow.value ? 3 : 24;
      this.rainU.opacity.value = this.rainU.snow.value ? 0.9 : 0.45;
    }
  }

  setNight(nf) {
    for (const m of this.nightMats) m.emissiveIntensity = nf * 1.1;
    const on = nf > 0.35;
    this.mats.glow.color.set(on ? '#fff1b8' : '#8a8a80');
    if (this.lampPools) for (const p of this.lampPools) p.visible = on;
  }

  setWet(wet) {
    for (const k in this.mats.road) {
      const m = this.mats.road[k];
      m.roughness = wet ? 0.28 : 0.9;
      m.metalness = wet ? 0.25 : 0.0;
    }
    this.mats.cross.roughness = wet ? 0.3 : 0.9;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const k in this.mats) { const m = this.mats[k]; if (m && m.dispose) m.dispose(); }
  }
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

function mergeGeos(list) {
  // basit birleştirme (aynı öznitelikler: position, normal, uv, color)
  let total = 0;
  const gs = list.map((g) => { const ng = g.index ? g.toNonIndexed() : g; if (!ng.attributes.color) colorize(ng, '#ffffff'); if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2)); total += ng.attributes.position.count; return ng; });
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const size = gs[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of gs) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
export { mergeGeos };
