// Para sandıkları, anahtarlar, elmas sandık ve "Sandık Avı" etkinliği
import * as THREE from 'three';
import { G, rand, randi, vibrate, weekKey, seeded } from './core.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

export const TIERS = [
  { name: 'Bronz', color: '#cd7f32', min: 500, max: 1500, xp: 20 },
  { name: 'Gümüş', color: '#c0c0c0', min: 2000, max: 5000, xp: 40 },
  { name: 'Altın', color: '#ffd700', min: 10000, max: 25000, xp: 100 },
  { name: 'Elmas', color: '#7df9ff', min: 50000, max: 100000, xp: 300 },
];
const RESPAWN = 10 * 60 * 1000;

export function isHoliday(d = new Date()) { return d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6); }

function chestMesh(tier, gift) {
  const g = new THREE.Group();
  const T = TIERS[tier];
  const col = gift ? ['#e63946', '#2a9d8f', '#3a86ff', '#7209b7'][tier] : T.color;
  const bodyM = new THREE.MeshStandardMaterial({ color: gift ? col : '#6b4423', roughness: 0.7 });
  const trimM = new THREE.MeshStandardMaterial({ color: gift ? '#ffd166' : col, metalness: 0.8, roughness: 0.25, emissive: new THREE.Color(col), emissiveIntensity: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.75), bodyM); base.position.y = 0.3; g.add(base);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.79), trimM); band.position.y = 0.55; g.add(band);
  const lidP = new THREE.Group(); lidP.position.set(0, 0.6, -0.375); g.add(lidP);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.75), bodyM); lid.position.set(0, 0.15, 0.375); lidP.add(lid);
  const lidT = new THREE.Mesh(new THREE.BoxGeometry(gift ? 0.15 : 1.14, 0.32, gift ? 0.79 : 0.1), trimM); lidT.position.set(0, 0.15, 0.375); lidP.add(lidT);
  if (gift) { const bow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 6, 12), trimM); bow.position.set(0, 0.35, 0.375); lidP.add(bow); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), trimM); lock.position.set(0, 0.5, 0.39); g.add(lock);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  glow.position.y = 3.5; g.add(glow);
  g.traverse((o) => { if (o.isMesh && o !== glow) o.castShadow = true; });
  return { g, lidP, glow };
}
function keyMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#7df9ff', metalness: 0.9, roughness: 0.2, emissive: new THREE.Color('#00bbf9'), emissiveIntensity: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), m); ring.position.y = 0.35; g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), m); shaft.position.y = -0.1; g.add(shaft);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), m); tooth.position.set(0.08, -0.32, 0); g.add(tooth);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  glow.position.y = 2.5; g.add(glow);
  return g;
}

