// Menü önizleme sahnesi: araç/karakter 360° döndürülerek gösterilir
import * as THREE from 'three';
import { G, clamp } from '../core.js';
import { buildCar } from '../carModel.js';
import { buildHuman } from '../human.js';

export class Stage {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#141a2e');
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.yaw = 0.6; this.pitch = 0.18; this.dist = 9; this.autoRot = true;
    const hemi = new THREE.HemisphereLight('#ffffff', '#334', 1.2);
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(5, 8, 6);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
    const rim = new THREE.DirectionalLight('#7aa2ff', 1.6); rim.position.set(-6, 3, -6);
    this.scene.add(hemi, key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1f2740', roughness: 0.35, metalness: 0.4 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4cc9f0' }));
    ring.position.y = 0.01; this.scene.add(ring);
    // arka duvar ışık şeritleri
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, 6, 0.15), new THREE.MeshBasicMaterial({ color: i % 2 ? '#7209b7' : '#4cc9f0' }));
      const a = (i / 9) * Math.PI * 2;
      s.position.set(Math.cos(a) * 14, 3, Math.sin(a) * 14);
      this.scene.add(s);
    }
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.obj = null;
    this.target = new THREE.Vector3(0, 0.7, 0);
    this.dom = renderer.domElement;
    this.initDrag();
  }
  initDrag() {
    let last = null;
    const down = (x, y) => { if (G.mode !== 'menu') return; last = [x, y]; this.autoRot = false; };
    const move = (x, y) => { if (!last) return; this.yaw -= (x - last[0]) / 150; this.pitch = clamp(this.pitch + (y - last[1]) / 300, -0.05, 0.9); last = [x, y]; };
    const up = () => { last = null; clearTimeout(this._ar); this._ar = setTimeout(() => (this.autoRot = true), 4000); };
    this.dom.addEventListener('mousedown', (e) => down(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);
    this.dom.addEventListener('touchstart', (e) => down(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    this.dom.addEventListener('touchmove', (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    this.dom.addEventListener('touchend', up);
    this.dom.addEventListener('wheel', (e) => { if (G.mode === 'menu') this.dist = clamp(this.dist + e.deltaY * 0.01, 3, 16); }, { passive: true });
  }
  clear() {
    if (this.obj) { this.holder.remove(this.obj.root); this.obj.dispose(); this.obj = null; }
  }
  showCar(entry) {
    this.clear();
    const m = buildCar(entry, { driver: false });
    m.update({ spins: [0, 0, 0, 0], t: 0, lights: true }, 0);
    m.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.holder.add(m.root);
    this.obj = m;
    this.target.set(0, m.d.H * 0.45, 0);
    this.dist = m.d.L * 2.1 + 2.5;
    return m;
  }
  showHuman(ch, name) {
    this.clear();
    const h = buildHuman(ch, { name });
    this.holder.add(h.root);
    this.obj = h;
    this.target.set(0, 1.1, 0);
    this.dist = 4.2;
    this.human = h;
    return h;
  }
  render(dt, viewport) {
    if (this.autoRot) this.yaw += dt * 0.25;
    if (this.human && this.obj === this.human) this.human.animate(this.emote ? 'emote' : 'idle', 0, dt, this.emote);
    if (this.emote) { this.emote.t += dt; if (this.emote.t > 3) this.emote = null; }
    if (this.obj && this.obj.update && this.obj.wheels) this.obj.update({ spins: [0, 0, 0, 0], t: performance.now() / 1000, lights: true }, dt);
    const c = this.cam;
    const x = Math.sin(this.yaw) * this.dist * Math.cos(this.pitch), z = Math.cos(this.yaw) * this.dist * Math.cos(this.pitch);
    c.position.set(x + this.target.x, this.target.y + Math.sin(this.pitch) * this.dist + 0.3, z + this.target.z);
    c.lookAt(this.target);
    const w = innerWidth, h = innerHeight;
    // menü sağ tarafta önizleme; mobil dikeyde üstte
    c.aspect = w / h;
    c.setViewOffset(w, h, viewport ? viewport.ox : 0, viewport ? viewport.oy || 0 : 0, w, h);
    c.updateProjectionMatrix();
    this.r.shadowMap.enabled = true;
    this.r.render(this.scene, c);
  }
}
