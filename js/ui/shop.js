// Garaj, galeri, modifiye, tuning ve karakter ekranları (this = UI)
import { G, el, clamp, $ } from '../core.js';
import { t, fmtNum, speedVal, speedUnit } from '../i18n.js';
import { CARS, CAR, CLASSES, ENGINES, ENGINE_ORDER, PRO_CLASSES } from '../data/cars.js';
import { UPGRADES, upgradePrice, TUNING_KEYS, TUNING_PROFILES, TUNING_PRESETS, PAINT_TYPES, PALETTE, VINYLS, BODYKITS, SPOILERS, RIMS, TINTS, LIGHT_COLORS, NEONS, HORNS, PLATES, GARAGE_TIERS, CLOTHES, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARDS, GLASSES, FACES, EMOTES } from '../data/content.js';
import { computeParams } from '../vehicle.js';
import { newCarEntry, save, currentCarEntry } from '../save.js';
import { sfx, horn } from '../audio.js';

let UIref = null;
export function bind(ui) { UIref = ui; }

const RADAR_PRICES = [5000, 15000, 40000, 90000, 200000];

function statsOf(entry) {
  const p = computeParams(entry);
  return {
    speed: clamp(p.vmax * 3.6 / 420, 0, 1), accel: clamp((14 - p.t100) / 12.5, 0, 1), grip: clamp((p.grip - 0.8) / 0.6, 0, 1),
    brake: clamp((p.brake - 0.9) / 0.7, 0, 1), nitro: clamp((p.nitroDur * p.nitroPow - 3) / 9, 0, 1), p,
  };
}
function statBars(a, b) {
  const row = (label, k) => el('div', { class: 'statbar' }, el('span', {}, label), el('div', { class: 'sb' }, el('i', { style: { width: a[k] * 100 + '%' } }), b && b[k] > a[k] ? el('u', { style: { left: a[k] * 100 + '%', width: (b[k] - a[k]) * 100 + '%' } }) : null));
  return el('div', { class: 'statbars' }, row(t('Hız'), 'speed'), row(t('İvme'), 'accel'), row(t('Yol tutuş'), 'grip'), row(t('Fren'), 'brake'), row(t('Nitro'), 'nitro'),
    el('small', { class: 'muted' }, `${Math.round(speedVal(a.p.vmax * 3.6))} ${speedUnit()} • 0-100: ${a.p.t100.toFixed(1)} sn • ${a.p.drive.toUpperCase()} • ${ENGINES[a.p.engine].name}`));
}
const driveName = (d) => ({ fwd: t('Önden çekiş'), rwd: t('Arkadan itiş'), awd: '4x4' }[d]);

