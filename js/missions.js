// Görev çalışma zamanı
import * as THREE from 'three';
import { G, clamp, seeded, wrapAngle, emit, lerp } from './core.js';
import { MISSIONS, MISSION, MTYPES, PARK_SUBS, missionDesc } from './data/missions.js';
import { CARS, CAR } from './data/cars.js';
import { buildCar } from './carModel.js';
import { buildHuman } from './human.js';
import { Vehicle } from './vehicle.js';
import { AIDriver } from './traffic.js';
import { newCarEntry } from './save.js';
import { catmull, resample } from './world/builder.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';
import * as TX from './world/textures.js';

export function missionUnlocked(m, p) {
  if (m.prev && !p.missions[m.prev]) return false;
  return true;
}
export function licenseOk(m, p) { return !m.license || p.licenses.includes(m.license); }

export class Missions {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.markers = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  get world() { return this.game.world; }

  rng(m) { return seeded(m.seed); }

  // ---------- başlangıç noktaları ----------
  nodesFor(rng, minLinks = 2) {
    const g = this.world.graph;
    const tn = g.nodes.filter((n) => n.links.length >= minLinks && n.traffic);
    return tn.length ? tn : g.nodes;
  }
  startOf(m) {
    if (m._start) return m._start;
    const r = this.rng(m), d = this.world.d, g = this.world.graph;
    let s = null;
    if (m.type === 'park') {
      if (m.sub === 'parallel') {
        const cand = g.nodes.filter((n) => n.links.length === 2 && n.links.every((l) => l.road.sidewalk && l.road.lanes <= 2));
        const pool = cand.length ? cand : g.nodes.filter((n) => n.links.length === 2);
        const n = pool[Math.floor(r() * pool.length)];
        const b = g.nodes[n.links[0].to];
        const yaw = Math.atan2(n.x - b.x, n.z - b.z);
        const rx = -Math.cos(yaw), rz = Math.sin(yaw);
        const off = (n.width || 10) / 2 - 1.3;
        const tx = n.x + rx * off, tz = n.z + rz * off;
        s = { x: tx - Math.sin(yaw) * 16 - rx * 1.5, z: tz - Math.cos(yaw) * 16 - rz * 1.5, rot: yaw, target: { x: tx, z: tz, rot: yaw, w: 2.6, l: 6.8, y: this.world.ground(tx, tz).h, parallel: true } };
      } else {
        const spots = d.parkSpots;
        const sp = spots[Math.floor(r() * spots.length)];
        const ang = m.sub === 'angle' ? Math.PI / 4 * (r() < 0.5 ? 1 : -1) : 0;
        const rot = sp.rot + ang;
        const fx = Math.sin(sp.rot), fz = Math.cos(sp.rot);
        const sx = sp.x + fx * 13 + Math.cos(sp.rot) * 9, sz = sp.z + fz * 13 - Math.sin(sp.rot) * 9;
        s = { x: sx, z: sz, rot: sp.rot - Math.PI / 2, target: { x: sp.x, z: sp.z, rot, w: m.sub === 'tight' ? 2.35 : 2.8, l: m.sub === 'tight' ? 5.3 : 5.8, y: sp.y, spot: sp, angle: ang } };
      }
    } else if (m.type === 'race' || (m.type === 'time' && d.tracks.length && r() < 0.5 && m.map === 'track')) {
      const tr = d.tracks[Math.floor(r() * d.tracks.length)];
      const pts = this.trackPts(tr);
      const yaw = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      s = { x: pts[0][0], z: pts[0][1], rot: yaw, track: tr, pts };
    } else if (m.type === 'drag') {
      const dr = d.drag;
      s = { x: dr.x - Math.sin(dr.rot) * 4, z: dr.z - Math.cos(dr.rot) * 4, rot: dr.rot, drag: dr };
    } else if (m.type === 'drift') {
      const z = d.driftZone || { x: d.spawn.x, z: d.spawn.z, r: 60 };
      s = { x: z.x, z: z.z, rot: 0, zone: z };
    } else if (m.type === 'speedcam') {
      const cam = d.cams[Math.floor(r() * d.cams.length)];
      const cn = g.nearest(cam.x, cam.z, 100);
      // ~350m uzaktaki düğüm
      const far = this.walkAway(cn, 350, r);
      s = { x: far.x, z: far.z, rot: Math.atan2(cam.x - far.x, cam.z - far.z), cam, camNode: cn };
    } else {
      const nodes = this.nodesFor(r);
      const n = nodes[Math.floor(r() * nodes.length)];
      const l = n.links[0];
      const b = g.nodes[l.to];
      s = { x: n.x, z: n.z, rot: Math.atan2(b.x - n.x, b.z - n.z), node: n };
    }
    s.y = this.world.ground(s.x, s.z).h;
    m._start = s;
    return s;
  }
  walkAway(n, dist, r) {
    const g = this.world.graph;
    let cur = n, prev = null, acc = 0;
    for (let i = 0; i < 400 && acc < dist; i++) {
      const opts = cur.links.filter((l) => !prev || l.to !== prev.id);
      const l = opts.length ? opts[Math.floor(r() * opts.length)] : cur.links[0];
      const nx = g.nodes[l.to];
      acc += Math.hypot(nx.x - cur.x, nx.z - cur.z);
      prev = cur; cur = nx;
    }
    return cur;
  }
  trackPts(tr) {
    let pts = tr.smooth ? catmull(tr.pts.slice(0, -1), tr.closed, 5) : resample(tr.pts, 5);
    return pts;
  }

