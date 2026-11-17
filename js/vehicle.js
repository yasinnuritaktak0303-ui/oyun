// Araç fiziği: sabit zaman adımı (120 Hz) ile çalışır.
// Yaylı süspansiyon (4 teker), Pacejka benzeri lastik modeli, sürtünme çemberi, motor/şanzıman,
// ABS / TCS / ESC, el freni, nitro, hız sabitleyici, launch control.
import * as THREE from 'three';
import { clamp, lerp, G } from './core.js';
import { CAR, BODY_DIMS, ENGINES } from './data/cars.js';

const GRAV = 9.81;
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// Araç parametrelerini (yükseltme + tuning dahil) hesapla
export function computeParams(entry) {
  const spec = CAR[entry.id];
  const dims = BODY_DIMS[spec.body];
  const up = entry.upgrades || {};
  const tu = entry.tuning || {};
  const engId = entry.engineSwap || spec.engine;
  const eng = ENGINES[engId];
  const baseEng = ENGINES[spec.engine];
  const em = eng.mult / baseEng.mult;
  let vmax = spec.vmax * Math.sqrt(em) * (1 + 0.04 * (up.engine || 0) + 0.015 * (up.exhaust || 0));
  let t100 = (spec.t100 / em) * (1 - 0.05 * (up.turbo || 0)) * (1 - 0.015 * (up.exhaust || 0));
  const ecu = entry.tuningBought && entry.tuningBought.ecu ? tu.ecu : 0.5;
  vmax *= 1 + (ecu - 0.5) * 0.04; t100 *= 1 - (ecu - 0.5) * 0.04;
  const wred = entry.tuningBought && entry.tuningBought.weight ? tu.weight * 150 : 0;
  const mass = Math.max(700, spec.mass - wred);
  t100 *= mass / spec.mass;
  const cls = spec.cls;
  const gears = engId === 'ev' ? 1 : spec.body === 'truck' ? 8 : ['super', 'hyper', 'secret'].includes(cls) ? 7 : ['sport', 'drift', 'muscle'].includes(cls) ? 6 : 5;
  const p = {
    id: spec.id, spec, dims, mass, vmax: vmax / 3.6, t100, drive: spec.drive, engine: engId,
    cyl: eng.cyl, idle: eng.idle || 0, red: eng.red * (1 + (ecu - 0.5) * 0.08), gears,
    shiftTime: 0.32 - 0.05 * (up.gearbox || 0),
    brake: (1.0 + 0.1 * (up.brakes || 0)),
    grip: (1.0 + 0.04 * (up.tires || 0)) * (1 - Math.abs(tu.tirePressure - 0.5) * 0.15) * (cls === 'drift' ? 0.94 : 1) * (cls === 'hyper' || cls === 'secret' ? 1.38 : cls === 'super' ? 1.26 : cls === 'sport' || cls === 'muscle' ? 1.1 : spec.body === 'truck' ? 0.9 : 1),
    nitroDur: 4 * (1 + 0.2 * (up.nitro || 0)), nitroPow: 1 + 0.1 * (up.nitro || 0),
    rideH: 0.75 + tu.rideHeight * 0.5, stiff: 0.7 + tu.stiffness * 0.7,
    camber: tu.camber, diff: tu.diffLock, brakeBias: tu.brakeBias,
    gearLen: 0.92 + tu.gearRatio * 0.16,
    downforce: ['super', 'hyper', 'secret'].includes(cls) ? 2.2 : ['sport', 'drift', 'muscle'].includes(cls) ? 1.0 : 0.2,
    steerMax: cls === 'drift' ? 0.72 : spec.body === 'truck' || spec.body === 'tow' ? 0.5 : 0.6,
    launchGrip: ['super', 'hyper', 'secret'].includes(cls) ? 1.22 : ['sport', 'muscle', 'drift'].includes(cls) ? 1.1 : 1,
    rearGrip: cls === 'drift' ? 0.98 : cls === 'muscle' ? 1.05 : 1.12,
    offroad: spec.drive === 'awd' && ['suv', 'pickup'].includes(cls) ? 1 : spec.drive === 'awd' ? 0.6 : 0,
  };
  // vites oranları
  const g1 = 3.4, gN = gears === 1 ? 1 : 0.78;
  p.ratios = [];
  for (let i = 0; i < gears; i++) p.ratios.push(gears === 1 ? 1 : g1 * Math.pow(gN / g1, i / (gears - 1)));
  p.R = dims.r;
  // son hız tepe vitesinde redline'a denk gelsin
  p.final = ((p.red * 2 * Math.PI) / 60) * p.R / (p.vmax * 1.01) / p.ratios[gears - 1];
  p.rev = 3.2;
  calibrate(p);
  p.final /= p.gearLen;
  return p;
}

