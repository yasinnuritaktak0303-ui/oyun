// Hızlı geometri biriktirici (birleştirilmiş statik mesh'ler için)
import * as THREE from 'three';

const _c = new THREE.Color();
export class Geo {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.vc = 0; }
  get empty() { return this.vc === 0; }
  quad(a, b, c, d, n, uv, col) {
    // a,b,c,d: [x,y,z] saat yönünün tersine
    const base = this.vc;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(n[0], n[1], n[2]);
    this.u.push(...uv);
    _c.set(col);
    for (let k = 0; k < 4; k++) this.c.push(_c.r, _c.g, _c.b);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vc += 4;
  }
  // Y ekseni etrafında döndürülmüş kutu. uvs: metre başına ölçek
  box(cx, y0, cz, w, h, d, rot, col, o = {}) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (lx, ly, lz) => [cx + lx * cr + lz * sr, y0 + ly, cz - lx * sr + lz * cr];
    const N = (lx, ly, lz) => [lx * cr + lz * sr, ly, -lx * sr + lz * cr];
    const hw = w / 2, hd = d / 2;
    const us = o.us ?? 1 / 8, vs = o.vs ?? 1 / 8;
    const top = o.topUV || [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
    const yb = o.y0rel || 0;
    const sides = [
      // ön (+z)
      [T(-hw, yb, hd), T(hw, yb, hd), T(hw, h, hd), T(-hw, h, hd), N(0, 0, 1), w],
      // arka (-z)
      [T(hw, yb, -hd), T(-hw, yb, -hd), T(-hw, h, -hd), T(hw, h, -hd), N(0, 0, -1), w],
      // sağ (+x)
      [T(hw, yb, hd), T(hw, yb, -hd), T(hw, h, -hd), T(hw, h, hd), N(1, 0, 0), d],
      // sol (-x)
      [T(-hw, yb, -hd), T(-hw, yb, hd), T(-hw, h, hd), T(-hw, h, -hd), N(-1, 0, 0), d],
    ];
    const col2 = o.sideCol || col;
    for (const s of sides) {
      const L = s[5];
      const uv = o.stretch ? [0, 0, 1, 0, 1, 1, 0, 1] : [0, yb * vs, L * us, yb * vs, L * us, h * vs, 0, h * vs];
      this.quad(s[0], s[1], s[2], s[3], s[4], uv, col2);
    }
    if (!o.noTop) this.quad(T(-hw, h, hd), T(hw, h, hd), T(hw, h, -hd), T(-hw, h, -hd), [0, 1, 0], top, o.topCol || col);
    if (o.bottom) this.quad(T(-hw, yb, -hd), T(hw, yb, -hd), T(hw, yb, hd), T(-hw, yb, hd), [0, -1, 0], top, col);
  }
  // Eğimli kutu (rampa): uzunluk boyunca y0 -> y1
  wedge(cx, cz, rot, len, w, ya, yb, col, thick = 0.4) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (lx, y, lz) => [cx + lx * cr + lz * sr, y, cz - lx * sr + lz * cr];
    const hw = w / 2, hl = len / 2;
    const s = (yb - ya) / len, nl = Math.hypot(1, s);
    const nn = [(-s * sr) / nl, 1 / nl, (-s * cr) / nl];
    this.quad(T(-hw, ya, -hl), T(-hw, yb, hl), T(hw, yb, hl), T(hw, ya, -hl), nn, [0, 0, 0, len / 4, w / 4, len / 4, w / 4, 0], col);
    const base = Math.min(ya, yb) - thick;
    // yanlar
    this.quad(T(hw, base, -hl), T(hw, ya, -hl), T(hw, yb, hl), T(hw, base, hl), [cr, 0, -sr], [0, 0, 0, 0, 0, 0, 0, 0], col);
    this.quad(T(-hw, base, hl), T(-hw, yb, hl), T(-hw, ya, -hl), T(-hw, base, -hl), [-cr, 0, sr], [0, 0, 0, 0, 0, 0, 0, 0], col);
    // uç
    this.quad(T(hw, base, hl), T(hw, yb, hl), T(-hw, yb, hl), T(-hw, base, hl), [sr, 0, cr], [0, 0, 0, 0, 0, 0, 0, 0], col);
    this.quad(T(-hw, base, -hl), T(-hw, ya, -hl), T(hw, ya, -hl), T(hw, base, -hl), [-sr, 0, -cr], [0, 0, 0, 0, 0, 0, 0, 0], col);
  }
  flat(cx, y, cz, w, d, rot, col, uvScale = 0) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (lx, lz) => [cx + lx * cr + lz * sr, y, cz - lx * sr + lz * cr];
    const hw = w / 2, hd = d / 2;
    const uv = uvScale ? [0, 0, w * uvScale, 0, w * uvScale, d * uvScale, 0, d * uvScale] : [0, 0, 1, 0, 1, 1, 0, 1];
    this.quad(T(-hw, hd), T(hw, hd), T(hw, -hd), T(-hw, -hd), [0, 1, 0], uv, col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.vc > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Bir geometriye düz renk özniteliği ekle (instancing / birleştirme için)
export function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
