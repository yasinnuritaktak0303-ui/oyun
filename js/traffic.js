// Trafik araçları, yayalar, polis ve yapay zekâ sürücüleri (havuz sistemiyle)
import * as THREE from 'three';
import { G, clamp, lerp, wrapAngle, pick, emit } from './core.js';
import { buildCar } from './carModel.js';
import { CARS } from './data/cars.js';
import { npcHorn } from './audio.js';
import { Vehicle } from './vehicle.js';
import { newCarEntry } from './save.js';

const TRAFFIC_IDS = CARS.filter((c) => ['hatch', 'sedan', 'suv', 'pickup', 'work'].includes(c.cls) && !c.police && c.body !== 'truck' && c.body !== 'tow').map((c) => c.id).concat(['dev', 'yuk', 'sari', 'sari']);
const COLORS = ['#f8f9fa', '#adb5bd', '#343a40', '#111', '#d00000', '#1d4ed8', '#2a9d8f', '#e9c46a', '#6b705c', '#9c6644', '#caf0f8', '#8d99ae'];

// ------------------- Yapay zekâ sürücüsü (fizikli araç) -------------------
export class AIDriver {
  constructor(vehicle) {
    this.v = vehicle; this.path = null; this.loop = false; this.idx = 0; this.skill = 1; this.maxSpeed = 1e9;
    this.target = null; this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.stuck = 0; this.reverseT = 0;
  }
  setPath(pts, loop) { this.path = pts; this.loop = loop; this.idx = 0; this.target = null; }
  nearestIdx() {
    let best = 0, bd = Infinity;
    const p = this.v.pos;
    for (let i = 0; i < this.path.length; i++) { const d = (this.path[i][0] - p.x) ** 2 + (this.path[i][1] - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    this.idx = best;
  }
  update(dt) {
    const v = this.v, inp = this.input;
    let tx, tz, speedT;
    if (this.target) {
      const tp = this.target();
      tx = tp.x; tz = tp.z; speedT = tp.speed ?? 40;
    } else if (this.path) {
      const P = this.path, n = P.length;
      // ilerle
      for (let k = 0; k < 8; k++) {
        const a = P[this.idx];
        if ((a[0] - v.pos.x) ** 2 + (a[1] - v.pos.z) ** 2 < 100) { if (this.idx < n - 1) this.idx++; else if (this.loop) this.idx = 0; else break; } else break;
      }
      const look = clamp(Math.floor(v.speed * 0.35) + 2, 2, 12);
      const ai = this.loop ? (this.idx + look) % n : Math.min(n - 1, this.idx + look);
      tx = P[ai][0]; tz = P[ai][1];
      // eğrilik -> hız
      let curv = 0;
      const span = clamp(Math.floor(v.speed * 0.8) + 4, 4, 30);
      for (let k = 1; k < span; k += 2) {
        const i0 = this.loop ? (this.idx + k) % n : Math.min(n - 1, this.idx + k);
        const i1 = this.loop ? (this.idx + k + 2) % n : Math.min(n - 1, this.idx + k + 2);
        const i2 = this.loop ? (this.idx + k + 4) % n : Math.min(n - 1, this.idx + k + 4);
        const a1 = Math.atan2(P[i1][0] - P[i0][0], P[i1][1] - P[i0][1]), a2 = Math.atan2(P[i2][0] - P[i1][0], P[i2][1] - P[i1][1]);
        const seg = Math.hypot(P[i2][0] - P[i1][0], P[i2][1] - P[i1][1]) || 1;
        curv = Math.max(curv, Math.abs(wrapAngle(a2 - a1)) / seg / Math.max(1, k * 0.15));
      }
      const R = 1 / Math.max(curv, 0.0005);
      speedT = Math.min(Math.sqrt(9.8 * 1.0 * R) * this.skill, this.maxSpeed);
    } else return inp;
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - v.yaw);
    // geri vites ile sıkışma kurtarma
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = clamp(err * 2, -1, 1); inp.handbrake = false;
      return inp;
    }
    inp.steer = clamp(-err * 2.2, -1, 1);
    const sp = v.fwdSpeed;
    if (sp < speedT - 1) { inp.throttle = clamp((speedT - sp) * 0.3, 0.3, 1); inp.brake = 0; }
    else if (sp > speedT + 2) { inp.throttle = 0; inp.brake = clamp((sp - speedT) * 0.15, 0, 1); }
    else { inp.throttle = 0.25; inp.brake = 0; }
    inp.handbrake = false;
    inp.nitro = this.useNitro && Math.abs(err) < 0.1 && sp < speedT - 10;
    if (v.speed < 1.5 && inp.throttle > 0.3) { this.stuck += dt; if (this.stuck > 1.5) { this.reverseT = 1.4; this.stuck = 0; } } else this.stuck = 0;
    return inp;
  }
}