function torqueCurve(p, rpm) {
  const x = rpm / p.red;
  if (p.engine === 'ev') return x < 0.35 ? 1 : 0.35 / x;
  return clamp(0.62 + 1.2 * x - 1.0 * x * x, 0.35, 1);
}

// İvme simülasyonu ile tork ve sürükleme katsayısını ayarla (0-100 ve son hız hedefleri)
function calibrate(p) {
  const m = p.mass;
  const driveShare = p.drive === 'awd' ? 1 : p.drive === 'fwd' ? 0.5 : 0.6;
  const mu = 1.05 * p.grip * p.launchGrip * (p.drive === 'fwd' ? 1 : p.rearGrip);
  const crr = 0.012;
  const forceAt = (Tpk, v, gear) => {
    const r = p.ratios[gear] * p.final;
    const rpm = Math.max(p.idle * 1.1 || 1000, (v / p.R) * r * 60 / (2 * Math.PI));
    return Tpk * torqueCurve(p, Math.min(rpm, p.red)) * r / p.R * 0.9;
  };
  const sim = (Tpk, cd) => {
    let v = 0, t = 0, gear = 0, shift = 0;
    const dt = 1 / 60;
    while (v < 27.78 && t < 40) {
      let F = 0;
      if (shift > 0) shift -= dt;
      else {
        const rpm = (v / p.R) * p.ratios[gear] * p.final * 60 / (2 * Math.PI);
        if (rpm > p.red * 0.97 && gear < p.gears - 1) { gear++; shift = p.shiftTime; }
        F = Math.min(forceAt(Tpk, v, gear), mu * m * GRAV * driveShare * 0.95);
      }
      F -= cd * v * v + crr * m * GRAV;
      v += (F / m) * dt; t += dt;
    }
    return t;
  };
  const cdFor = (T) => Math.max(0.05, (forceAt(T, p.vmax, p.gears - 1) - crr * m * GRAV) / (p.vmax * p.vmax));
  // t(T) eğrisi tek tepelidir (fazla tork = fazla sürükleme ayarı), bu yüzden önce tara sonra ikiye böl
  let T = 40, prevT = T, prevTime = Infinity, bestT = T, bestTime = Infinity, found = false;
  for (let i = 0; i < 80; i++) {
    const time = sim(T, cdFor(T));
    if (time < bestTime) { bestTime = time; bestT = T; }
    if (time <= p.t100) { found = true; break; }
    if (time > prevTime + 0.05 && i > 3) break;
    prevTime = time; prevT = T; T *= 1.18;
  }
  let Tpk = bestT;
  if (found) {
    let lo = prevT, hi = T;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (sim(mid, cdFor(mid)) > p.t100) lo = mid; else hi = mid; }
    Tpk = hi;
  }
  const cd = cdFor(Tpk) * (p.vmax > 83 ? 0.62 : 0.82);
  p.Tpk = Tpk; p.cd = cd; p.crr = crr;
}

