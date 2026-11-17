// Oyun içi arayüz: göstergeler, mini harita, tam harita, bildirimler, görev paneli
import { G, clamp, $, el, fmt } from './core.js';
import { t, speedVal, speedUnit, fmtNum } from './i18n.js';
import { POI_ICONS } from './world/world.js';
import { SURF } from './world/builder.js';
import { MTYPES } from './data/missions.js';
import { MAP } from './data/content.js';
import { sfx } from './audio.js';

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.mapImg = null;
    this.build();
  }
  build() {
    const r = this.root;
    r.innerHTML = '';
    this.top = el('div', { class: 'hud-top' },
      el('div', { class: 'hud-money' }, el('span', { class: 'coin' }, '💰'), el('b', { id: 'hMoney' }, '0')),
      el('div', { class: 'hud-gold' }, el('span', { class: 'coin' }, '🪙'), el('b', { id: 'hGold' }, '0')),
      el('div', { class: 'hud-level' }, el('span', { id: 'hLevel' }, 'Lv 1'), el('div', { class: 'xpbar' }, el('i', { id: 'hXp' }))),
      el('button', { class: 'hud-btn', id: 'hPause', onclick: () => this.game.action('pause') }, '⏸'),
      el('button', { class: 'hud-btn', id: 'hMapBtn', onclick: () => this.game.action('map') }, '🗺'),
    );
    this.mini = el('canvas', { class: 'minimap', width: 220, height: 220 });
    this.miniWrap = el('div', { class: 'minimap-wrap', onclick: () => this.game.action('map') }, this.mini, el('div', { class: 'mini-n' }, 'N'), el('div', { class: 'mini-speedlimit', id: 'hLimit' }, '50'));
    this.gauge = el('canvas', { class: 'gauge', width: 260, height: 260 });
    this.gaugeWrap = el('div', { class: 'gauge-wrap' }, this.gauge,
      el('div', { class: 'g-speed' }, el('b', { id: 'hSpeed' }, '0'), el('small', { id: 'hUnit' }, 'km/s')),
      el('div', { class: 'g-gear', id: 'hGear' }, 'N'),
      el('div', { class: 'g-bars' },
        el('div', { class: 'bar nitro' }, el('i', { id: 'hNitro' }), el('span', {}, 'N₂O')),
        el('div', { class: 'bar fuel' }, el('i', { id: 'hFuel' }), el('span', {}, '⛽')),
        el('div', { class: 'bar dmg' }, el('i', { id: 'hDmg' }), el('span', {}, '🔧')),
      ),
      el('div', { class: 'g-icons', id: 'hIcons' }),
    );
    this.toasts = el('div', { class: 'toasts' });
    this.pops = el('div', { class: 'pops' });
    this.big = el('div', { class: 'bigtext' });
    this.prompt = el('div', { class: 'prompt hidden' });
    this.mission = el('div', { class: 'mission-panel hidden' });
    this.drift = el('div', { class: 'drift-score hidden' });
    this.police = el('div', { class: 'police-bar hidden' });
    this.saveIcon = el('div', { class: 'save-icon' }, '💾');
    this.fps = el('div', { class: 'fps hidden' });
    this.recover = el('button', { class: 'recover-btn hidden', onclick: () => this.game.recoverCar() }, '🛟 ' + t('Aracı Kurtar'));
    this.dragL = el('div', { class: 'drag-lights hidden' }, el('i'), el('i'), el('i'), el('i', { class: 'g' }));
    this.shiftBar = el('div', { class: 'shift-bar hidden' }, el('i', { id: 'hShift' }), el('b', {}));
    this.rearFrame = el('div', { class: 'rear-frame hidden' }, el('span', {}, t('Geri görüş')));
    this.flashEl = el('div', { class: 'flash' });
    this.rain = el('canvas', { class: 'rain-overlay hidden' });
    this.speedFx = el('div', { class: 'speed-fx' });
    this.radioEl = el('div', { class: 'radio-ind hidden' });
    this.missionTimer = el('div', { class: 'mission-timer hidden' });
    r.append(this.speedFx, this.rain, this.top, this.miniWrap, this.gaugeWrap, this.toasts, this.pops, this.big, this.prompt, this.mission, this.missionTimer, this.drift, this.police, this.saveIcon, this.fps, this.recover, this.dragL, this.shiftBar, this.rearFrame, this.flashEl, this.radioEl);
    this.prompt.addEventListener('click', () => this.game.action('interact'));
    this.initRain();
  }
  setUnits() { $('#hUnit').textContent = speedUnit(); }
  show(v) { this.root.style.display = v ? '' : 'none'; }
  carMode(inCar) { this.gaugeWrap.style.display = inCar ? '' : 'none'; }

  // ---------- göstergeler ----------
  updateCar(v, dt) {
    const sp = Math.abs(v.fwdSpeed) * 3.6;
    $('#hSpeed').textContent = Math.round(speedVal(sp));
    const g = v.gear === 0 ? 'R' : v.gear === -1 ? 'N' : String(v.gear);
    $('#hGear').textContent = (G.settings.gearbox === 'manual' ? 'M' : '') + g;
    $('#hNitro').style.width = v.nitro * 100 + '%';
    $('#hFuel').style.width = v.fuel * 100 + '%';
    $('#hFuel').parentNode.classList.toggle('low', v.fuel < 0.15);
    $('#hDmg').style.width = v.damage * 100 + '%';
    this._gt = (this._gt || 0) - dt;
    if (this._gt <= 0) {
      this._gt = 1 / 30;
      const c = this.gauge.getContext('2d');
      const W = 260, cx = 130, cy = 130;
      c.clearRect(0, 0, W, W);
      const rr = clamp(v.rpm / v.p.red, 0, 1.02);
      const a0 = Math.PI * 0.72, a1 = Math.PI * 2.28, span = a1 - a0;
      // cam disk
      const bg = c.createRadialGradient(cx, cy, 30, cx, cy, 124);
      bg.addColorStop(0, 'rgba(10,16,32,0.25)'); bg.addColorStop(0.75, 'rgba(10,16,32,0.72)'); bg.addColorStop(1, 'rgba(10,16,32,0.0)');
      c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, 124, 0, Math.PI * 2); c.fill();
      // devir segmentleri
      const segs = 44;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, aa = a0 + span * t0, ab = aa + span / segs * 0.62;
        const on = t0 < rr;
        const red = t0 > 0.86;
        c.strokeStyle = on ? (red ? '#ff2d55' : `hsl(${195 - t0 * 70}, 100%, ${55 + t0 * 10}%)`) : red ? 'rgba(255,45,85,0.28)' : 'rgba(255,255,255,0.13)';
        c.lineWidth = on ? 13 : 11;
        c.beginPath(); c.arc(cx, cy, 108, aa, ab); c.stroke();
      }
      if (rr > 0.9) { c.shadowColor = '#ff2d55'; c.shadowBlur = 18; c.strokeStyle = 'rgba(255,45,85,0.35)'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 122, a0, a1); c.stroke(); c.shadowBlur = 0; }
      // rakamlar
      c.fillStyle = 'rgba(220,230,255,0.75)'; c.font = '600 13px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const maxK = Math.ceil(v.p.red / 1000);
      const step = maxK > 10 ? 2 : 1;
      for (let i = 0; i <= maxK; i += step) { const a = a0 + span * (i * 1000 / v.p.red); if (a > a1 + 0.01) break; c.fillText(String(i), cx + Math.cos(a) * 86, cy + Math.sin(a) * 86); }
      // hız ince yayı
      const vr = clamp(sp / (v.p.vmax * 3.6 * 1.05), 0, 1);
      c.lineCap = 'round';
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(cx, cy, 72, a0, a1); c.stroke();
      const g2 = c.createLinearGradient(0, W, W, 0); g2.addColorStop(0, '#00d2ff'); g2.addColorStop(1, '#ff3d81');
      c.strokeStyle = g2; c.beginPath(); c.arc(cx, cy, 72, a0, a0 + span * vr); c.stroke();
      c.lineCap = 'butt';
      // nitro ve yakıt yayları (alt)
      const arc2 = (r, a, b, k, col) => { c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.arc(cx, cy, r, a, b); c.stroke(); c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, r, a, a + (b - a) * clamp(k, 0, 1)); c.stroke(); };
      arc2(122, Math.PI * 0.32, Math.PI * 0.68, v.nitro, '#3ad1ff');
    }
    // ikonlar
    const ic = [];
    const gm = this.game;
    if (gm.lights) ic.push(gm.highBeam ? '🔦' : '💡');
    if (gm.indL && Math.floor(G.time * 2.5) % 2 === 0) ic.push('⬅️');
    if (gm.indR && Math.floor(G.time * 2.5) % 2 === 0) ic.push('➡️');
    if (gm.hazard && Math.floor(G.time * 2.5) % 2 === 0) ic.push('⚠️');
    if (v.cruise > 0) ic.push('🅲');
    if (G.settings.abs) ic.push('<small>ABS</small>');
    if (G.settings.tcs) ic.push('<small>TCS</small>');
    if (v.launch) ic.push('<small>LC</small>');
    const html = ic.join(' ');
    if (html !== this._ic) { $('#hIcons').innerHTML = html; this._ic = html; }
    // vites ışığı (manuel)
    const manual = G.settings.gearbox === 'manual' || (gm.missions.active && gm.missions.active.m.type === 'drag');
    this.shiftBar.classList.toggle('hidden', !manual);
    if (manual) {
      const rr = v.rpm / v.p.red;
      $('#hShift').style.width = clamp(rr, 0, 1) * 100 + '%';
      this.shiftBar.className = 'shift-bar' + (rr > 0.86 && rr < 0.98 ? ' good' : rr >= 0.98 ? ' over' : '');
      this.shiftBar.querySelector('b').textContent = rr > 0.86 ? t('VİTES!') : '';
    }
  }
  updateProfile() {
    const p = G.profile;
    $('#hMoney').textContent = fmtNum(p.money);
    $('#hGold').textContent = fmtNum(p.gold);
    $('#hLevel').textContent = t('Sv') + ' ' + p.level;
    $('#hXp').style.width = clamp(p.xp / this.game.xpNeed(p.level), 0, 1) * 100 + '%';
  }
  setLimit(l) {
    const e = $('#hLimit');
    if (!l) { e.style.display = 'none'; return; }
    e.style.display = '';
    const v = Math.round(speedVal(l) / 5) * 5;
    if (e.textContent !== String(v)) e.textContent = v;
  }

  // ---------- bildirimler ----------
  toast(msg, kind = '') {
    const e = el('div', { class: 'toast ' + kind }, msg);
    this.toasts.appendChild(e);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => e.classList.add('out'), 2600);
    setTimeout(() => e.remove(), 3200);
  }
  money(amount, gold = 0, label = '') {
    const txt = (amount ? (amount > 0 ? '+' : '') + fmtNum(amount) + ' 💰' : '') + (gold ? ` +${gold} 🪙` : '');
    if (!txt) return;
    const e = el('div', { class: 'pop' + (amount < 0 ? ' neg' : '') }, el('b', {}, txt), label ? el('small', {}, label) : null);
    this.pops.appendChild(e);
    setTimeout(() => e.remove(), 1800);
  }
  bigText(txt, dur = 1.5, color) {
    this.big.textContent = txt;
    this.big.style.color = color || '';
    this.big.classList.remove('show'); void this.big.offsetWidth; this.big.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => this.big.classList.remove('show'), dur * 1000);
  }
  setPrompt(txt) {
    if (!txt) { this.prompt.classList.add('hidden'); return; }
    this.prompt.classList.remove('hidden');
    if (this.prompt.dataset.t !== txt) { this.prompt.dataset.t = txt; this.prompt.innerHTML = txt; }
  }
  savedBlink() { this.saveIcon.classList.remove('on'); void this.saveIcon.offsetWidth; this.saveIcon.classList.add('on'); }
  flash() { this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on'); }
  driftScore(score, mult, state) {
    if (!state) { this.drift.classList.add('hidden'); return; }
    this.drift.classList.remove('hidden');
    this.drift.className = 'drift-score ' + state;
    this.drift.innerHTML = `<b>${fmtNum(score)}</b><small>${t('DRIFT')} x${mult.toFixed(1)}</small>`;
  }
  policeBar(state, info) {
    if (!state) { this.police.classList.add('hidden'); return; }
    this.police.classList.remove('hidden');
    this.police.innerHTML = state === 'chase' ? `🚨 ${t('POLİS TAKİBİ')} <small>${info}</small>` : state === 'patrol' ? `👮 ${t('POLİS MODU')} <small>${info}</small>` : info;
    this.police.className = 'police-bar ' + state + (Math.floor(G.time * 4) % 2 ? ' blink' : '');
  }
  showFps(v, fps, extra) { this.fps.classList.toggle('hidden', !v); if (v) this.fps.textContent = `${fps} FPS ${extra || ''}`; }
  showRecover(v) { this.recover.classList.toggle('hidden', !v); }
  showRadio(txt) { this.radioEl.textContent = txt; this.radioEl.classList.remove('hidden'); clearTimeout(this._rd); this._rd = setTimeout(() => this.radioEl.classList.add('hidden'), 3500); }
  rearView(v) { this.rearFrame.classList.toggle('hidden', !v); }
  rearRect() { const r = this.rearFrame.getBoundingClientRect(); return r; }

  // ---------- görev paneli ----------
  missionPanel(v) {
    this.mission.classList.toggle('hidden', !v);
    this.missionTimer.classList.toggle('hidden', !v);
    if (!v) { this.dragMode(false); this.mission.innerHTML = ''; }
  }
  missionInfo(title, lines, timeLeft, progress, elapsed) {
    const L = lines.filter(Boolean).map((l) => `<div>${l}</div>`).join('');
    const pr = progress !== undefined && progress !== null ? `<div class="mp-bar"><i style="width:${clamp(progress, 0, 1) * 100}%"></i></div>` : '';
    const html = `<h4>${title}</h4>${L}${pr}<button class="mp-abort">✖ ${t('İptal')}</button>`;
    if (html !== this._mh) {
      this.mission.innerHTML = html; this._mh = html;
      this.mission.querySelector('.mp-abort').onclick = () => this.game.missions.abort();
    }
    let tt = '';
    if (timeLeft !== null && timeLeft !== undefined) { tt = `⏱ ${Math.max(0, timeLeft).toFixed(1)}`; this.missionTimer.classList.toggle('warn', timeLeft < 10); }
    else if (elapsed !== undefined) { tt = `⏱ ${elapsed.toFixed(2)}`; this.missionTimer.classList.remove('warn'); }
    this.missionTimer.textContent = tt;
  }
  dragMode(v) { this.dragL.classList.toggle('hidden', !v); }
  dragLights(n, go) {
    const L = this.dragL.children;
    for (let i = 0; i < 3; i++) L[i].classList.toggle('on', i < n && !go);
    L[3].classList.toggle('on', !!go);
  }
  result(r) {
    const ov = el('div', { class: 'overlay result' });
    const stars = r.ok ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '';
    ov.appendChild(el('div', { class: 'card' },
      el('h2', {}, r.ok ? t('GÖREV BAŞARILI!') : t('GÖREV BAŞARISIZ')),
      el('h3', {}, r.title),
      r.ok ? el('div', { class: 'stars' }, stars) : null,
      r.extra ? el('p', {}, r.extra) : null,
      r.ok ? el('div', { class: 'rewards' }, el('span', {}, '💰 +' + fmtNum(r.money)), el('span', {}, '⭐ +' + r.xp + ' XP'), r.gold ? el('span', {}, '🪙 +' + r.gold) : null) : null,
      el('div', { class: 'row' },
        !r.ok && r.retry ? el('button', { class: 'btn', onclick: () => { ov.remove(); r.retry(); } }, '↻ ' + t('Tekrar dene')) : null,
        el('button', { class: 'btn primary', onclick: () => { ov.remove(); this.game.resume(); } }, t('Devam')),
      ),
    ));
    document.body.appendChild(ov);
    this.game.pauseSoft(true);
  }

  // ---------- harita ----------
  buildMapImage(world) {
    const d = world.d;
    const S = 1024, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const k = S / d.size;
    const img = x.createImageData(S, S);
    const step = d.size / S;
    const water = d.water && d.water.sea;
    const gc = hex(d.groundColor);
    const colOf = (s, h) => {
      if (water && h < d.water.level) return [40, 110, 170];
      if (d.snow && s !== SURF.ASPHALT) return [235, 240, 245];
      switch (s) {
        case SURF.SAND: return [214, 190, 140];
        case SURF.DIRT: return [140, 110, 76];
        case SURF.MUD: return [96, 74, 50];
        case SURF.CONCRETE: return [150, 150, 148];
        case SURF.ASPHALT: return [70, 70, 74];
        default: return gc;
      }
    };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const wx = i * step - d.half, wz = j * step - d.half;
      const h = d.h(wx, wz);
      const s = d.surf(wx, wz);
      const c3 = colOf(s, h);
      const shade = 0.85 + clamp((d.h(wx + 4, wz) - h) * 0.05, -0.2, 0.2) + clamp(h / 400, 0, 0.15);
      const o = (j * S + i) * 4;
      img.data[o] = c3[0] * shade; img.data[o + 1] = c3[1] * shade; img.data[o + 2] = c3[2] * shade; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const P = (wx, wz) => [(wx + d.half) * k, (wz + d.half) * k];
    // yollar
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const pass of [0, 1]) for (const r of d.roads) {
      x.strokeStyle = pass === 0 ? '#2b2b2f' : r.kind === 'dirt' ? '#b08d5c' : r.kind === 'track' ? '#e5e5e5' : '#f2f2f2';
      x.lineWidth = Math.max(2, r.width * k * (pass === 0 ? 1.3 : 0.75));
      x.beginPath();
      r.pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); if (i) x.lineTo(a, b); else x.moveTo(a, b); });
      x.stroke();
    }
    // binalar
    x.fillStyle = 'rgba(60,64,72,0.9)';
    for (const b of d.buildings) {
      if (b.style === 3) continue;
      const [a, bb] = P(b.x, b.z);
      x.save(); x.translate(a, bb); x.rotate(-b.rot); x.fillRect((-b.w / 2) * k, (-b.d / 2) * k, b.w * k, b.d * k); x.restore();
    }
    this.mapImg = c;
    this.mapK = k;
  }
  drawMini(world, px, pz, heading, extras) {
    if (!this.mapImg) return;
    const c = this.mini.getContext('2d');
    const W = 220, d = world.d, k = this.mapK;
    const zoom = 1.6 * (extras.speed > 25 ? 0.8 : 1);
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    c.rotate(heading + Math.PI);
    c.scale(zoom, zoom);
    const mx = (px + d.half) * k, mz = (pz + d.half) * k;
    c.drawImage(this.mapImg, -mx, -mz);
    // GPS
    if (extras.route && extras.route.length > 1) {
      c.strokeStyle = '#3a86ff'; c.lineWidth = 4 / zoom; c.beginPath();
      extras.route.forEach((p, i) => { const a = (p[0] + d.half) * k - mx, b = (p[1] + d.half) * k - mz; if (i) c.lineTo(a, b); else c.moveTo(a, b); });
      c.stroke();
    }
    const icon = (wx, wz, txt, size = 14, col) => {
      const a = (wx + d.half) * k - mx, b = (wz + d.half) * k - mz;
      c.save(); c.translate(a, b); c.rotate(-(heading + Math.PI)); c.scale(1 / zoom, 1 / zoom);
      if (col) { c.fillStyle = col; c.beginPath(); c.arc(0, 0, size * 0.6, 0, 7); c.fill(); }
      c.font = `${size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(txt, 0, 1);
      c.restore();
    };
    for (const p of world.d.pois) icon(p.x, p.z, (POI_ICONS[p.type] || ['•'])[0], 13);
    for (const ch of extras.chests || []) icon(ch.x, ch.z, ch.key ? '🔑' : '?', 13, ch.key ? '#00b4d8' : '#e09f3e');
    for (const m of extras.missions || []) icon(m.s.x, m.s.z, MTYPES[m.m.type].icon, 13);
    for (const pc of extras.police || []) icon(pc.x, pc.z, '🚓', 14);
    if (extras.target) icon(extras.target[0], extras.target[1], '📍', 16);
    c.restore();
    // oyuncu oku
    c.save(); c.translate(W / 2, W / 2);
    c.fillStyle = '#ffd60a'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  // tam ekran harita
  openMap(world, player, extras, onPick) {
    const d = world.d;
    const ov = el('div', { class: 'overlay fullmap' });
    const cv = el('canvas', { width: 1024, height: 1024 });
    const legend = el('div', { class: 'map-legend' }, ...Object.entries(POI_ICONS).map(([k, v]) => el('span', {}, v[0] + ' ' + t({ fuel: 'Benzinlik', repair: 'Tamirhane', wash: 'Oto yıkama', gallery: 'Galeri', garage: 'Garaj', teleport: 'Işınlanma', house: 'Ev', clothes: 'Kıyafet', cafe: 'Kafe', tuning: 'Tuning' }[k]))), el('span', {}, '🎯 ' + t('Görev')), el('span', {}, '❓ ' + t('Sandık')));
    const close = el('button', { class: 'btn close', onclick: () => { ov.remove(); this.game.pauseSoft(false); } }, '✖');
    const clr = el('button', { class: 'btn', onclick: () => { this.game.clearGPS(); draw(); } }, t('Rotayı temizle'));
    ov.append(el('div', { class: 'map-box' }, cv, el('div', { class: 'map-side' }, el('h3', {}, t(MAP[d.id].name)), el('p', { class: 'muted' }, t('Hedef seçmek için haritaya dokun')), legend, clr)), close);
    document.body.appendChild(ov);
    this.game.pauseSoft(true);
    const k = 1024 / d.size;
    const draw = () => {
      const c = cv.getContext('2d');
      c.drawImage(this.mapImg, 0, 0);
      const P = (x, z) => [(x + d.half) * k, (z + d.half) * k];
      const route = this.game.gps.route;
      if (route && route.length > 1) { c.strokeStyle = '#3a86ff'; c.lineWidth = 5; c.beginPath(); route.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke(); }
      const ic = (x, z, s, size = 22) => { const [a, b] = P(x, z); c.font = size + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, a, b); };
      for (const p of d.pois) ic(p.x, p.z, (POI_ICONS[p.type] || ['•'])[0]);
      for (const m of extras.missions || []) ic(m.s.x, m.s.z, MTYPES[m.m.type].icon, 20);
      for (const ch of extras.chests || []) ic(ch.x, ch.z, ch.key ? '🔑' : '❓', 16);
      if (this.game.gps.target) ic(this.game.gps.target[0], this.game.gps.target[1], '📍', 28);
      const [a, b] = P(player.x, player.z);
      c.save(); c.translate(a, b); c.rotate(-player.heading + Math.PI);
      c.fillStyle = '#ffd60a'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.fill(); c.stroke();
      c.restore();
    };
    draw();
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * d.size - d.half, z = ((e.clientY - r.top) / r.height) * d.size - d.half;
      onPick(x, z); sfx('click'); setTimeout(draw, 30);
    });
  }

  // ---------- yağmur damlaları ----------
  initRain() {
    const c = this.rain;
    this.drops = [];
    const resize = () => { c.width = innerWidth / 2; c.height = innerHeight / 2; };
    resize(); addEventListener('resize', resize);
  }
  updateRain(dt, on, speed) {
    this.rain.classList.toggle('hidden', !on);
    if (!on) return;
    const c = this.rain, x = c.getContext('2d');
    if (Math.random() < dt * 25 && this.drops.length < 60) this.drops.push({ x: Math.random() * c.width, y: Math.random() * c.height, r: 2 + Math.random() * 5, life: 1.5 + Math.random() * 2, vy: 0 });
    x.clearRect(0, 0, c.width, c.height);
    for (const d of this.drops) {
      d.life -= dt;
      d.vy += (speed > 10 ? 40 : 6) * dt;
      d.y += d.vy * dt; d.x += (speed > 10 ? (d.x - c.width / 2) * dt * 0.8 : 0);
      x.fillStyle = 'rgba(200,220,255,0.25)'; x.strokeStyle = 'rgba(255,255,255,0.35)';
      x.beginPath(); x.ellipse(d.x, d.y, d.r, d.r * 1.2, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y < c.height + 10);
  }
  speedEffect(k) { this.speedFx.style.opacity = k; }
}

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
