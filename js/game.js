// Ana oyun: harita yükleme, sabit zaman adımlı fizik döngüsü, oyuncu, sistemler
import * as THREE from 'three';
import { G, clamp, lerp, emit, on, vibrate, dayKey, weekKey, pick, wrapAngle, hashStr } from './core.js';
import { t } from './i18n.js';
import { generateMap } from './world/maps.js';
import { World } from './world/world.js';
import { Vehicle, computeParams } from './vehicle.js';
import { buildCar } from './carModel.js';
import { buildHuman } from './human.js';
import { Effects } from './effects.js';
import { Traffic } from './traffic.js';
import { Chests, isHoliday } from './chests.js';
import { Missions } from './missions.js';
import { CameraCtl } from './camera.js';
import { HUD } from './hud.js';
import { input, pollInput, takeActions, createTouchUI } from './input.js';
import { EngineSound, sfx, horn, hornBeep, updateAmbient, radio, initAudio, applyVolumes } from './audio.js';
import { save, currentCarEntry, newCarEntry } from './save.js';
import { CAR, CARS } from './data/cars.js';
import { MAPS, MAP, ACHIEVEMENTS, LICENSES, DAILY_TEMPLATES, LOGIN_REWARDS, TIPS, RADIO, GARAGE_TIERS, HOUSES } from './data/content.js';
import { MISSIONS } from './data/missions.js';

const STEP = 1 / 120; // fizik adımı: saniyede 120
const MAX_STEPS = 12;
// haritalardaki altın sandık sayıları (Hayalet kilidi için)
export const GOLD_CHEST_TOTAL = 13;