export class Vehicle {
  constructor(entry, world) {
    this.entry = entry;
    this.world = world;
    this.p = computeParams(entry);
    const d = this.p.dims;
    this.L = d.L; this.W = d.W; this.H = d.H;
    this.wb = d.wb; this.track = d.W * 0.84;
    this.cgH = 0.45 + d.clr;
    const m = this.p.mass;
    this.Iyaw = (m * (d.L * d.L + d.W * d.W)) / 12;
    this.Ipitch = (m * (d.L * d.L + d.H * d.H)) / 12 * 0.8;
    this.Iroll = (m * (d.W * d.W + d.H * d.H)) / 12 * 0.8;
    // durum
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.yawRate = 0;
    this.pitch = 0; this.pitchRate = 0; this.roll = 0; this.rollRate = 0;
    this.prevPos = new THREE.Vector3(); this.prevQuat = new THREE.Quaternion(); this.quat = new THREE.Quaternion();
    this.rpm = 1000; this.gear = 1; // 0 = R, -1 = N, 1.. ileri
    this.shiftTimer = 0;
    this.throttle = 0; this.brake = 0; this.steer = 0; this.handbrake = 0;
    this.nitro = 1; this.nitroOn = false; this.cruise = 0;
    this.launch = false;
    this.fuel = entry.fuel ?? 1; this.damage = entry.damage || 0; this.dirt = entry.dirt || 0;
    this.speed = 0; this.fwdSpeed = 0;
    this.airTime = 0; this.grounded = true; this.flipped = false; this.stuckT = 0; this.drownT = 0;
    this.slip = 0; this.driftAngle = 0;
    this.limiter = false; this.backfire = 0; this.blowoff = 0; this.boost = 0;
    this.lastImpact = 0; this.scrape = 0;
    // tekerler: lx (sol +), lz (ön +)
    const tw = this.track / 2, a = this.wb / 2;
    this.restLen = 0.32 * this.p.rideH;
    this.k = (m * GRAV / 4 / (this.restLen * 0.45)) * this.p.stiff;
    this.c = 2 * Math.sqrt(this.k * m / 4) * 0.55;
    this.wheels = [
      { lx: tw, lz: a, front: true, left: true }, { lx: -tw, lz: a, front: true, left: false },
      { lx: tw, lz: -a, front: false, left: true }, { lx: -tw, lz: -a, front: false, left: false },
    ].map((w) => ({ ...w, comp: 0, prevComp: 0, Fz: 0, contact: false, spin: 0, slip: 0, slipLong: 0, wx: 0, wy: 0, wz: 0, steer: 0, surf: 1, locked: false, spinning: false, ground: 0 }));
    for (const w of this.wheels) w.driven = this.p.drive === 'awd' || (this.p.drive === 'fwd' ? w.front : !w.front);
    this.mountY = -this.cgH + this.restLen + this.p.R + 0.05;
    const compEq = (m * GRAV) / 4 / this.k;
    this.kRollBar = 4 * this.k * (this.track / 2) ** 2 * 1.5;
    this.restGroundY = -(this.cgH - compEq - 0.05); // dinlenmede zeminin yerel y'si
  }

  place(x, z, rot, y) {
    const g = this.world.ground(x, z, y ?? 1e9);
    this.pos.set(x, (y ?? g.h) + this.cgH + 0.25, z);
    this.vel.set(0, 0, 0);
    this.yaw = rot; this.yawRate = 0; this.pitch = 0; this.roll = 0; this.pitchRate = 0; this.rollRate = 0;
    this.flipped = false; this.stuckT = 0; this.drownT = 0; this.airTime = 0;
    this.gear = 1; this.rpm = this.p.idle || 0;
    this.updateQuat();
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
  }

  updateQuat() {
    _e.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(_e);
  }

  // yerel -> dünya ofseti
  toWorld(lx, ly, lz, out) {
    out.set(lx, ly, lz).applyQuaternion(this.quat);
    return out;
  }

  get kmh() { return this.speed * 3.6; }

