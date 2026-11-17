// Görüntü hattı: gökyüzünden ortam yansıması (PMREM), bloom, SMAA, renk derecelendirme + vinyet
import * as THREE from 'three';
import { G } from './core.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, saturation: { value: 1.12 }, contrast: { value: 1.06 }, tint: { value: new THREE.Color(1, 1, 1) }, time: { value: 0 }, grain: { value: 0.025 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float saturation; uniform float contrast; uniform vec3 tint; uniform float time; uniform float grain; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb *= tint;
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vignette * dot(d, d) * 2.2;
      c.rgb += (rnd(vUv * 731.0) - 0.5) * grain;
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a); }`,
};

export class RenderPipe {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // ortam sahnesi: gökyüzü + koyu zemin
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3c4038' }));
    this.envGround.position.y = -8;
    this.envScene.add(this.envGround);
    this.envRT = null;
    this.lastEnv = { dir: new THREE.Vector3(0, -2, 0), weather: '', t: -99 };
    this.build();
  }
  get quality() { const s = G.settings; return s.batterySaver ? 0 : ['verylow', 'low', 'medium', 'high', 'ultra'].indexOf(s.preset); }
  build() {
    const q = this.quality;
    this.enabled = q >= 2;
    if (this.composer) { this.composer.dispose?.(); }
    if (!this.enabled) { this.composer = null; this.r.toneMapping = THREE.ACESFilmicToneMapping; return; }
    const size = this.r.getSize(new THREE.Vector2());
    const comp = new EffectComposer(this.r);
    comp.setPixelRatio(this.r.getPixelRatio());
    comp.setSize(size.x, size.y);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.6, 0.86);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    comp.addPass(this.grade);
    if (q >= 3 && !G.settings.aa) { this.smaa = new SMAAPass(size.x * this.r.getPixelRatio(), size.y * this.r.getPixelRatio()); comp.addPass(this.smaa); } else this.smaa = null;
    this.composer = comp;
  }
  setSize(w, h) {
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(w, h); }
  }
  updateEnv(sunDir, night, weather, horizon) {
    if (!G.settings || G.settings.reflections === 0) { if (this.scene.environment) this.scene.environment = null; return; }
    const L = this.lastEnv;
    const now = performance.now() / 1000;
    if (L.dir.distanceTo(sunDir) < 0.04 && L.weather === weather && this.envRT) return;
    if (now - L.t < 2 && this.envRT) return;
    L.dir.copy(sunDir); L.weather = weather; L.t = now;
    const u = this.envSky.material.uniforms;
    u.sunPosition.value.copy(sunDir);
    const bad = weather !== 'sunny';
    u.turbidity.value = bad ? 14 : 4; u.rayleigh.value = bad ? 0.6 : 1.8; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.envGround.material.color.copy(horizon || new THREE.Color('#556')).multiplyScalar(0.35 * (1 - night * 0.8));
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = Math.max(0.08, 1 - night * 0.9) * (bad ? 0.7 : 1);
    if (old) old.dispose();
  }
  render(dt, night, speedFx) {
    if (!this.composer) { this.r.render(this.scene, this.camera); return; }
    this.bloom.strength = 0.3 + night * 0.38;
    this.bloom.threshold = 0.92 - night * 0.25;
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
    this.grade.uniforms.vignette.value = 0.28 + (speedFx || 0) * 0.25;
    this.grade.uniforms.saturation.value = G.weather === 'sunny' ? 1.12 : 0.92;
    const tn = this.grade.uniforms.tint.value;
    if (night > 0.5) tn.setRGB(0.92, 0.96, 1.08); else if (G.weather !== 'sunny') tn.setRGB(0.97, 0.99, 1.03); else tn.setRGB(1.03, 1.0, 0.96);
    this.composer.render(dt);
  }
}