// ======================= GARAJ =======================
export function garage(selUid, tab = 'perf') {
  const ui = this, p = G.profile;
  const cap = ui.game.garageCap();
  const sel = p.cars.find((c) => c.uid === selUid) || currentCarEntry();
  ui.stage.showCar(sel);
  const list = el('div', { class: 'car-list' }, ...p.cars.map((c) => el('div', { class: 'car-item' + (c.uid === sel.uid ? ' on' : ''), onclick: () => garage.call(ui, c.uid, tab) },
    el('b', {}, CAR[c.id].name), el('small', {}, t(CLASSES.find((x) => x.id === CAR[c.id].cls).name)), c.uid === p.currentCar ? el('span', { class: 'badge' }, t('Kullanımda')) : null)));
  const tier = GARAGE_TIERS[p.garageTier];
  const nextTier = GARAGE_TIERS[p.garageTier + 1];
  const head = el('div', { class: 'garage-head' },
    el('span', {}, `🚗 ${p.cars.length}/${cap}`),
    nextTier ? el('button', { class: 'btn small', onclick: () => ui.confirm(t('Garajı {n} araçlığa büyüt?', { n: nextTier.cap }), () => { if (ui.canPay(nextTier.price)) { ui.pay(nextTier.price); p.garageTier++; garage.call(ui, sel.uid, tab); } }, '💰 ' + fmtNum(nextTier.price)) }, t('Garajı büyüt ({n})', { n: nextTier.cap })) : null,
    p.radar < 5 ? el('button', { class: 'btn small', onclick: () => ui.confirm(t('Sandık radarını {n}. seviyeye yükselt?', { n: p.radar + 1 }), () => { if (ui.canPay(RADAR_PRICES[p.radar])) { ui.pay(RADAR_PRICES[p.radar]); p.radar++; garage.call(ui, sel.uid, tab); } }, '💰 ' + fmtNum(RADAR_PRICES[p.radar])) }, `📡 ${t('Sandık radarı')} ${p.radar}/5`) : el('span', {}, '📡 5/5'),
  );
  let body;
  if (tab === 'perf') body = perfTab.call(ui, sel);
  else if (tab === 'tuning') body = tuningTab.call(ui, sel);
  else if (tab === 'mod') body = modTab.call(ui, sel);
  else body = infoTab.call(ui, sel);
  ui.screen(t('Garaj'), el('div', { class: 'garage' }, head, list,
    el('div', { class: 'garage-detail' },
      el('div', { class: 'row' }, el('h3', {}, CAR[sel.id].name), sel.uid !== p.currentCar ? el('button', { class: 'btn primary small', onclick: () => { ui.game.switchCar(sel.uid); garage.call(ui, sel.uid, tab); ui.game.toast(t('{c} seçildi', { c: CAR[sel.id].name })); } }, '🔑 ' + t('Bu aracı kullan')) : null),
      ui.tabs([['perf', t('Performans')], ['tuning', t('Tuning')], ['mod', t('Modifiye')], ['info', t('Bilgi / Sat')]], tab, (x) => garage.call(ui, sel.uid, x)),
      body)), { cls: 'split' });
}

function afterCarChange(ui, entry) {
  save(true);
  if (entry.uid === G.profile.currentCar && !ui.game.rentalEntry) ui.game.rebuildCar();
}

function perfTab(e) {
  const ui = this;
  const cur = statsOf(e);
  const rows = UPGRADES.map((u) => {
    const lvl = e.upgrades[u.id] || 0;
    const price = lvl < 5 ? upgradePrice(u, lvl, CAR[e.id].price) : 0;
    const next = { ...e, upgrades: { ...e.upgrades, [u.id]: Math.min(5, lvl + 1) } };
    return el('div', { class: 'upg', onmouseenter: () => { const b = statsOf(next); bars.replaceWith((bars = statBars(cur, b))); } },
      el('b', {}, t(u.name)), el('small', { class: 'muted' }, t(u.desc)),
      el('div', { class: 'pips' }, ...[0, 1, 2, 3, 4].map((i) => el('i', { class: i < lvl ? 'on' : '' }))),
      lvl < 5 ? el('button', { class: 'btn small primary', onclick: () => ui.confirm(t('{u} {n}. seviyeye yükseltilsin mi?', { u: t(u.name), n: lvl + 1 }), () => { if (ui.canPay(price)) { ui.pay(price); e.upgrades[u.id] = lvl + 1; sfx('success'); afterCarChange(ui, e); garage.call(ui, e.uid, 'perf'); } }, '💰 ' + fmtNum(price)) }, '💰 ' + fmtNum(price)) : el('span', { class: 'badge' }, 'MAX'));
  });
  let bars = statBars(cur);
  const engNow = e.engineSwap || CAR[e.id].engine;
  const engines = el('div', { class: 'engines' }, el('h4', {}, t('Motor değiştirme')), el('div', { class: 'seg wrap' }, ...ENGINE_ORDER.map((id) => {
    const E = ENGINES[id];
    const price = Math.round(E.price * (1 + Math.max(0, CAR[e.id].price) / 300000));
    return el('button', { class: 'btn small' + (engNow === id ? ' on' : ''), onclick: () => {
      if (engNow === id) return;
      ui.confirm(t('Motor {m} ile değiştirilsin mi?', { m: E.name }), () => { if (ui.canPay(price)) { ui.pay(price); e.engineSwap = id === CAR[e.id].engine ? null : id; sfx('success'); afterCarChange(ui, e); garage.call(ui, e.uid, 'perf'); } }, '💰 ' + fmtNum(price));
    } }, `${t(E.name)} ${engNow === id ? '✓' : '💰' + fmtNum(price)}`);
  })));
  return el('div', {}, bars, el('div', { class: 'upg-list' }, ...rows), engines);
}