  step(dt, input) {
    const p = this.p, m = p.mass;
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    const S = G.settings;
    // ---- girişler ----
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const lefX = Math.cos(this.yaw), lefZ = -Math.sin(this.yaw);
    const vLong = this.vel.x * fwdX + this.vel.z * fwdZ;
    const vLat = this.vel.x * lefX + this.vel.z * lefZ;
    this.fwdSpeed = vLong;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    let thr = input.throttle, brk = input.brake;
    // otomatik geri vites mantığı
    if (S.gearbox === 'auto' || this.gear === 0 || this.gear === 1) {
      if (this.gear > 0 && brk > 0.1 && thr < 0.05 && vLong < 0.8) { this.gear = 0; }
      else if (this.gear === 0 && thr > 0.1 && vLong > -0.8) { this.gear = 1; }
    }
    if (this.gear === 0) { const t = thr; thr = brk; brk = t; }
    // hız sabitleyici
    if (this.cruise > 0) {
      if (input.brake > 0.1 || input.handbrake) this.cruise = 0;
      else if (input.throttle < 0.05) thr = clamp((this.cruise - vLong) * 0.5, 0, 1);
    }
    if (this.fuel <= 0) thr = 0;
    if (this.damage > 0.85) thr *= 0.6;
    // direksiyon: hıza duyarlı
    const steerMax = p.steerMax / (1 + Math.abs(vLong) / 15);
    let target = -input.steer * steerMax;
    // basit karşı direksiyon yardımı (ESC açıkken)
    if (S.esc && Math.abs(input.steer) < 0.1 && this.speed > 5) target += clamp(Math.atan2(vLat, Math.abs(vLong) + 1) * 0.5, -0.2, 0.2);
    const rate = 4.5;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    this.throttle = thr; this.brake = brk; this.handbrake = input.handbrake ? 1 : 0;

    // ---- motor ve şanzıman ----
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const drivenSpeed = this.drivenWheelSpeed(vLong);
    const ratio = this.gear === 0 ? -p.rev : this.gear > 0 ? p.ratios[this.gear - 1] : 0;
    const totalR = ratio * p.final;
    let wheelRpm = (Math.abs(drivenSpeed) / p.R) * Math.abs(totalR) * 60 / (2 * Math.PI);
    const anySpin = this.wheels.some((w) => w.driven && w.spinning);
    let targetRpm;
    if (this.gear === -1 || this.shiftTimer > 0) targetRpm = (p.idle || 0) + thr * (p.red - (p.idle || 0)) * 0.9;
    else targetRpm = Math.max(wheelRpm, (p.idle || 0) + (anySpin ? thr * p.red * 0.4 : 0));
    if (anySpin) targetRpm = Math.max(targetRpm, lerp(wheelRpm, p.red * 0.95, thr * 0.7));
    this.rpm = lerp(this.rpm, clamp(targetRpm, p.idle || 0, p.red * 1.02), 1 - Math.exp(-dt * (this.gear === -1 || this.shiftTimer > 0 ? 6 : 18)));
    this.limiter = this.rpm >= p.red * 0.995 && thr > 0.5;
    // otomatik vites
    if (S.gearbox === 'auto' && this.gear > 0 && this.shiftTimer <= 0) {
      const up = p.red * 0.93, down = p.red * (thr > 0.6 ? 0.55 : 0.38);
      if (this.rpm > up && this.gear < p.gears && !anySpin && thr > 0.1) this.shift(1);
      else if (this.rpm < down && this.gear > 1) this.shift(-1);
    }
    let engineF = 0;
    if (this.gear !== -1 && this.shiftTimer <= 0 && thr > 0) {
      const T = p.Tpk * torqueCurve(p, this.rpm) * (this.limiter ? 0.05 : 1);
      engineF = T * thr * totalR / p.R * 0.9;
    }
    // nitro
    let nitroF = 0;
    this.nitroOn = !!(input.nitro && this.nitro > 0 && this.gear > 0 && thr > 0.1);
    if (this.nitroOn) { nitroF = m * 4.5 * p.nitroPow; this.nitro = Math.max(0, this.nitro - dt / p.nitroDur); }
    // turbo basıncı (ses için)
    const prevBoost = this.boost;
    this.boost = lerp(this.boost, thr * clamp(this.rpm / p.red * 1.4 - 0.3, 0, 1), 1 - Math.exp(-dt * 3));
    if (prevBoost > 0.5 && thr < 0.1 && this.boost < prevBoost) this.blowoff = 1;
    if (this.rpm > p.red * 0.7 && thr < 0.05 && this._lastThr > 0.6) this.backfire = 1;
    this._lastThr = thr;
    // yakıt
    this.fuel = Math.max(0, this.fuel - dt * (0.00004 + thr * 0.00028 * (this.rpm / p.red)) * (this.nitroOn ? 1.5 : 1));

    // ---- süspansiyon ----
    this.updateQuat();
    const q = this.quat;
    let sumFy = 0, pitchT = 0, rollT = 0;
    const F = _w.set(0, 0, 0);
    let yawT = 0, contacts = 0;
    const brakeTotal = brk * m * 11.5 * p.brake;
    const hb = this.handbrake;
    let lateralSum = 0, longSum = 0;
    const absOn = S.abs, tcsOn = S.tcs || (this.launch && this.speed < 8);
    const drivenCount = this.wheels.filter((w) => w.driven).length;
    const driveShareSplit = (w) => {
      if (p.drive !== 'awd') return 1 / drivenCount;
      return w.front ? 0.2 : 0.3; // AWD: arka ağırlıklı
    };
    let slipMax = 0, groundY = -1e9, onWaterCount = 0;
    for (const w of this.wheels) {
      // bağlantı noktası
      this.toWorld(w.lx, this.mountY, w.lz, _v);
      const mx = this.pos.x + _v.x, my = this.pos.y + _v.y, mz = this.pos.z + _v.z;
      const g = this.world.ground(mx, mz, my);
      w.surf = g.surf;
      w.ground = g.h;
      groundY = Math.max(groundY, g.h);
      if (g.water) onWaterCount++;
      const dist = my - g.h - p.R; // yayın uzunluğu
      w.prevComp = w.comp;
      let comp = this.restLen - dist;
      w.contact = comp > 0;
      comp = clamp(comp, 0, this.restLen * 1.6);
      w.comp = comp;
      w.wx = mx; w.wz = mz; w.wy = g.h;
      w.Fz = 0;
      if (!w.contact) { w.slip = 0; w.spinning = false; w.locked = false; w.spin += (vLong / p.R) * dt; continue; }
      contacts++;
      const compVel = (w.comp - w.prevComp) / dt;
      let Fs = this.k * comp + this.c * compVel;
      if (comp > this.restLen * 1.3) Fs += (comp - this.restLen * 1.3) * this.k * 8;
      // aero downforce
      Fs = Math.max(0, Fs);
      w.Fz = Fs;
      // normal kuvvetin yatay bileşeni (eğim)
      F.x += Fs * g.nx; F.z += Fs * g.nz;
      const Fvert = Fs * g.ny;
      sumFy += Fvert;
      pitchT += Fvert * w.lz * Math.cos(this.pitch);
      rollT += Fvert * w.lx * Math.cos(this.roll);
      // ---- lastik ----
      const dx = _v.x, dz = _v.z;
      const wvx = this.vel.x + this.yawRate * dz, wvz = this.vel.z - this.yawRate * dx;
      const st = w.front ? this.steer : 0;
      w.steer = st;
      const cy = Math.cos(this.yaw + st), sy = Math.sin(this.yaw + st);
      const fx = sy, fz = cy, lx = cy, lz = -sy;
      const vl = wvx * fx + wvz * fz, vt = wvx * lx + wvz * lz;
      let mu = p.grip * g.grip * (1.08 - 0.1 * clamp(w.Fz / (m * GRAV / 4) - 1, -1, 1));
      // yüzey: 4x4 arazide avantajlı
      if (g.surf === 4 || g.surf === 3 || g.surf === 2) mu *= 1 + p.offroad * (g.surf === 4 ? 0.6 : 0.25);
      if (w.front) mu *= 1 + p.camber * 0.06; else mu *= (1 - p.camber * 0.04) * p.rearGrip;
      if (this.damage > 0.5) mu *= 1 - (this.damage - 0.5) * 0.3;
      if (w.driven && this.speed < 30) mu *= 1 + (p.launchGrip - 1) * (1 - this.speed / 30);
      const maxF = mu * w.Fz;
      // boyuna kuvvet
      let Fx = 0;
      if (w.driven && engineF !== 0) Fx += engineF * driveShareSplit(w);
      if (w.driven) Fx += nitroF / drivenCount;
      // diferansiyel kilidi: arka içeride çekiş kaybı
      // fren
      const bShare = w.front ? p.brakeBias : 1 - p.brakeBias;
      let Fb = brakeTotal * bShare * 0.5;
      // yuvarlanma direnci
      const roll = p.crr * g.roll * w.Fz * (g.surf === 4 || g.surf === 3 ? 1 - p.offroad * 0.5 : 1);
      w.locked = false; w.spinning = false;
      let Fy;
      const speedAbs = Math.abs(vl);
      // el freni arka tekerleri kilitler
      const lockedHB = hb && !w.front;
      if (lockedHB || (!absOn && Fb > maxF * 1.05 && speedAbs > 1)) {
        // kilitli teker: hız vektörüne zıt kayma sürtünmesi
        const sv = Math.hypot(vl, vt);
        if (sv > 0.3) {
          const k = (maxF * 0.75) / sv;
          Fx = -vl * k + (lockedHB ? Fx * 0.25 : 0);
          Fy = -vt * k;
        } else { Fx = -vl * w.Fz * 0.5; Fy = -vt * w.Fz * 0.5; }
        w.locked = sv > 2;
        w.slip = sv;
      } else {
        // fren: kayma yoksa hız ile ters
        if (Fb > 0) {
          if (absOn) Fb = Math.min(Fb, maxF * 0.92);
          Fx += speedAbs > 0.4 ? -Math.sign(vl) * Fb : -vl * Math.min(Fb, w.Fz * 2) * 0.5;
        }
        Fx -= Math.sign(vl) * Math.min(roll, Math.abs(vl) * w.Fz * 0.1);
        // patinaj
        if (Math.abs(Fx) > maxF) {
          if (tcsOn && w.driven && Fx * vl >= 0) { Fx = Math.sign(Fx) * maxF * 0.97; }
          else { Fx = Math.sign(Fx) * maxF * 0.85; w.spinning = w.driven && thr > 0.2; }
        }
        // yanal
        const slipA = Math.atan2(vt, Math.max(Math.abs(vl), 0.5));
        const B = 9.5;
        let fy = Math.sin(1.9 * Math.atan(B * slipA - 0.95 * (B * slipA - Math.atan(B * slipA)))) ;
        // düşük hızda sönümleme
        const lowK = clamp(1 - Math.hypot(vl, vt) / 4, 0, 1);
        const avail = Math.sqrt(Math.max(0.02, 1 - (Fx / maxF) ** 2));
        let spinFac = w.spinning ? (p.drive === 'rwd' ? 0.42 + (1 - p.diff) * 0.15 : 0.65) : 1;
        Fy = -fy * maxF * avail * spinFac;
        Fy = lerp(Fy, clamp(-vt * w.Fz * 0.8, -maxF, maxF), lowK);
        w.slip = Math.abs(vt) > 2 ? Math.abs(slipA) : 0;
        if (w.spinning) w.slip = Math.max(w.slip, 0.5);
      }
      slipMax = Math.max(slipMax, Math.abs(Math.atan2(vt, Math.abs(vl) + 0.5)));
      // dünya kuvveti
      const fwx = fx * Fx + lx * Fy, fwz = fz * Fx + lz * Fy;
      F.x += fwx; F.z += fwz;
      yawT += dz * fwx - dx * fwz;
      // yerel boyuna/yanal (gövde ekseninde) - yük transferi için
      const fLong = fwx * fwdX + fwz * fwdZ, fLat = fwx * lefX + fwz * lefZ;
      longSum += fLong; lateralSum += fLat;
      w.spin += ((w.locked ? 0 : w.spinning ? Math.max(vl, 8) * 1.8 : vl) / p.R) * dt;
    }
    this.slip = slipMax;
    this.driftAngle = Math.abs(vLong) > 4 ? Math.atan2(vLat, Math.abs(vLong)) : 0;
    this.grounded = contacts > 0;
    // yük transferinden kaynaklanan gövde torkları
    pitchT += longSum * this.cgH * 0.8;
    rollT += lateralSum * this.cgH * 0.6;
    // viraj denge çubukları (anti-roll)
    rollT -= this.roll * this.kRollBar;
    pitchT -= this.pitch * this.kRollBar * 0.6;
    // ---- aerodinamik ----
    const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    F.x -= p.cd * sp * this.vel.x; F.z -= p.cd * sp * this.vel.z;
    let Fyw = sumFy - m * GRAV - p.cd * sp * this.vel.y * 0.5;
    const downF = Math.min(m * GRAV * 0.4, p.downforce * this.speed * this.speed * 0.25);
    if (this.grounded) Fyw -= downF;
    // su
    const inWater = this.world.d.water && this.world.d.water.sea && this.pos.y < this.world.d.water.level + 0.3 && onWaterCount >= 2;
    if (inWater) { F.x -= this.vel.x * m * 1.5; F.z -= this.vel.z * m * 1.5; Fyw += m * GRAV * 0.6 - this.vel.y * m * 2; this.drownT += dt; } else this.drownT = 0;
    // ESC: aşırı savrulmayı sınırla
    if (S.esc && this.grounded && this.speed > 6 && !hb) {
      let want = (vLong * Math.tan(this.steer)) / this.wb;
      const lim = (9.81 * p.grip * 1.05) / Math.max(4, this.speed);
      want = clamp(want, -lim, lim);
      const ex = this.yawRate - want;
      if (Math.abs(ex) > 0.3) yawT -= ex * this.Iyaw * 1.6;
    }
    // ---- entegrasyon ----
    this.vel.x += (F.x / m) * dt; this.vel.z += (F.z / m) * dt; this.vel.y += (Fyw / m) * dt;
    this.yawRate += (yawT / this.Iyaw) * dt;
    if (!this.grounded) { this.yawRate *= 1 - 0.3 * dt; this.yawRate += -input.steer * 0.8 * dt; }
    // gövde açıları (yay-sönüm)
    if (this.grounded) {
      this.pitchRate += (pitchT / this.Ipitch) * dt;
      this.rollRate += (rollT / this.Iroll) * dt;
      // zemin eğimine hizalanma için ek sönüm
      this.pitchRate *= 1 - 6 * dt; this.rollRate *= 1 - 6 * dt;
    } else {
      // havada: hafif kontrol
      this.pitchRate += (input.throttle - input.brake) * 0.6 * dt;
      this.pitchRate *= 1 - 0.4 * dt; this.rollRate *= 1 - 0.4 * dt;
    }
    this.pitch += this.pitchRate * dt;
    this.roll += this.rollRate * dt;
    this.yaw += this.yawRate * dt;
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    // gövde-zemin çarpışması (devrilme/ezilme)
    this.updateQuat();
    this.bodyGround(dt);
    // statik çarpışma
    this.collideStatic(dt);
    // ters dönme
    const upY = 1 - 2 * (this.quat.x * this.quat.x + this.quat.z * this.quat.z);
    this.flipped = upY < 0.25 && this.speed < 3;
    if (this.speed < 1 && thr > 0.5 && !this.flipped) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (!this.grounded) this.airTime += dt; else this.airTime = 0;
    // kir
    const s0 = this.wheels[2].surf;
    if (s0 === 2 || s0 === 3 || s0 === 4 || G.weather === 'rain') this.dirt = Math.min(1, this.dirt + dt * this.speed * (s0 === 4 ? 0.0025 : 0.0006));
    // nitro dolumu (drift)
    if (Math.abs(this.driftAngle) > 0.25 && this.speed > 10 && this.grounded) this.nitro = Math.min(1, this.nitro + dt * 0.06);
  }