export class Game {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 4000);
    this.rearCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
    G.scene = this.scene; G.camera = this.camera; G.renderer = renderer; G.game = this;
    this.camCtl = new CameraCtl(this.camera, renderer.domElement);
    this.hud = new HUD(document.getElementById('hud'), this);
    this.touch = createTouchUI(document.getElementById('touch'));
    this.effects = new Effects(this.scene);
    this.acc = 0;
    this.gps = { target: null, route: null, t: 0, line: null };
    this.lights = false; this.highBeam = false; this.indL = false; this.indR = false; this.hazard = false; this.sigTime = { L: -99, R: -99 };
    this.onFoot = false;
    this.freezeCar = false;
    this.drift = { score: 0, mult: 1, t: 0, low: 0, active: false };
    this.police = { state: null, heat: 0, overT: 0, farT: 0, caughtT: 0, patrol: false, close: 0, units: [] };
    this.weatherT = 120 + Math.random() * 200;
    this.saveT = 30;
    this.achT = 2;
    this.renderPos = new THREE.Vector3(); this.renderQuat = new THREE.Quaternion();
    this.pausedSoft = false;
    this.setupLights();
    on('saved', () => this.hud.savedBlink());
    on('trafficHit', () => { if (this.drift.active) this.endDrift(true); });
    on('pedHit', () => { this.toast(t('Dikkat! Yayaya çarptın!'), 'warn'); if (G.profile) G.profile.money = Math.max(0, G.profile.money - 200); this.hud.money(-200, 0, t('Ceza')); });
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#4a5a3a', 0.8);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.headlight = new THREE.SpotLight('#fff6e0', 0, 80, 0.55, 0.5, 1.2);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight, this.headlight.target);
    this.scene.fog = new THREE.Fog('#cfe8ff', 200, 900);
    this.applyShadowQuality();
  }
  applyShadowQuality() {
    const q = G.settings.batterySaver ? 0 : Math.min(G.settings.shadows, this.adaptShadow ?? 9);
    this.renderer.shadowMap.enabled = q > 0;
    this.sun.castShadow = q > 0;
    const size = [0, 1024, 2048, 4096][q] || 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    const ext = q >= 3 ? 90 : q === 2 ? 70 : 50;
    const sc = this.sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
  }

  // ===================== HARİTA =====================
  async loadMap(id, spawnAt) {
    const ui = this.ui;
    ui.loading(true, 0, t(pick(TIPS)));
    G.mode = 'loading';
    if (this.missions && this.missions.active) this.missions.abort(true);
    await new Promise((r) => setTimeout(r, 30));
    // eskiyi temizle
    if (this.world) {
      this.scene.remove(this.world.root); this.world.dispose();
      this.traffic.clear(); this.chests.clear(); this.scene.remove(this.missions.group);
      this.effects.clear();
      this.clearGPS();
      this.clearGarageDisplay();
    }
    const snow = isHoliday();
    const data = generateMap(id, { snow });
    ui.loading(true, 0.15);
    await new Promise((r) => setTimeout(r, 10));
    const world = new World(data);
    await world.build((p) => ui.loading(true, 0.15 + p * 0.65));
    this.world = world; G.world = world; G.mapId = id;
    this.scene.add(world.root);
    this.traffic = new Traffic(this.scene, world);
    this.chests = new Chests(this);
    this.chests.build();
    this.missions = this.missions || new Missions(this);
    this.missions.group = new THREE.Group(); this.scene.add(this.missions.group);
    for (const m of MISSIONS) delete m._start;
    this.missions.refreshMarkers();
    ui.loading(true, 0.9);
    this.hud.buildMapImage(world);
    const p = G.profile;
    p.lastMap = id;
    if (!p.mapsVisited.includes(id)) p.mapsVisited.push(id);
    // oyuncu aracı
    const sp = spawnAt || this.homeSpawn(id);
    this.spawnPlayerCar(sp);
    if (this.chests.huntActive()) this.chests.spawnHunt();
    // gölge ve shader derlemesi yükleme ekranında yapılsın (takılma olmasın)
    this.renderer.compile(this.scene, this.camera);
    this.camCtl.pos.copy(this.car.pos).add(new THREE.Vector3(0, 4, -8));
    this.updateSun(0);
    ui.loading(true, 1);
    await new Promise((r) => setTimeout(r, 120));
    ui.loading(false);
    G.mode = 'play';
    this.acc = 0;
    this.hud.updateProfile();
    this.hud.setUnits();
    this.save();
    emit('mapLoaded', id);
  }
  homeSpawn(id) {
    const d = this.world ? this.world.d : null;
    const house = G.profile.houses.find((h) => HOUSES.find((x) => x.id === h && x.map === id));
    const sp = this.world.d.spawn;
    if (house) {
      const hp = this.world.d.pois.find((p) => p.type === 'house');
      if (hp) return { x: hp.x + Math.sin(hp.rot) * 10, z: hp.z + Math.cos(hp.rot) * 10, rot: hp.rot + Math.PI / 2 };
    }
    return sp;
  }

  spawnPlayerCar(sp, entry) {
    const e = entry || this.rentalEntry || currentCarEntry();
    if (this.carModel) { this.scene.remove(this.carModel.root); this.carModel.dispose(); }
    if (this.engine) this.engine.stop();
    this.car = new Vehicle(e, this.world);
    G.car = this.car;
    this.car.onImpact = (info) => this.onImpact(info);
    this.car.place(sp.x, sp.z, sp.rot, sp.y);
    this.carModel = buildCar(e, { char: this.charColors() });
    this.carModel.setGroundY(this.car.restGroundY);
    this.carModel.setDirt(this.car.dirt);
    this.applyDamageVisual(true);
    this.scene.add(this.carModel.root);
    this.engine = new EngineSound(this.car.p.engine, e.upgrades.exhaust);
    if (!this.human) this.buildPlayerHuman();
    this.setOnFoot(false);
    this.effects.skids.last = [null, null, null, null];
  }
  charColors() {
    const c = G.profile.char;
    return { skin: ['#f9dcc4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'][c.skin], shirt: '#888' };
  }
  buildPlayerHuman() {
    if (this.human) { this.scene.remove(this.human.root); this.human.dispose(); }
    this.human = buildHuman(G.profile.char, { name: G.profile.name });
    this.human.root.visible = this.onFoot;
    this.scene.add(this.human.root);
    this.foot = this.foot || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, grounded: true, emote: null };
  }
  placeCar(x, z, rot, y) {
    this.car.place(x, z, rot, y);
    this.camCtl.smYaw = rot;
    this.camCtl.pos.set(x - Math.sin(rot) * 8, this.car.pos.y + 3, z - Math.cos(rot) * 8);
  }

  // Görev / test sürüşü araçları
  useRental(id) {
    if (!this.rentalEntry) this.rentalPrev = currentCarEntry();
    const e = newCarEntry(id);
    e.cos.paint = null;
    this.rentalEntry = e;
    const pos = this.car.pos;
    this.spawnPlayerCar({ x: pos.x, z: pos.z, rot: this.car.yaw }, e);
  }
  returnRental() {
    if (!this.rentalEntry) return;
    this.rentalEntry = null; this.testDrive = null;
    const pos = this.car.pos;
    this.spawnPlayerCar({ x: pos.x, z: pos.z, rot: this.car.yaw });
  }

  // ===================== DÖNGÜ =====================
  frame(dt) {
    if (G.mode !== 'play' && G.mode !== 'photo' && G.mode !== 'drone') return;
    dt = Math.min(dt, 0.1);
    pollInput(dt);
    const actions = takeActions();
    for (const a of actions) this.action(a);
    const paused = G.paused || this.pausedSoft || G.mode === 'photo';
    if (!paused) {
      G.time += dt;
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < MAX_STEPS) {
        this.fixedStep(STEP);
        this.acc -= STEP; n++;
      }
      if (n >= MAX_STEPS) this.acc = 0;
      this.update(dt);
    }
    this.render(dt, paused);
  }

  carInput() {
    if (this.freezeCar || this.onFoot || G.mode !== 'play') return { throttle: 0, brake: 0, steer: 0, handbrake: true, nitro: false };
    if (this.freezeCar) return { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false };
    return input;
  }
  inputState() { return input; }

  fixedStep(dt) {
    const car = this.car;
    let inp = this.carInput();
    if (this.freezeCar && !this.onFoot) {
      // geri sayım: gaz verilebilir ama araç kilitli
      inp = { throttle: input.throttle, brake: 0, steer: input.steer, handbrake: true, nitro: false };
    }
    car.step(dt, inp);
    if (this.freezeCar) { car.vel.x *= 0.5; car.vel.z *= 0.5; }
    if (this.traffic) this.traffic.stepAI(dt);
    this.missions.stepAI(dt);
    if (this.onFoot) this.stepFoot(dt);
  }

  update(dt) {
    const car = this.car, p = G.profile, S = G.settings;
    const wasGrounded = this._wasGrounded;
    // sistemler
    this.world.update(dt, this.camera.position);
    const pl = this.playerPos();
    this.traffic.update(dt, pl, this.onFoot ? null : car);
    if (!this.onFoot) this.traffic.interact(car, dt, (c) => this.nearMiss(c));
    this.chests.update(dt, pl.x, pl.y, pl.z, !this.onFoot);
    this.missions.update(dt);
    this.effects.update(dt);
    this.updateSun(dt);
    this.updateWeather(dt);
    this.updatePolice(dt);
    if (!this.onFoot) {
      this.updateDrift(dt);
      this.updateCarFx(dt);
      // atlama
      if (!car.grounded && wasGrounded && car.speed > 8) { this.jumpStart = G.time; }
      if (car.grounded && !wasGrounded && this.jumpStart) {
        const air = G.time - this.jumpStart;
        this.jumpStart = null;
        if (air > 0.7) {
          const bonus = Math.round(air * air * 250 / 10) * 10;
          p.stats.jumps++;
          p.stats.longestJump = Math.max(p.stats.longestJump, air);
          this.reward(bonus, 0, Math.round(air * 10), t('Atlama {s} sn', { s: air.toFixed(1) }));
          this.hud.bigText(t('ATLAMA! {s} sn', { s: air.toFixed(1) }), 1.2, '#ffd166');
          sfx('land');
        }
      }
      this._wasGrounded = car.grounded;
      // istatistikler
      p.stats.distance += (car.speed * dt) / 1000;
      if (car.kmh > p.stats.topSpeed) p.stats.topSpeed = car.kmh;
      // suya düşme
      if (car.drownT > 1.5) { this.toast(t('Araç suya düştü!'), 'warn'); sfx('splash'); this.recoverCar(true); }
      this.hud.showRecover(car.flipped || car.stuckT > 3 || car.drownT > 0.5);
      // gişe
      for (const tl of this.world.d.tolls) {
        if (Math.abs(car.pos.x - tl.x) < 3 && Math.abs(car.pos.z - tl.z) < tl.w / 2 && car.speed > 1 && G.time - (this._tollT || -99) > 8) {
          this._tollT = G.time; sfx('toll');
          p.money = Math.max(0, p.money - 25); this.hud.money(-25, 0, t('Otoyol gişesi'));
        }
      }
      // park sensörü
      this.parkSensor(dt);
      // yakıt uyarısı
      if (car.fuel < 0.1 && G.time - (this._fuelWarn || -99) > 30) { this._fuelWarn = G.time; this.toast(t('⛽ Benzin azaldı! En yakın istasyona git.'), 'warn'); }
      if (car.fuel <= 0 && G.time - (this._fuelOut || -99) > 15) { this._fuelOut = G.time; this.toast(t('Benzin bitti! Duraklat menüsünden yol yardımı çağırabilirsin.'), 'warn'); }
    } else {
      this.hud.showRecover(false);
    }
    // hız sınırı göstergesi
    this._lt = (this._lt || 0) - dt;
    if (this._lt <= 0) {
      this._lt = 0.5;
      const n = this.world.graph.nearest(pl.x, pl.z, 30);
      let lim = n ? n.limit : null;
      for (const z of this.world.d.zones) if (z.limit && Math.hypot(pl.x - z.x, pl.z - z.z) < z.r) lim = Math.min(lim || 999, z.limit);
      this.zoneLimit = lim;
      this.hud.setLimit(this.onFoot ? null : lim && lim < 200 ? lim : null);
    }
    // POI ve görev etkileşim istemi
    this.updatePrompts();
    // GPS
    this.updateGPS(dt);
    // test sürüşü
    if (this.testDrive) {
      this.testDrive.t -= dt;
      if (this.testDrive.t <= 0) { this.toast(t('Test sürüşü bitti.')); const g = this.testDrive.back; this.hud.missionPanel(false); this.returnRental(); this.placeCar(g.x, g.z, g.rot); }
      else this.hud.missionInfo(t('Test Sürüşü'), [CAR[this.rentalEntry.id].name], this.testDrive.t);
    }
    // otomatik kayıt
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 30; this.syncCarToEntry(); this.save(); }
    this.achT -= dt;
    if (this.achT <= 0) { this.achT = 2; this.checkAchievements(); this.checkDaily(); }
    // ses
    if (this.engine) this.engine.update(car, !this.onFoot || true);
    updateAmbient({ rain: G.weather === 'rain', city: this.world.d.id === 'city', sea: !!(this.world.d.water && this.world.d.water.sea) });
    // garaj sergisi
    this.updateGarageDisplay();
    this.hud.updateProfile();
  }

  // ===================== OYUNCU (YAYA) =====================
  playerPos() {
    if (this.onFoot) return { x: this.foot.pos.x, y: this.foot.pos.y, z: this.foot.pos.z, heading: this.foot.yaw };
    return { x: this.car.pos.x, y: this.car.pos.y, z: this.car.pos.z, heading: this.car.yaw };
  }
  setOnFoot(v) {
    this.onFoot = v;
    this.human.root.visible = v;
    if (this.carModel.driver) this.carModel.driver.visible = !v;
    this.touch.setMode(G.mode === 'play' ? (v ? 'foot' : 'car') : 'none');
    this.hud.carMode(!v);
  }
  exitCar() {
    const car = this.car;
    if (car.speed > 3) { this.toast(t('Önce dur!')); return; }
    const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    const off = car.W / 2 + 0.9;
    let x = car.pos.x + lx * off, z = car.pos.z + lz * off;
    const g = this.world.ground(x, z, car.pos.y);
    this.foot.pos.set(x, g.h, z);
    this.foot.vel.set(0, 0, 0);
    this.foot.yaw = car.yaw + Math.PI / 2;
    this.camCtl.footYaw = car.yaw; this.camCtl.yawOff = 0;
    if (this.carModel.doors[0]) { this.carModel.doors[0].target = 1; setTimeout(() => { if (this.carModel.doors[0]) this.carModel.doors[0].target = 0; }, 900); }
    sfx('door');
    this.setOnFoot(true);
    if (this.car.cruise) this.car.cruise = 0;
  }
  enterCar(force) {
    const car = this.car;
    const d = Math.hypot(this.foot.pos.x - car.pos.x, this.foot.pos.z - car.pos.z);
    if (!force && d > 4.5) { this.toast(t('Araca yaklaş')); return; }
    if (this.carModel.doors[0]) { this.carModel.doors[0].target = 1; setTimeout(() => { if (this.carModel.doors[0]) this.carModel.doors[0].target = 0; }, 700); }
    sfx('door');
    this.foot.emote = null;
    this.setOnFoot(false);
  }
  stepFoot(dt) {
    const f = this.foot;
    const yawRef = this.camCtl.footYaw + this.camCtl.yawOff;
    let mx = input.moveX, my = input.moveY;
    const len = Math.hypot(mx, my);
    const run = input.run;
    const speed = len > 0.05 ? (run ? 5.8 : 2.2) * Math.min(1, len) : 0;
    let vx = 0, vz = 0;
    if (speed > 0) {
      if (f.emote) f.emote = null;
      const a = yawRef + Math.atan2(-mx, my);
      vx = Math.sin(a) * speed; vz = Math.cos(a) * speed;
      f.yaw += wrapAngle(a - f.yaw) * Math.min(1, dt * 12);
    }
    f.vel.x = lerp(f.vel.x, vx, Math.min(1, dt * 10)); f.vel.z = lerp(f.vel.z, vz, Math.min(1, dt * 10));
    f.vel.y -= 20 * dt;
    f.pos.x += f.vel.x * dt; f.pos.z += f.vel.z * dt; f.pos.y += f.vel.y * dt;
    const g = this.world.ground(f.pos.x, f.pos.z, f.pos.y + 0.5);
    if (f.pos.y <= g.h) { f.pos.y = g.h; f.vel.y = 0; f.grounded = true; } else f.grounded = f.pos.y - g.h < 0.05;
    if (g.water && f.pos.y < g.waterLevel - 1.2) { f.pos.y = g.waterLevel - 1.2; f.vel.y = 0; f.grounded = true; }
    this.world.collide(f.pos.x, f.pos.z, 0.35, f.pos.y + 0.3, (nx, nz, depth) => { f.pos.x += nx * depth; f.pos.z += nz * depth; });
    // araçla çarpışma
    const car = this.car;
    const dx = f.pos.x - car.pos.x, dz = f.pos.z - car.pos.z;
    const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
    const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
    if (Math.abs(lx) < car.W / 2 + 0.35 && Math.abs(lz) < car.L / 2 + 0.35 && f.pos.y < car.pos.y + car.H) {
      const px = car.W / 2 + 0.35 - Math.abs(lx), pz = car.L / 2 + 0.35 - Math.abs(lz);
      if (px < pz) { const s = Math.sign(lx) * px; f.pos.x += s * cy; f.pos.z += -s * sy; } else { const s = Math.sign(lz) * pz; f.pos.x += s * sy; f.pos.z += s * cy; }
    }
    const half = this.world.d.half - 6;
    f.pos.x = clamp(f.pos.x, -half, half); f.pos.z = clamp(f.pos.z, -half, half);
    f.speed = Math.hypot(f.vel.x, f.vel.z);
    this._stepT = (this._stepT || 0) + dt * f.speed;
    if (this._stepT > (run ? 1.4 : 0.9) && f.grounded) { this._stepT = 0; sfx('step'); }
  }
  jump() {
    if (this.onFoot && this.foot.grounded) { this.foot.vel.y = 6.5; this.foot.grounded = false; this.foot.emote = null; }
  }
  emote(id) {
    if (!this.onFoot) { this.toast(t('Emote için araçtan in')); return; }
    const e = (this.emotes || []).find((x) => x.id === id) || { id };
    this.foot.emote = { id, t: 0 };
    this.human.say(e.emoji || '🙂');
  }

  // ===================== EYLEMLER =====================
  action(a) {
    if (G.mode === 'photo') { if (a === 'pause' || a === 'photo') this.ui.exitPhoto(); return; }
    if (G.mode === 'drone') { if (a === 'pause' || a === 'drone' || a === 'camera') this.exitDrone(); return; }
    if (G.mode !== 'play') return;
    if (a === 'pause') { if (document.querySelector('.overlay')) return; this.ui.pause(); return; }
    if (this.pausedSoft) return;
    const car = this.car;
    switch (a) {
      case 'enter': if (this.onFoot) this.enterCar(); else this.exitCar(); break;
      case 'lights': this.lights = !this.lights; sfx('click'); break;
      case 'hiBeam': this.highBeam = !this.highBeam; if (this.highBeam) this.lights = true; sfx('click'); break;
      case 'indL': this.indL = !this.indL; this.indR = false; if (this.indL) this.sigTime.L = G.time; sfx('tick'); break;
      case 'indR': this.indR = !this.indR; this.indL = false; if (this.indR) this.sigTime.R = G.time; sfx('tick'); break;
      case 'hazard': this.hazard = !this.hazard; sfx('tick'); break;
      case 'camera': if (!this.onFoot) { const m = this.camCtl.next(); this.toast(t(['Yakın arka', 'Uzak arka', 'Kokpit', 'Kaput üstü', 'Üstten (park)'][m])); } break;
      case 'map': this.openMap(); break;
      case 'photo': this.ui.photoMode(); break;
      case 'drone': this.startDrone(); break;
      case 'shiftUp': if (!this.onFoot && car.shift(1)) { sfx('click'); this.missions.onShift(car); } break;
      case 'shiftDown': if (!this.onFoot) car.shift(-1); break;
      case 'interact': this.interact(); break;
      case 'cruise': if (!this.onFoot) { car.cruise = car.cruise ? 0 : Math.max(5, car.fwdSpeed); this.toast(car.cruise ? t('Hız sabitleyici: {v}', { v: Math.round(car.cruise * 3.6) }) : t('Hız sabitleyici kapalı')); } break;
      case 'jump': this.jump(); break;
      case 'emote': this.ui.emoteMenu(); break;
      case 'radio': this.cycleRadio(); break;
      case 'police': this.togglePatrol(); break;
      case 'door': if (!this.onFoot && this.carModel.doors[0]) { const d = this.carModel.doors[0]; d.target = d.target ? 0 : 1; sfx('door'); } break;
      case 'hood': if (this.carModel.hood) { this.carModel.hood.target = this.carModel.hood.target ? 0 : 1; sfx('door'); } break;
      case 'trunk': if (this.carModel.trunk) { this.carModel.trunk.target = this.carModel.trunk.target ? 0 : 1; sfx('door'); } break;
      case 'window': for (const d of this.carModel.doors) d.winTarget = d.winTarget ? 0 : 1; break;
      case 'recover': this.recoverCar(); break;
      case 'lookBack': this.lookBackT = 1.0; break;
    }
  }
  signalOk(dir) { return (dir === 'L' && (this.indL || G.time - this.sigTime.L < 6)) || (dir === 'R' && (this.indR || G.time - this.sigTime.R < 6)); }

  updatePrompts() {
    const pl = this.playerPos();
    const slow = this.onFoot || this.car.speed < 2.5;
    let txt = null;
    this.nearPoi = null; this.nearMission = null;
    if (slow && !this.missions.active) {
      for (const poi of this.world.d.pois) {
        if (Math.hypot(poi.x - pl.x, poi.z - pl.z) < 7) { this.nearPoi = poi; break; }
      }
      const mk = this.missions.nearestMarker(pl.x, pl.z, 5);
      if (mk) this.nearMission = mk;
    }
    const key = this.touch.visible && 'ontouchstart' in window ? '✋' : 'G';
    if (this.nearMission) txt = `<b>${key}</b> ${t('Görevi başlat')}: ${t(this.nearMission.m.name)}`;
    else if (this.nearPoi) txt = `<b>${key}</b> ${t(poiName(this.nearPoi.type))}`;
    else if (this.onFoot && Math.hypot(this.foot.pos.x - this.car.pos.x, this.foot.pos.z - this.car.pos.z) < 4.5) txt = `<b>F</b> ${t('Araca bin')}`;
    this.hud.setPrompt(txt);
  }
  interact() {
    if (this.nearMission) { this.ui.missionBrief(this.nearMission.m); return; }
    if (this.nearPoi) { this.ui.poi(this.nearPoi); return; }
  }

  // ===================== ÇARPIŞMA / HASAR =====================
  onImpact(info) {
    const v = clamp(info.speed / 20, 0, 1);
    sfx('crash', { v });
    if (info.speed > 6) vibrate(Math.round(20 + v * 60));
    this.camCtl.shake(v * 0.4);
    this.effects.spark(info.x, this.car.pos.y, info.z, this.car.vel.x, this.car.vel.z, 6 + v * 12);
    // görsel göçük: çarpma noktasını yerel koordinata çevir
    const car = this.car;
    const dx = info.x - car.pos.x, dz = info.z - car.pos.z;
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (info.dmg > 0.005) this.carModel.dent(lx, 0.6 - car.restGroundY * 0, lz, Math.min(0.35, info.dmg * 4));
    this.applyDamageVisual();
    this.missions.onImpact(info);
    if (this.drift.active) this.endDrift(true);
  }
  applyDamageVisual(init) {
    const d = this.car.damage;
    this.carModel.setBroken(d > 0.75 ? 2 : d > 0.4 ? 1 : 0);
    if (init && d > 0.05) {
      // kayıtlı hasarı rastgele göçüklerle göster
      const r = this.car;
      for (let i = 0; i < Math.round(d * 8); i++) this.carModel.dent((Math.random() - 0.5) * r.W, 0.6, (Math.random() - 0.5) * r.L, 0.12);
    }
  }
  recoverCar(silent) {
    const car = this.car;
    const n = this.world.graph.nearest(car.pos.x, car.pos.z, 3000);
    if (n) {
      const l = n.links[0];
      const b = l ? this.world.graph.nodes[l.to] : n;
      this.placeCar(n.x, n.z, Math.atan2(b.x - n.x, b.z - n.z) || car.yaw);
    } else this.placeCar(car.pos.x, car.pos.z, car.yaw);
    if (!silent) this.toast(t('Araç kurtarıldı'));
  }
  resetCar() { const c = this.car; this.placeCar(c.pos.x, c.pos.z, c.yaw); }

  // ===================== BONUSLAR =====================
  nearMiss() {
    const p = G.profile;
    p.stats.nearMiss++;
    this.car.nitro = Math.min(1, this.car.nitro + 0.1);
    this.reward(100, 0, 5, t('Yakın geçiş'));
    sfx('nearmiss');
    this.hud.bigText(t('YAKIN GEÇİŞ! +100'), 0.9, '#4cc9f0');
  }
  updateDrift(dt) {
    const car = this.car, D = this.drift;
    const ang = Math.abs(car.driftAngle);
    const drifting = car.grounded && car.speed > 8 && ang > 0.2 && ang < 1.6 && car.fwdSpeed > 0;
    if (drifting) {
      if (!D.active) { D.active = true; D.score = 0; D.mult = 1; D.t = 0; }
      D.t += dt; D.low = 0;
      D.mult = Math.min(5, 1 + D.t * 0.4);
      const pts = car.speed * ang * 12 * dt * D.mult;
      D.score += pts;
      this.missions.addDrift(pts);
      if (Math.random() < 0.3) vibrate(8);
      this.hud.driftScore(D.score, D.mult, 'on');
    } else if (D.active) {
      D.low += dt;
      this.hud.driftScore(D.score, D.mult, 'on');
      if (D.low > 0.7) this.endDrift(false);
    }
  }
  endDrift(failed) {
    const D = this.drift, p = G.profile;
    D.active = false;
    if (failed) { this.hud.driftScore(D.score, D.mult, 'fail'); setTimeout(() => this.hud.driftScore(0, 0, null), 900); return; }
    const s = Math.round(D.score);
    if (s > 150) {
      p.stats.driftTotal += s;
      p.stats.longestDrift = Math.max(p.stats.longestDrift, s);
      const money = Math.round(s / 25 / 10) * 10;
      this.reward(money, 0, Math.round(s / 200), t('Drift {s}', { s }));
      this.hud.driftScore(s, D.mult, 'bank');
      if (!this.missions.active) { const lb = p.leaderboard.drift; if (!lb.length || s > lb[lb.length - 1].v || lb.length < 10) { lb.push({ v: s, map: G.mapId, d: Date.now() }); lb.sort((a, b) => b.v - a.v); p.leaderboard.drift = lb.slice(0, 10); } }
    }
    setTimeout(() => this.hud.driftScore(0, 0, null), 1200);
  }

  // ===================== EFEKTLER =====================
  updateCarFx(dt) {
    const car = this.car, fx = this.effects;
    const S = G.settings;
    const dirtCol = [0.55, 0.45, 0.32];
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      if (!w.contact) { fx.skids.lift(i); continue; }
      const onAsphalt = w.surf === 1 || w.surf === 7;
      const sliding = w.locked || w.spinning || (w.slip > 0.18 && car.speed > 5);
      if (sliding && onAsphalt) {
        const nx = Math.cos(car.yaw), nz = -Math.sin(car.yaw);
        fx.skids.add(i, w.wx, w.wy + 0.05, w.wz, nx, nz, 0.12, clamp(w.slip * 2, 0.4, 1));
        fx.tireSmoke(w.wx, w.wy, w.wz, clamp(car.speed / 15, 0.2, 0.9) * (w.spinning ? 1 : 0.7));
        if (Math.random() < dt * 30) vibrate(5);
      } else {
        fx.skids.lift(i);
        if (!onAsphalt && car.speed > 6 && (w.surf === 2 || w.surf === 3 || w.surf === 4)) fx.dust(w.wx, w.wy, w.wz, 0.25, w.surf === 3 ? [0.85, 0.75, 0.55] : dirtCol);
      }
    }
    // egzoz
    const back = -car.L / 2 - 0.1;
    const ex = car.pos.x + Math.sin(car.yaw) * back, ez = car.pos.z + Math.cos(car.yaw) * back;
    const ey = car.pos.y + car.restGroundY + car.p.dims.clr + 0.25;
    if (car.nitroOn) {
      fx.flame(ex, ey, ez, -Math.sin(car.yaw), -Math.cos(car.yaw), true);
      if (!this._nitroSnd) { sfx('nitro'); this._nitroSnd = true; }
    } else this._nitroSnd = false;
    if (car.backfire) fx.backfire(ex, ey, ez, -Math.sin(car.yaw), -Math.cos(car.yaw));
    if (car.scrape > 4) {
      if (car.contactPoint && Math.random() < 0.6) fx.spark(car.contactPoint[0], car.contactPoint[1], car.contactPoint[2], car.vel.x, car.vel.z, 3);
      if (Math.random() < 0.15) sfx('scrape');
    }
    car.scrape = 0;
    car.contactPoint = null;
    if (car.drownT > 0) fx.waterSplash(car.pos.x, this.world.d.water.level, car.pos.z);
    // hız bulanıklığı
    this.hud.speedEffect(S.motionBlur ? clamp((car.kmh - 120) / 200, 0, 0.8) + (car.nitroOn ? 0.3 : 0) : 0);
    // kir görseli
    this._dirtT = (this._dirtT || 0) - dt;
    if (this._dirtT <= 0) { this._dirtT = 1; this.carModel.setDirt(car.dirt); }
  }
  parkSensor(dt) {
    const car = this.car;
    if (this.onFoot || car.speed > 3.5) return;
    const dir = car.gear === 0 ? -1 : car.fwdSpeed > 0.3 && car.speed < 2.5 && this.camCtl.mode === 4 ? 1 : 0;
    if (!dir) return;
    let best = 9;
    const fx = Math.sin(car.yaw) * dir, fz = Math.cos(car.yaw) * dir;
    for (const dd of [0.4, 0.9, 1.5]) {
      const x = car.pos.x + fx * (car.L / 2 + dd), z = car.pos.z + fz * (car.L / 2 + dd);
      if (this.world.collide(x, z, car.W / 2, car.pos.y - car.cgH + 0.3, () => {})) { best = dd; break; }
    }
    if (this.missions.active && this.missions.active.cols) for (const c of this.missions.active.cols) {
      const d = Math.hypot(c.x - car.pos.x, c.z - car.pos.z) - car.L / 2 - (c.hd || c.r || 1);
      if (d < 1.5 && d < best) best = Math.max(0.2, d);
    }
    if (best < 9) {
      const interval = best < 0.5 ? 0.08 : best < 1 ? 0.25 : 0.5;
      this._beepT = (this._beepT || 0) - dt;
      if (this._beepT <= 0) { this._beepT = interval; sfx('beep', { f: best < 0.5 ? 1900 : 1600 }); }
    }
  }

  // ===================== POLİS =====================
  updatePolice(dt) {
    const P = this.police, car = this.car, p = G.profile;
    if (!this.traffic.enabled) return;
    const inPolice = CAR[car.entry.id].police;
    // devriye modu
    if (P.patrol) {
      if (!inPolice || this.onFoot) { this.togglePatrol(); return; }
      let u = this.traffic.speeders[0];
      if (!u) { u = this.traffic.spawnSpeeder(car.pos); if (u) this.toast(t('🚨 Hız yapan bir araç tespit edildi!')); }
      if (u) {
        const d = Math.hypot(u.v.pos.x - car.pos.x, u.v.pos.z - car.pos.z);
        if (u.busted > 0) {
          u.busted -= dt;
          if (u.busted <= 0) { this.traffic.removeUnit(this.traffic.speeders, u); }
        } else {
          if (d < 14) u.close += dt; else u.close = Math.max(0, u.close - dt * 0.3);
          if (u.close > 4) {
            u.busted = 3; u.ai.maxSpeed = 0; u.ai.path = null; u.ai.target = () => ({ x: u.v.pos.x, z: u.v.pos.z, speed: 0 });
            p.stats.busts++;
            this.reward(1500, 0, 60, t('Şüpheli durduruldu'));
            this.hud.bigText(t('DURDURULDU!'), 1.2, '#4cc9f0');
          }
          if (d > 600) this.traffic.removeUnit(this.traffic.speeders, u);
        }
        this.hud.policeBar('patrol', u.busted > 0 ? t('Durduruldu') : t('Mesafe: {d} m — {p}%', { d: Math.round(d), p: Math.round((u.close / 4) * 100) }));
        this._gpsPolice = [u.v.pos.x, u.v.pos.z];
      }
      return;
    }
    if (this.onFoot || this.missions.active || inPolice || this.testDrive) {
      if (P.state === 'chase' && this.missions.active) this.endChase(null);
      return;
    }
    const lim = this.zoneLimit || 90;
    if (!P.state) {
      if (car.kmh > lim + 45 && this.world.d.id !== 'track') P.overT += dt; else P.overT = Math.max(0, P.overT - dt);
      if (P.overT > 2.5 && Math.random() < dt * 0.6) {
        P.overT = 0;
        const u = this.traffic.spawnPolice(car.pos);
        if (u) {
          P.state = 'chase'; P.heat = 1; P.farT = 0; P.caughtT = 0; P.t = 0;
          u.ai.target = () => ({ x: car.pos.x + car.vel.x * 0.6, z: car.pos.z + car.vel.z * 0.6, speed: Math.max(25, car.speed * 1.15) });
          this.toast(t('🚨 Polis seni fark etti!'), 'warn'); sfx('police');
        }
      }
      return;
    }
    // takip
    P.t += dt;
    if (P.t > 30 * P.heat && P.heat < 3 && this.traffic.police.length < 3) {
      P.heat++;
      const u = this.traffic.spawnPolice(car.pos);
      if (u) u.ai.target = () => ({ x: car.pos.x + car.vel.x * 0.6, z: car.pos.z + car.vel.z * 0.6, speed: Math.max(25, car.speed * 1.15) });
    }
    let minD = Infinity;
    for (const u of this.traffic.police) minD = Math.min(minD, Math.hypot(u.v.pos.x - car.pos.x, u.v.pos.z - car.pos.z));
    if (minD > 250) P.farT += dt; else P.farT = Math.max(0, P.farT - dt * 0.5);
    if (minD < 10 && car.kmh < 12) P.caughtT += dt; else P.caughtT = Math.max(0, P.caughtT - dt);
    if (Math.random() < dt * 0.4) sfx('police');
    this.hud.policeBar('chase', `${'★'.repeat(P.heat)} — ${P.farT > 0 ? t('Kaçış: {p}%', { p: Math.round((P.farT / 10) * 100) }) : t('Mesafe: {d} m', { d: Math.round(minD) })}`);
    if (P.farT > 10) this.endChase(true);
    else if (P.caughtT > 3) this.endChase(false);
  }
  endChase(escaped) {
    const P = this.police, p = G.profile;
    for (const u of this.traffic.police.slice()) this.traffic.removeUnit(this.traffic.police, u);
    if (escaped === true) { p.stats.escapes++; this.reward(2000 * P.heat, 0, 50 * P.heat, t('Polisten kaçtın!')); this.hud.bigText(t('KAÇTIN!'), 1.4, '#06d6a0'); }
    else if (escaped === false) { const fine = 1000 + 500 * P.heat; p.money = Math.max(0, p.money - fine); this.hud.money(-fine, 0, t('Polis cezası')); this.hud.bigText(t('YAKALANDIN!'), 1.4, '#ef476f'); }
    P.state = null; P.heat = 0;
    this.hud.policeBar(null);
  }
  togglePatrol() {
    const P = this.police;
    if (!CAR[this.car.entry.id].police) { this.toast(t('Polis modu için Devriye aracı gerekli')); return; }
    P.patrol = !P.patrol;
    if (!P.patrol) { for (const u of this.traffic.speeders.slice()) this.traffic.removeUnit(this.traffic.speeders, u); this.hud.policeBar(null); this.toast(t('Polis modu kapalı')); }
    else this.toast(t('👮 Polis modu açık: hız yapanları yakala!'));
  }

  // ===================== GÜN / HAVA =====================
  updateSun(dt) {
    G.dayTime = (G.dayTime + dt / (24 * 60)) % 1; // 24 dakikalık gün
    const a = (G.dayTime - 0.25) * Math.PI * 2;
    const sy = Math.sin(a), sx = Math.cos(a);
    const dir = new THREE.Vector3(sx * 0.8, sy, 0.45).normalize();
    const night = clamp(-sy * 3 + 0.25, 0, 1);
    G.nightF = night;
    const day = 1 - night;
    const pl = this.car ? (this.onFoot ? this.foot.pos : this.car.pos) : new THREE.Vector3();
    this.sun.position.copy(pl).addScaledVector(dir.y > 0 ? dir : new THREE.Vector3(-dir.x, -dir.y, dir.z), 200);
    this.sun.target.position.copy(pl);
    const warm = clamp(1 - Math.abs(sy) * 3, 0, 1);
    this.sun.color.setRGB(1, 0.95 - warm * 0.25, 0.85 - warm * 0.4);
    const fog = G.weather === 'fog', rain = G.weather === 'rain';
    const dim = rain ? 0.55 : fog ? 0.65 : 1;
    this.sun.intensity = (dir.y > 0 ? 2.6 * day : 0.25) * dim;
    this.hemi.intensity = (0.25 + day * 0.75) * (rain ? 0.8 : 1);
    const top = new THREE.Color('#3a7bd5').lerp(new THREE.Color('#050a1a'), night);
    const bottom = new THREE.Color('#cfe8ff').lerp(new THREE.Color('#ffb36b'), warm * day * 0.7).lerp(new THREE.Color('#0b1022'), night);
    if (rain || fog) { top.lerp(new THREE.Color('#7d8794'), 0.7 * day + 0.2); bottom.lerp(new THREE.Color('#9aa3ad'), 0.7 * day + 0.1); }
    if (this.world) {
      const u = this.world.skyUniforms;
      u.top.value.copy(top); u.bottom.value.copy(bottom); u.sunDir.value.copy(dir); u.night.value = night;
      this.world.setNight(night);
    }
    this.hemi.color.copy(bottom).lerp(new THREE.Color('#ffffff'), 0.3);
    this.scene.fog.color.copy(bottom);
    const vd = G.settings.viewDist;
    const fogNear = fog ? 15 : rain ? vd * 0.25 : vd * 0.5;
    const fogFar = fog ? 160 : rain ? vd * 0.8 : vd * 1.05;
    this.scene.fog.near = lerp(this.scene.fog.near, fogNear, 0.05); this.scene.fog.far = lerp(this.scene.fog.far, fogFar, 0.05);
    this.camera.far = Math.max(fogFar + 50, 400); this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = 0.9 + day * 0.15;
  }
  updateWeather(dt) {
    if (this.weatherLock) return;
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = 240 + Math.random() * 300;
      const r = Math.random();
      this.setWeather(r < 0.6 ? 'sunny' : r < 0.85 ? 'rain' : 'fog');
    }
  }
  setWeather(w) {
    if (G.weather === w) return;
    G.weather = w;
    this.world.setWet(w === 'rain');
    this.toast(t({ sunny: '☀️ Hava açıldı', rain: '🌧️ Yağmur başladı — yol kaygan!', fog: '🌫️ Sis çöktü' }[w]));
  }

  // ===================== GPS =====================
  setGPS(x, z, silent) {
    this.gps.target = [x, z];
    this.gps.t = 0;
    this.computeRoute();
    if (!silent) this.toast(t('📍 Hedef işaretlendi'));
  }
  clearGPS() {
    this.gps.target = null; this.gps.route = null;
    if (this.gps.line) { this.scene.remove(this.gps.line); this.gps.line.geometry.dispose(); this.gps.line = null; }
  }
  computeRoute() {
    const g = this.world.graph, pl = this.playerPos();
    const a = g.nearest(pl.x, pl.z, 2000), b = g.nearest(this.gps.target[0], this.gps.target[1], 2000);
    let route;
    if (a && b) {
      const path = g.path(a.id, b.id);
      if (path) route = [[pl.x, pl.z]].concat(path.map((id) => [g.nodes[id].x, g.nodes[id].z])).concat([this.gps.target]);
    }
    if (!route) route = [[pl.x, pl.z], this.gps.target];
    this.gps.route = route;
    this.buildRouteLine();
  }
  buildRouteLine() {
    if (this.gps.line) { this.scene.remove(this.gps.line); this.gps.line.geometry.dispose(); }
    const r = this.gps.route;
    const pos = [];
    const w = 0.7;
    for (let i = 0; i < r.length - 1; i++) {
      const [ax, az] = r[i], [bx, bz] = r[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const nx = (-(bz - az) / len) * w, nz = ((bx - ax) / len) * w;
      const ya = this.world.ground(ax, az).h + 0.25, yb = this.world.ground(bx, bz).h + 0.25;
      pos.push(ax - nx, ya, az - nz, ax + nx, ya, az + nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const line = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#3a86ff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    this.gps.line = line;
    this.scene.add(line);
  }
  updateGPS(dt) {
    if (!this.gps.target) return;
    const pl = this.playerPos();
    if (Math.hypot(pl.x - this.gps.target[0], pl.z - this.gps.target[1]) < 12 && !this.missions.active) { this.toast(t('Hedefe ulaştın')); this.clearGPS(); return; }
    this.gps.t += dt;
    if (this.gps.t > 2.5) {
      this.gps.t = 0;
      // rotadan sapma kontrolü
      const r = this.gps.route;
      let md = Infinity;
      for (let i = 0; i < r.length; i++) md = Math.min(md, Math.hypot(r[i][0] - pl.x, r[i][1] - pl.z));
      if (md > 25) this.computeRoute();
      else {
        // geçilen noktaları kırp
        let cut = 0;
        for (let i = 1; i < Math.min(r.length, 30); i++) if (Math.hypot(r[i][0] - pl.x, r[i][1] - pl.z) < 15) cut = i;
        if (cut > 0) { this.gps.route = [[pl.x, pl.z]].concat(r.slice(cut + 1)); this.buildRouteLine(); }
      }
    }
  }
  openMap() {
    const pl = this.playerPos();
    this.hud.openMap(this.world, pl, this.mapExtras(5000), (x, z) => this.setGPS(x, z));
  }
  mapExtras(radar) {
    const pl = this.playerPos();
    return {
      route: this.gps.route, target: this.gps.target, speed: this.onFoot ? 0 : this.car.speed,
      chests: this.chests.nearby(pl.x, pl.z, radar ?? (110 + G.profile.radar * 90)),
      missions: this.missions.markers,
      police: this.traffic.police.map((u) => ({ x: u.v.pos.x, z: u.v.pos.z })),
    };
  }

  // ===================== GARAJ SERGİSİ =====================
  updateGarageDisplay() {
    const it = this.world.d.interiors.find((i) => i.kind === 'garage');
    if (!it || !it.lifts) return;
    const pl = this.playerPos();
    const near = Math.hypot(pl.x - it.x, pl.z - it.z) < 70;
    if (near && !this.garageDisplay) {
      this.garageDisplay = [];
      const cars = G.profile.cars.filter((c) => c.uid !== (this.rentalEntry ? '' : G.profile.currentCar)).slice(0, it.lifts.length);
      cars.forEach((e, i) => {
        const L = it.lifts[i];
        const m = buildCar(e, { low: false, driver: false });
        m.root.position.set(L.x, L.y + 0.4, L.z); m.root.rotation.y = L.rot + Math.PI;
        m.update({ spins: [0, 0, 0, 0], t: 0 }, 0);
        this.scene.add(m.root);
        this.garageDisplay.push(m);
      });
    } else if (!near && this.garageDisplay) this.clearGarageDisplay();
  }
  clearGarageDisplay() {
    if (!this.garageDisplay) return;
    for (const m of this.garageDisplay) { this.scene.remove(m.root); m.dispose(); }
    this.garageDisplay = null;
  }

  // ===================== EKONOMİ / İLERLEME =====================
  xpNeed(l) { return 200 + 80 * l; }
  reward(money, gold = 0, xp = 0, label = '', silent) {
    const p = G.profile;
    if (money > 0) { p.money += money; p.stats.moneyEarned += money; }
    if (gold > 0) p.gold += gold;
    if (money || gold) { this.hud.money(money, gold, label); if (!silent) sfx('coin'); }
    if (xp) this.addXp(xp);
  }
  addXp(xp) {
    const p = G.profile;
    p.xp += xp;
    while (p.xp >= this.xpNeed(p.level)) {
      p.xp -= this.xpNeed(p.level);
      p.level++;
      sfx('level');
      this.hud.bigText(t('SEVİYE {l}!', { l: p.level }), 2, '#ffd166');
      const mp = MAPS.find((m) => m.level === p.level);
      if (mp) this.toast(t('🗺️ Yeni harita açıldı: {m}', { m: t(mp.name) }), 'gold');
      this.checkSecretCars();
    }
  }
  checkLicenses() {
    const p = G.profile;
    const count = (type) => MISSIONS.filter((m) => m.type === type && p.missions[m.id]).length;
    for (const L of LICENSES) {
      if (!L.need || p.licenses.includes(L.id)) continue;
      const ok = Object.entries(L.need).every(([k, n]) => count(k) >= n);
      if (ok) {
        p.licenses.push(L.id);
        sfx('level');
        this.ui.licenseAward(L);
      }
    }
  }
  checkSecretCars() {
    const p = G.profile;
    const has = (id) => p.cars.some((c) => c.id === id);
    const give = (id, why) => { if (has(id)) return; p.cars.push(newCarEntry(id)); this.toast(t('🔓 Gizli araç açıldı: {c}!', { c: CAR[id].name }), 'gold'); this.ui.secretCar(id, why); };
    if (p.level >= 50) give('pars', t('50. seviyeye ulaştın'));
    if (MISSIONS.every((m) => p.missions[m.id] === 3)) give('efsane', t('Tüm görevleri 3 yıldızla bitirdin'));
    if (p.goldFound.length >= GOLD_CHEST_TOTAL) give('hayalet', t('Tüm altın sandıkları buldun'));
  }
  statVal(s) {
    const p = G.profile;
    switch (s) {
      case 'carsOwned': return p.cars.length;
      case 'maxUpgrade': return p.cars.some((c) => Object.values(c.upgrades).some((v) => v >= 5)) ? 1 : 0;
      case 'houses': return p.houses.length;
      case 'licC': return p.licenses.includes('C') ? 1 : 0;
      case 'licR': return p.licenses.includes('R') ? 1 : 0;
      case 'licP': return p.licenses.includes('P') ? 1 : 0;
      case 'level': return p.level;
      case 'mapsVisited': return p.mapsVisited.length;
      case 'loginStreak': return p.login.streak;
      default: return p.stats[s] || 0;
    }
  }
  checkAchievements() {
    const p = G.profile;
    for (const a of ACHIEVEMENTS) {
      if (p.achievements[a.id]) continue;
      if (this.statVal(a.stat) >= a.goal) {
        p.achievements[a.id] = Date.now();
        this.reward(a.money, a.gold, 50, '🏆 ' + t(a.name));
        this.toast(`🏆 ${t('Başarım')}: ${t(a.name)}`, 'gold');
        sfx('success');
      }
    }
  }
  ensureDaily() {
    const p = G.profile, today = dayKey();
    if (!p.daily || p.daily.day !== today) {
      const r = (() => { let s = hashStr(today + p.name); return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); })();
      const pool = DAILY_TEMPLATES.slice();
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const tp = pool.splice(Math.floor(r() * pool.length), 1)[0];
        const n = Math.round((tp.n[0] + r() * (tp.n[1] - tp.n[0])) / (tp.n[1] > 100 ? 1000 : 1)) * (tp.n[1] > 100 ? 1000 : 1);
        tasks.push({ id: tp.id, n, base: this.statVal(tp.stat), done: false, money: tp.money });
      }
      p.daily = { day: today, tasks };
    }
  }
  dailyProgress(task) {
    const tp = DAILY_TEMPLATES.find((x) => x.id === task.id);
    return clamp(this.statVal(tp.stat) - task.base, 0, task.n);
  }
  checkDaily() {
    const p = G.profile;
    this.ensureDaily();
    for (const task of p.daily.tasks) {
      if (task.done) continue;
      if (this.dailyProgress(task) >= task.n) {
        task.done = true;
        this.reward(task.money, 1, 100, t('Günlük görev'));
        this.toast('📅 ' + t('Günlük görev tamamlandı!'), 'gold');
      }
    }
  }
  loginReward() {
    const p = G.profile, today = dayKey();
    if (p.login.last === today) return null;
    const y = new Date(); y.setDate(y.getDate() - 1);
    p.login.streak = p.login.last === dayKey(y) ? p.login.streak + 1 : 1;
    p.login.last = today;
    const r = LOGIN_REWARDS[(p.login.streak - 1) % 7];
    p.money += r.money; p.gold += r.gold || 0;
    return { day: ((p.login.streak - 1) % 7) + 1, ...r };
  }
  garageCap() { const p = G.profile; return GARAGE_TIERS[p.garageTier].cap + p.houses.reduce((a, h) => a + (HOUSES.find((x) => x.id === h)?.slots || 0), 0); }
  syncCarToEntry() {
    if (this.rentalEntry || !this.car) return;
    const e = currentCarEntry();
    e.fuel = this.car.fuel; e.damage = this.car.damage; e.dirt = this.car.dirt;
  }
  save() { this.syncCarToEntry(); save(true); }
  toast(m, k) { this.hud.toast(m, k); }
  flash() { this.hud.flash(); }

  // Araç değiştir (garajdan)
  switchCar(uid) {
    this.syncCarToEntry();
    G.profile.currentCar = uid;
    const c = this.car;
    this.spawnPlayerCar({ x: c.pos.x, z: c.pos.z, rot: c.yaw });
    this.save();
  }
  // Yükseltme/tuning sonrası aracı yeniden oluştur
  rebuildCar() { const c = this.car; const keep = { fuel: c.fuel, damage: c.damage, dirt: c.dirt }; this.syncCarToEntry(); this.spawnPlayerCar({ x: c.pos.x, z: c.pos.z, rot: c.yaw }); Object.assign(this.car, keep); }

  cycleRadio() {
    const S = G.settings;
    initAudio();
    if (!S.radioOn) { S.radioOn = true; S.radio = 0; }
    else if (S.radio < RADIO.length - 1) S.radio++;
    else S.radioOn = false;
    if (S.radioOn) { radio.start(S.radio); this.hud.showRadio('📻 ' + RADIO[S.radio].name + ' — ' + radio.title); }
    else { radio.stop(); this.hud.showRadio('📻 ' + t('Radyo kapalı')); }
  }

  // ===================== DRONE =====================
  startDrone() { G.mode = 'drone'; this.camCtl.startDrone(this.camera.position.clone()); this.touch.setMode('foot'); this.hud.show(false); this.ui.droneUI(true); }
  exitDrone() { G.mode = 'play'; this.hud.show(true); this.touch.setMode(this.onFoot ? 'foot' : 'car'); this.ui.droneUI(false); }

  pauseSoft(v) { this.pausedSoft = v; if (v) { horn(0, false); } }
  resume() { this.pausedSoft = false; G.paused = false; }

  // ===================== ÇİZİM =====================
  render(dt, paused) {
    const car = this.car, cm = this.carModel;
    const alpha = paused ? 1 : clamp(this.acc / STEP, 0, 1);
    car.interpolate(alpha, this.renderPos, this.renderQuat);
    cm.root.position.copy(this.renderPos);
    cm.root.quaternion.copy(this.renderQuat);
    const wy = car.wheels.map((w) => -car.cgH + car.p.R + 0.05 + w.comp - car.restGroundY);
    const kmh = Math.abs(car.fwdSpeed) * 3.6;
    cm.update({
      steer: car.steer, spins: car.wheels.map((w) => w.spin), wheelY: wy,
      lights: this.lights, high: this.highBeam, brake: car.brake > 0.1 && !this.onFoot, reverse: car.gear === 0,
      indL: this.indL, indR: this.indR, hazard: this.hazard, t: G.time, siren: this.police.patrol,
      kmh, rpm: car.rpm, red: car.p.red, gearTxt: car.gear === 0 ? 'R' : car.gear === -1 ? 'N' : String(car.gear), fuel: car.fuel,
    }, dt);
    this.traffic.renderAI(alpha);
    this.missions.renderAI(alpha);
    // far ışığı
    const hl = this.headlight;
    if (this.lights && !this.onFoot || (this.lights && this.onFoot)) {
      hl.intensity = (this.highBeam ? 140 : 70) * (0.3 + G.nightF);
      hl.distance = this.highBeam ? 110 : 60;
      const f = new THREE.Vector3(0, -0.05, 1).applyQuaternion(this.renderQuat);
      hl.position.copy(this.renderPos).addScaledVector(f, car.L / 2).add(new THREE.Vector3(0, 0.2, 0));
      hl.target.position.copy(hl.position).addScaledVector(f, 20).add(new THREE.Vector3(0, -2, 0));
    } else hl.intensity = 0;
    // yaya
    if (this.onFoot) {
      const f = this.foot;
      this.human.root.position.copy(f.pos);
      this.human.root.rotation.y = f.yaw;
      let st = 'idle';
      if (!f.grounded) st = 'jump';
      else if (f.speed > 3.5) st = 'run';
      else if (f.speed > 0.3) st = 'walk';
      else if (f.emote) { st = 'emote'; f.emote.t += dt; if (f.emote.t > 4 && f.emote.id !== 'sit' && f.emote.id !== 'dance') f.emote = null; }
      this.human.animate(st, f.speed || 0, paused ? 0 : dt, f.emote);
    }
    // kamera
    const lookBack = this.lookBackT > 0 || (input.brake > 0.5 && input.handbrake && false);
    if (this.lookBackT > 0) this.lookBackT -= dt;
    if (G.mode === 'photo') this.camCtl.photoUpdate(dt, input);
    else if (G.mode === 'drone') { this.camCtl.droneUpdate(dt, { ...input, up: input.handbrake, down: input.brake > 0.5 && false }); }
    else if (this.onFoot) {
      this.camCtl.foot(dt, this.foot.pos, { x: input.lookX, y: input.lookY });
    } else this.camCtl.car(dt, this.renderPos, this.renderQuat, car, cm, lookBack, { x: input.lookX, y: input.lookY });
    // HUD
    if (!this.onFoot) this.hud.updateCar(car, dt);
    const pl = this.playerPos();
    this._mt = (this._mt || 0) - dt;
    if (this._mt <= 0) {
      this._mt = 1 / 20;
      const heading = this.onFoot ? this.camCtl.footYaw + this.camCtl.yawOff : car.yaw;
      this.hud.drawMini(this.world, pl.x, pl.z, heading, this.mapExtras());
    }
    const wipers = G.settings.autoWipers && !this.onFoot;
    this.hud.updateRain(dt, G.weather === 'rain' && (this.camCtl.mode === 2 || this.camCtl.mode === 3) && !this.onFoot && G.mode === 'play' && !wipers || (G.weather === 'rain' && this.onFoot), car.speed);
    // ana çizim
    const r = this.renderer;
    r.setScissorTest(false);
    const w = r.domElement.width, h = r.domElement.height;
    r.setViewport(0, 0, w / r.getPixelRatio(), h / r.getPixelRatio());
    if (this.ui.composer && G.mode === 'photo' && this.ui.photoDof) this.ui.composer.render();
    else r.render(this.scene, this.camera);
    // geri görüş kamerası
    const showRear = !this.onFoot && car.gear === 0 && this.camCtl.mode !== 4 && G.mode === 'play';
    this.hud.rearView(showRear);
    if (showRear) {
      const rr = this.hud.rearRect();
      if (rr.width > 10) {
        const rc = this.rearCam;
        const back = new THREE.Vector3(0, car.H * 0.5 - car.restGroundY * 0, -car.L / 2 - 0.1).applyQuaternion(this.renderQuat).add(this.renderPos);
        rc.position.copy(back);
        const dir = new THREE.Vector3(0, -0.35, -1).applyQuaternion(this.renderQuat);
        rc.lookAt(back.clone().add(dir));
        rc.aspect = rr.width / rr.height; rc.updateProjectionMatrix();
        const H = innerHeight;
        r.setScissorTest(true);
        r.setScissor(rr.left, H - rr.bottom, rr.width, rr.height);
        r.setViewport(rr.left, H - rr.bottom, rr.width, rr.height);
        r.render(this.scene, rc);
        r.setScissorTest(false);
        r.setViewport(0, 0, innerWidth, innerHeight);
      }
    }
  }
}

export function poiName(type) {
  return { fuel: 'Benzin istasyonu', repair: 'Tamirhane', wash: 'Oto yıkama', gallery: 'Galeri', garage: 'Garaj', teleport: 'Işınlanma noktası', house: 'Ev', clothes: 'Kıyafet mağazası', cafe: 'Kafe', tuning: 'Tuning atölyesi' }[type] || type;
}