function tuningTab(e) {
  const ui = this;
  const sliders = TUNING_KEYS.map((k) => {
    const locked = k.price && !(e.tuningBought && e.tuningBought[k.id]);
    const inp = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: e.tuning[k.id], disabled: locked, onchange: (ev) => { e.tuning[k.id] = +ev.target.value; afterCarChange(ui, e); }, oninput: (ev) => { e.tuning[k.id] = +ev.target.value; } });
    return el('div', { class: 'tune-row' }, el('b', {}, t(k.name)), el('div', { class: 'tune-sl' }, el('small', {}, t(k.l)), inp, el('small', {}, t(k.r))),
      locked ? el('button', { class: 'btn small', onclick: () => ui.confirm(t('{n} parçası satın alınsın mı?', { n: t(k.name) }), () => { if (ui.canPay(k.price)) { ui.pay(k.price); (e.tuningBought ||= {})[k.id] = true; afterCarChange(ui, e); garage.call(ui, e.uid, 'tuning'); } }, '💰 ' + fmtNum(k.price)) }, '🔓 ' + fmtNum(k.price)) : null);
  });
  const prof = el('div', { class: 'profiles' }, el('h4', {}, t('Ayar profilleri')), ...TUNING_PROFILES.map((name) => el('div', { class: 'row' },
    el('b', {}, t(name)),
    el('button', { class: 'btn small', onclick: () => { (e.tuningProfiles ||= {})[name] = { ...e.tuning }; save(true); ui.game.toast(t('Profil kaydedildi: {n}', { n: t(name) })); } }, '💾 ' + t('Kaydet')),
    el('button', { class: 'btn small', onclick: () => { const src = (e.tuningProfiles && e.tuningProfiles[name]) || TUNING_PRESETS[name]; Object.assign(e.tuning, src); afterCarChange(ui, e); garage.call(ui, e.uid, 'tuning'); ui.game.toast(t('Profil yüklendi: {n}', { n: t(name) })); } }, '📂 ' + t('Yükle')))));
  return el('div', {}, el('p', { class: 'muted small' }, t('Kısa vites = hızlı kalkış, uzun vites = yüksek son hız. Kilitli diferansiyel drifti kolaylaştırır.')), ...sliders, prof, statBars(statsOf(e)));
}

function infoTab(e) {
  const ui = this, p = G.profile, spec = CAR[e.id];
  const sell = Math.round(Math.max(0, spec.price) * 0.6);
  return el('div', {},
    el('p', {}, `${t(CLASSES.find((c) => c.id === spec.cls).name)} • ${driveName(spec.drive)} • ${ENGINES[e.engineSwap || spec.engine].name}`),
    statBars(statsOf(e)),
    el('p', {}, t('Hasar: %{d} • Kir: %{k} • Benzin: %{f}', { d: Math.round(e.damage * 100), k: Math.round(e.dirt * 100), f: Math.round(e.fuel * 100) })),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => { const m = ui.stage.obj; if (m && m.doors) { m.doors.forEach((d) => (d.target = d.target ? 0 : 1)); } } }, '🚪 ' + t('Kapılar')),
      el('button', { class: 'btn', onclick: () => { const m = ui.stage.obj; if (m && m.hood) m.hood.target = m.hood.target ? 0 : 1; } }, t('Kaput')),
      el('button', { class: 'btn', onclick: () => { const m = ui.stage.obj; if (m && m.trunk) m.trunk.target = m.trunk.target ? 0 : 1; } }, t('Bagaj')),
      el('button', { class: 'btn', onclick: () => { const m = ui.stage.obj; if (m) m.doors.forEach((d) => (d.winTarget = d.winTarget ? 0 : 1)); } }, t('Camlar'))),
    el('hr'),
    spec.price > 0 && p.cars.length > 1 ? el('button', { class: 'btn danger', onclick: () => {
      if (e.uid === p.currentCar) { ui.dialog(t('Satılamaz'), t('Kullandığın aracı satamazsın. Önce başka bir araç seç.'), [{ label: t('Tamam') }]); return; }
      ui.confirm(t('{c} satılsın mı? (fiyatının %60\'ı)', { c: spec.name }), () => { p.money += sell; p.cars = p.cars.filter((c) => c.uid !== e.uid); save(true); sfx('coin'); garage.call(ui, p.currentCar, 'info'); }, '💰 +' + fmtNum(sell));
    } }, t('Sat') + ' (+' + fmtNum(sell) + ')') : el('p', { class: 'muted small' }, t('Bu araç satılamaz.')),
  );
}

