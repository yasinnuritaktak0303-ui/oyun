// Harita veri oluşturucu: arazi yükseklikleri, yollar, binalar, çarpışma kutuları, yüzeyler
import { seeded, makeNoise, clamp, lerp } from '../core.js';

export const SURF = { GRASS: 0, ASPHALT: 1, DIRT: 2, SAND: 3, MUD: 4, ROCK: 5, WATER: 6, CONCRETE: 7, SNOW: 8 };
export const SURF_GRIP = [0.72, 1.0, 0.78, 0.62, 0.45, 0.85, 0.3, 0.95, 0.55];
export const SURF_ROLL = [1.8, 1.0, 1.6, 4.0, 6.0, 1.3, 10, 1.0, 2.0];

export function catmull(points, closed, spacing = 6) {
  const out = [];
  const n = points.length;
  const get = (i) => {
    if (closed) return points[((i % n) + n) % n];
    return points[clamp(i, 0, n - 1)];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push([points[n - 1][0], points[n - 1][1]]);
  else out.push([out[0][0], out[0][1]]);
  return out;
}

export function resample(pts, spacing = 6) {
  const out = [pts[0].slice()];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= n; s++) out.push([lerp(a[0], b[0], s / n), lerp(a[1], b[1], s / n)]);
  }
  return out;
}