// ------------------- Basit yaya modeli -------------------
function pedModel(color, skin) {
  const g = new THREE.Group();
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), m(color)); body.position.y = 1.25; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.27, 0.24), m(skin)); head.position.y = 1.72; g.add(head);
  const legM = m(pick(['#264f73', '#222', '#6c757d', '#c2a878']));
  const legs = [];
  for (const x of [-0.1, 0.1]) { const pv = new THREE.Group(); pv.position.set(x, 0.94, 0); const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.16), legM); l.position.y = -0.45; pv.add(l); g.add(pv); legs.push(pv); }
  const arms = [];
  for (const x of [-0.27, 0.27]) { const pv = new THREE.Group(); pv.position.set(x, 1.52, 0); const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), m(color)); a.position.y = -0.3; pv.add(a); g.add(pv); arms.push(pv); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legs, arms };
}

// ------------------- Trafik yöneticisi -------------------
export class Traffic {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.graph = world.graph;
    this.cars = []; this.peds = []; this.police = []; this.speeders = [];
    this.enabled = ['city', 'highway', 'island', 'airport', 'mountain'].includes(world.d.id);
    this.trafficNodes = this.graph.nodes.filter((n) => n.traffic && n.links.length >= 2);
    this.pedNodes = this.graph.nodes.filter((n) => n.links.some((l) => l.road.sidewalk));
    this.lightNodes = new Map();
    for (const L of world.d.lights) {
      const n = this.graph.nearest(L.x, L.z, 5);
      if (n) this.lightNodes.set(n.id, L);
    }
    this.nearMissCooldown = new Map();
    this.heat = 0; this.chase = null;
    this.build();
  }
  get density() { return G.settings.traffic * (G.settings.batterySaver ? 0.6 : 1) * (G.adaptTraffic ?? 1); }
  build() {
    if (!this.enabled || !this.trafficNodes.length) return;
    const base = this.world.d.id === 'city' ? 26 : 14;
    const n = Math.round(base * Math.max(0.25, this.density));
    for (let i = 0; i < n; i++) {
      const id = pick(TRAFFIC_IDS);
      const e = newCarEntry(id);
      e.cos.paint = id === 'sari' ? null : pick(COLORS);
      const m = buildCar(e, { low: true, driver: false });
      m.root.visible = false;
      this.scene.add(m.root);
      this.cars.push({ m, e, active: false, pos: new THREE.Vector3(), yaw: 0, speed: 0, L: m.d.L, W: m.d.W, hitT: 0, vel: new THREE.Vector2(), signal: 0, horned: 0, path: [] });
    }
    const pn = this.pedNodes.length ? Math.round((this.world.d.id === 'city' ? 18 : 8) * Math.max(0.3, this.density)) : 0;
    for (let i = 0; i < pn; i++) {
      const pm = pedModel(pick(['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#8338ec', '#f1f1f1', '#222']), pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#f9dcc4']));
      pm.g.visible = false;
      this.scene.add(pm.g);
      this.peds.push({ pm, active: false, pos: new THREE.Vector3(), yaw: 0, from: null, to: null, t: 0, side: 1, flee: 0, fleeDir: [0, 0], fallen: 0, phase: Math.random() * 6 });
    }
  }

  // --- yerleştirme ---
  spawnCar(c, px, pz) {
    for (let tries = 0; tries < 12; tries++) {
      const n = pick(this.trafficNodes);
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < 70 || d > 260) continue;
      const l = pick(n.links);
      const to = this.graph.nodes[l.to];
      c.from = n; c.to = to; c.t = 0; c.prev = null;
      c.lane = (n.lanes || 2) >= 4 ? Math.floor(Math.random() * 2) : 0;
      c.limit = (n.limit || 50) / 3.6 * (0.75 + Math.random() * 0.25);
      c.speed = c.limit * 0.6; c.hitT = 0; c.signal = 0; c.horned = 0;
      c.active = true; c.m.root.visible = true;
      c.path = [];
      this.extend(c);
      this.place(c, 1);
      return true;
    }
    return false;
  }
  extend(c) {
    // gelecekteki düğümleri planla
    let a = c.path.length ? c.path[c.path.length - 1] : c.to, prev = c.path.length > 1 ? c.path[c.path.length - 2] : c.from;
    while (c.path.length < 8) {
      const opts = a.links.filter((l) => l.to !== prev.id && l.road.traffic);
      const choice = opts.length ? pick(opts) : a.links[0];
      if (!choice) break;
      const nx = this.graph.nodes[choice.to];
      c.path.push(nx);
      prev = a; a = nx;
    }
  }
  laneOffset(c) {
    const w = c.from.width || 10, lanes = Math.max(2, c.from.lanes || 2);
    const lw = w / lanes;
    return lw * (0.5 + (c.lane || 0));
  }
  place(c, k) {
    const a = c.from, b = c.to;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz);
    const off = this.laneOffset(c);
    // sağ = (-cos, sin)
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    c.pos.set(a.x + dx * c.t + rx * off, lerp(a.y, b.y, c.t), a.z + dz * c.t + rz * off);
    c.yaw = k >= 1 ? yaw : c.yaw + wrapAngle(yaw - c.yaw) * k;
    c.segLen = len;
  }

  update(dt, player, car) {
    if (!this.enabled) return;
    const px = player.x, pz = player.z;
    for (const c of this.cars) {
      if (!c.active) { if (Math.random() < 0.05) this.spawnCar(c, px, pz); continue; }
      const dP = Math.hypot(c.pos.x - px, c.pos.z - pz);
      if (dP > 320) { c.active = false; c.m.root.visible = false; continue; }
      this.driveCar(c, dt, car);
    }
    this.updatePeds(dt, player, car);
  }

  driveCar(c, dt, car) {
    if (c.hitT > 0) {
      // çarpışma sonrası serbest kayma
      c.hitT -= dt;
      c.pos.x += c.vel.x * dt; c.pos.z += c.vel.y * dt;
      c.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      c.yaw += c.spin * dt; c.spin *= 1 - 2 * dt;
      c.pos.y = this.world.ground(c.pos.x, c.pos.z, c.pos.y + 1).h;
      if (c.hitT <= 0) {
        // en yakın düğümden devam
        const n = this.graph.nearest(c.pos.x, c.pos.z, 60);
        if (n && n.links.length) { c.from = n; c.to = this.graph.nodes[pick(n.links).to]; c.t = 0; c.path = []; this.extend(c); }
        if (car && Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z) < 40 && G.time - c.horned > 3) { c.horned = G.time; npcHorn(Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z)); }
      }
      this.syncModel(c, dt);
      return;
    }
    // hedef hız
    let target = c.limit;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    // öndeki engeller (diğer araçlar, oyuncu)
    const look = 8 + c.speed * 1.4;
    const check = (ox, oz, rad) => {
      const dx = ox - c.pos.x, dz = oz - c.pos.z;
      const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < look && side < rad) target = Math.min(target, Math.max(0, (along - c.L - 2) * 0.6));
    };
    for (const o of this.cars) if (o !== c && o.active) check(o.pos.x, o.pos.z, 2.0);
    if (car) check(car.pos.x, car.pos.z, 2.2);
    for (const pd of this.peds) if (pd.active && !pd.fallen) check(pd.pos.x, pd.pos.z, 2.2);
    // trafik ışığı
    const next = c.to;
    let distToLight = Infinity, lightNode = null;
    {
      let d = (1 - c.t) * c.segLen, prevN = c.to;
      if (this.lightNodes.has(prevN.id)) { distToLight = d; lightNode = prevN; }
      else for (const n of c.path) { d += Math.hypot(n.x - prevN.x, n.z - prevN.z); if (d > 40) break; if (this.lightNodes.has(n.id)) { distToLight = d; lightNode = n; break; } prevN = n; }
    }
    if (lightNode) {
      const L = this.lightNodes.get(lightNode.id);
      const axis = Math.abs(fx) > Math.abs(fz) ? 'EW' : 'NS';
      const st = this.world.lightAt(L, axis);
      const stopD = L.s / 2 + 5;
      if (st !== 'g' && distToLight > stopD - 1 && !(st === 'y' && distToLight < stopD + 4)) target = Math.min(target, Math.max(0, (distToLight - stopD) * 0.5));
    }
    // sinyal: yaklaşan dönüş
    c.signal = 0;
    if (c.path.length >= 3) {
      const a0 = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
      const p2 = c.path[2], p1 = c.path[0];
      const a1 = Math.atan2(p2.x - p1.x, p2.z - p1.z);
      const turn = wrapAngle(a1 - a0);
      if (Math.abs(turn) > 0.5) c.signal = turn > 0 ? -1 : 1; // + açı = sola
    }
    c.speed += clamp(target - c.speed, -9 * dt, 3 * dt);
    c.speed = Math.max(0, c.speed);
    c.t += (c.speed * dt) / c.segLen;
    while (c.t >= 1) {
      c.t -= 1;
      c.from = c.to;
      c.to = c.path.shift() || c.from;
      if (c.to === c.from) { c.active = false; c.m.root.visible = false; return; }
      this.extend(c);
      const dx = c.to.x - c.from.x, dz = c.to.z - c.from.z;
      c.segLen = Math.hypot(dx, dz) || 1;
      c.t = (c.t * 1) % 1;
      // şerit değiştirmeyi önlemek için yol sayısını güncelle
      if ((c.from.lanes || 2) < 4) c.lane = 0;
    }
    this.place(c, Math.min(1, dt * 8));
    this.syncModel(c, dt);
  }

  syncModel(c, dt) {
    const m = c.m;
    m.root.position.copy(c.pos);
    m.root.rotation.y = c.yaw;
    const night = G.nightF > 0.4;
    c.spinA = (c.spinA || 0) + (c.speed / 0.33) * dt;
    m.update({ steer: 0, spins: [c.spinA, c.spinA, c.spinA, c.spinA], lights: night, brake: c.hitT <= 0 && c.speed < c.limit * 0.5, indL: c.signal === -1, indR: c.signal === 1, t: G.time }, dt);
  }

  // Oyuncu aracı ile çarpışma ve yakın geçiş
  interact(car, dt, onNearMiss) {
    if (!this.enabled || !car) return;
    const cf = [Math.sin(car.yaw), Math.cos(car.yaw)];
    const r = car.W / 2;
    for (const c of this.cars) {
      if (!c.active) continue;
      const dx = c.pos.x - car.pos.x, dz = c.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 12) continue;
      if (Math.abs(c.pos.y - car.pos.y) > 3) continue;
      // 3x3 daire testi
      const of = [Math.sin(c.yaw), Math.cos(c.yaw)];
      let hit = false;
      let minGap = Infinity;
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
        const ax = car.pos.x + cf[0] * a * (car.L / 2 - r), az = car.pos.z + cf[1] * a * (car.L / 2 - r);
        const bx = c.pos.x + of[0] * b * (c.L / 2 - c.W / 2), bz = c.pos.z + of[1] * b * (c.L / 2 - c.W / 2);
        const ddx = bx - ax, ddz = bz - az, dd = Math.hypot(ddx, ddz);
        const gap = dd - r - c.W / 2;
        minGap = Math.min(minGap, gap);
        if (gap < 0 && !hit && dd > 1e-3) {
          hit = true;
          const nx = ddx / dd, nz = ddz / dd;
          const rel = (car.vel.x - c.vel.x * (c.hitT > 0 ? 1 : 0) - of[0] * c.speed * (c.hitT > 0 ? 0 : 1)) * nx + (car.vel.z - of[1] * c.speed * (c.hitT > 0 ? 0 : 1)) * nz;
          car.pos.x -= nx * -gap * 0.6; car.pos.z -= nz * -gap * 0.6;
          if (rel > 0) {
            const mOther = 1300;
            const j = (1.3 * rel) / (1 / car.p.mass + 1 / mOther);
            car.applyImpulse(-nx, -nz, j, ax + nx * r, az + nz * r);
            c.vel.set(of[0] * c.speed + (nx * j) / mOther, of[1] * c.speed + (nz * j) / mOther);
            c.spin = (Math.random() - 0.5) * rel * 0.3;
            c.hitT = 2.5; c.speed = 0;
            if (rel > 2) car.registerImpact(rel, 'car', ax + nx * r, az + nz * r);
            if (G.time - c.horned > 2) { c.horned = G.time; setTimeout(() => npcHorn(5), 300); }
            emit('trafficHit', c, rel);
          } else { c.pos.x += nx * -gap * 0.4; c.pos.z += nz * -gap * 0.4; }
        }
      }
      // yakın geçiş
      if (!hit && minGap < 1.0 && minGap > 0 && car.kmh > 60 && c.hitT <= 0) {
        const last = this.nearMissCooldown.get(c) || -10;
        if (G.time - last > 4) { this.nearMissCooldown.set(c, G.time); onNearMiss && onNearMiss(c); }
      }
    }
  }

  // ------------------- Yayalar -------------------
  updatePeds(dt, player, car) {
    for (const p of this.peds) {
      if (!p.active) {
        if (Math.random() < 0.03) {
          const n = pick(this.pedNodes);
          if (!n) continue;
          const d = Math.hypot(n.x - player.x, n.z - player.z);
          if (d < 40 || d > 160) continue;
          const l = n.links.find((ll) => ll.road.sidewalk) || n.links[0];
          p.from = n; p.to = this.graph.nodes[l.to]; p.t = 0; p.side = Math.random() < 0.5 ? 1 : -1; p.active = true; p.flee = 0; p.fallen = 0;
          p.pm.g.visible = true; p.speed = 1.1 + Math.random() * 0.5;
        }
        continue;
      }
      if (Math.hypot(p.pos.x - player.x, p.pos.z - player.z) > 200) { p.active = false; p.pm.g.visible = false; continue; }
      const g = p.pm.g;
      if (p.fallen > 0) {
        p.fallen -= dt;
        g.rotation.x = Math.min(Math.PI / 2, g.rotation.x + dt * 6);
        if (p.fallen <= 0) { g.rotation.x = 0; }
        continue;
      }
      // araç yaklaşınca kaç
      if (car && car.speed > 3) {
        const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z, d = Math.hypot(dx, dz);
        if (d < 2.0 && car.speed > 4) {
          p.fallen = 2.5; car.vel.multiplyScalar(0.96);
          emit('pedHit');
          continue;
        }
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
        const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
        if (d < 14 && along > -2 && Math.abs(side) < 4 && p.flee <= 0) {
          p.flee = 1.6; const sgn = side >= 0 ? 1 : -1;
          p.fleeDir = [fz * sgn, -fx * sgn];
        }
      }
      if (p.flee > 0) {
        p.flee -= dt;
        p.pos.x += p.fleeDir[0] * 5 * dt; p.pos.z += p.fleeDir[1] * 5 * dt;
        p.yaw = Math.atan2(p.fleeDir[0], p.fleeDir[1]);
        if (p.flee <= 0) {
          const n = this.graph.nearest(p.pos.x, p.pos.z, 50);
          if (n && n.links.length) { p.from = n; p.to = this.graph.nodes[n.links[0].to]; p.t = 0; }
        }
      } else {
        const a = p.from, b = p.to;
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        p.t += (p.speed * dt) / len;
        if (p.t >= 1) {
          const opts = b.links.filter((l) => l.to !== a.id && l.road.sidewalk);
          const l = opts.length ? pick(opts) : b.links.find((ll) => ll.to === a.id);
          p.from = b; p.to = this.graph.nodes[l.to]; p.t = 0;
          continue;
        }
        const yaw = Math.atan2(dx, dz);
        const off = (a.width || 10) / 2 + 1.5;
        const rx = -Math.cos(yaw) * p.side, rz = Math.sin(yaw) * p.side;
        const tx = a.x + dx * p.t + rx * off, tz = a.z + dz * p.t + rz * off;
        p.pos.x = lerp(p.pos.x || tx, tx, Math.min(1, dt * 3)); p.pos.z = lerp(p.pos.z || tz, tz, Math.min(1, dt * 3));
        p.yaw = yaw + (p.side < 0 ? Math.PI : 0) * 0 ;
        if (p.side < 0) { /* karşı kaldırım: aynı yönde yürür */ }
      }
      p.pos.y = this.world.ground(p.pos.x, p.pos.z, p.pos.y + 1).h + 0.1;
      g.position.copy(p.pos); g.rotation.y = p.yaw;
      p.phase += dt * (p.flee > 0 ? 14 : 7);
      const s = Math.sin(p.phase) * (p.flee > 0 ? 0.9 : 0.5);
      p.pm.legs[0].rotation.x = s; p.pm.legs[1].rotation.x = -s; p.pm.arms[0].rotation.x = -s; p.pm.arms[1].rotation.x = s;
    }
  }

  // ------------------- Polis -------------------
  spawnPolice(player, mode = 'chase', targetEntity) {
    if (!this.trafficNodes.length && mode !== 'race') return null;
    // oyuncunun gerisinde bir yol düğümü
    let best = null;
    for (let i = 0; i < 40; i++) {
      const n = pick(this.trafficNodes.length ? this.trafficNodes : this.graph.nodes);
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      if (d > 90 && d < 200) { best = n; break; }
    }
    if (!best) return null;
    const e = newCarEntry('devriye');
    const v = new Vehicle(e, this.world);
    v.place(best.x, best.z, Math.atan2(player.x - best.x, player.z - best.z));
    const m = buildCar(e, { low: true, driver: false });
    v.restGroundY && m.setGroundY(v.restGroundY);
    this.scene.add(m.root);
    const ai = new AIDriver(v);
    ai.useNitro = false;
    const unit = { v, m, ai, mode, siren: true };
    this.police.push(unit);
    return unit;
  }
  spawnSpeeder(player) {
    const n = this.graph.nearest(player.x + (Math.random() - 0.5) * 300, player.z + (Math.random() - 0.5) * 300, 400);
    if (!n) return null;
    const e = newCarEntry(pick(['yildirim', 'zipzip', 'asil', 'bozkurt', 'boga']));
    e.cos.paint = pick(COLORS);
    const v = new Vehicle(e, this.world);
    v.place(n.x, n.z, 0);
    const m = buildCar(e, { low: true, driver: false });
    m.setGroundY(v.restGroundY);
    this.scene.add(m.root);
    const ai = new AIDriver(v);
    ai.skill = 0.9;
    // rastgele uzun rota
    const pts = [];
    let cur = n, prev = null;
    for (let i = 0; i < 400; i++) { pts.push([cur.x, cur.z]); const opts = cur.links.filter((l) => !prev || l.to !== prev.id); const l = opts.length ? pick(opts) : cur.links[0]; prev = cur; cur = this.graph.nodes[l.to]; }
    ai.setPath(pts, false);
    const unit = { v, m, ai, busted: 0, close: 0 };
    this.speeders.push(unit);
    return unit;
  }
  removeUnit(list, u) {
    const i = list.indexOf(u);
    if (i >= 0) list.splice(i, 1);
    this.scene.remove(u.m.root); u.m.dispose();
  }
  stepAI(dt) {
    for (const u of this.police.concat(this.speeders)) {
      const inp = u.ai.update(dt);
      u.v.step(dt, inp);
    }
  }
  renderAI(alpha) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const u of this.police.concat(this.speeders)) {
      u.v.interpolate(alpha, p, q);
      u.m.root.position.copy(p); u.m.root.quaternion.copy(q);
      const sp = [0, 1, 2, 3].map((i) => u.v.wheels[i].spin);
      const wy = u.v.wheels.map((w) => -u.v.cgH + u.v.p.R + 0.05 + w.comp - u.v.restGroundY);
      u.m.update({ steer: u.v.steer, spins: sp, wheelY: wy, lights: G.nightF > 0.4, brake: u.v.brake > 0.1, siren: !!u.siren, t: G.time }, 1 / 60);
    }
  }
  clear() {
    for (const c of this.cars) { this.scene.remove(c.m.root); c.m.dispose(); }
    for (const p of this.peds) this.scene.remove(p.pm.g);
    for (const u of this.police.slice()) this.removeUnit(this.police, u);
    for (const u of this.speeders.slice()) this.removeUnit(this.speeders, u);
    this.cars = []; this.peds = [];
  }
}