  drivenWheelSpeed(vLong) { return vLong; }

  shift(dir) {
    const p = this.p;
    if (dir > 0) {
      if (this.gear === 0) this.gear = -1;
      else if (this.gear === -1) this.gear = 1;
      else if (this.gear < p.gears) { this.gear++; this.shiftTimer = p.shiftTime; }
      else return false;
    } else {
      if (this.gear > 1) { this.gear--; this.shiftTimer = p.shiftTime * 0.7; }
      else if (this.gear === 1) this.gear = -1;
      else if (this.gear === -1 && this.speed < 2) this.gear = 0;
      else return false;
    }
    return true;
  }

  // Gövde köşelerinin zemine girmesini engelle (devrilmiş araç, sert iniş)
  bodyGround(dt) {
    const hw = this.W / 2, hl = this.L / 2;
    const by = this.restGroundY + this.p.dims.clr + 0.05;
    const pts = [[hw, by, hl], [-hw, by, hl], [hw, by, -hl], [-hw, by, -hl], [hw, this.H - this.cgH, hl * 0.5], [-hw, this.H - this.cgH, hl * 0.5], [hw, this.H - this.cgH, -hl * 0.5], [-hw, this.H - this.cgH, -hl * 0.5]];
    let maxPen = 0, hit = false;
    for (const [lx, ly, lz] of pts) {
      this.toWorld(lx, ly, lz, _v);
      const wx = this.pos.x + _v.x, wy = this.pos.y + _v.y, wz = this.pos.z + _v.z;
      const g = this.world.ground(wx, wz, wy + 0.5);
      const pen = g.h - wy;
      if (pen > 0) {
        hit = true;
        if (pen > maxPen) maxPen = pen;
        // torque: noktayı yukarı iten kuvvet
        const imp = pen * 40;
        this.pitchRate += (imp * lz) / this.L * 0.6 * dt * 60;
        this.rollRate += (imp * lx) / this.W * 0.6 * dt * 60;
      }
    }
    if (hit) {
      this.pos.y += maxPen;
      if (this.vel.y < 0) {
        if (this.vel.y < -6) this.registerImpact(-this.vel.y * 0.4, 'land');
        this.vel.y *= -0.1;
      }
      this.vel.x *= 1 - 2.5 * dt; this.vel.z *= 1 - 2.5 * dt;
      this.scrape = Math.max(this.scrape, this.speed);
    }
  }

