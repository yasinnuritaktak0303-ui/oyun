// Görsel efektler: lastik izi, duman, kıvılcım, egzoz alevi (havuzlu parçacıklar)
import * as THREE from 'three';
import { G } from './core.js';
import * as TX from './world/textures.js';

class Particles {
  constructor(max, tex, blending = THREE.NormalBlending) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, size, life, r, gC, b, grow = 1, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.grav[i] = grav;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gC; this.col[i * 3 + 2] = b;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const drag = 1 - 1.5 * dt;
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.max(0, k) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true; a.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

class Skids {
  constructor(max = 1200) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const idx = [];
    for (let i = 0; i < max; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05,0.05,0.05, vA*0.55); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.geo = g;
    this.next = 0;
    this.last = [null, null, null, null];
    this.dirty = false;
  }
  add(wi, x, y, z, nx, nz, w, strength) {
    const L = this.last[wi];
    if (L && Math.hypot(x - L[0], z - L[2]) < 0.25) return;
    if (L && Math.hypot(x - L[0], z - L[2]) < 3) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const p = this.pos, b = i * 12;
      p[b] = L[0] - L[3] * w; p[b + 1] = L[1]; p[b + 2] = L[2] - L[4] * w;
      p[b + 3] = L[0] + L[3] * w; p[b + 4] = L[1]; p[b + 5] = L[2] + L[4] * w;
      p[b + 6] = x + nx * w; p[b + 7] = y; p[b + 8] = z + nz * w;
      p[b + 9] = x - nx * w; p[b + 10] = y; p[b + 11] = z - nz * w;
      for (let k = 0; k < 4; k++) this.alpha[i * 4 + k] = strength;
      this.dirty = true;
    }
    this.last[wi] = [x, y, z, nx, nz];
  }
  lift(wi) { this.last[wi] = null; }
  update(dt) {
    // izler yavaşça solar
    for (let i = 0; i < this.alpha.length; i++) if (this.alpha[i] > 0) this.alpha[i] = Math.max(0, this.alpha[i] - dt * 0.012);
    this.geo.attributes.alpha.needsUpdate = true;
    if (this.dirty) { this.geo.attributes.position.needsUpdate = true; this.dirty = false; }
  }
  clear() { this.alpha.fill(0); this.pos.fill(0); this.geo.attributes.position.needsUpdate = true; this.last = [null, null, null, null]; }
}

export class Effects {
  constructor(scene) {
    this.smoke = new Particles(600, TX.smokeTexture());
    this.sparks = new Particles(300, TX.radialTexture('#ffffff'), THREE.AdditiveBlending);
    this.fire = new Particles(200, TX.radialTexture('#ffffff', 0.1), THREE.AdditiveBlending);
    this.splash = new Particles(200, TX.smokeTexture());
    this.skids = new Skids();
    for (const o of [this.skids.mesh, this.smoke.points, this.sparks.points, this.fire.points, this.splash.points]) scene.add(o);
  }
  get q() { return G.settings.particles; }
  tireSmoke(x, y, z, amount, color = [0.85, 0.85, 0.85]) {
    if (Math.random() > amount * this.q) return;
    this.smoke.emit(x + (Math.random() - 0.5) * 0.4, y + 0.2, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5, 1.2, 1.6 + Math.random(), ...color, 2.2, -0.2);
  }
  dust(x, y, z, amount, color) {
    if (Math.random() > amount * this.q) return;
    this.smoke.emit(x, y + 0.2, z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 2, 1.0, 1.2, ...color, 2.5, -0.1);
  }
  spark(x, y, z, vx, vz, n = 6) {
    for (let i = 0; i < n * this.q; i++) this.sparks.emit(x, y, z, vx * 0.3 + (Math.random() - 0.5) * 6, 2 + Math.random() * 4, vz * 0.3 + (Math.random() - 0.5) * 6, 0.18, 0.35 + Math.random() * 0.3, 1, 0.75, 0.3, -0.2, 14);
  }
  flame(x, y, z, dx, dz, big) {
    for (let i = 0; i < (big ? 3 : 2); i++) this.fire.emit(x, y, z, dx * (6 + Math.random() * 4), (Math.random() - 0.3) * 0.6, dz * (6 + Math.random() * 4), big ? 0.55 : 0.35, 0.12 + Math.random() * 0.08, 0.4 + Math.random() * 0.2, 0.55, 1.0, -1.5);
  }
  backfire(x, y, z, dx, dz) {
    for (let i = 0; i < 8; i++) this.fire.emit(x, y, z, dx * (4 + Math.random() * 5) + (Math.random() - 0.5) * 2, Math.random(), dz * (4 + Math.random() * 5) + (Math.random() - 0.5) * 2, 0.5, 0.12 + Math.random() * 0.1, 1, 0.55, 0.15, 1);
  }
  waterSplash(x, y, z) {
    for (let i = 0; i < 3 * this.q; i++) this.splash.emit(x, y, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.8, 0.8, 0.8, 0.9, 1, 1, 9);
  }
  update(dt) {
    this.smoke.update(dt); this.sparks.update(dt); this.fire.update(dt); this.splash.update(dt); this.skids.update(dt);
  }
  clear() { this.smoke.clear(); this.sparks.clear(); this.fire.clear(); this.splash.clear(); this.skids.clear(); }
}
