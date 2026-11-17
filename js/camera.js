// Kamera kontrolü: araç (5 mod), yaya, drone ve foto modu
import * as THREE from 'three';
import { G, clamp, lerp, wrapAngle } from './core.js';

export const CAM_NAMES = ['Yakın arka', 'Uzak arka', 'Kokpit', 'Kaput üstü', 'Üstten (park)'];

export class CameraCtl {
  constructor(camera, dom) {
    this.cam = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3(0, 10, -10);
    this.look = new THREE.Vector3();
    this.yawOff = 0; this.pitchOff = 0.25; this.dist = 6;
    this.footYaw = 0; this.footPitch = 0.3;
    this.shakeT = 0; this.shakeAmp = 0;
    this.drone = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.3 };
    this.photo = { yaw: 0, pitch: 0.2, dist: 7, target: new THREE.Vector3(), fov: 55, roll: 0 };
    this.dragging = false; this.lastDrag = 0;
    this.initPointer(dom);
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  initPointer(dom) {
    let last = null, id = null;
    const start = (x, y, i) => { last = [x, y]; id = i; this.dragging = true; };
    const move = (x, y) => {
      if (!last) return;
      const dx = (x - last[0]) / 200, dy = (y - last[1]) / 200;
      last = [x, y];
      if (G.mode === 'photo') { this.photo.yaw -= dx * 1.5; this.photo.pitch = clamp(this.photo.pitch + dy, -0.4, 1.4); }
      else if (G.mode === 'drone') { this.drone.yaw -= dx * 1.5; this.drone.pitch = clamp(this.drone.pitch - dy, -1.4, 1.4); }
      else { this.yawOff -= dx * 1.6; this.pitchOff = clamp(this.pitchOff + dy * (G.settings.invertCam ? -1 : 1), -0.2, 1.2); this.lastDrag = performance.now(); }
    };
    const end = () => { last = null; id = null; this.dragging = false; };
    dom.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) start(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', end);
    dom.addEventListener('touchstart', (e) => { const tc = e.changedTouches[0]; if (id === null) start(tc.clientX, tc.clientY, tc.identifier); }, { passive: true });
    dom.addEventListener('touchmove', (e) => { for (const tc of e.changedTouches) if (tc.identifier === id) move(tc.clientX, tc.clientY); }, { passive: true });
    dom.addEventListener('touchend', (e) => { for (const tc of e.changedTouches) if (tc.identifier === id) end(); });
    dom.addEventListener('wheel', (e) => {
      if (G.mode === 'photo') this.photo.dist = clamp(this.photo.dist + e.deltaY * 0.01, 2, 40);
      else this.dist = clamp(this.dist + e.deltaY * 0.005, 3.5, 14);
    }, { passive: true });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  next() { this.mode = (this.mode + 1) % 5; this.yawOff = 0; return this.mode; }
  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a); this.shakeT = 0.4; }

  // araç kamerası
  car(dt, pos, quat, v, model, lookBack, look) {
    const cam = this.cam;
    const yaw = v.yaw;
    if (look && (Math.abs(look.x) > 0.1 || Math.abs(look.y) > 0.1)) { this.yawOff -= look.x * dt * 2.5; this.pitchOff = clamp(this.pitchOff + look.y * dt * 1.5, -0.2, 1.2); this.lastDrag = performance.now(); }
    // bir süre sonra kamera arkaya döner
    if (!this.dragging && performance.now() - this.lastDrag > 1500) { this.yawOff *= Math.exp(-dt * 2.5); this.pitchOff = lerp(this.pitchOff, 0.25, 1 - Math.exp(-dt * 2)); }
    const spd = v.speed;
    let fov = 60 + clamp(spd * 3.6 - 60, 0, 240) * 0.07 + (v.nitroOn ? 8 : 0);
    const back = lookBack ? Math.PI : 0;
    if (this.mode === 0 || this.mode === 1) {
      const far = this.mode === 1;
      const dist = (far ? 10.5 : 6.6) * (v.L / 4.4) ** 0.7 + (this.dist - 6) * 0.6;
      const height = (far ? 3.6 : 2.2) * (v.H / 1.4) ** 0.6;
      // hareket yönüne doğru hafif kayan kamera
      const velYaw = spd > 3 && v.fwdSpeed > 0 ? Math.atan2(v.vel.x, v.vel.z) : yaw;
      const blend = wrapAngle(velYaw - yaw) * 0.35;
      this.smYaw = this.smYaw === undefined ? yaw : this.smYaw + wrapAngle(yaw + blend - this.smYaw) * (1 - Math.exp(-dt * 6));
      const a = this.smYaw + this.yawOff + back;
      const pd = this.pitchOff;
      const tx = pos.x - Math.sin(a) * dist * Math.cos(pd * 0.6), tz = pos.z - Math.cos(a) * dist * Math.cos(pd * 0.6);
      const ty = pos.y + height + Math.sin(pd) * dist * 0.7;
      const k = 1 - Math.exp(-dt * 12);
      this.pos.x = lerp(this.pos.x, tx, k); this.pos.z = lerp(this.pos.z, tz, k);
      this.pos.y = lerp(this.pos.y, ty, 1 - Math.exp(-dt * 6));
      // yere girmesin
      const gh = G.world ? G.world.ground(this.pos.x, this.pos.z, this.pos.y).h : 0;
      if (this.pos.y < gh + 0.6) this.pos.y = gh + 0.6;
      cam.position.copy(this.pos);
      this.look.set(pos.x + Math.sin(this.smYaw) * 1.5, pos.y + 1.05 * (v.H / 1.4), pos.z + Math.cos(this.smYaw) * 1.5);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      if (model) model.showCockpit(false);
    } else if (this.mode === 2 || this.mode === 3) {
      let eye;
      if (this.mode === 2 && model && model.cockpit) eye = model.cockpit.eye.clone();
      else eye = new THREE.Vector3(0, v.H * (model && model.belt ? 0.85 : 0.9), (model ? model.zWs : 0.5) + 0.3);
      if (this.mode === 3) eye.y = (model ? model.belt : 1) + 0.25 - v.restGroundY * 0;
      if (model) eye.y += model.model.position.y;
      eye.applyQuaternion(quat).add(pos);
      cam.position.copy(eye);
      const fwd = new THREE.Vector3(Math.sin(this.yawOff + back) * 1, -0.08 + this.pitchOff * 0.3 - 0.075, Math.cos(this.yawOff + back)).applyQuaternion(quat);
      this.look.copy(eye).add(fwd);
      cam.up.set(0, 1, 0).applyQuaternion(quat);
      cam.lookAt(this.look);
      fov = this.mode === 2 ? 70 : 72 + clamp(spd * 3.6 - 60, 0, 240) * 0.05;
      if (model) model.showCockpit(this.mode === 2);
      this.pos.copy(cam.position);
    } else {
      // üstten park kamerası
      const h = 14 + v.L;
      cam.position.set(pos.x - Math.sin(yaw) * 2, pos.y + h, pos.z - Math.cos(yaw) * 2);
      cam.up.set(Math.sin(yaw), 0, Math.cos(yaw));
      cam.lookAt(pos.x, pos.y, pos.z);
      fov = 55;
      if (model) model.showCockpit(false);
      this.pos.copy(cam.position);
    }
    this.applyShake(dt);
    cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 4));
    cam.updateProjectionMatrix();
  }
  foot(dt, pos, look) {
    const cam = this.cam;
    if (look) { this.yawOff -= look.x * dt * 2.5; this.pitchOff = clamp(this.pitchOff + look.y * dt * 1.5, -0.2, 1.2); }
    const a = this.footYaw + this.yawOff;
    const d = 4.2;
    const tx = pos.x - Math.sin(a) * d * Math.cos(this.pitchOff), tz = pos.z - Math.cos(a) * d * Math.cos(this.pitchOff);
    const ty = pos.y + 1.7 + Math.sin(this.pitchOff) * d;
    const k = 1 - Math.exp(-dt * 10);
    this.pos.set(lerp(this.pos.x, tx, k), lerp(this.pos.y, ty, k), lerp(this.pos.z, tz, k));
    const gh = G.world ? G.world.ground(this.pos.x, this.pos.z, this.pos.y).h : 0;
    if (this.pos.y < gh + 0.4) this.pos.y = gh + 0.4;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(pos.x, pos.y + 1.4, pos.z);
    cam.fov = lerp(cam.fov, 60, 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix();
    this.applyShake(dt);
  }
  // yaya yön referansı (kamera açısı)
  get viewYaw() { return Math.atan2(this.look.x - this.cam.position.x, this.look.z - this.cam.position.z); }
  startDrone(from) { this.drone.pos.copy(from).add(new THREE.Vector3(0, 6, 0)); this.drone.yaw = Math.atan2(this.look.x - from.x, this.look.z - from.z); this.drone.pitch = -0.3; }
  droneUpdate(dt, inp) {
    const d = this.drone, cam = this.cam;
    d.yaw -= inp.lookX * dt * 2; d.pitch = clamp(d.pitch - inp.lookY * dt * 1.5, -1.4, 1.4);
    const sp = (inp.run ? 60 : 20) * dt;
    const fx = Math.sin(d.yaw) * Math.cos(d.pitch), fy = Math.sin(d.pitch), fz = Math.cos(d.yaw) * Math.cos(d.pitch);
    const rx = -Math.cos(d.yaw), rz = Math.sin(d.yaw);
    d.pos.x += (fx * inp.moveY + rx * inp.moveX) * sp; d.pos.z += (fz * inp.moveY + rz * inp.moveX) * sp; d.pos.y += fy * inp.moveY * sp;
    if (inp.up) d.pos.y += sp; if (inp.down) d.pos.y -= sp;
    const gh = G.world.ground(d.pos.x, d.pos.z).h;
    d.pos.y = clamp(d.pos.y, gh + 1, gh + 300);
    const half = G.world.d.half - 10;
    d.pos.x = clamp(d.pos.x, -half, half); d.pos.z = clamp(d.pos.z, -half, half);
    cam.position.copy(d.pos); cam.up.set(0, 1, 0);
    cam.lookAt(d.pos.x + fx, d.pos.y + fy, d.pos.z + fz);
    cam.fov = 65; cam.updateProjectionMatrix();
  }
  startPhoto(target) { this.photo.target.copy(target); this.photo.yaw = Math.atan2(this.cam.position.x - target.x, this.cam.position.z - target.z); this.photo.dist = Math.max(4, this.cam.position.distanceTo(target)); this.photo.pitch = 0.25; this.photo.fov = this.cam.fov; this.photo.roll = 0; }
  photoUpdate(dt, inp) {
    const p = this.photo, cam = this.cam;
    p.yaw -= inp.moveX * dt * 1.5 + inp.lookX * dt * 2; p.pitch = clamp(p.pitch + inp.moveY * dt + inp.lookY * dt, -0.4, 1.4);
    const x = p.target.x + Math.sin(p.yaw) * p.dist * Math.cos(p.pitch), z = p.target.z + Math.cos(p.yaw) * p.dist * Math.cos(p.pitch);
    let y = p.target.y + 0.8 + Math.sin(p.pitch) * p.dist;
    const gh = G.world.ground(x, z).h;
    y = Math.max(y, gh + 0.3);
    cam.position.set(x, y, z);
    cam.up.set(Math.sin(p.roll) * Math.cos(p.yaw + Math.PI / 2) * 0, 1, 0);
    cam.lookAt(p.target.x, p.target.y + 0.8, p.target.z);
    cam.rotateZ(p.roll);
    cam.fov = p.fov; cam.updateProjectionMatrix();
  }
  applyShake(dt) {
    if (this.shakeT <= 0) return;
    this.shakeT -= dt;
    const a = this.shakeAmp * (this.shakeT / 0.4);
    this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; this.cam.position.z += (Math.random() - 0.5) * a;
    if (this.shakeT <= 0) this.shakeAmp = 0;
  }
}