export class Chests {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.keys = [];
    this.diamond = null;
    this.hunt = [];
    this.huntUntil = 0;
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }
  get mapId() { return this.game.world.d.id; }
  build() {
    const d = this.game.world.d;
    const gift = isHoliday();
    d.chests.forEach((c, i) => {
      const id = this.mapId + ':' + i;
      const m = chestMesh(c.tier, gift);
      m.g.position.set(c.x, c.y + 0.02, c.z);
      this.group.add(m.g);
      this.list.push({ id, ...c, mesh: m, opening: 0 });
    });
    d.keys.forEach((k, i) => {
      const g = keyMesh();
      g.position.set(k.x, k.y + 1.2, k.z);
      this.group.add(g);
      this.keys.push({ i, ...k, mesh: g });
    });
    if (d.diamond) {
      const m = chestMesh(3, gift);
      m.g.scale.setScalar(1.4);
      m.g.position.set(d.diamond.x, d.diamond.y + 0.02, d.diamond.z);
      this.group.add(m.g);
      this.diamond = { id: this.mapId + ':D', tier: 3, ...d.diamond, mesh: m, opening: 0 };
    }
    this.refresh();
  }
  isOpen(c) {
    const ts = G.profile.chestsOpened[c.id];
    return ts && Date.now() - ts < RESPAWN;
  }
  keysHave() { return (G.profile.keys[this.mapId] || []).length; }
  refresh() {
    for (const c of this.list) c.mesh.g.visible = !this.isOpen(c) || c.opening > 0;
    const have = G.profile.keys[this.mapId] || [];
    for (const k of this.keys) k.mesh.visible = !have.includes(k.i) && !this.keyCooldown();
    if (this.diamond) this.diamond.mesh.g.visible = !this.isOpen(this.diamond) || this.diamond.opening > 0;
  }
  keyCooldown() {
    const ts = G.profile.chestsOpened[this.mapId + ':D'];
    return ts && Date.now() - ts < RESPAWN;
  }
  // haftalık sandık avı
  huntActive() { return Date.now() < this.huntUntil; }
  autoHuntTime() { const d = new Date(); return d.getDay() === 6 && d.getHours() === 20 && d.getMinutes() < 15; }
  canStartHunt() { return G.profile.chestHuntWeek !== weekKey(); }
  startHunt(auto) {
    if (!auto) G.profile.chestHuntWeek = weekKey();
    this.huntUntil = Date.now() + 15 * 60 * 1000;
    this.spawnHunt();
    this.game.toast(t('🎁 SANDIK AVI BAŞLADI! 15 dakika boyunca 3 kat sandık!'), 'gold');
  }
  spawnHunt() {
    for (const h of this.hunt) this.group.remove(h.mesh.g);
    this.hunt = [];
    const g = this.game.world.graph;
    const r = seeded(Date.now() & 0xffff);
    const n = this.list.length * 2;
    const gift = isHoliday();
    for (let i = 0; i < n && g.nodes.length; i++) {
      const node = g.nodes[Math.floor(r() * g.nodes.length)];
      const off = (node.width || 10) / 2 + 2;
      const x = node.x + (r() < 0.5 ? off : -off), z = node.z + (r() - 0.5) * 6;
      const tier = r() < 0.75 ? 0 : r() < 0.9 ? 1 : 2;
      const y = this.game.world.ground(x, z).h;
      const m = chestMesh(tier, gift);
      m.g.position.set(x, y + 0.02, z);
      this.group.add(m.g);
      this.hunt.push({ id: 'hunt' + i, tier, x, y, z, mesh: m, opening: 0, hunt: true });
    }
  }
  all() { return this.list.concat(this.hunt, this.diamond ? [this.diamond] : []); }

  update(dt, px, py, pz, inCar) {
    if (!this.huntActive() && this.autoHuntTime() && !this._autoDone) { this._autoDone = true; this.startHunt(true); }
    if (this.hunt.length && !this.huntActive()) { for (const h of this.hunt) this.group.remove(h.mesh.g); this.hunt = []; this.game.toast(t('Sandık avı sona erdi.')); }
    this._rt = (this._rt || 0) - dt;
    if (this._rt <= 0) { this._rt = 2; this.refresh(); }
    const R = inCar ? 3.2 : 1.8;
    for (const c of this.all()) {
      const m = c.mesh;
      if (!m.g.visible) continue;
      m.glow.rotation.y += dt;
      if (c.opening > 0) {
        c.opening -= dt;
        m.lidP.rotation.x = -Math.min(1.9, (1.6 - c.opening) * 4);
        if (c.opening <= 0) { m.lidP.rotation.x = 0; m.g.visible = !c.hunt && !this.isOpen(c); if (c.hunt) { this.group.remove(m.g); this.hunt.splice(this.hunt.indexOf(c), 1); } }
        continue;
      }
      m.g.rotation.y += dt * 0.5;
      const dx = c.x - px, dz = c.z - pz, dy = c.y - py;
      if (dx * dx + dz * dz < R * R && Math.abs(dy) < 3.5) this.open(c);
    }
    for (const k of this.keys) {
      if (!k.mesh.visible) continue;
      k.mesh.rotation.y += dt * 2;
      k.mesh.position.y = k.y + 1.2 + Math.sin(G.time * 3 + k.i) * 0.2;
      if (Math.hypot(k.x - px, k.z - pz) < R + 0.5 && Math.abs(k.y - py) < 4) this.takeKey(k);
    }
  }
  open(c) {
    const p = G.profile;
    if (c.tier === 3 && this.keysHave() < 3) {
      if (!this._lockMsg || G.time - this._lockMsg > 4) { this._lockMsg = G.time; this.game.toast(t('🔒 Elmas sandık kilitli! Anahtarlar: {n}/3', { n: this.keysHave() }), 'warn'); }
      return;
    }
    const T = TIERS[c.tier];
    const money = Math.round(rand(T.min, T.max) / 50) * 50;
    const gold = c.tier === 3 ? randi(5, 15) : c.tier === 2 && Math.random() < 0.3 ? 1 : 0;
    c.opening = 1.6;
    if (!c.hunt) p.chestsOpened[c.id] = Date.now();
    if (c.tier === 3) p.keys[this.mapId] = [];
    p.stats.chests++;
    if (c.tier === 2) { p.stats.goldChests++; if (!c.hunt && !p.goldFound.includes(c.id)) p.goldFound.push(c.id); }
    if (c.tier === 3) p.stats.diamondChests++;
    sfx('chest');
    vibrate([30, 40, 60]);
    this.game.effects.spark(c.x, c.y + 0.8, c.z, 0, 0, 20);
    this.game.reward(money, gold, T.xp, t('{t} sandık', { t: t(T.name) }));
    this.game.hud.bigText(`${t(T.name)} ${t('sandık')}! +${money.toLocaleString('tr-TR')}`, 1.6, T.color);
    this.game.save();
    this.game.checkSecretCars();
  }
  takeKey(k) {
    const p = G.profile;
    const arr = (p.keys[this.mapId] ||= []);
    if (!arr.includes(k.i)) arr.push(k.i);
    k.mesh.visible = false;
    sfx('key'); vibrate(40);
    this.game.toast(t('🔑 Anahtar bulundu! {n}/3', { n: arr.length }), 'gold');
    this.game.save();
  }
  // mini harita için yakındaki sandıklar
  nearby(x, z, r) {
    const out = [];
    for (const c of this.all()) if (c.mesh.g.visible && c.opening <= 0 && Math.hypot(c.x - x, c.z - z) < r) out.push(c);
    for (const k of this.keys) if (k.mesh.visible && Math.hypot(k.x - x, k.z - z) < r) out.push({ ...k, key: true });
    return out;
  }
  totalGold() { let n = 0; for (const id of ['city', 'highway', 'mountain', 'offroad', 'island', 'track', 'airport']) n += 0; return n; }
  clear() { this.game.scene.remove(this.group); }
}
