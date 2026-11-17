// Yol ağı grafiği: trafik yapay zekâsı ve GPS için
export class RoadGraph {
  constructor(data) {
    this.nodes = []; // {x,z,y,links:[{to, road}], light}
    this.map = new Map();
    const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    const addNode = (x, z, y, road) => {
      const k = key(x, z);
      let id = this.map.get(k);
      if (id === undefined) {
        id = this.nodes.length;
        this.nodes.push({ id, x, z, y, links: [], width: road.width, lanes: road.lanes, limit: road.limit, traffic: road.traffic });
        this.map.set(k, id);
      }
      return id;
    };
    const link = (a, b, road) => {
      if (a === b) return;
      const na = this.nodes[a];
      if (!na.links.some((l) => l.to === b)) na.links.push({ to: b, road });
      const nb = this.nodes[b];
      if (!nb.links.some((l) => l.to === a)) nb.links.push({ to: a, road });
    };
    for (const r of data.roads) {
      let prev = -1;
      for (let i = 0; i < r.pts.length; i++) {
        const id = addNode(r.pts[i][0], r.pts[i][1], r.ys[i], r);
        if (prev >= 0) link(prev, id, r);
        prev = id;
      }
      r.nodeStart = this.map.get(key(r.pts[0][0], r.pts[0][1]));
      r.nodeEnd = this.map.get(key(r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1]));
    }
    // uç noktaları en yakın diğer yol noktasına bağla
    this.buildGrid();
    for (const r of data.roads) {
      for (const nid of [r.nodeStart, r.nodeEnd]) {
        const n = this.nodes[nid];
        if (n.links.length > 1 && !r.closed) {
          // zaten bağlı olabilir
        }
        let best = -1, bd = 9;
        for (const m of this.near(n.x, n.z, 9)) {
          if (m.id === nid || n.links.some((l) => l.to === m.id)) continue;
          // aynı yolun komşularını atla
          const d = Math.hypot(m.x - n.x, m.z - n.z);
          if (d < bd && !this.sameRoadNear(nid, m.id)) { bd = d; best = m.id; }
        }
        if (best >= 0) link(nid, best, r);
      }
    }
  }
  sameRoadNear(a, b) {
    // a'dan 3 adımda b'ye ulaşılıyorsa zaten bağlıdır
    const seen = new Set([a]);
    let frontier = [a];
    for (let d = 0; d < 3; d++) {
      const nf = [];
      for (const f of frontier) for (const l of this.nodes[f].links) if (!seen.has(l.to)) { if (l.to === b) return true; seen.add(l.to); nf.push(l.to); }
      frontier = nf;
    }
    return false;
  }
  buildGrid() {
    this.cell = 20;
    this.grid = new Map();
    for (const n of this.nodes) {
      const k = Math.floor(n.x / this.cell) + ',' + Math.floor(n.z / this.cell);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(n);
    }
  }
  near(x, z, r) {
    const out = [];
    const c = this.cell;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = this.grid.get(i + ',' + j);
      if (l) for (const n of l) if ((n.x - x) ** 2 + (n.z - z) ** 2 <= r * r) out.push(n);
    }
    return out;
  }
  nearest(x, z, maxR = 400) {
    for (let r = 20; r <= maxR; r *= 2) {
      let best = null, bd = Infinity;
      for (const n of this.near(x, z, r)) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
      if (best) return best;
    }
    return null;
  }
  // A* yol bulma
  path(fromId, toId) {
    if (fromId === toId) return [fromId];
    const N = this.nodes;
    const g = new Map([[fromId, 0]]);
    const came = new Map();
    const t = N[toId];
    const h = (n) => Math.hypot(n.x - t.x, n.z - t.z);
    const open = [[h(N[fromId]), fromId]];
    const closed = new Set();
    let iter = 0;
    while (open.length && iter++ < 30000) {
      // en küçüğü bul (ikili yığın)
      const cur = heapPop(open)[1];
      if (cur === toId) {
        const out = [cur];
        let c = cur;
        while (came.has(c)) { c = came.get(c); out.push(c); }
        return out.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const gc = g.get(cur);
      const nc = N[cur];
      for (const l of nc.links) {
        const nn = N[l.to];
        const ng = gc + Math.hypot(nn.x - nc.x, nn.z - nc.z);
        if (ng < (g.get(l.to) ?? Infinity)) {
          g.set(l.to, ng); came.set(l.to, cur);
          heapPush(open, [ng + h(nn), l.to]);
        }
      }
    }
    return null;
  }
}

function heapPush(h, v) {
  h.push(v);
  let i = h.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  return top;
}