  // ---------- harita işaretçileri ----------
  refreshMarkers() {
    for (const mk of this.markers) this.group.remove(mk.obj);
    this.markers = [];
    if (this.active) return;
    const p = G.profile;
    const list = MISSIONS.filter((m) => m.map === this.world.d.id && missionUnlocked(m, p));
    for (const m of list) {
      const s = this.startOf(m);
      const done = p.missions[m.id];
      const obj = new THREE.Group();
      const color = done ? '#ffd166' : licenseOk(m, p) ? '#06d6a0' : '#ef476f';
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 12, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 6; obj.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.position.y = 0.2; obj.add(ring);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.iconTexture(MTYPES[m.type].icon, color) }));
      spr.scale.set(2.6, 2.6, 1); spr.position.y = 4; obj.add(spr);
      obj.position.set(s.x, s.y, s.z);
      this.group.add(obj);
      this.markers.push({ m, obj, s, spr });
    }
  }
  nearestMarker(x, z, r = 6) {
    for (const mk of this.markers) if (Math.hypot(mk.s.x - x, mk.s.z - z) < r) return mk;
    return null;
  }

  // ---------- başlatma ----------
  start(m) {
    const game = this.game, p = G.profile;
    if (!licenseOk(m, p)) { game.toast(t('Bu görev için ehliyet gerekli: ') + t(m.license === 'C' ? 'C Sınıfı Ehliyet' : 'Yarış Lisansı'), 'warn'); return false; }
    this.abort(true);
    const s = this.startOf(m);
    const A = { m, s, t: 0, state: 'countdown', cd: 3.5, hits: 0, objs: [], cols: [], data: {}, startDamage: 0, lastCd: 4 };
    this.active = A;
    this.refreshMarkers();
    // görev aracı
    const rental = { taxi: 'sari', tow: 'kanca', cargo: m.tier >= 6 ? 'dev' : 'yuk' }[m.type];
    if (rental) game.useRental(rental);
    if (game.onFoot) game.enterCar(true);
    game.placeCar(s.x, s.z, s.rot, s.y);
    A.startDamage = game.car.damage;
    game.hud.missionPanel(true);
    const setup = this['setup_' + m.type];
    if (setup) setup.call(this, A);
    game.hud.bigText(t(MTYPES[m.type].name), 1.5);
    emit('missionStart', m);
    return true;
  }

  abort(silent) {
    const A = this.active;
    if (!A) return;
    this.cleanup(A);
    this.active = null;
    this.game.hud.missionPanel(false);
    this.game.clearGPS();
    this.game.returnRental();
    if (!silent) { this.game.toast(t('Görev iptal edildi'), 'warn'); }
    this.refreshMarkers();
  }
  cleanup(A) {
    for (const o of A.objs) { this.game.scene.remove(o); if (o.userData.dispose) o.userData.dispose(); }
    for (const c of A.cols) this.world.removeCollider(c);
    if (A.ai) for (const u of A.ai) { this.game.scene.remove(u.m.root); u.m.dispose(); }
    if (A.data.opp) { this.game.scene.remove(A.data.opp.root); A.data.opp.dispose(); }
    this.game.car.launch = false;
  }

  finish(success, stars = 0, extra = '') {
    const A = this.active;
    if (!A) return;
    const m = A.m, game = this.game, p = G.profile;
    this.lastTime = A.t;
    if (m.tournament && success) { this.cleanup(A); this.active = null; game.hud.missionPanel(false); game.clearGPS(); game.returnRental(); this.refreshMarkers(); emit('tournamentEnd', m, A.t, stars); return; }
    this.cleanup(A);
    this.active = null;
    game.hud.missionPanel(false);
    game.clearGPS();
    if (success) {
      stars = clamp(stars, 1, 3);
      const prev = p.missions[m.id] || 0;
      const mult = [1, 1.5, 2.2][stars - 1];
      const firstBonus = prev ? 0.5 : 1;
      const money = Math.round((m.reward * mult * firstBonus) / 10) * 10;
      const xp = Math.round(m.xp * mult * firstBonus);
      const gold = stars === 3 && prev < 3 ? m.gold : 0;
      p.missions[m.id] = Math.max(prev, stars);
      p.stats.missionsDone++;
      if (m.type === 'park') p.stats.parkDone++;
      if (m.type === 'rules') p.stats.rulesDone++;
      if (m.type === 'race' || m.type === 'drag') { p.stats.racesWon++; p.stats.raceDone++; }
      p.stats.stars = Object.values(p.missions).reduce((a, b) => a + b, 0);
      sfx('success');
      game.hud.result({ ok: true, title: t(MISSION[m.id].name), stars, money, xp, gold, extra });
      game.reward(money, gold, xp, null, true);
      game.checkLicenses();
    } else {
      sfx('fail');
      game.hud.result({ ok: false, title: t(m.name), extra, retry: () => this.start(m) });
    }
    game.returnRental();
    emit('missionEnd', m, success, stars);
    game.save();
    this.refreshMarkers();
  }

  onImpact(info) {
    const A = this.active;
    if (!A || A.state !== 'run') return;
    if (info.speed > 1.2) A.hits++;
    if (A.m.type === 'cargo') { A.data.integrity -= info.speed * 4; }
    if (A.m.type === 'rules' && info.speed > 2) this.violation(A, t('Çarpışma'));
    if (A.m.type === 'park') this.game.toast(t('Çarpma! ({n})', { n: A.hits }), 'warn');
  }

  // ---------- güncelleme ----------
  update(dt) {
    const A = this.active;
    for (const mk of this.markers) { mk.spr.position.y = 4 + Math.sin(G.time * 2) * 0.4; mk.obj.children[0].rotation.y += dt; }
    if (!A) return;
    const game = this.game;
    if (A.state === 'countdown') {
      A.cd -= dt;
      game.freezeCar = true;
      const n = Math.ceil(A.cd);
      if (n !== A.lastCd && n <= 3 && n > 0) { game.hud.bigText(String(n), 0.8); sfx('countdown'); }
      A.lastCd = n;
      if (A.cd <= 0) { A.state = 'run'; game.freezeCar = false; game.hud.bigText(t('BAŞLA!'), 0.8); sfx('countdown', { go: true }); if (A.onGo) A.onGo(); }
      if (A.m.type === 'drag') this.dragPre(A, dt);
      return;
    }
    if (A.state !== 'run') return;
    A.t += dt;
    const fn = this['update_' + A.m.type];
    if (fn) fn.call(this, A, dt);
    if (A.limit && A.t > A.limit && this.active === A) this.finish(false, 0, t('Süre doldu!'));
  }

  // ======================= PARK =======================
  setup_park(A) {
    const T = A.s.target, m = A.m;
    A.limit = 75 - m.tier * 3;
    // park çizgileri
    const g = new THREE.Group();
    const lineM = new THREE.MeshBasicMaterial({ color: '#ffd60a' });
    const add = (lx, lz, w, d) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), lineM); q.position.set(lx, 0.14, lz); g.add(q); };
    add(-T.w / 2, 0, 0.15, T.l); add(T.w / 2, 0, 0.15, T.l); add(0, -T.l / 2, T.w, 0.15); add(0, T.l / 2, T.w, 0.15);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(T.w, T.l).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#06d6a0', transparent: true, opacity: 0.18, depthWrite: false }));
    fill.position.y = 0.13; g.add(fill);
    A.data.fill = fill;
    // yardım okları: araç burnunun yönü
    if (G.settings.parkHelp) {
      const arrowM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false });
      const shape = new THREE.Shape(); shape.moveTo(0, 0.9); shape.lineTo(0.6, 0); shape.lineTo(0.22, 0); shape.lineTo(0.22, -0.8); shape.lineTo(-0.22, -0.8); shape.lineTo(-0.22, 0); shape.lineTo(-0.6, 0); shape.closePath();
      const ag = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      const dirSign = this.parkDir(A);
      for (const z of [-1.4, 1.4]) { const a = new THREE.Mesh(ag, arrowM); a.position.set(0, 0.16, z); a.rotation.y = dirSign > 0 ? Math.PI : 0; g.add(a); }
      A.data.help = g;
    }
    g.position.set(T.x, T.y, T.z); g.rotation.y = T.rot;
    this.game.scene.add(g); A.objs.push(g);
    // komşu park etmiş araçlar
    const ids = ['minik', 'doruk', 'kaya', 'serce', 'asil', 'toros'];
    const fx = Math.sin(T.rot), fz = Math.cos(T.rot), rx = Math.cos(T.rot), rz = -Math.sin(T.rot);
    const neighbors = T.parallel ? [[0, T.l / 2 + 2.9], [0, -T.l / 2 - 2.9]] : [[T.w + (m.sub === 'tight' ? 0.05 : 0.2), 0], [-T.w - (m.sub === 'tight' ? 0.05 : 0.2), 0]];
    if (m.tier >= 4 && !T.parallel) neighbors.push([0, T.l + 2.5 + (A.s.target.spot ? 0 : 0)].map((v, i) => (i === 1 ? -(T.l + 1.0) : v)));
    neighbors.forEach(([lx, lz], i) => {
      const e = newCarEntry(ids[(i + m.n) % ids.length]);
      e.cos.paint = ['#adb5bd', '#1d3557', '#e63946', '#f1faee'][(i + m.n) % 4];
      const cm = buildCar(e, { low: true, driver: false });
      const x = T.x + rx * lx + fx * lz, z = T.z + rz * lx + fz * lz;
      const flip = (i + m.n) % 2 ? Math.PI : 0;
      const y = this.world.ground(x, z).h;
      cm.root.position.set(x, y, z); cm.root.rotation.y = T.rot + flip;
      cm.update({ spins: [0, 0, 0, 0], t: 0 }, 0);
      this.game.scene.add(cm.root);
      cm.root.userData.dispose = () => cm.dispose();
      A.objs.push(cm.root);
      A.cols.push(this.world.addCollider({ x, z, hw: cm.d.W / 2, hd: cm.d.L / 2, rot: T.rot, y0: y - 1, y1: y + cm.d.H, tag: 'parked' }));
    });
    // koniler (dar park)
    if (m.sub === 'tight' || m.tier >= 6) {
      for (const s of [-1, 1]) {
        const x = T.x + fx * (T.l / 2 + 0.4) * -1 + rx * s * (T.w / 2 + 0.25), z = T.z + fz * (T.l / 2 + 0.4) * -1 + rz * s * (T.w / 2 + 0.25);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 8), new THREE.MeshStandardMaterial({ color: '#ff6b00' }));
        const y = this.world.ground(x, z).h;
        cone.position.set(x, y + 0.35, z); this.game.scene.add(cone); A.objs.push(cone);
        A.cols.push(this.world.addCollider({ x, z, r: 0.28, y0: y - 1, y1: y + 0.7, tag: 'cone' }));
      }
    }
    A.hold = 0;
    this.game.setGPS(T.x, T.z, true);
  }
  parkDir(A) {
    // +1: araç hedef rot yönüne bakmalı, -1: tersine; 0: farketmez
    const m = A.m;
    if (A.s.target.parallel) return 0;
    if (m.sub === 'reverse') return 1;
    if (m.sub === 'angle' || m.sub === 'tight') return 0;
    return -1;
  }
  update_park(A, dt) {
    const car = this.game.car, T = A.s.target;
    const hw = car.W / 2, hl = car.L / 2;
    const cf = [Math.sin(car.yaw), Math.cos(car.yaw)], cr = [Math.cos(car.yaw), -Math.sin(car.yaw)];
    const bf = [Math.sin(T.rot), Math.cos(T.rot)], br = [Math.cos(T.rot), -Math.sin(T.rot)];
    let inside = true;
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = car.pos.x + cf[0] * hl * a + cr[0] * hw * b - T.x, z = car.pos.z + cf[1] * hl * a + cr[1] * hw * b - T.z;
      const lx = x * br[0] + z * br[1], lz = x * bf[0] + z * bf[1];
      if (Math.abs(lx) > T.w / 2 + 0.08 || Math.abs(lz) > T.l / 2 + 0.08) { inside = false; break; }
    }
    const dir = this.parkDir(A);
    const dyaw = wrapAngle(car.yaw - T.rot);
    let headOk;
    if (dir === 1) headOk = Math.abs(dyaw) < 0.22;
    else if (dir === -1) headOk = Math.abs(wrapAngle(dyaw - Math.PI)) < 0.22;
    else headOk = Math.abs(dyaw) < 0.22 || Math.abs(wrapAngle(dyaw - Math.PI)) < 0.22;
    const ok = inside && headOk;
    A.data.fill.material.color.set(ok ? '#06d6a0' : inside ? '#ffd166' : '#06d6a0');
    A.data.fill.material.opacity = ok ? 0.45 : 0.18;
    if (ok && car.speed < 0.35) A.hold += dt; else A.hold = 0;
    const lines = [t(PARK_SUBS[A.m.sub]), t('Çarpma: {n}/3', { n: A.hits }), ok ? t('Dur ve bekle...') : inside ? t('Yönü düzelt') : t('Park yerine gir')];
    this.game.hud.missionInfo(t(A.m.name), lines, A.limit - A.t, A.hold / 1.0);
    if (A.hits >= 3) return this.finish(false, 0, t('Çok fazla çarptın!'));
    if (A.hold >= 1.0) {
      const stars = A.hits === 0 && A.t < A.limit * 0.55 ? 3 : A.hits <= 1 && A.t < A.limit * 0.85 ? 2 : 1;
      this.finish(true, stars, t('Süre: {s} sn', { s: A.t.toFixed(1) }));
    }
  }

  // ======================= TAKSİ =======================
  setup_taxi(A) {
    const r = this.rng(A.m), g = this.world.graph;
    const start = A.s.node || g.nearest(A.s.x, A.s.z);
    const pick = this.walkAway(start, 80 + r() * 120, r);
    const drop = this.walkAway(pick, 400 + A.m.tier * 60 + r() * 200, r);
    A.data = { pick, drop, phase: 'pickup', board: 0 };
    const h = buildHuman({ gender: r() < 0.5 ? 0 : 1, skin: Math.floor(r() * 6), face: Math.floor(r() * 8), hair: Math.floor(r() * 4), hairColor: Math.floor(r() * 4), shirt: 's' + Math.floor(r() * 4) }, {});
    const off = (pick.width || 10) / 2 + 1;
    h.root.position.set(pick.x + off * 0.7, this.world.ground(pick.x, pick.z).h, pick.z + off * 0.7);
    this.game.scene.add(h.root);
    h.root.userData.dispose = () => h.dispose();
    A.objs.push(h.root);
    A.data.h = h;
    A.limit = 200;
    this.game.setGPS(pick.x, pick.z);
    A.beacon = this.beacon(pick.x, pick.z, '#ffd60a', A);
  }
  update_taxi(A, dt) {
    const car = this.game.car, D = A.data;
    D.h.animate(D.phase === 'pickup' ? 'emote' : 'idle', 0, dt, { id: 'wave', t: A.t });
    if (D.phase === 'pickup') {
      const d = Math.hypot(car.pos.x - D.pick.x, car.pos.z - D.pick.z);
      this.game.hud.missionInfo(t(A.m.name), [t('Yolcuyu al'), t('Mesafe: {d} m', { d: Math.round(d) })], A.limit - A.t);
      if (d < 9 && car.speed < 1.5) {
        D.board += dt;
        if (D.board > 1.2) {
          D.phase = 'deliver'; D.h.root.visible = false; sfx('door');
          const dist = Math.hypot(D.drop.x - D.pick.x, D.drop.z - D.pick.z);
          A.t2 = 0; A.limit = A.t + dist / (9 + A.m.tier * 0.6) * 1.6 + 30;
          A.dmg0 = car.damage;
          this.game.setGPS(D.drop.x, D.drop.z);
          this.moveBeacon(A, D.drop.x, D.drop.z);
          this.game.toast(t('Yolcu bindi! Hedefe götür.'));
        }
      } else D.board = 0;
    } else {
      const d = Math.hypot(car.pos.x - D.drop.x, car.pos.z - D.drop.z);
      const dmg = (car.damage - A.dmg0) * 100;
      this.game.hud.missionInfo(t(A.m.name), [t('Hedefe götür'), t('Mesafe: {d} m', { d: Math.round(d) }), t('Yolcu memnuniyeti: %{p}', { p: Math.max(0, Math.round(100 - dmg * 8 - A.hits * 5)) })], A.limit - A.t);
      if (d < 10 && car.speed < 1.5) {
        const sat = 100 - dmg * 8 - A.hits * 5;
        const stars = sat > 85 && A.limit - A.t > 20 ? 3 : sat > 55 ? 2 : 1;
        this.finish(true, stars, t('Memnuniyet: %{p}', { p: Math.max(0, Math.round(sat)) }));
      }
    }
  }

  // ======================= KARGO =======================
  setup_cargo(A) {
    const r = this.rng(A.m);
    const start = A.s.node || this.world.graph.nearest(A.s.x, A.s.z);
    const drop = this.walkAway(start, 500 + A.m.tier * 50, r);
    A.data = { drop, integrity: 100, latT: 0 };
    const dist = Math.hypot(drop.x - start.x, drop.z - start.z);
    A.limit = dist / (8 + A.m.tier * 0.4) * 1.8 + 60;
    if (this.game.carModel.cargoBoxes) this.game.carModel.cargoBoxes.visible = true;
    this.game.setGPS(drop.x, drop.z);
    this.beacon(drop.x, drop.z, '#4cc9f0', A);
  }
  update_cargo(A, dt) {
    const car = this.game.car, D = A.data;
    const lat = Math.abs(car.yawRate * car.speed);
    if (lat > 6.5) D.integrity -= (lat - 6.5) * 12 * dt;
    if (!car.grounded && car.airTime > 0.4) D.integrity -= 30 * dt;
    if (Math.abs(car.roll) > 0.45) D.integrity -= 60 * dt;
    D.integrity = Math.max(0, D.integrity);
    const d = Math.hypot(car.pos.x - D.drop.x, car.pos.z - D.drop.z);
    this.game.hud.missionInfo(t(A.m.name), [t('Yük sağlamlığı: %{p}', { p: Math.round(D.integrity) }), t('Mesafe: {d} m', { d: Math.round(d) }), lat > 5 ? t('Dikkat! Yük kayıyor!') : ''], A.limit - A.t, D.integrity / 100);
    if (D.integrity <= 0) return this.finish(false, 0, t('Yük devrildi!'));
    if (d < 12 && car.speed < 1.5) this.finish(true, D.integrity > 90 ? 3 : D.integrity > 60 ? 2 : 1, t('Yük sağlamlığı: %{p}', { p: Math.round(D.integrity) }));
  }

  // ======================= ÇEKİCİ =======================
  setup_tow(A) {
    const r = this.rng(A.m), d = this.world.d;
    const start = A.s.node || this.world.graph.nearest(A.s.x, A.s.z);
    const bn = this.walkAway(start, 150 + r() * 200, r);
    const e = newCarEntry(['doruk', 'kivi', 'kaya', 'asil'][A.m.n % 4]);
    e.cos.paint = '#8d99ae';
    const cm = buildCar(e, { low: true, driver: false });
    const y = this.world.ground(bn.x, bn.z).h;
    const yaw = bn.links.length ? Math.atan2(this.world.graph.nodes[bn.links[0].to].x - bn.x, this.world.graph.nodes[bn.links[0].to].z - bn.z) : 0;
    const off = (bn.width || 10) / 2 - 1.4;
    const bx = bn.x - Math.cos(yaw) * off, bz = bn.z + Math.sin(yaw) * off;
    cm.root.position.set(bx, y, bz); cm.root.rotation.y = yaw;
    this.game.scene.add(cm.root);
    cm.root.userData.dispose = () => cm.dispose();
    A.objs.push(cm.root);
    const repair = d.pois.find((p) => p.type === 'repair') || d.pois[0];
    A.data = { cm, pos: new THREE.Vector3(bx, y, bz), yaw, attached: false, repair, L: cm.d.L };
    A.limit = 260 - A.m.tier * 8;
    this.game.setGPS(bx, bz);
    this.beacon(bx, bz, '#fb8500', A);
  }
  update_tow(A, dt) {
    const car = this.game.car, D = A.data;
    D.cm.update({ hazard: true, t: G.time, spins: [0, 0, 0, 0] }, dt);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const hx = car.pos.x - fx * (car.L / 2 + 0.4), hz = car.pos.z - fz * (car.L / 2 + 0.4);
    if (!D.attached) {
      const frontX = D.pos.x + Math.sin(D.yaw) * D.L / 2, frontZ = D.pos.z + Math.cos(D.yaw) * D.L / 2;
      const d = Math.hypot(hx - frontX, hz - frontZ);
      this.game.hud.missionInfo(t(A.m.name), [t('Aracın önüne geri geri yanaş'), t('Kanca mesafesi: {d} m', { d: d.toFixed(1) })], A.limit - A.t);
      if (d < 3.5 && car.speed < 2) {
        D.attached = true; sfx('door');
        this.game.toast(t('Araç bağlandı! Tamirhaneye götür.'));
        this.game.setGPS(D.repair.x, D.repair.z);
        this.moveBeacon(A, D.repair.x, D.repair.z);
      }
    } else {
      // römork kinematiği
      const dx = D.pos.x - hx, dz = D.pos.z - hz, l = Math.hypot(dx, dz) || 1;
      const dist = D.L / 2 + 0.3;
      D.pos.x = hx + (dx / l) * dist; D.pos.z = hz + (dz / l) * dist;
      D.yaw = Math.atan2(-dx, -dz);
      const g = this.world.ground(D.pos.x, D.pos.z, D.pos.y + 1);
      D.pos.y = lerp(D.pos.y, g.h + 0.35, Math.min(1, dt * 8));
      D.cm.root.position.copy(D.pos); D.cm.root.rotation.set(-0.12, D.yaw, 0, 'YXZ');
      // çekilen aracın engellere çarpması
      this.world.collide(D.pos.x, D.pos.z, 0.9, D.pos.y, (nx, nz, depth) => { D.pos.x += nx * depth; D.pos.z += nz * depth; if (car.speed > 3) A.hits++; });
      const d = Math.hypot(D.pos.x - D.repair.x, D.pos.z - D.repair.z);
      this.game.hud.missionInfo(t(A.m.name), [t('Tamirhaneye götür'), t('Mesafe: {d} m', { d: Math.round(d) })], A.limit - A.t);
      if (d < 14 && car.speed < 2) this.finish(true, A.hits === 0 && A.t < A.limit * 0.6 ? 3 : A.hits < 4 ? 2 : 1);
    }
  }

  // ======================= YARIŞ / ZAMANA KARŞI =======================
  setupCheckpoints(A, pts, closed, laps) {
    const step = 12;
    const cps = [];
    for (let i = step; i < pts.length - (closed ? 0 : 1); i += step) cps.push(i);
    if (!closed) cps.push(pts.length - 1); else cps.push(0);
    A.data.pts = pts; A.data.cps = cps; A.data.cpIdx = 0; A.data.lap = 1; A.data.laps = laps; A.data.closed = closed;
    // kapı nesneleri (2 tane gösterilir)
    const mk = () => {
      const g = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: '#4cc9f0', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.35, 6, 32), m);
      ring.position.y = 3; g.add(ring);
      this.game.scene.add(g); A.objs.push(g);
      return g;
    };
    A.data.gates = [mk(), mk()];
    this.placeGates(A);
  }
  placeGates(A) {
    const D = A.data;
    for (let k = 0; k < 2; k++) {
      const ci = D.cpIdx + k;
      const gate = D.gates[k];
      if (ci >= D.cps.length) { gate.visible = D.closed && D.lap < D.laps; if (!gate.visible) continue; }
      const idx = D.cps[ci % D.cps.length];
      const p = D.pts[idx], q = D.pts[(idx + 1) % D.pts.length];
      const y = this.world.ground(p[0], p[1]).h;
      gate.position.set(p[0], y, p[1]);
      gate.rotation.y = Math.atan2(q[0] - p[0], q[1] - p[1]);
      gate.children[0].material.color.set(k === 0 ? (ci === D.cps.length - 1 && D.lap === D.laps ? '#ffd60a' : '#4cc9f0') : '#adb5bd');
      gate.visible = true;
    }
    const idx = D.cps[Math.min(D.cpIdx, D.cps.length - 1)];
    this.game.setGPS(D.pts[idx][0], D.pts[idx][1], true);
  }
  progressCheck(A) {
    const car = this.game.car, D = A.data;
    const idx = D.cps[D.cpIdx];
    const p = D.pts[idx];
    if (Math.hypot(car.pos.x - p[0], car.pos.z - p[1]) < 14) {
      D.cpIdx++;
      sfx('checkpoint');
      if (D.cpIdx >= D.cps.length) {
        if (D.lap >= D.laps) return true;
        D.lap++; D.cpIdx = 0;
        this.game.toast(t('Tur {a}/{b}', { a: D.lap, b: D.laps }));
      }
      this.placeGates(A);
    }
    return false;
  }
  setup_race(A) {
    const m = A.m, s = A.s, game = this.game;
    const pts = s.pts;
    const closed = s.track.closed;
    const laps = closed ? (m.tier >= 8 ? 3 : 2) : 1;
    this.setupCheckpoints(A, pts, closed, laps);
    // rakipler
    const pv = game.car.p.vmax * 3.6;
    const pool = CARS.filter((c) => c.price >= 0 && c.cls !== 'work').sort((a, b) => Math.abs(a.vmax - pv) - Math.abs(b.vmax - pv));
    A.ai = [];
    const yaw = s.rot, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    for (let i = 0; i < 3; i++) {
      const spec = pool[i * 2 + 1] || pool[0];
      const e = newCarEntry(spec.id);
      e.cos.paint = ['#e63946', '#3a86ff', '#ffbe0b'][i];
      const lvl = Math.min(5, Math.floor(m.tier / 2));
      for (const k in e.upgrades) e.upgrades[k] = lvl;
      const v = new Vehicle(e, this.world);
      const row = Math.floor((i + 1) / 2), col = (i + 1) % 2 ? 1 : -1;
      v.place(s.x - fx * (row * 9 + (i === 0 ? 0 : 0)) + rx * col * 3, s.z - fz * (row * 9) + rz * col * 3, yaw);
      const cm = buildCar(e, { low: true, driver: false });
      cm.setGroundY(v.restGroundY);
      game.scene.add(cm.root);
      const ai = new AIDriver(v);
      ai.setPath(pts, closed); ai.nearestIdx();
      ai.skill = 0.82 + m.tier * 0.022;
      ai.useNitro = m.tier >= 5;
      A.ai.push({ v, m: cm, ai, lap: 1, prog: 0, last: 0, done: false });
    }
    // oyuncu 2. sıra solda
    game.placeCar(s.x - fx * 9 - rx * 3, s.z - fz * 9 - rz * 3, yaw);
    A.data.finishOrder = [];
  }
  progressOf(D, x, z, lapHint) {
    // yol üzerindeki en yakın indeks
    const P = D.pts;
    let best = 0, bd = Infinity;
    for (let i = 0; i < P.length; i += 2) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  update_race(A, dt) {
    const D = A.data, game = this.game, car = game.car;
    const done = this.progressCheck(A);
    const N = D.pts.length;
    const myProg = (D.lap - 1) * N + (D.cpIdx > 0 ? D.cps[D.cpIdx - 1] : 0) + 0.5;
    // yapay zekâ ilerlemesi
    let pos = 1;
    for (const u of A.ai) {
      const idx = u.ai.idx;
      if (idx < u.last - N / 2) u.lap++;
      u.last = idx;
      u.prog = (u.lap - 1) * N + idx;
      // lastik bandı
      const gap = u.prog - myProg;
      u.ai.skill = (0.82 + A.m.tier * 0.022) * (gap > 40 ? 0.9 : gap < -40 ? 1.08 : 1);
      if (!u.done && u.lap > D.laps) { u.done = true; D.finishOrder.push(u); }
      if (u.done || u.prog > myProg) pos++;
    }
    D.pos = pos;
    game.hud.missionInfo(t(A.m.name), [t('Sıra: {p}/4', { p: pos }), t('Tur {a}/{b}', { a: Math.min(D.lap, D.laps), b: D.laps }), t('KN: {a}/{b}', { a: D.cpIdx, b: D.cps.length })], null, null, A.t);
    if (done) {
      const place = D.finishOrder.length + 1;
      if (place <= 3) {
        this.saveLeader('race', A.m.id, A.t);
        this.finish(true, 4 - place, t('{p}. oldun! Süre: {s} sn', { p: place, s: A.t.toFixed(2) }));
      } else this.finish(false, 0, t('Son sırada bitirdin.'));
    }
  }
  stepAI(dt) {
    const A = this.active;
    if (!A || !A.ai) return;
    for (const u of A.ai) {
      const inp = A.state === 'run' ? u.ai.update(dt) : { throttle: 0, brake: 1, steer: 0, handbrake: false };
      u.v.step(dt, inp);
    }
    // oyuncu ile yapay zekâ çarpışması (basit daire)
    const car = this.game.car;
    for (const u of A.ai) {
      const dx = u.v.pos.x - car.pos.x, dz = u.v.pos.z - car.pos.z, d = Math.hypot(dx, dz);
      const minD = (car.W + u.v.W) / 2 + 0.4;
      if (d < minD && d > 0.01) {
        const nx = dx / d, nz = dz / d, pen = minD - d;
        car.pos.x -= nx * pen / 2; car.pos.z -= nz * pen / 2; u.v.pos.x += nx * pen / 2; u.v.pos.z += nz * pen / 2;
        const rel = (car.vel.x - u.v.vel.x) * nx + (car.vel.z - u.v.vel.z) * nz;
        if (rel > 0) {
          const j = rel / (1 / car.p.mass + 1 / u.v.p.mass) * 1.2;
          car.applyImpulse(-nx, -nz, j, car.pos.x + nx * car.W / 2, car.pos.z + nz * car.W / 2);
          u.v.applyImpulse(nx, nz, j, u.v.pos.x - nx * u.v.W / 2, u.v.pos.z - nz * u.v.W / 2);
          if (rel > 3) car.registerImpact(rel, 'car');
        }
      }
    }
  }
  renderAI(alpha) {
    const A = this.active;
    if (!A || !A.ai) return;
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const u of A.ai) {
      u.v.interpolate(alpha, p, q);
      u.m.root.position.copy(p); u.m.root.quaternion.copy(q);
      const wy = u.v.wheels.map((w) => -u.v.cgH + u.v.p.R + 0.05 + w.comp - u.v.restGroundY);
      u.m.update({ steer: u.v.steer, spins: u.v.wheels.map((w) => w.spin), wheelY: wy, lights: G.nightF > 0.4, brake: u.v.brake > 0.1, t: G.time }, 1 / 60);
    }
  }

  setup_time(A) {
    const m = A.m, r = this.rng(m), s = A.s;
    let pts, closed = false;
    if (s.pts) { pts = s.pts; closed = s.track.closed; }
    else {
      const g = this.world.graph;
      const start = s.node || g.nearest(s.x, s.z);
      const end = this.walkAway(start, 700 + m.tier * 80, r);
      const path = g.path(start.id, end.id) || [start.id, end.id];
      pts = path.map((id) => [g.nodes[id].x, g.nodes[id].z]);
    }
    this.setupCheckpoints(A, pts, closed, 1);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const vAvg = (this.world.d.id === 'offroad' ? 9 : 13) + m.tier * 1.1;
    A.limit = len / vAvg + 12;
    A.data.len = len;
  }
  update_time(A) {
    const D = A.data;
    this.game.hud.missionInfo(t(A.m.name), [t('KN: {a}/{b}', { a: D.cpIdx, b: D.cps.length })], A.limit - A.t);
    if (this.progressCheck(A)) {
      const left = A.limit - A.t;
      this.finish(true, left > A.limit * 0.25 ? 3 : left > A.limit * 0.1 ? 2 : 1, t('Kalan süre: {s} sn', { s: left.toFixed(1) }));
    }
  }

  // ======================= DRAG =======================
  setup_drag(A) {
    const dr = A.s.drag, m = A.m, game = this.game;
    const fx = Math.sin(dr.rot), fz = Math.cos(dr.rot), rx = -Math.cos(dr.rot), rz = Math.sin(dr.rot);
    game.placeCar(dr.x - rx * 3.2, dr.z - rz * 3.2, dr.rot);
    const opId = ['zipzip', 'asil', 'vizyon', 'yildirim', 'akrep', 'atmaca', 'boga', 'gurzel', 'simsek', 'kobra'][m.tier - 1] || 'puma';
    const e = newCarEntry(opId);
    e.cos.paint = '#e63946';
    const cm = buildCar(e, { low: true, driver: false });
    game.scene.add(cm.root);
    const scale = dr.len / 402;
    const et = (16.5 - m.tier * 0.65) * Math.pow(scale, 0.75);
    A.data = { dr, opp: cm, et, ox: dr.x + rx * 3.2, oz: dr.z + rz * 3.2, fx, fz, start: null, false: false, launchArmed: false, shifts: 0, perfect: 0 };
    cm.root.position.set(A.data.ox, this.world.ground(A.data.ox, A.data.oz).h, A.data.oz); cm.root.rotation.y = dr.rot;
    A.limit = et * 2 + 10;
    game.hud.dragMode(true);
    A.onGo = () => { A.data.start = A.t; };
    game.toast(t('İpucu: Başlamadan önce gaz + fren basılı tut = Launch Control'));
  }
  dragPre(A, dt) {
    const car = this.game.car, inp = this.game.inputState();
    // geri sayımda launch control
    A.data.launchArmed = inp.throttle > 0.5 && inp.brake > 0.5;
    car.launch = A.data.launchArmed || car.launch;
    this.game.hud.dragLights(Math.max(0, 3 - Math.ceil(A.cd)), false);
    this.game.hud.missionInfo(t(A.m.name), [A.data.launchArmed ? t('Launch Control HAZIR') : t('Gaz + fren = Launch Control'), t('Rakip: {s} sn', { s: A.data.et.toFixed(2) })], null);
  }
  update_drag(A, dt) {
    const D = A.data, car = this.game.car, game = this.game;
    const tt = A.t;
    game.hud.dragLights(3, true);
    // rakip
    const s = Math.min(D.dr.len + 30, D.dr.len * Math.pow(tt / D.et, 1.7));
    const ox = D.ox + D.fx * s, oz = D.oz + D.fz * s;
    D.opp.root.position.set(ox, this.world.ground(ox, oz).h, oz);
    D.oppSpin = (D.oppSpin || 0) + 0.5;
    D.opp.update({ spins: [D.oppSpin, D.oppSpin, D.oppSpin, D.oppSpin], t: G.time }, dt);
    if (car.speed > 15) car.launch = false;
    // oyuncu mesafesi
    const px = car.pos.x - (D.dr.x - Math.cos(D.dr.rot) * -3.2), pz = car.pos.z - (D.dr.z + Math.sin(D.dr.rot) * -3.2);
    const dist = (car.pos.x - D.dr.x) * D.fx + (car.pos.z - D.dr.z) * D.fz;
    game.hud.missionInfo(t(A.m.name), [t('Mesafe: {d}/{t} m', { d: Math.max(0, Math.round(dist)), t: D.dr.len }), t('Mükemmel vites: {n}', { n: D.perfect })], null, dist / D.dr.len, tt);
    if (dist >= D.dr.len) {
      const et = tt;
      this.saveLeader('drag', this.world.d.id, et);
      game.hud.dragMode(false);
      if (et < D.et) this.finish(true, et < D.et - 1 ? 3 : et < D.et - 0.4 ? 2 : 1, t('Süren: {a} sn — Rakip: {b} sn', { a: et.toFixed(3), b: D.et.toFixed(3) }));
      else this.finish(false, 0, t('Süren: {a} sn — Rakip: {b} sn', { a: et.toFixed(3), b: D.et.toFixed(3) }));
    }
  }
  onShift(car) {
    const A = this.active;
    if (!A || A.m.type !== 'drag' || A.state !== 'run') return;
    const r = car.rpm / car.p.red;
    if (r > 0.86 && r < 0.98) { A.data.perfect++; this.game.toast(t('Mükemmel vites!'), 'ok'); }
  }

  // ======================= DRIFT =======================
  setup_drift(A) {
    const m = A.m;
    A.limit = 60;
    A.data = { score: 0, target: 2500 + m.tier * 1500, zone: A.s.zone };
    const z = A.s.zone;
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.6, z.r, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff006e', transparent: true, opacity: 0.6, depthWrite: false }));
    ring.position.set(z.x, this.world.ground(z.x, z.z).h + 0.15, z.z);
    this.game.scene.add(ring); A.objs.push(ring);
  }
  addDrift(points) {
    const A = this.active;
    if (!A || A.m.type !== 'drift' || A.state !== 'run') return;
    const car = this.game.car, z = A.data.zone;
    if (Math.hypot(car.pos.x - z.x, car.pos.z - z.z) <= z.r + 5) A.data.score += points;
  }
  update_drift(A) {
    const D = A.data;
    this.game.hud.missionInfo(t(A.m.name), [t('Puan: {a} / {b}', { a: Math.round(D.score), b: D.target })], A.limit - A.t, D.score / D.target);
    if (A.t >= A.limit - 0.05) {
      if (D.score >= D.target) {
        this.saveLeader('drift', this.world.d.id, D.score);
        this.finish(true, D.score >= D.target * 2 ? 3 : D.score >= D.target * 1.5 ? 2 : 1, t('Drift puanı: {a}', { a: Math.round(D.score) }));
      } else this.finish(false, 0, t('Drift puanı: {a}', { a: Math.round(D.score) }));
    }
  }

  // ======================= HIZ KAMERASI =======================
  setup_speedcam(A) {
    const cam = A.s.cam, m = A.m;
    const vmax = this.game.car.p.vmax * 3.6;
    A.data = { cam, target: Math.round(Math.min(cam.limit + 25 + m.tier * 8, vmax * 0.82) / 5) * 5, passed: false };
    A.limit = 75;
    const g = this.world.graph;
    this.game.setGPS(cam.x, cam.z);
    this.beacon(cam.x, cam.z, '#f72585', A);
  }
  update_speedcam(A) {
    const car = this.game.car, D = A.data;
    const d = Math.hypot(car.pos.x - D.cam.x, car.pos.z - D.cam.z);
    this.game.hud.missionInfo(t(A.m.name), [t('Hedef hız: {v}', { v: D.target }), t('Kameraya: {d} m', { d: Math.round(d) })], A.limit - A.t);
    if (d < 16) {
      const v = car.kmh;
      sfx('shutter');
      this.game.flash();
      if (v >= D.target) this.finish(true, v >= D.target + 30 ? 3 : v >= D.target + 15 ? 2 : 1, t('Ölçülen hız: {v}', { v: Math.round(v) }));
      else this.finish(false, 0, t('Ölçülen hız: {v} (hedef {t})', { v: Math.round(v), t: D.target }));
    }
  }

  // ======================= TRAFİK KURALLARI =======================
  setup_rules(A) {
    const r = this.rng(A.m), g = this.world.graph, s = A.s;
    const start = s.node || g.nearest(s.x, s.z);
    const end = this.walkAway(start, 500 + A.m.tier * 40, r);
    const path = g.path(start.id, end.id) || [start.id, end.id];
    // dönüş noktaları
    const turns = [];
    for (let i = 2; i < path.length - 2; i++) {
      const a = g.nodes[path[i - 2]], b = g.nodes[path[i]], c = g.nodes[path[i + 2]];
      if (b.links.length < 3) continue;
      const a1 = Math.atan2(b.x - a.x, b.z - a.z), a2 = Math.atan2(c.x - b.x, c.z - b.z);
      const tr = wrapAngle(a2 - a1);
      if (Math.abs(tr) > 0.7) turns.push({ node: b, dir: tr > 0 ? -1 : 1, done: false });
    }
    A.data = { end, turns, viol: 0, speedT: 0, lastViol: -10, lights: new Map(), path };
    A.limit = 240;
    this.game.setGPS(end.x, end.z);
    this.beacon(end.x, end.z, '#06d6a0', A);
  }
  violation(A, why) {
    if (A.t - A.data.lastViol < 1.5) return;
    A.data.lastViol = A.t;
    A.data.viol++;
    sfx('fail');
    this.game.toast(t('İhlal: ') + why + ` (${A.data.viol}/3)`, 'warn');
    if (A.data.viol >= 3) this.finish(false, 0, t('Çok fazla kural ihlali!'));
  }
  update_rules(A, dt) {
    const car = this.game.car, D = A.data, game = this.game, w = this.world;
    if (!this.active) return;
    // hız sınırı
    const node = w.graph.nearest(car.pos.x, car.pos.z, 30);
    const limit = node ? node.limit : 50;
    if (car.kmh > limit + 10) { D.speedT += dt; if (D.speedT > 1.5) { D.speedT = 0; this.violation(A, t('Hız sınırı ({l})', { l: limit })); } } else D.speedT = 0;
    // kırmızı ışık
    for (const L of w.d.lights) {
      const d = Math.hypot(car.pos.x - L.x, car.pos.z - L.z);
      const st = D.lights.get(L) || { inside: false };
      const ins = d < L.s / 2 + 1;
      if (ins && !st.inside && car.speed > 2) {
        const axis = Math.abs(Math.sin(car.yaw)) > Math.abs(Math.cos(car.yaw)) ? 'EW' : 'NS';
        if (w.lightAt(L, axis) === 'r') this.violation(A, t('Kırmızı ışık'));
      }
      st.inside = ins; D.lights.set(L, st);
    }
    // sinyal
    for (const tn of D.turns) {
      if (tn.done) continue;
      if (Math.hypot(car.pos.x - tn.node.x, car.pos.z - tn.node.z) < 7) {
        tn.done = true;
        const ok = (tn.dir === -1 && game.signalOk('L')) || (tn.dir === 1 && game.signalOk('R'));
        if (!ok) this.violation(A, t('Sinyal vermedin'));
        else game.toast(t('Doğru sinyal ✓'), 'ok');
      }
    }
    // sonraki dönüş ipucu
    const nextTurn = D.turns.find((x) => !x.done);
    const dEnd = Math.hypot(car.pos.x - D.end.x, car.pos.z - D.end.z);
    game.hud.missionInfo(t(A.m.name), [t('İhlal: {n}/3', { n: D.viol }), t('Hız sınırı: {l}', { l: limit }), nextTurn ? (Math.hypot(car.pos.x - nextTurn.node.x, car.pos.z - nextTurn.node.z) < 60 ? (nextTurn.dir < 0 ? t('Sola dönüş: sinyal ver (Q)') : t('Sağa dönüş: sinyal ver (E)')) : '') : '', t('Hedef: {d} m', { d: Math.round(dEnd) })], A.limit - A.t);
    if (dEnd < 10 && car.speed < 1.5 && this.active) this.finish(true, 3 - D.viol);
  }

  // ---------- yardımcılar ----------
  beacon(x, z, color, A) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 30; g.add(beam);
    g.position.set(x, this.world.ground(x, z).h, z);
    this.game.scene.add(g); A.objs.push(g);
    A.data.beacon = g;
    return g;
  }
  moveBeacon(A, x, z) { if (A.data.beacon) A.data.beacon.position.set(x, this.world.ground(x, z).h, z); }
  saveLeader(kind, key, val) {
    const lb = G.profile.leaderboard;
    if (kind === 'race') { (lb.race[key] ||= []).push(val); lb.race[key].sort((a, b) => a - b); lb.race[key] = lb.race[key].slice(0, 10); }
    else { lb[kind].push({ v: val, map: key, d: Date.now() }); lb[kind].sort((a, b) => (kind === 'drag' ? a.v - b.v : b.v - a.v)); lb[kind] = lb[kind].slice(0, 10); }
  }
}

export { MISSIONS, MISSION, MTYPES, missionDesc };