// ---------- modifiye ----------
function modTab(e, sub = 'paint', draft) {
  const ui = this, p = G.profile;
  draft = draft || JSON.parse(JSON.stringify(e.cos));
  const cos = e.cos;
  const goldUnlocked = (key) => p.goldUnlocks.includes(key);
  const preview = () => { ui.stage.showCar({ ...e, cos: draft }); };
  const rerender = (s = sub) => { const body = modTab.call(ui, e, s, draft); const host = ui.root.querySelector('.mod-host'); host.replaceWith(body); };
  // maliyet hesabı
  const items = [];
  const add = (key, label, money, gold, goldKey) => { if (gold && goldUnlocked(goldKey)) gold = 0; items.push({ key, label, money, gold, goldKey }); };
  if (draft.paint !== cos.paint || draft.paintType !== cos.paintType || draft.paint2 !== cos.paint2) { const pt = PAINT_TYPES.find((x) => x.id === draft.paintType); add('paint', t('Boya'), pt.price || 500, pt.gold, 'paint:' + pt.id); }
  if (JSON.stringify(draft.vinyl) !== JSON.stringify(cos.vinyl)) { const v = VINYLS.find((x) => x.id === draft.vinyl.id); add('vinyl', t('Vinil'), v.price || 300, v.gold, 'vinyl:' + v.id); }
  if (draft.kit !== cos.kit) { const k = BODYKITS[draft.kit]; add('kit', t('Body kit'), k.price, k.gold, 'kit:' + k.id); }
  if (draft.spoiler !== cos.spoiler) { const s = SPOILERS[draft.spoiler]; add('spoiler', t('Spoiler'), s.price, s.gold, 'spoiler:' + s.id); }
  if (draft.rim !== cos.rim || draft.rimColor !== cos.rimColor || draft.rimSize !== cos.rimSize) { const r = RIMS[draft.rim]; add('rim', t('Jant'), r.price + 300 + draft.rimSize * 400, r.gold, 'rim:' + r.id); }
  if (draft.tint !== cos.tint) add('tint', t('Cam filmi'), 400, 0);
  if (draft.light !== cos.light) add('light', t('Far rengi'), 300, 0);
  if (draft.neon !== cos.neon) { const n = NEONS[draft.neon]; add('neon', t('Neon'), n.price, n.gold, 'neon:' + draft.neon); }
  if (draft.horn !== cos.horn) { const h = HORNS[draft.horn]; add('horn', t('Korna'), h.price, h.gold, 'horn:' + h.id); }
  if (JSON.stringify(draft.plate) !== JSON.stringify(cos.plate)) add('plate', t('Plaka'), 200, 0);
  const totalM = items.reduce((a, b) => a + b.money, 0), totalG = items.reduce((a, b) => a + b.gold, 0);
  const sw = (cur, val, label, onClick, extra) => el('button', { class: 'btn small' + (cur === val ? ' on' : ''), onclick: onClick }, label, extra ? el('small', {}, ' ' + extra) : null);
  const swatches = (cur, onPick) => el('div', { class: 'swatches' }, ...PALETTE.map((c) => el('i', { class: cur === c ? 'on' : '', style: { background: c }, onclick: () => onPick(c) })), el('input', { type: 'color', value: cur || '#ffffff', oninput: (ev) => onPick(ev.target.value) }));
  const set = (fn, s) => { fn(); preview(); rerender(s); };
  let content;
  switch (sub) {
    case 'paint': content = el('div', {}, el('div', { class: 'seg wrap' }, ...PAINT_TYPES.map((pt) => sw(draft.paintType, pt.id, t(pt.name), () => set(() => (draft.paintType = pt.id)), ui.priceTag(pt.price, goldUnlocked('paint:' + pt.id) ? 0 : pt.gold)))),
      el('h4', {}, t('Renk')), swatches(draft.paint || CAR[e.id].color, (c) => set(() => (draft.paint = c))),
      draft.paintType === 'pearl' ? el('div', {}, el('h4', {}, t('Sedef rengi')), swatches(draft.paint2, (c) => set(() => (draft.paint2 = c)))) : null); break;
    case 'vinyl': {
      const v = draft.vinyl;
      const sl = (label, k, min, max, step) => el('label', { class: 'set-row' }, el('span', {}, label), el('input', { type: 'range', min, max, step, value: v[k], onchange: (ev) => set(() => (v[k] = +ev.target.value)) }));
      content = el('div', {}, el('div', { class: 'seg wrap' }, ...VINYLS.map((x) => sw(v.id, x.id, t(x.name), () => set(() => (v.id = x.id)), x.id === 'none' ? '' : ui.priceTag(x.price, goldUnlocked('vinyl:' + x.id) ? 0 : x.gold)))),
        v.id !== 'none' ? el('div', {}, el('h4', {}, t('Renk')), swatches(v.color, (c) => set(() => (v.color = c))), sl(t('Boyut'), 'scale', 0.3, 2.5, 0.05), sl(t('Döndür'), 'rot', -180, 180, 5), sl(t('Yatay konum'), 'x', 0, 1, 0.02), sl(t('Dikey konum'), 'y', 0.1, 0.9, 0.02)) : null);
      break;
    }
    case 'kit': content = el('div', {}, el('h4', {}, t('Body kit (tampon, marşpiyel, kaput)')), el('div', { class: 'seg wrap' }, ...BODYKITS.map((k) => sw(draft.kit, k.id, t(k.name), () => set(() => (draft.kit = k.id)), ui.priceTag(k.price, goldUnlocked('kit:' + k.id) ? 0 : k.gold)))),
      el('h4', {}, t('Spoiler')), el('div', { class: 'seg wrap' }, ...SPOILERS.map((s) => sw(draft.spoiler, s.id, t(s.name), () => set(() => (draft.spoiler = s.id)), ui.priceTag(s.price, goldUnlocked('spoiler:' + s.id) ? 0 : s.gold))))); break;
    case 'rim': content = el('div', {}, el('div', { class: 'seg wrap' }, ...RIMS.map((r) => sw(draft.rim, r.id, t(r.name), () => set(() => (draft.rim = r.id)), ui.priceTag(r.price, goldUnlocked('rim:' + r.id) ? 0 : r.gold)))),
      el('h4', {}, t('Jant boyutu')), el('div', { class: 'seg' }, ...[0, 1, 2, 3].map((s) => sw(draft.rimSize, s, `${17 + s * 1}"`, () => set(() => (draft.rimSize = s), 'rim')))),
      el('h4', {}, t('Jant rengi')), swatches(draft.rimColor, (c) => set(() => (draft.rimColor = c), 'rim'))); break;
    case 'glass': content = el('div', {}, el('h4', {}, t('Cam filmi')), el('div', { class: 'seg' }, ...TINTS.map((x) => sw(draft.tint, x.v, t(x.name), () => set(() => (draft.tint = x.v), 'glass')))),
      el('h4', {}, t('Far rengi')), el('div', { class: 'swatches' }, ...LIGHT_COLORS.map((c) => el('i', { class: draft.light === c ? 'on' : '', style: { background: c }, onclick: () => set(() => (draft.light = c), 'glass') }))),
      el('h4', {}, t('Neon alt ışıkları')), el('div', { class: 'seg wrap' }, ...NEONS.map((n, i) => sw(draft.neon, i, t(n.name), () => set(() => (draft.neon = i), 'glass'), i ? ui.priceTag(n.price, goldUnlocked('neon:' + i) ? 0 : n.gold) : '')))); break;
    case 'horn': content = el('div', {}, el('div', { class: 'seg wrap' }, ...HORNS.map((h) => sw(draft.horn, h.id, t(h.name), () => { horn(h.id, true); setTimeout(() => horn(h.id, false), 400); set(() => (draft.horn = h.id), 'horn'); }, ui.priceTag(h.price, goldUnlocked('horn:' + h.id) ? 0 : h.gold))))); break;
    case 'plate': {
      const inp = el('input', { type: 'text', class: 'input', maxlength: 10, value: draft.plate.text, onchange: (ev) => set(() => (draft.plate.text = ev.target.value.toUpperCase().slice(0, 10)), 'plate') });
      content = el('div', {}, el('div', { class: 'seg wrap' }, ...PLATES.map((pl) => sw(draft.plate.type, pl.id, t(pl.name), () => set(() => (draft.plate.type = pl.id), 'plate')))), el('h4', {}, t('Plaka yazısı')), inp);
      break;
    }
  }
  const apply = () => {
    if (!items.length) return;
    ui.confirm(t('Modifiyeler uygulansın mı?') + ' (' + items.map((i) => i.label).join(', ') + ')', () => {
      if (!ui.canPay(totalM, totalG)) return;
      ui.pay(totalM, totalG);
      for (const i of items) if (i.gold && i.goldKey && !p.goldUnlocks.includes(i.goldKey)) p.goldUnlocks.push(i.goldKey);
      e.cos = JSON.parse(JSON.stringify(draft));
      sfx('success');
      afterCarChange(ui, e);
      garage.call(ui, e.uid, 'mod');
    }, (totalM ? '💰 ' + fmtNum(totalM) : '') + (totalG ? ' 🪙 ' + totalG : ''));
  };
  return el('div', { class: 'mod-host' },
    ui.tabs([['paint', t('Boya')], ['vinyl', t('Vinil')], ['kit', t('Body kit')], ['rim', t('Jant')], ['glass', t('Cam / Işık')], ['horn', t('Korna')], ['plate', t('Plaka')]], sub, (s) => rerender(s)),
    content,
    el('div', { class: 'mod-foot' }, el('span', {}, items.length ? t('Toplam: {m}', { m: (totalM ? '💰 ' + fmtNum(totalM) : '') + (totalG ? ' 🪙 ' + totalG : '') }) : t('Değişiklik yok')),
      el('button', { class: 'btn', onclick: () => { ui.stage.showCar(e); garage.call(ui, e.uid, 'mod'); } }, t('Sıfırla')),
      el('button', { class: 'btn primary', disabled: !items.length, onclick: apply }, t('Uygula'))));
}