  collideStatic(dt) {
    const r = this.W / 2;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const offs = [this.L / 2 - r, 0, -(this.L / 2 - r)];
    const y = this.pos.y - this.cgH + 0.3;
    for (const o of offs) {
      const cx = this.pos.x + fx * o, cz = this.pos.z + fz * o;
      this.world.collide(cx, cz, r, y, (nx, nz, depth, col) => {
        this.pos.x += nx * depth; this.pos.z += nz * depth;
        // temas noktası hızı
        const dx = fx * o - nx * r, dz = fz * o - nz * r;
        const pvx = this.vel.x + this.yawRate * dz, pvz = this.vel.z - this.yawRate * dx;
        const vn = pvx * nx + pvz * nz;
        if (vn < 0) {
          const e = 0.25;
          const rn = dx * nz - dz * nx; // r x n (y)
          const invM = 1 / this.p.mass, invI = 1 / this.Iyaw;
          const j = (-(1 + e) * vn) / (invM + rn * rn * invI);
          this.vel.x += j * nx * invM; this.vel.z += j * nz * invM;
          this.yawRate += rn * j * invI * -1;
          // sürtünme
          const tx = -nz, tz = nx;
          const vt = pvx * tx + pvz * tz;
          const jt = clamp(-vt / (invM * 3), -j * 0.4, j * 0.4);
          this.vel.x += jt * tx * invM; this.vel.z += jt * tz * invM;
          const impactSpeed = -vn;
          if (impactSpeed > 2.5) this.registerImpact(impactSpeed, col.tag, cx - nx * r, cz - nz * r);
          if (Math.abs(vt) > 4) this.scrape = Math.max(this.scrape, Math.abs(vt));
          this.contactPoint = [cx - nx * r, this.pos.y - 0.2, cz - nz * r];
        }
      });
    }
  }

  registerImpact(speed, tag, x, z) {
    const now = G.time;
    if (now - this.lastImpact < 0.15) return;
    this.lastImpact = now;
    const dmg = Math.max(0, speed - 3) * 0.012;
    this.damage = Math.min(1, this.damage + dmg);
    this.lastImpactInfo = { speed, tag, x: x ?? this.pos.x, z: z ?? this.pos.z, t: now, dmg };
    if (this.onImpact) this.onImpact(this.lastImpactInfo);
  }

  // Dış çarpışmalar için itme (trafik)
  applyImpulse(nx, nz, j, px, pz) {
    const invM = 1 / this.p.mass;
    this.vel.x += nx * j * invM; this.vel.z += nz * j * invM;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const rn = dx * nz - dz * nx;
    this.yawRate -= (rn * j) / this.Iyaw;
  }

  interpolate(alpha, outPos, outQuat) {
    outPos.lerpVectors(this.prevPos, this.pos, alpha);
    outQuat.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }
}
