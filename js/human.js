// Oyuncu karakteri ve yayalar: düşük poligon insan modeli + prosedürel animasyon
import * as THREE from 'three';
import { CLOTHES, SKIN_TONES, HAIR_COLORS } from './data/content.js';
import * as TX from './world/textures.js';

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const findCloth = (cat, id) => CLOTHES[cat].find((c) => c.id === id) || CLOTHES[cat][0];

export function buildHuman(ch = {}, o = {}) {
  const root = new THREE.Group();
  const female = ch.gender === 1;
  const skin = typeof ch.skin === 'number' ? SKIN_TONES[ch.skin] : ch.skin || SKIN_TONES[1];
  const hairC = typeof ch.hairColor === 'number' ? HAIR_COLORS[ch.hairColor] : ch.hairColor || '#222';
  const shirt = o.shirtColor || findCloth('shirt', ch.shirt).color;
  const jacket = findCloth('jacket', ch.jacket || 'j0').color;
  const pants = o.pantsColor || findCloth('pants', ch.pants || 'p0').color;
  const shoes = findCloth('shoes', ch.shoes || 'f0').color;
  const hat = findCloth('hat', ch.hat || 'h0');
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const skinM = M(skin), shirtM = M(jacket || shirt), pantsM = M(pants), shoeM = M(shoes), hairM = M(hairC);
  const sc = female ? 0.95 : 1;
  const hips = new THREE.Group(); hips.position.y = 0.95 * sc; root.add(hips);
  const torso = box(female ? 0.4 : 0.46, 0.6, 0.25, shirtM); torso.position.y = 0.32; hips.add(torso);
  if (jacket) { const inner = box(0.2, 0.55, 0.02, M(shirt)); inner.position.set(0, 0.32, 0.13); hips.add(inner); }
  const neck = new THREE.Group(); neck.position.y = 0.66; hips.add(neck);
  const headM = [skinM, skinM, hairM, skinM, new THREE.MeshStandardMaterial({ map: TX.faceTexture(ch.face || 0, skin), roughness: 0.8 }), skinM];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.27), headM); head.position.y = 0.17; neck.add(head);
  // saç
  const hs = ch.hair ?? 0;
  if (hs !== 4) {
    const top = box(0.28, 0.08, 0.29, hairM); top.position.y = 0.33; neck.add(top);
    const back = box(0.28, hs === 1 || hs === 3 ? 0.4 : 0.2, 0.06, hairM); back.position.set(0, hs === 1 ? 0.12 : 0.24, -0.13); neck.add(back);
    if (hs === 2) { for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), hairM); c.position.set(-0.12 + (i % 3) * 0.12, 0.36, -0.08 + Math.floor(i / 3) * 0.12); neck.add(c); } }
    if (hs === 3) { const tail = box(0.07, 0.3, 0.07, hairM); tail.position.set(0, 0.1, -0.2); tail.rotation.x = 0.4; neck.add(tail); }
    if (hs === 5) { top.visible = false; const mo = box(0.06, 0.14, 0.3, hairM); mo.position.y = 0.37; neck.add(mo); }
    if (hs === 1) { for (const sx of [-1, 1]) { const sd = box(0.04, 0.3, 0.2, hairM); sd.position.set(0.14 * sx, 0.12, -0.04); neck.add(sd); } }
  }
  // sakal
  if (ch.beard) {
    if (ch.beard === 1) { const m = box(0.14, 0.03, 0.02, hairM); m.position.set(0, 0.1, 0.14); neck.add(m); }
    if (ch.beard === 2) { const m = box(0.08, 0.08, 0.03, hairM); m.position.set(0, 0.02, 0.14); neck.add(m); }
    if (ch.beard === 3) { const m = box(0.27, 0.13, 0.05, hairM); m.position.set(0, 0.06, 0.12); neck.add(m); }
  }
  if (ch.glasses) {
    const gm = new THREE.MeshStandardMaterial({ color: ch.glasses === 2 ? '#111' : ch.glasses === 3 ? '#e63946' : '#333', metalness: 0.5, roughness: 0.3 });
    const g = box(0.27, ch.glasses === 3 ? 0.05 : 0.07, 0.02, gm); g.position.set(0, 0.2, 0.145); neck.add(g);
  }
  if (hat.type) {
    const hm = M(hat.color);
    if (hat.type === 'cap') { const c = box(0.29, 0.1, 0.3, hm); c.position.y = 0.36; neck.add(c); const v = box(0.24, 0.02, 0.15, hm); v.position.set(0, 0.32, 0.2); neck.add(v); }
    if (hat.type === 'beanie') { const c = box(0.3, 0.16, 0.3, hm); c.position.y = 0.36; neck.add(c); }
    if (hat.type === 'fedora') { const b = box(0.44, 0.02, 0.44, hm); b.position.y = 0.33; neck.add(b); const c = box(0.26, 0.14, 0.26, hm); c.position.y = 0.41; neck.add(c); }
    if (hat.type === 'crown') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd700', metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide })); c.position.y = 0.4; neck.add(c); }
  }
  // kollar ve bacaklar (omuz/kalça pivotu)
  const limb = (parent, x, y, w, len, m, m2) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); parent.add(pivot);
    const upper = box(w, len * 0.5, w, m); upper.position.y = -len * 0.25; pivot.add(upper);
    const knee = new THREE.Group(); knee.position.y = -len * 0.5; pivot.add(knee);
    const lower = box(w * 0.9, len * 0.5, w * 0.9, m2 || m); lower.position.y = -len * 0.25; knee.add(lower);
    return { pivot, knee, lower };
  };
  const armL = limb(hips, 0.29, 0.6, 0.11, 0.62, shirtM, skinM);
  const armR = limb(hips, -0.29, 0.6, 0.11, 0.62, shirtM, skinM);
  const legL = limb(hips, 0.11, 0, 0.15, 0.92, pantsM);
  const legR = limb(hips, -0.11, 0, 0.15, 0.92, pantsM);
  for (const lg of [legL, legR]) { const sh = box(0.16, 0.08, 0.26, shoeM); sh.position.set(0, -0.46, 0.04); lg.knee.add(sh); }
  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  // isim etiketi
  let tag = null;
  if (o.name) {
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.textTexture(o.name, { size: 30, stroke: '#000', w: 256, h: 48 }), depthTest: false }));
    tag.scale.set(1.6, 0.3, 1); tag.position.y = 2.15; tag.renderOrder = 10;
    root.add(tag);
  }
  let bubble = null;
  let phase = 0;
  const api = {
    root, hips, neck, armL, armR, legL, legR, tag,
    // anim: idle | walk | run | jump | emote:<id> | sit
    animate(state, speed, dt, emote) {
      phase += dt * (state === 'run' ? 11 : 7) * Math.max(0.4, Math.min(1.5, speed / (state === 'run' ? 5.5 : 2)));
      const s = Math.sin(phase);
      let la = 0, ra = 0, ll = 0, rl = 0, lk = 0, rk = 0, bob = 0, armSideL = 0, armSideR = 0, hipRot = 0, lean = 0, headTilt = 0;
      if (state === 'walk' || state === 'run') {
        const a = state === 'run' ? 0.9 : 0.5;
        la = -s * a; ra = s * a; ll = s * a * 0.9; rl = -s * a * 0.9;
        lk = Math.max(0, -s) * a; rk = Math.max(0, s) * a;
        bob = Math.abs(Math.cos(phase)) * (state === 'run' ? 0.08 : 0.03);
        lean = state === 'run' ? 0.15 : 0.03;
        if (state === 'run') { armL.knee.rotation.x = -1.2; armR.knee.rotation.x = -1.2; } else { armL.knee.rotation.x = -0.2; armR.knee.rotation.x = -0.2; }
      } else if (state === 'jump') {
        la = -2.6; ra = -2.6; ll = 0.6; rl = -0.2; lk = 1.0; rk = 0.6;
      } else if (state === 'emote') {
        const t = emote.t;
        armL.knee.rotation.x = 0; armR.knee.rotation.x = 0;
        switch (emote.id) {
          case 'wave': ra = -2.8; armSideR = -0.3 + Math.sin(t * 10) * 0.4; break;
          case 'dance': la = -2.5 + Math.sin(t * 8) * 0.6; ra = -2.5 - Math.sin(t * 8) * 0.6; hipRot = Math.sin(t * 4) * 0.5; ll = Math.sin(t * 8) * 0.4; rl = -ll; bob = Math.abs(Math.sin(t * 8)) * 0.08; break;
          case 'clap': la = -1.3; ra = -1.3; armSideL = -0.6 + Math.abs(Math.sin(t * 12)) * 0.5; armSideR = 0.6 - Math.abs(Math.sin(t * 12)) * 0.5; break;
          case 'salute': ra = -2.2; armSideR = 0.9; armR.knee.rotation.x = -1.9; break;
          case 'cheer': la = -3; ra = -3; bob = Math.abs(Math.sin(t * 6)) * 0.25; break;
          case 'think': ra = -1.0; armR.knee.rotation.x = -2.2; armSideR = 0.5; headTilt = 0.25; break;
          case 'laugh': lean = -0.25 + Math.sin(t * 14) * 0.05; la = -0.3; ra = -0.3; break;
          case 'point': ra = -1.55; break;
          case 'sit': ll = -1.5; rl = -1.5; lk = 1.5; rk = 1.5; bob = -0.45; la = -0.4; ra = -0.4; break;
          case 'flex': la = -1.6; ra = -1.6; armSideL = 1.2; armSideR = -1.2; armL.knee.rotation.x = -1.8; armR.knee.rotation.x = -1.8; break;
        }
      } else {
        // boşta: nefes
        bob = Math.sin(phase * 0.3) * 0.01; la = 0.05; ra = 0.05;
        armL.knee.rotation.x = -0.1; armR.knee.rotation.x = -0.1;
      }
      armL.pivot.rotation.x = la; armR.pivot.rotation.x = ra;
      armL.pivot.rotation.z = 0.08 + armSideL; armR.pivot.rotation.z = -0.08 + armSideR;
      legL.pivot.rotation.x = ll; legR.pivot.rotation.x = rl;
      legL.knee.rotation.x = lk; legR.knee.rotation.x = rk;
      hips.position.y = 0.95 * sc + bob;
      hips.rotation.y = hipRot; hips.rotation.x = lean;
      neck.rotation.z = headTilt;
      if (bubble) {
        bubble.t -= dt;
        bubble.spr.position.y = 2.5 + (1.5 - bubble.t) * 0.2;
        bubble.spr.material.opacity = Math.min(1, bubble.t);
        if (bubble.t <= 0) { root.remove(bubble.spr); bubble.spr.material.dispose(); bubble = null; }
      }
    },
    say(emoji) {
      if (bubble) { root.remove(bubble.spr); bubble.spr.material.dispose(); }
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.iconTexture(emoji, '#ffffff'), transparent: true, depthTest: false }));
      spr.scale.set(0.8, 0.8, 1); spr.position.y = 2.5; spr.renderOrder = 11;
      root.add(spr);
      bubble = { spr, t: 2.5 };
    },
    dispose() { root.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); } }); },
  };
  api.animate('idle', 0, 0.016);
  return api;
}