// ======================= GALERİ =======================
export function gallery(cls = 'hatch', selId) {
  const ui = this, p = G.profile;
  const list = CARS.filter((c) => c.cls === cls);
  const sel = CAR[selId] || list[0];
  const entry = newCarEntry(sel.id);
  ui.stage.showCar(entry);
  const owned = (id) => p.cars.some((c) => c.id === id);
  const cards = list.map((c) => {
    const needsPro = PRO_CLASSES.includes(c.cls) && !p.licenses.includes('P');
    const needsC = c.license === 'C' && !p.licenses.includes('C');
    const secret = c.price < 0;
    const locked = needsPro || needsC || secret || c.price > p.money;
    return el('div', { class: 'gal-card' + (c.id === sel.id ? ' on' : '') + (locked && !owned(c.id) ? ' locked' : ''), onclick: () => gallery.call(ui, cls, c.id) },
      el('b', {}, c.name), el('small', {}, `${Math.round(speedVal(c.vmax))} ${speedUnit()} • 0-100 ${c.t100} sn`),
      el('span', { class: 'price' }, owned(c.id) ? '✔ ' + t('Sahipsin') : secret ? '🔒 ' + t('Gizli') : (locked ? '🔒 ' : '') + (c.price === 0 ? t('Ücretsiz') : '💰 ' + fmtNum(c.price))));
  });
  const needsPro = PRO_CLASSES.includes(sel.cls) && !p.licenses.includes('P');
  const needsC = sel.license === 'C' && !p.licenses.includes('C');
  const secretTxt = { allStars: t('Tüm görevleri 3 yıldızla bitirince açılır'), allGold: t('Tüm altın sandıkları bulunca açılır'), level50: t('50. seviyeye ulaşınca açılır') }[sel.unlock];
  const buy = () => {
    if (needsPro) { ui.dialog(t('Lisans gerekli'), t('Süper spor ve hiper araçlar için Profesyonel Lisans gerekir.'), [{ label: t('Tamam') }]); return; }
    if (needsC) { ui.dialog(t('Ehliyet gerekli'), t('Bu araç için C sınıfı ehliyet gerekir.'), [{ label: t('Tamam') }]); return; }
    if (p.cars.length >= ui.game.garageCap()) { ui.dialog(t('Garaj dolu'), t('Garajını büyüt, ev satın al ya da bir aracını sat.'), [{ label: t('Tamam') }]); return; }
    ui.confirm(t('{c} satın alınsın mı?', { c: sel.name }), () => {
      if (!ui.canPay(sel.price)) return;
      ui.pay(sel.price);
      const e = newCarEntry(sel.id);
      p.cars.push(e);
      sfx('success');
      ui.game.toast(t('🚗 {c} garajına eklendi!', { c: sel.name }), 'gold');
      ui.dialog(t('Tebrikler!'), t('{c} artık senin. Hemen kullanmak ister misin?', { c: sel.name }), [{ label: t('Sonra') }, { label: t('Kullan'), cls: 'primary', fn: () => { ui.game.switchCar(e.uid); gallery.call(ui, cls, sel.id); } }]);
      gallery.call(ui, cls, sel.id);
    }, '💰 ' + fmtNum(sel.price));
  };
  const test = () => {
    const g = ui.game;
    if (g.missions.active) { g.toast(t('Görev sırasında test sürüşü yapılamaz')); return; }
    const back = { x: g.car.pos.x, z: g.car.pos.z, rot: g.car.yaw };
    ui.resumeGame();
    g.useRental(sel.id);
    g.testDrive = { t: 120, back };
    g.hud.missionPanel(true);
    g.toast(t('🏁 2 dakikalık test sürüşü başladı!'));
  };
  ui.screen(t('Galeri'), el('div', { class: 'gallery' },
    ui.tabs(CLASSES.map((c) => [c.id, t(c.name)]), cls, (x) => gallery.call(ui, x)),
    el('div', { class: 'gal-list' }, ...cards),
    el('div', { class: 'gal-detail' }, el('h3', {}, sel.name), el('p', {}, `${t(CLASSES.find((c) => c.id === sel.cls).name)} • ${driveName(sel.drive)} • ${ENGINES[sel.engine].name}`),
      statBars(statsOf(entry)),
      sel.price < 0 ? el('p', { class: 'muted' }, '🔒 ' + secretTxt) : owned(sel.id) ? el('p', {}, '✔ ' + t('Bu araca sahipsin')) : el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: buy }, t('Satın al') + ' 💰 ' + fmtNum(sel.price)),
        el('button', { class: 'btn', onclick: test }, '🏁 ' + t('Test sürüşü (2 dk)'))),
      needsPro ? el('p', { class: 'warn' }, '🪪 ' + t('Profesyonel Lisans gerekli')) : null)), { cls: 'split' });
}