export class MapBuilder {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.size = def.size;
    this.half = def.size / 2;
    this.cs = 4;
    this.N = Math.round(def.size / this.cs);
    this.H = new Float32Array((this.N + 1) * (this.N + 1));
    this.scs = 2;
    this.SN = Math.round(def.size / this.scs);
    this.S = new Uint8Array(this.SN * this.SN); // yüzey
    this.R = new Uint8Array(this.SN * this.SN); // yol üstü maskesi (1=yol)
    this.rng = seeded(def.seed);
    this.noise = makeNoise(def.seed);
    this.roads = []; this.buildings = []; this.colliders = []; this.decks = [];
    this.trees = []; this.lamps = []; this.rocks = []; this.pois = []; this.chests = []; this.keys = [];
    this.diamond = null; this.parkSpots = []; this.lights = []; this.bumps = []; this.zones = [];
    this.tracks = []; this.props = []; this.cams = []; this.drag = null; this.driftZone = null;
    this.water = null; this.spawn = { x: 0, z: 0, rot: 0 }; this.paint = []; this.tunnels = [];
    this.cones = []; this.interiors = []; this.hidden = []; this.tolls = [];
    this.groundColor = def.groundColor || '#5a8f3c';
  }

  // ---- Yükseklik ----
  idx(i, j) { return j * (this.N + 1) + i; }
  setHeights(fn) {
    const N = this.N, cs = this.cs, h = this.half;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) this.H[this.idx(i, j)] = fn(i * cs - h, j * cs - h);
  }
  h(x, z) {
    const N = this.N, cs = this.cs;
    let fx = (x + this.half) / cs, fz = (z + this.half) / cs;
    fx = clamp(fx, 0, N - 0.0001); fz = clamp(fz, 0, N - 0.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const H = this.H, r = N + 1;
    const a = H[j * r + i], b = H[j * r + i + 1], c = H[(j + 1) * r + i], d = H[(j + 1) * r + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  // ---- Yüzey ----
  setSurfRect(x0, z0, x1, z1, s) {
    const sc = this.scs, h = this.half;
    const i0 = clamp(Math.floor((Math.min(x0, x1) + h) / sc), 0, this.SN - 1), i1 = clamp(Math.floor((Math.max(x0, x1) + h) / sc), 0, this.SN - 1);
    const j0 = clamp(Math.floor((Math.min(z0, z1) + h) / sc), 0, this.SN - 1), j1 = clamp(Math.floor((Math.max(z0, z1) + h) / sc), 0, this.SN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.S[j * this.SN + i] = s;
  }
  setSurfCircle(x, z, r, s) {
    const sc = this.scs, h = this.half;
    const i0 = clamp(Math.floor((x - r + h) / sc), 0, this.SN - 1), i1 = clamp(Math.floor((x + r + h) / sc), 0, this.SN - 1);
    const j0 = clamp(Math.floor((z - r + h) / sc), 0, this.SN - 1), j1 = clamp(Math.floor((z + r + h) / sc), 0, this.SN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = i * sc - h + 1, cz = j * sc - h + 1;
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) this.S[j * this.SN + i] = s;
    }
  }
  surf(x, z) {
    const sc = this.scs, h = this.half;
    const i = clamp(Math.floor((x + h) / sc), 0, this.SN - 1), j = clamp(Math.floor((z + h) / sc), 0, this.SN - 1);
    return this.S[j * this.SN + i];
  }
  fillSurf(fn) {
    const sc = this.scs, h = this.half;
    for (let j = 0; j < this.SN; j++) for (let i = 0; i < this.SN; i++) {
      const v = fn(i * sc - h + 1, j * sc - h + 1);
      if (v !== undefined) this.S[j * this.SN + i] = v;
    }
  }
  // Belirli bir alanı düzleştir (köy, otopark vb.)
  flatten(x, z, r, y, blend = 20) {
    const N = this.N, cs = this.cs, h = this.half;
    const R = r + blend;
    const i0 = clamp(Math.floor((x - R + h) / cs), 0, N), i1 = clamp(Math.ceil((x + R + h) / cs), 0, N);
    const j0 = clamp(Math.floor((z - R + h) / cs), 0, N), j1 = clamp(Math.ceil((z + R + h) / cs), 0, N);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * cs - h, pz = j * cs - h;
      const d = Math.hypot(px - x, pz - z);
      if (d > R) continue;
      const k = d <= r ? 1 : 1 - (d - r) / blend;
      const id = this.idx(i, j);
      this.H[id] = lerp(this.H[id], y, k * k * (3 - 2 * k));
    }
  }
  flattenRect(x0, z0, x1, z1, y, blend = 12) {
    const N = this.N, cs = this.cs, h = this.half;
    const i0 = clamp(Math.floor((x0 - blend + h) / cs), 0, N), i1 = clamp(Math.ceil((x1 + blend + h) / cs), 0, N);
    const j0 = clamp(Math.floor((z0 - blend + h) / cs), 0, N), j1 = clamp(Math.ceil((z1 + blend + h) / cs), 0, N);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * cs - h, pz = j * cs - h;
      const dx = Math.max(x0 - px, 0, px - x1), dz = Math.max(z0 - pz, 0, pz - z1);
      const d = Math.hypot(dx, dz);
      if (d > blend) continue;
      const k = 1 - d / blend;
      const id = this.idx(i, j);
      this.H[id] = lerp(this.H[id], y, k * k * (3 - 2 * k));
    }
  }

  // ---- Yollar ----
  // pts: [[x,z],...]; o: {width, kind, limit, traffic, closed, lanes, y (sabit yükseklik), structures}
  road(pts, o = {}) {
    const r = {
      pts: resample(pts, 5), width: o.width || 10, kind: o.kind || 'asphalt', limit: o.limit || 50,
      traffic: o.traffic !== false, closed: !!o.closed, lanes: o.lanes || 2, y: o.y, structures: !!o.structures,
      curbs: !!o.curbs, smoothH: o.smoothH ?? 6, maxGrade: o.maxGrade ?? 0.12, name: o.name, markings: o.markings !== false,
      sidewalk: !!o.sidewalk,
    };
    this.roads.push(r);
    return r;
  }

  finalizeRoads() {
    // 1) yükseklik profili
    for (const r of this.roads) {
      const n = r.pts.length;
      let ys = r.pts.map((p) => (r.y !== undefined ? r.y : this.h(p[0], p[1])));
      if (r.y === undefined) {
        for (let pass = 0; pass < r.smoothH; pass++) {
          const nys = ys.slice();
          for (let i = 1; i < n - 1; i++) nys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
          if (r.closed) nys[0] = nys[n - 1] = (ys[n - 2] + ys[0] * 2 + ys[1]) / 4;
          ys = nys;
        }
        // eğim sınırla (ileri-geri)
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < n; i++) {
            const d = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
            const m = d * r.maxGrade;
            ys[i] = clamp(ys[i], ys[i - 1] - m, ys[i - 1] + m);
          }
          for (let i = n - 2; i >= 0; i--) {
            const d = Math.hypot(r.pts[i][0] - r.pts[i + 1][0], r.pts[i][1] - r.pts[i + 1][1]);
            const m = d * r.maxGrade;
            ys[i] = clamp(ys[i], ys[i + 1] - m, ys[i + 1] + m);
          }
        }
      }
      r.ys = ys;
      // köprü / tünel tespiti
      r.seg = new Uint8Array(n); // 0 normal, 1 köprü, 2 tünel
      if (r.structures) {
        for (let i = 0; i < n; i++) {
          const t = this.h(r.pts[i][0], r.pts[i][1]);
          if (t < ys[i] - 11) r.seg[i] = 1;
          else if (t > ys[i] + 15) r.seg[i] = 2;
        }
        // kısa parçaları birleştir
        for (const v of [1, 2]) {
          for (let i = 1; i < n - 1; i++) if (r.seg[i] !== v && r.seg[i - 1] === v && r.seg[i + 1] === v) r.seg[i] = v;
        }
      }
    }
    // 2) araziyi yola göre düzleştir (köprüler hariç)
    const N = this.N, cs = this.cs, h = this.half;
    const best = new Float32Array((N + 1) * (N + 1)).fill(1e9);
    const target = new Float32Array((N + 1) * (N + 1));
    for (const r of this.roads) {
      const hw = r.width / 2 + 3, blend = r.y !== undefined ? 6 : 16;
      for (let i = 0; i < r.pts.length - 1; i++) {
        if (r.seg[i] === 1 && r.seg[i + 1] === 1) continue;
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ay = r.ys[i], by = r.ys[i + 1];
        const minx = Math.min(ax, bx) - hw - blend, maxx = Math.max(ax, bx) + hw + blend;
        const minz = Math.min(az, bz) - hw - blend, maxz = Math.max(az, bz) + hw + blend;
        const i0 = clamp(Math.floor((minx + h) / cs), 0, N), i1 = clamp(Math.ceil((maxx + h) / cs), 0, N);
        const j0 = clamp(Math.floor((minz + h) / cs), 0, N), j1 = clamp(Math.ceil((maxz + h) / cs), 0, N);
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
          const px = ii * cs - h, pz = jj * cs - h;
          let t = ((px - ax) * dx + (pz - az) * dz) / L2;
          t = clamp(t, 0, 1);
          const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
          if (d > hw + blend) continue;
          const id = this.idx(ii, jj);
          const y = lerp(ay, by, t) - 0.04;
          const k = d <= hw ? 1 : 1 - (d - hw) / blend;
          // en yakın yol kazanır
          const score = d - k * 0.001;
          if (score < best[id]) {
            best[id] = score;
            target[id] = k >= 1 ? y : lerp(this.H[id], y, k * k * (3 - 2 * k));
          }
        }
      }
    }
    for (let i = 0; i < best.length; i++) if (best[i] < 1e9) this.H[i] = target[i];
    // 3) yüzey işaretle ve köprü güvertelerini oluştur
    for (const r of this.roads) {
      const surf = r.kind === 'dirt' ? SURF.DIRT : SURF.ASPHALT;
      const hw = r.width / 2;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.ceil(len / 1.5);
        const nx = -(bz - az) / (len || 1), nz = (bx - ax) / (len || 1);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = lerp(ax, bx, t), cz = lerp(az, bz, t);
          for (let w = -hw; w <= hw; w += 1.5) {
            const x = cx + nx * w, z = cz + nz * w;
            const si = clamp(Math.floor((x + h) / this.scs), 0, this.SN - 1), sj = clamp(Math.floor((z + h) / this.scs), 0, this.SN - 1);
            this.S[sj * this.SN + si] = surf;
            this.R[sj * this.SN + si] = 1;
          }
        }
        if (r.seg[i] === 1 || r.seg[i + 1] === 1) {
          const ang = Math.atan2(bx - ax, bz - az);
          this.decks.push({ x: (ax + bx) / 2, z: (az + bz) / 2, rot: ang, len: len + 0.6, w: r.width + 1, y0: r.ys[i], y1: r.ys[i + 1], bridge: true });
        }
        if (r.seg[i] === 2) this.tunnels.push({ ax, az, bx, bz, ay: r.ys[i], by: r.ys[i + 1], w: r.width });
      }
    }
  }

  // ---- Nesneler ----
  box(x, z, w, d, rot = 0, y0 = -5, y1 = 50, tag) {
    const c = { x, z, hw: w / 2, hd: d / 2, rot, y0, y1, tag };
    this.colliders.push(c);
    return c;
  }
  building(x, z, w, d, h, o = {}) {
    const y = o.y ?? this.h(x, z);
    const b = { x, z, w, d, h, rot: o.rot || 0, y, color: o.color || '#b0b0b0', style: o.style ?? 0, roof: o.roof };
    this.buildings.push(b);
    if (!o.noCollide) this.box(x, z, w, d, b.rot, y - 2, y + h, 'bld');
    if (o.roofDeck) this.decks.push({ x, z, rot: b.rot, len: d, w, y0: y + h, y1: y + h, roof: true });
    return b;
  }
  tree(x, z, s = 1, type = 0) { this.trees.push({ x, z, y: this.h(x, z), s, type }); this.colliders.push({ x, z, r: 0.5 * s, y0: -5, y1: 50, tag: 'tree' }); }
  rock(x, z, s = 1) { this.rocks.push({ x, z, y: this.h(x, z), s, rot: this.rng() * 6 }); this.colliders.push({ x, z, r: 0.9 * s, y0: -5, y1: this.h(x, z) + s * 1.2, tag: 'rock' }); }
  lamp(x, z, rot = 0) { this.lamps.push({ x, z, y: this.h(x, z), rot }); this.colliders.push({ x, z, r: 0.25, y0: -5, y1: 50, tag: 'lamp' }); }
  poi(type, x, z, rot = 0, o = {}) {
    const p = { type, x, z, rot, y: this.h(x, z), ...o };
    this.pois.push(p);
    return p;
  }
  ramp(x, z, rot, len = 16, w = 6, hgt = 3, o = {}) {
    const y = o.y ?? this.h(x, z);
    this.decks.push({ x, z, rot, len, w, y0: y, y1: y + hgt, ramp: true, color: o.color });
    return { x, z, rot };
  }
  deck(x, z, rot, len, w, y0, y1, o = {}) { this.decks.push({ x, z, rot, len, w, y0, y1, ...o }); }
  chest(tier, x, z, y) { this.chests.push({ tier, x, z, y: y ?? this.h(x, z) }); }
  key(x, z, y) { this.keys.push({ x, z, y: y ?? this.h(x, z) }); }
  prop(kind, x, z, o = {}) { this.props.push({ kind, x, z, y: o.y ?? this.h(x, z), rot: 0, ...o }); }
  parking(x, z, rot, cols, rows = 1, o = {}) {
    // Otopark: sütun x satır park yeri; her yer 2.7 x 5.5
    const sw = o.sw || 2.8, sl = o.sl || 5.6, ang = o.angle || 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const W = cols * sw, D = rows * (sl + 7);
    this.paint.push({ type: 'lot', x, z, rot, w: W + 4, d: D + 2 });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lx = -W / 2 + sw * (c + 0.5), lz = -D / 2 + 1 + r * (sl + 7) + sl / 2;
      const wx = x + lx * cr + lz * sr, wz = z - lx * sr + lz * cr;
      const spot = { x: wx, z: wz, rot: rot + ang, w: sw, l: sl, y: this.h(wx, wz) };
      this.parkSpots.push(spot);
      this.paint.push({ type: 'spot', ...spot });
    }
  }
  trafficLight(nodeX, nodeZ, size) { this.lights.push({ x: nodeX, z: nodeZ, s: size, phase: this.rng() * 20 }); }
}