// ======================= KARAKTER =======================
export function character(tab = 'look', cat = 'shirt') {
  const ui = this, p = G.profile, ch = p.char;
  ui.stage.showHuman(ch, p.name);
  const redo = (tb = tab, c = cat) => { save(true); character.call(ui, tb, c); if (ui.game.human) ui.game.buildPlayerHuman(); };
  const opt = (label, list, key, fmtv) => el('div', { class: 'set-row' }, el('span', {}, label), el('div', { class: 'seg wrap' }, ...list.map((v, i) => el('button', { class: 'btn small' + (ch[key] === i ? ' on' : ''), onclick: () => { ch[key] = i; redo(); } }, fmtv ? fmtv(v, i) : t(v)))));
  const colors = (label, list, key) => el('div', { class: 'set-row' }, el('span', {}, label), el('div', { class: 'swatches' }, ...list.map((c, i) => el('i', { class: ch[key] === i ? 'on' : '', style: { background: c }, onclick: () => { ch[key] = i; redo(); } }))));
  let body;
  if (tab === 'look') {
    const name = el('input', { type: 'text', class: 'input', maxlength: 16, value: p.name, onchange: (e) => { p.name = (e.target.value || 'Sürücü').slice(0, 16); redo(); } });
    body = el('div', {},
      el('div', { class: 'set-row' }, el('span', {}, t('Oyuncu adı')), name),
      opt(t('Cinsiyet'), ['Erkek', 'Kadın'], 'gender'),
      colors(t('Ten rengi'), SKIN_TONES, 'skin'),
      opt(t('Yüz'), Array.from({ length: FACES }, (_, i) => i + 1), 'face', (v) => String(v)),
      opt(t('Saç modeli'), HAIR_STYLES, 'hair'),
      colors(t('Saç rengi'), HAIR_COLORS, 'hairColor'),
      opt(t('Sakal / bıyık'), BEARDS, 'beard'),
      opt(t('Gözlük'), GLASSES, 'glasses'),
      el('h4', {}, t('Emote önizleme')), el('div', { class: 'seg wrap' }, ...EMOTES.map((e) => el('button', { class: 'btn small', onclick: () => { ui.stage.emote = { id: e.id, t: 0 }; ui.stage.human.say(e.emoji); } }, e.emoji))),
    );
  } else {
    const items = CLOTHES[cat].map((c) => {
      const own = p.clothes.includes(c.id);
      const wearing = ch[cat] === c.id;
      return el('div', { class: 'cloth' + (wearing ? ' on' : '') },
        el('i', { class: 'cl-sw', style: { background: c.color || 'transparent' } }), el('b', {}, t(c.name)),
        own ? el('button', { class: 'btn small' + (wearing ? ' on' : ''), onclick: () => { ch[cat] = c.id; redo('shop', cat); } }, wearing ? t('Giyiliyor') : t('Giy'))
          : el('button', { class: 'btn small primary', onclick: () => ui.confirm(t('{c} satın alınsın mı?', { c: t(c.name) }), () => { if (ui.canPay(c.price, c.gold || 0)) { ui.pay(c.price, c.gold || 0); p.clothes.push(c.id); ch[cat] = c.id; sfx('success'); redo('shop', cat); } }, ui.priceTag(c.price, c.gold)) }, ui.priceTag(c.price, c.gold)));
    });
    body = el('div', {}, ui.tabs([['shirt', t('Tişört')], ['jacket', t('Ceket')], ['pants', t('Pantolon')], ['shoes', t('Ayakkabı')], ['hat', t('Şapka')]], cat, (c) => character.call(ui, 'shop', c)), el('div', { class: 'cloth-list' }, ...items), el('p', { class: 'muted small' }, t('🪙 ile işaretli özel kıyafetler altınla alınır.')));
  }
  ui.screen(t('Karakter'), el('div', {}, ui.tabs([['look', t('Görünüm')], ['shop', t('Kıyafet mağazası')]], tab, (x) => character.call(ui, x)), body), { cls: 'split' });
}
