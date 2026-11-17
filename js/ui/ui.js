// Menüler ve diyaloglar
import * as THREE from 'three';
import { G, $, el, clamp, emit, on, vibrate, weekKey, hashStr, dayKey } from '../core.js';
import { t, fmtNum, speedVal, speedUnit } from '../i18n.js';
import { saveSettings, applyPreset, PRESETS, PRESET_ORDER, PRESET_NAMES } from '../settings.js';
import { slotInfo, loadSlot, newProfile, deleteSlot, save, currentCarEntry } from '../save.js';
import { MAPS, MAP, ACHIEVEMENTS, LICENSES, DAILY_TEMPLATES, TIPS, RADIO, HOUSES, EMOTES, LOGIN_REWARDS } from '../data/content.js';
import { MISSIONS, MISSION, MTYPES, PARK_SUBS, missionDesc } from '../data/missions.js';
import { CAR } from '../data/cars.js';
import { missionUnlocked, licenseOk } from '../missions.js';
import { initAudio, applyVolumes, radio, sfx, suspendAudio } from '../audio.js';
import { requestTilt, resetLayout, input } from '../input.js';
import { poiName } from '../game.js';
import { Stage } from './stage.js';
import * as Shop from './shop.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class UI {
  constructor(renderer) {
    this.r = renderer;
    this.root = document.getElementById('ui');
    this.stage = new Stage(renderer);
    this.stack = [];
    Shop.bind(this);
  }
  get game() { return G.game; }

  // ---------- genel yardımcılar ----------
  clear() { this.root.innerHTML = ''; this.stack = []; }
  screen(title, body, o = {}) {
    const back = o.back !== false;
    const s = el('div', { class: 'screen ' + (o.cls || '') },
      el('div', { class: 'scr-head' },
        back ? el('button', { class: 'btn back', onclick: () => (o.onBack ? o.onBack() : this.back()) }, '‹ ' + t('Geri')) : null,
        el('h2', {}, title),
        el('div', { class: 'wallet' }, el('span', {}, '💰 ' + fmtNum(G.profile ? G.profile.money : 0)), el('span', {}, '🪙 ' + fmtNum(G.profile ? G.profile.gold : 0))),
      ),
      el('div', { class: 'scr-body' }, body),
    );
    this.root.innerHTML = '';
    this.root.appendChild(s);
    return s;
  }
  go(fn, ...args) { this.stack.push([fn, args]); fn.apply(this, args); sfx('click'); }
  back() { this.stack.pop(); const top = this.stack[this.stack.length - 1]; if (top) top[0].apply(this, top[1]); else this.mainMenu(); sfx('click'); }
  refreshWallet() { const w = this.root.querySelector('.wallet'); if (w && G.profile) w.innerHTML = `<span>💰 ${fmtNum(G.profile.money)}</span><span>🪙 ${fmtNum(G.profile.gold)}</span>`; }
  tabs(list, active, onPick) {
    return el('div', { class: 'tabs' }, ...list.map(([id, label]) => el('button', { class: 'tab' + (id === active ? ' on' : ''), onclick: () => onPick(id) }, label)));
  }
  dialog(title, body, buttons, o = {}) {
    const ov = el('div', { class: 'overlay dlg' + (o.cls ? ' ' + o.cls : '') });
    const close = () => { ov.remove(); if (o.onClose) o.onClose(); };
    ov.appendChild(el('div', { class: 'card' }, el('h3', {}, title), typeof body === 'string' ? el('p', {}, body) : body,
      el('div', { class: 'row' }, ...buttons.map((b) => el('button', { class: 'btn ' + (b.cls || ''), onclick: () => { if (!b.keep) close(); b.fn && b.fn(); } }, b.label)))));
    document.body.appendChild(ov);
    return { ov, close };
  }
  confirm(text, onYes, price) {
    sfx('click');
    this.dialog(t('Emin misin?'), el('div', {}, el('p', {}, text), price ? el('p', { class: 'price-big' }, price) : null), [
      { label: t('Vazgeç') },
      { label: t('Evet'), cls: 'primary', fn: onYes },
    ]);
  }
  canPay(money, gold = 0) {
    const p = G.profile;
    if (p.money < money) { this.dialog(t('Yetersiz para'), t('Bu işlem için {m} para gerekli.', { m: fmtNum(money) }), [{ label: t('Tamam') }]); return false; }
    if (p.gold < gold) { this.dialog(t('Yetersiz altın'), t('Bu işlem için {g} altın gerekli. Altın; zor görevler, elmas sandıklar ve başarımlardan kazanılır.', { g: gold }), [{ label: t('Tamam') }]); return false; }
    return true;
  }
  pay(money, gold = 0) { const p = G.profile; p.money -= money; p.gold -= gold; if (money) this.game.hud.money(-money); this.refreshWallet(); save(true); }
  priceTag(money, gold) { return gold ? `🪙 ${gold}` : money ? `💰 ${fmtNum(money)}` : t('Ücretsiz'); }

  // ---------- yükleme ----------
  loading(show, p = 0, tip) {
    const L = $('#loading');
    L.style.display = show ? 'flex' : 'none';
    if (p !== undefined) $('#loadBar').style.width = Math.round(p * 100) + '%';
    if (tip) $('#loadTip').textContent = '💡 ' + tip;
  }

  // ---------- başlangıç: kayıt slotları ----------
  title() {
    G.mode = 'menu';
    this.stage.showCar({ id: 'kivi', cos: { paint: '#7bc043' }, upgrades: {}, tuning: {} });
    const slots = [0, 1, 2].map((i) => {
      const info = slotInfo(i);
      return el('div', { class: 'slot' },
        el('div', { class: 'slot-info', onclick: () => this.startSlot(i) },
          el('b', {}, t('Kayıt {n}', { n: i + 1 })),
          info ? el('span', {}, `${info.name} — ${t('Sv')} ${info.level} — 💰 ${fmtNum(info.money)} — 🚗 ${info.cars}`) : el('span', { class: 'muted' }, t('Boş — yeni oyun')),
          info ? el('small', { class: 'muted' }, new Date(info.saved).toLocaleString()) : null),
        info ? el('button', { class: 'btn small danger', onclick: () => this.confirm(t('Bu kaydı silmek istiyor musun?'), () => { deleteSlot(i); this.title(); }) }, '🗑') : null);
    });
    this.root.innerHTML = '';
    this.root.appendChild(el('div', { class: 'title-screen' },
      el('div', { class: 'logo' }, el('h1', {}, 'OTO', el('span', {}, 'DÜNYA')), el('p', {}, t('Açık Dünya Sürüş • Park • Yarış'))),
      el('div', { class: 'slots' }, ...slots),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => { this.stack = [[this.title, []]]; this.settings(); } }, '⚙️ ' + t('Ayarlar')),
        el('button', { class: 'btn', onclick: () => { G.settings.lang = G.settings.lang === 'tr' ? 'en' : 'tr'; saveSettings(); this.title(); } }, G.settings.lang === 'tr' ? '🇬🇧 English' : '🇹🇷 Türkçe')),
      el('p', { class: 'muted small' }, t('Tüm marka ve araç isimleri hayalidir.')),
    ));
  }
  startSlot(i) {
    initAudio();
    let p = loadSlot(i);
    G.slot = i;
    if (!p) {
      // yeni oyun: isim sor
      const inp = el('input', { type: 'text', maxlength: 16, value: t('Sürücü'), class: 'input' });
      this.dialog(t('Yeni oyun'), el('div', {}, el('p', {}, t('Sürücü adın:')), inp), [{ label: t('Başla'), cls: 'primary', fn: () => {
        const prof = newProfile((inp.value || 'Sürücü').trim().slice(0, 16));
        G.profile = prof; save(true);
        this.afterLoad(true);
      } }]);
      setTimeout(() => inp.select(), 50);
      return;
    }
    G.profile = p;
    this.afterLoad(false);
  }
  async afterLoad(isNew) {
    const g = this.game;
    g.ensureDaily();
    const lr = g.loginReward();
    if (G.settings.radioOn) radio.start(G.settings.radio);
    await g.loadMap(G.profile.lastMap && MAP[G.profile.lastMap] && G.profile.level >= MAP[G.profile.lastMap].level ? G.profile.lastMap : 'city');
    this.clear();
    $('#hud').style.display = '';
    g.setOnFoot(false);
    if (lr) this.loginDialog(lr);
    if (!G.profile.tutorialDone) this.tutorial();
    this.benchmarkLater();
  }
  loginDialog(r) {
    const days = LOGIN_REWARDS.map((x, i) => el('div', { class: 'day' + (i + 1 < r.day ? ' got' : i + 1 === r.day ? ' today' : '') }, el('b', {}, t('Gün {n}', { n: i + 1 })), el('span', {}, '💰' + fmtNum(x.money)), x.gold ? el('span', {}, '🪙' + x.gold) : null));
    this.dialog(t('Günlük Hediye!'), el('div', {}, el('div', { class: 'days' }, ...days), el('p', {}, t('7 gün üst üste girersen büyük ödül!'))), [{ label: t('Topla'), cls: 'primary', fn: () => { sfx('coin'); this.game.hud.updateProfile(); } }], { cls: 'login' });
  }

  // ---------- ana menü ----------
  mainMenu() {
    G.mode = 'menu';
    this.game.pauseSoft(true);
    this.game.touch.setMode('none');
    $('#hud').style.display = 'none';
    this.stack = [];
    this.stage.showCar(currentCarEntry());
    const p = G.profile;
    const B = (icon, label, fn, cls = '') => el('button', { class: 'mbtn ' + cls, onclick: fn }, el('span', { class: 'mi' }, icon), el('span', {}, label));
    this.root.innerHTML = '';
    this.root.appendChild(el('div', { class: 'main-menu' },
      el('div', { class: 'mm-head' }, el('h1', {}, 'OTO', el('span', {}, 'DÜNYA')),
        el('div', { class: 'mm-player' }, el('b', {}, p.name), el('span', {}, `${t('Sv')} ${p.level}`), el('span', {}, '💰 ' + fmtNum(p.money)), el('span', {}, '🪙 ' + fmtNum(p.gold)), el('span', {}, '🪪 ' + p.licenses.join(' ')))),
      el('div', { class: 'mm-grid' },
        B('🚗', t('Serbest Sürüş'), () => this.go(this.mapSelect), 'big primary'),
        B('🎯', t('Görevler'), () => this.go(this.missionsMenu)),
        B('🔩', t('Garaj'), () => this.go(Shop.garage)),
        B('🏪', t('Galeri'), () => this.go(Shop.gallery)),
        B('🧍', t('Karakter'), () => this.go(Shop.character)),
        B('🏆', t('Başarımlar'), () => this.go(this.achievements)),
        B('📅', t('Etkinlikler'), () => this.go(this.events)),
        B('⚙️', t('Ayarlar'), () => this.go(this.settings)),
        B('🌐', t('Çok Oyunculu'), () => this.dialog(t('Çok Oyunculu'), t('Çevrim içi mod geliştirme aşamasında (ileri aşama). Şimdilik tek oyunculu oynayabilirsin.'), [{ label: t('Tamam') }])),
        B('💾', t('Kayıt Seç'), () => { save(true); this.title(); }),
      ),
      el('button', { class: 'btn primary continue', onclick: () => this.resumeGame() }, '▶ ' + t('Sürüşe devam et')),
    ));
  }
  resumeGame() {
    this.clear();
    G.mode = 'play';
    $('#hud').style.display = '';
    this.game.resume();
    this.game.setOnFoot(this.game.onFoot);
    this.game.hud.updateProfile();
  }

  // ---------- duraklat ----------
  pause() {
    const g = this.game;
    G.paused = true;
    sfx('click');
    const close = () => { ov.remove(); G.paused = false; };
    const B = (label, fn, cls = '') => el('button', { class: 'btn wide ' + cls, onclick: () => { fn(); } }, label);
    const weather = el('div', { class: 'row small' }, ...[['auto', '🔄'], ['sunny', '☀️'], ['rain', '🌧️'], ['fog', '🌫️']].map(([w, ic]) => el('button', { class: 'btn small', onclick: () => { if (w === 'auto') g.weatherLock = false; else { g.weatherLock = true; g.setWeather(w); } } }, ic)));
    const timeRow = el('div', { class: 'row small' }, ...[[0.3, '🌅'], [0.5, '☀️'], [0.75, '🌇'], [0.95, '🌙']].map(([v, ic]) => el('button', { class: 'btn small', onclick: () => { G.dayTime = v; } }, ic)));
    const ov = el('div', { class: 'overlay pause' }, el('div', { class: 'card' },
      el('h2', {}, t('Duraklatıldı')),
      B('▶ ' + t('Devam et'), close, 'primary'),
      B('↺ ' + t('Aracı sıfırla'), () => { g.resetCar(); close(); }),
      B('🛣 ' + t('En yakın yola ışınlan'), () => { g.recoverCar(); close(); }),
      g.car.fuel < 0.05 ? B('⛽ ' + t('Yol yardımı (yarım depo) — 500'), () => { if (this.canPay(500)) { this.pay(500); g.car.fuel = 0.5; close(); } }) : null,
      g.missions.active ? B('✖ ' + t('Görevi iptal et'), () => { g.missions.abort(); close(); }, 'danger') : null,
      el('div', { class: 'row' }, B('📷 ' + t('Foto modu'), () => { close(); this.photoMode(); }), B('🚁 ' + t('Drone'), () => { close(); g.startDrone(); })),
      el('div', { class: 'row' }, B('📻 ' + t('Radyo'), () => g.cycleRadio()), B('😀 ' + t('Emote'), () => { close(); this.emoteMenu(); })),
      el('label', { class: 'lbl' }, t('Hava durumu')), weather,
      el('label', { class: 'lbl' }, t('Saat')), timeRow,
      B('⚙️ ' + t('Ayarlar'), () => { ov.remove(); this.stack = [[() => { this.clear(); this.pause(); }, []]]; this.settings(true); }),
      B('🏠 ' + t('Ana menü'), () => { ov.remove(); G.paused = false; g.save(); this.mainMenu(); }),
      el('p', { class: 'muted small keys' }, t('Klavye: WASD/oklar sür • Boşluk el freni • Shift nitro • F in/bin • L far • H korna • Q/E sinyal • C kamera • M harita • P foto • G etkileşim • R/V vites • K hız sabitleyici • N radyo • O drone • J polis modu • 1-4 kapı/kaput/bagaj/cam • Z dörtlü • X uzun far • T emote')),
    ));
    document.body.appendChild(ov);
  }

  // ---------- harita seçimi ----------
  mapSelect(fromTeleport) {
    const p = G.profile;
    const cards = MAPS.map((m) => {
      const locked = p.level < m.level;
      const done = MISSIONS.filter((x) => x.map === m.id && p.missions[x.id]).length, total = MISSIONS.filter((x) => x.map === m.id).length;
      const house = p.houses.some((h) => HOUSES.find((x) => x.id === h && x.map === m.id));
      return el('div', { class: 'map-card' + (locked ? ' locked' : '') + (G.mapId === m.id ? ' cur' : ''), style: { '--c': m.color }, onclick: () => {
        if (locked) { this.dialog(t('Kilitli'), t('Bu harita {l}. seviyede açılır.', { l: m.level }), [{ label: t('Tamam') }]); return; }
        this.clear(); this.travel(m.id);
      } },
        el('div', { class: 'map-ico' }, ['🏙️', '🏜️', '⛰️', '🌲', '🏝️', '🏁', '✈️'][MAPS.indexOf(m)]),
        el('h3', {}, t(m.name)),
        locked ? el('span', { class: 'lock' }, '🔒 ' + t('Seviye {l}', { l: m.level })) : el('span', {}, `🎯 ${done}/${total}` + (house ? ' • 🏡' : '') + (G.mapId === m.id ? ' • ' + t('Buradasın') : '')),
      );
    });
    this.screen(fromTeleport ? t('Işınlanma') : t('Serbest Sürüş — Harita Seç'), el('div', { class: 'map-grid' }, ...cards), fromTeleport ? { onBack: () => this.resumeGame() } : {});
  }
  async travel(id, then) {
    $('#hud').style.display = '';
    if (G.mapId !== id || !this.game.world) await this.game.loadMap(id);
    this.resumeGame();
    if (then) then();
  }

  // ---------- görevler ----------
  missionsMenu(mapId = G.mapId || 'city') {
    const p = G.profile;
    const list = MISSIONS.filter((m) => m.map === mapId);
    const items = list.map((m) => {
      const un = missionUnlocked(m, p) && p.level >= MAP[m.map].level;
      const lic = licenseOk(m, p);
      const stars = p.missions[m.id] || 0;
      return el('div', { class: 'mis-card' + (un ? '' : ' locked') },
        el('div', { class: 'mis-ico' }, MTYPES[m.type].icon),
        el('div', { class: 'mis-info' },
          el('b', {}, `${m.n}. ${t(m.name)}`),
          el('small', {}, t(MTYPES[m.type].name) + (m.sub ? ' — ' + t(PARK_SUBS[m.sub]) : '') + ' • ' + t('Zorluk') + ' ' + '▮'.repeat(m.tier)),
          el('small', { class: 'muted' }, t(missionDesc(m))),
          el('span', { class: 'mis-rew' }, `💰 ${fmtNum(m.reward)}+  ⭐ ${m.xp} XP` + (m.gold ? `  🪙 ${m.gold}` : '') + (m.license && !lic ? `  🪪 ${t(m.license === 'C' ? 'C Sınıfı Ehliyet' : 'Yarış Lisansı')}` : '')),
        ),
        el('div', { class: 'mis-right' }, el('div', { class: 'stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
          un ? el('button', { class: 'btn small primary', disabled: !lic, onclick: () => this.launchMission(m) }, t('Başlat')) : el('span', { class: 'muted' }, '🔒')),
      );
    });
    const total = MISSIONS.length, done = Object.keys(p.missions).filter((k) => MISSION[k]).length, stars = Object.entries(p.missions).filter(([k]) => MISSION[k]).reduce((a, [, b]) => a + b, 0);
    const lic = el('div', { class: 'lic-row' }, ...LICENSES.map((L) => el('span', { class: 'lic' + (p.licenses.includes(L.id) ? ' on' : '') }, '🪪 ' + t(L.name))));
    this.screen(t('Görevler'), el('div', {},
      el('p', { class: 'muted' }, t('Tamamlanan: {a}/{b} • Yıldız: {s}/{m}', { a: done, b: total, s: stars, m: total * 3 })),
      lic,
      this.tabs(MAPS.map((m) => [m.id, (p.level < m.level ? '🔒 ' : '') + t(m.name)]), mapId, (id) => this.missionsMenu(id)),
      el('div', { class: 'mis-list' }, ...items)));
  }
  launchMission(m) {
    const p = G.profile;
    if (p.level < MAP[m.map].level) { this.dialog(t('Kilitli'), t('Bu harita {l}. seviyede açılır.', { l: MAP[m.map].level }), [{ label: t('Tamam') }]); return; }
    this.clear();
    this.travel(m.map, () => this.game.missions.start(m));
  }
  missionBrief(m) {
    const p = G.profile;
    this.game.pauseSoft(true);
    const stars = p.missions[m.id] || 0;
    this.dialog(`${MTYPES[m.type].icon} ${t(m.name)}`, el('div', {},
      el('p', {}, t(missionDesc(m))),
      el('p', { class: 'muted' }, t(MTYPES[m.type].name) + (m.sub ? ' — ' + t(PARK_SUBS[m.sub]) : '')),
      el('p', {}, `💰 ${fmtNum(m.reward)}+ • ⭐ ${m.xp} XP` + (m.gold ? ` • 🪙 ${m.gold}` : '')),
      el('div', { class: 'stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      ['taxi', 'tow', 'cargo'].includes(m.type) ? el('p', { class: 'muted small' }, t('Bu görev için iş aracı verilecek.')) : null,
    ), [{ label: t('Vazgeç'), fn: () => this.game.pauseSoft(false) }, { label: t('Başlat'), cls: 'primary', fn: () => { this.game.pauseSoft(false); this.game.missions.start(m); } }]);
  }
  licenseAward(L) {
    this.dialog('🪪 ' + t('Yeni lisans!'), el('div', {}, el('h2', {}, t(L.name)), el('p', {}, t(L.desc))), [{ label: t('Harika!'), cls: 'primary' }]);
  }
  secretCar(id, why) {
    this.dialog('🔓 ' + t('Gizli araç!'), el('div', {}, el('h2', {}, CAR[id].name), el('p', {}, why), el('p', { class: 'muted' }, t('Araç garajına eklendi.'))), [{ label: t('Harika!'), cls: 'primary' }]);
  }

  // ---------- etkinlikler ----------
  events() {
    const g = this.game, p = G.profile;
    g.ensureDaily();
    const daily = p.daily.tasks.map((task) => {
      const tp = DAILY_TEMPLATES.find((x) => x.id === task.id);
      const pr = g.dailyProgress(task);
      return el('div', { class: 'task' + (task.done ? ' done' : '') }, el('b', {}, t(tp.text, { n: fmtNum(task.n) })), el('div', { class: 'mp-bar' }, el('i', { style: { width: (pr / task.n) * 100 + '%' } })), el('small', {}, `${fmtNum(pr)}/${fmtNum(task.n)} • 💰 ${fmtNum(task.money)} + 🪙1`));
    });
    // haftalık turnuva
    const wk = weekKey();
    const tour = this.tournamentDef();
    const rivals = this.tournamentBoard(tour);
    const board = el('ol', { class: 'board' }, ...rivals.map((r) => el('li', { class: r.me ? 'me' : '' }, `${r.name} — ${r.time.toFixed(2)} sn`)));
    const hunt = g.chests;
    const huntBtn = hunt.huntActive() ? el('p', {}, t('Sandık avı devam ediyor!')) : el('button', { class: 'btn primary', disabled: !hunt.canStartHunt(), onclick: () => { hunt.startHunt(false); this.resumeGame(); } }, hunt.canStartHunt() ? t('Sandık Avını Başlat (haftada 1)') : t('Bu hafta kullanıldı'));
    const holiday = new Date().getMonth() === 11;
    this.screen(t('Etkinlikler'), el('div', { class: 'events' },
      el('section', {}, el('h3', {}, '📅 ' + t('Günlük görevler')), ...daily),
      el('section', {}, el('h3', {}, '🏆 ' + t('Haftalık Turnuva')), el('p', {}, t('Bu haftanın pisti: {m} ({w})', { m: t(MAP[tour.map].name), w: wk })), el('p', { class: 'muted' }, t('İlk 3\'e gir, özel ödülü kap! (Yarış lisansı gerekli)')), board,
        el('button', { class: 'btn primary', disabled: !p.licenses.includes('R'), onclick: () => { this.clear(); this.travel(tour.map, () => this.game.missions.start(tour)); } }, t('Turnuvaya katıl'))),
      el('section', {}, el('h3', {}, '🎁 ' + t('Sandık Avı')), el('p', {}, t('Her hafta 15 dakika boyunca haritaya 3 kat fazla sandık düşer. Cumartesi 20:00\'de otomatik başlar ya da istediğin zaman bir kez başlatabilirsin.')), huntBtn),
      el('section', {}, el('h3', {}, '🎄 ' + t('Tema etkinlikleri')), el('p', {}, holiday ? t('Yılbaşı etkinliği aktif: haritalar karlı, sandıklar hediye kutusu!') : t('Özel günlerde (yılbaşı) haritalar karla kaplanır ve sandıklar hediye kutusuna dönüşür.'))),
    ));
  }
  tournamentDef() {
    const wk = weekKey();
    const h = hashStr(wk);
    const maps = ['track', 'city', 'mountain', 'island', 'highway', 'airport'];
    const map = maps[h % maps.length];
    return { id: 'tour', tournament: true, map, type: 'race', tier: 8, n: 0, name: 'Haftalık Turnuva', reward: 15000, xp: 500, gold: 5, seed: h, week: wk };
  }
  tournamentBoard(tour) {
    const names = ['Rüzgar', 'Kartal_34', 'DriftUstası', 'GeceSürücü', 'Turbo', 'AsfaltKedi', 'Şimşek06', 'Pist_Kurdu', 'Viraj', 'Kaptan'];
    const r = (k) => ((hashStr(tour.week + k) % 1000) / 1000);
    const base = { track: 95, city: 110, mountain: 210, island: 190, highway: 160, airport: 170 }[tour.map];
    const list = names.map((n, i) => ({ name: n, time: base * (0.92 + r(n) * 0.25) }));
    const tb = G.profile.tournament;
    if (tb.week === tour.week && tb.best) list.push({ name: G.profile.name, time: tb.best, me: true });
    list.sort((a, b) => a.time - b.time);
    return list.slice(0, 10);
  }

  // ---------- başarımlar / istatistikler ----------
  achievements(tab = 'ach') {
    const p = G.profile, g = this.game;
    let body;
    if (tab === 'ach') {
      body = el('div', { class: 'ach-grid' }, ...ACHIEVEMENTS.map((a) => {
        const got = p.achievements[a.id];
        const pr = clamp(g.statVal(a.stat) / a.goal, 0, 1);
        return el('div', { class: 'ach' + (got ? ' got' : '') }, el('b', {}, (got ? '🏆 ' : '🔒 ') + t(a.name)), el('small', {}, t(a.desc)), el('div', { class: 'mp-bar' }, el('i', { style: { width: pr * 100 + '%' } })), el('small', { class: 'muted' }, (a.money ? '💰 ' + fmtNum(a.money) + ' ' : '') + (a.gold ? '🪙 ' + a.gold : '')));
      }));
    } else if (tab === 'stats') {
      const s = p.stats;
      const row = (k, v) => el('div', { class: 'stat' }, el('span', {}, k), el('b', {}, v));
      body = el('div', { class: 'stats' },
        row(t('Toplam sürüş mesafesi'), s.distance.toFixed(1) + ' km'),
        row(t('En yüksek hız'), Math.round(speedVal(s.topSpeed)) + ' ' + speedUnit()),
        row(t('En uzun drift'), fmtNum(s.longestDrift) + ' ' + t('puan')),
        row(t('En uzun atlama'), s.longestJump.toFixed(2) + ' sn'),
        row(t('Toplam kazanılan para'), fmtNum(s.moneyEarned)),
        row(t('Açılan sandık'), fmtNum(s.chests)),
        row(t('Tamamlanan görev'), fmtNum(s.missionsDone)),
        row(t('Toplam yıldız'), fmtNum(s.stars)),
        row(t('Yakın geçiş'), fmtNum(s.nearMiss)),
        row(t('Polisten kaçış'), fmtNum(s.escapes)),
        row(t('Durdurulan araç (polis modu)'), fmtNum(s.busts)),
        row(t('Kazanılan yarış'), fmtNum(s.racesWon)),
        row(t('Oyun süresi'), Math.round((p.playTime || 0) / 60) + ' dk'),
      );
    } else {
      const lb = p.leaderboard;
      const list = (arr, fmtv) => el('ol', { class: 'board' }, ...(arr.length ? arr.map((x) => el('li', {}, fmtv(x))) : [el('li', { class: 'muted' }, t('Henüz kayıt yok'))]));
      body = el('div', { class: 'boards' },
        el('section', {}, el('h3', {}, '🚦 ' + t('Drag süreleri')), list(lb.drag, (x) => `${x.v.toFixed(3)} sn — ${t(MAP[x.map] ? MAP[x.map].name : x.map)}`)),
        el('section', {}, el('h3', {}, '💨 ' + t('Drift puanları')), list(lb.drift, (x) => `${fmtNum(x.v)} — ${t(MAP[x.map] ? MAP[x.map].name : x.map)}`)),
        el('section', {}, el('h3', {}, '🏁 ' + t('Yarış süreleri')), list(Object.entries(lb.race).map(([k, v]) => ({ k, v: v[0] })), (x) => `${MISSION[x.k] ? t(MISSION[x.k].name) : x.k}: ${x.v.toFixed(2)} sn`)),
      );
    }
    this.screen(t('Başarımlar'), el('div', {}, this.tabs([['ach', t('Başarımlar')], ['stats', t('İstatistikler')], ['lb', t('Liderlik')]], tab, (x) => this.achievements(x)), body));
  }

  // ---------- ayarlar ----------
  settings(fromPause, tab = 'general') {
    const S = G.settings;
    const set = (k, v, after) => { S[k] = v; saveSettings(); if (after) after(); };
    const toggle = (label, k, after) => el('label', { class: 'set-row' }, el('span', {}, label), el('input', { type: 'checkbox', checked: S[k], onchange: (e) => set(k, e.target.checked, after) }));
    const slider = (label, k, min, max, step, after, fmtv = (v) => v) => {
      const val = el('b', {}, fmtv(S[k]));
      return el('label', { class: 'set-row' }, el('span', {}, label), el('input', { type: 'range', min, max, step, value: S[k], oninput: (e) => { set(k, +e.target.value, after); val.textContent = fmtv(+e.target.value); } }), val);
    };
    const choice = (label, k, opts, after) => el('div', { class: 'set-row' }, el('span', {}, label), el('div', { class: 'seg' }, ...opts.map(([v, l]) => el('button', { class: 'btn small' + (S[k] === v ? ' on' : ''), onclick: () => { set(k, v, after); this.settings(fromPause, tab); } }, l))));
    const g = this.game;
    const gfx = () => { if (g) { g.applyShadowQuality(); } emit('graphics'); };
    let body;
    if (tab === 'general') {
      body = el('div', {},
        choice(t('Dil / Language'), 'lang', [['tr', 'Türkçe'], ['en', 'English']], () => { if (g && g.hud) { g.hud.build(); } }),
        choice(t('Hız birimi'), 'units', [['kmh', 'km/s'], ['mph', 'mph']], () => g && g.hud.setUnits()),
        toggle(t('Renk körü modu'), 'colorblind', () => document.body.classList.toggle('cb', S.colorblind)),
        slider(t('Yazı boyutu'), 'textSize', 0.8, 1.4, 0.05, () => document.documentElement.style.setProperty('--ts', S.textSize), (v) => Math.round(v * 100) + '%'),
        toggle(t('Titreşim (mobil)'), 'vibration'),
        toggle(t('Park yardım okları'), 'parkHelp'),
        toggle(t('Otomatik silecek (yağmurda)'), 'autoWipers'),
        el('button', { class: 'btn', onclick: () => { if (G.profile) { G.profile.tutorialDone = false; this.dialog(t('Eğitim'), t('Eğitim bir sonraki sürüşte tekrar gösterilecek.'), [{ label: t('Tamam') }]); } } }, t('Eğitimi tekrar göster')),
      );
    } else if (tab === 'graphics') {
      body = el('div', {},
        el('div', { class: 'set-row' }, el('span', {}, t('Ön ayar')), el('div', { class: 'seg' }, ...PRESET_ORDER.map((pn) => el('button', { class: 'btn small' + (S.preset === pn ? ' on' : ''), onclick: () => { applyPreset(pn); gfx(); this.settings(fromPause, tab); } }, t(PRESET_NAMES[pn]))))),
        choice(t('FPS sınırı'), 'fpsCap', [[30, '30'], [60, '60'], [90, '90'], [0, t('Sınırsız')]]),
        toggle(t('FPS sayacı'), 'showFps'),
        toggle(t('Dinamik çözünürlük'), 'dynamicRes'),
        toggle(t('Uyarlanabilir kalite'), 'adaptive'),
        toggle(t('Pil tasarruf modu (30 FPS)'), 'batterySaver', gfx),
        slider(t('Çözünürlük ölçeği'), 'resScale', 0.5, 1, 0.05, () => emit('resize'), (v) => Math.round(v * 100) + '%'),
        choice(t('Gölge kalitesi'), 'shadows', [[0, t('Kapalı')], [1, t('Düşük')], [2, t('Orta')], [3, t('Yüksek')]], gfx),
        choice(t('Yansımalar'), 'reflections', [[0, t('Kapalı')], [1, t('Açık')], [2, t('Yüksek')]], gfx),
        slider(t('Görüş mesafesi'), 'viewDist', 200, 1200, 50, null, (v) => v + ' m'),
        slider(t('Trafik ve yaya yoğunluğu'), 'traffic', 0, 1.5, 0.05, null, (v) => Math.round(v * 100) + '%'),
        slider(t('Parçacık efektleri'), 'particles', 0, 1, 0.05, null, (v) => Math.round(v * 100) + '%'),
        toggle(t('Hız bulanıklığı'), 'motionBlur'),
        toggle(t('Kenar yumuşatma (yeniden başlatma gerekir)'), 'aa'),
        el('p', { class: 'muted small' }, t('Trafik yoğunluğu değişikliği harita yeniden yüklenince uygulanır.')),
      );
    } else if (tab === 'controls') {
      body = el('div', {},
        choice(t('Mobil kontrol'), 'mobileControl', [['buttons', t('Butonlar')], ['wheel', t('Direksiyon')], ['tilt', t('Eğerek')]], async () => { if (S.mobileControl === 'tilt') await requestTilt(); g && g.touch.setMode(g.onFoot ? 'foot' : 'car'); }),
        slider(t('Eğme hassasiyeti'), 'tiltSens', 0.5, 2, 0.1),
        slider(t('Direksiyon hassasiyeti'), 'steerSens', 0.5, 1.5, 0.05),
        slider(t('Buton boyutu'), 'btnScale', 0.6, 1.6, 0.05, () => g && g.touch.layout(), (v) => Math.round(v * 100) + '%'),
        slider(t('Buton şeffaflığı'), 'btnOpacity', 0.15, 1, 0.05, () => g && g.touch.layout(), (v) => Math.round(v * 100) + '%'),
        el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => this.editLayout() }, '✋ ' + t('Buton yerlerini düzenle')), el('button', { class: 'btn', onclick: () => resetLayout() }, t('Varsayılana dön'))),
        choice(t('Vites'), 'gearbox', [['auto', t('Otomatik')], ['manual', t('Manuel')]], () => g && g.touch.setMode(g.onFoot ? 'foot' : 'car')),
        toggle('ABS', 'abs'), toggle(t('Çekiş kontrolü (TCS)'), 'tcs'), toggle(t('Denge kontrolü (ESC)'), 'esc'),
        toggle(t('Kamerayı ters çevir'), 'invertCam'),
        el('p', { class: 'muted small' }, t('Oyun kolu desteklenir: RT gaz, LT fren, A el freni, X nitro, Y in/bin, B etkileşim, LB/RB vites.')),
      );
    } else {
      const vol = (label, k) => slider(label, k, 0, 1, 0.05, applyVolumes, (v) => Math.round(v * 100) + '%');
      body = el('div', {},
        vol(t('Ana ses'), 'volMaster'), vol(t('Müzik (radyo)'), 'volMusic'), vol(t('Motor'), 'volEngine'), vol(t('Efektler'), 'volSfx'), vol(t('Ortam'), 'volAmbient'),
        el('div', { class: 'set-row' }, el('span', {}, t('Radyo kanalı')), el('div', { class: 'seg wrap' }, ...RADIO.map((r, i) => el('button', { class: 'btn small' + (S.radioOn && S.radio === i ? ' on' : ''), onclick: () => { initAudio(); S.radioOn = true; S.radio = i; saveSettings(); radio.start(i); this.settings(fromPause, tab); } }, r.name)),
          el('button', { class: 'btn small' + (!S.radioOn ? ' on' : ''), onclick: () => { S.radioOn = false; saveSettings(); radio.stop(); this.settings(fromPause, tab); } }, t('Kapalı')))),
      );
    }
    this.screen(t('Ayarlar'), el('div', { class: 'settings' }, this.tabs([['general', t('Genel')], ['graphics', t('Grafik')], ['controls', t('Kontroller')], ['audio', t('Ses')]], tab, (x) => this.settings(fromPause, x)), body), { onBack: () => { if (fromPause) { this.clear(); this.pause(); } else this.back(); } });
  }
  editLayout() {
    const g = this.game;
    if (!g) return;
    const prev = this.root.innerHTML;
    this.root.style.display = 'none';
    g.touch.wrap.style.display = '';
    g.touch.edit(true);
    const done = el('button', { class: 'btn primary edit-done', onclick: () => { g.touch.edit(false); done.remove(); this.root.style.display = ''; g.touch.setMode('none'); } }, '✔ ' + t('Bitti — butonları sürükleyerek taşı'));
    document.body.appendChild(done);
  }

  // ---------- POI ----------
  poi(poi) {
    const g = this.game, p = G.profile, car = g.car;
    const type = poi.type;
    g.pauseSoft(true);
    const done = () => g.pauseSoft(false);
    if (type === 'gallery') { this.openFromWorld(Shop.gallery); return; }
    if (type === 'garage') { this.openFromWorld(Shop.garage); return; }
    if (type === 'tuning') { this.openFromWorld(Shop.garage, undefined, 'tuning'); return; }
    if (type === 'clothes') { this.openFromWorld(Shop.character, 'shop'); return; }
    if (type === 'teleport') { G.mode = 'menu'; $('#hud').style.display = 'none'; g.touch.setMode('none'); this.mapSelect(true); return; }
    if (type === 'fuel') {
      const need = 1 - car.fuel;
      const cost = Math.round(need * (300 + car.p.mass / 8));
      this.dialog('⛽ ' + t('Benzin istasyonu'), el('div', {}, el('p', {}, t('Depo: %{p}', { p: Math.round(car.fuel * 100) })), el('p', {}, t('Depoyu doldur: {c} para', { c: fmtNum(cost) }))), [
        { label: t('Kapat'), fn: done },
        { label: t('Doldur'), cls: 'primary', fn: () => { if (need < 0.01) { g.toast(t('Depo zaten dolu')); done(); return; } if (this.canPay(cost)) { this.pay(cost); car.fuel = 1; g.toast(t('Depo dolduruldu ⛽')); } done(); } },
      ]);
    } else if (type === 'repair') {
      const cost = Math.round(car.damage * (800 + Math.max(0, car.p.spec.price) * 0.03));
      this.dialog('🔧 ' + t('Tamirhane'), el('div', {}, el('p', {}, t('Hasar: %{p}', { p: Math.round(car.damage * 100) })), el('p', {}, t('Tamir ücreti: {c}', { c: fmtNum(cost) }))), [
        { label: t('Kapat'), fn: done },
        { label: t('Tamir et'), cls: 'primary', fn: () => { if (car.damage < 0.01) { g.toast(t('Araç zaten sağlam')); done(); return; } if (this.canPay(cost)) { this.pay(cost); car.damage = 0; g.carModel.repair(); g.toast(t('Araç tamir edildi 🔧')); } done(); } },
      ]);
    } else if (type === 'wash') {
      const cost = 150;
      this.dialog('🧽 ' + t('Oto yıkama'), el('div', {}, el('p', {}, t('Kir: %{p}', { p: Math.round(car.dirt * 100) })), el('p', {}, t('Yıkama: {c}', { c: cost }))), [
        { label: t('Kapat'), fn: done },
        { label: t('Yıka'), cls: 'primary', fn: () => { if (this.canPay(cost)) { this.pay(cost); car.dirt = 0; g.carModel.setDirt(0); p.stats.washes++; g.toast(t('Araç pırıl pırıl ✨')); for (let i = 0; i < 40; i++) g.effects.waterSplash(car.pos.x + (Math.random() - 0.5) * 3, car.pos.y + 1, car.pos.z + (Math.random() - 0.5) * 4); } done(); } },
      ]);
    } else if (type === 'house') {
      const H = HOUSES.find((h) => h.map === G.mapId);
      const owned = p.houses.includes(H.id);
      this.dialog('🏡 ' + t(H.name), el('div', {}, el('p', {}, owned ? t('Bu ev senin. Bu haritada başlangıç noktan burası ve garajına +{n} araç yeri ekler.', { n: H.slots }) : t('Satın alırsan bu haritada başlangıç noktan olur ve garajına +{n} araç yeri eklenir.', { n: H.slots })), owned ? null : el('p', { class: 'price-big' }, '💰 ' + fmtNum(H.price))), owned ? [{ label: t('Kapat'), fn: done }, { label: t('Dinlen (sabaha geç)'), cls: 'primary', fn: () => { G.dayTime = 0.3; done(); } }] : [
        { label: t('Kapat'), fn: done },
        { label: t('Satın al'), cls: 'primary', fn: () => this.confirm(t('{h} satın alınsın mı?', { h: t(H.name) }), () => { if (this.canPay(H.price)) { this.pay(H.price); p.houses.push(H.id); g.toast(t('🏡 Ev satın alındı!'), 'gold'); save(true); } done(); }, '💰 ' + fmtNum(H.price)) },
      ]);
    } else if (type === 'cafe') {
      this.dialog('☕ ' + t('Kafe'), el('div', {}, el('p', {}, t('Bir kahve iç: nitro dolar (50 para).')), el('p', { class: 'muted' }, t('Kafenin içine yürüyerek girebilirsin.'))), [
        { label: t('Kapat'), fn: done },
        { label: t('Kahve al'), cls: 'primary', fn: () => { if (this.canPay(50)) { this.pay(50); car.nitro = 1; g.toast('☕ ' + t('Nitro doldu!')); } done(); } },
      ]);
    } else done();
  }
  openFromWorld(fn, ...args) {
    const g = this.game;
    G.mode = 'menu';
    $('#hud').style.display = 'none';
    g.touch.setMode('none');
    this.stack = [];
    const back = () => this.resumeGame();
    this.stack.push([back, []]);
    this.go(fn, ...args);
  }

  // ---------- emote ----------
  emoteMenu() {
    const g = this.game;
    g.emotes = EMOTES;
    const ov = el('div', { class: 'overlay emote' });
    const close = () => ov.remove();
    ov.appendChild(el('div', { class: 'card' }, el('h3', {}, t('Emote')), el('div', { class: 'emote-grid' }, ...EMOTES.map((e) => el('button', { class: 'btn', onclick: () => { close(); g.emote(e.id); } }, el('span', { class: 'big' }, e.emoji), el('small', {}, t(e.name))))), el('button', { class: 'btn', onclick: close }, t('Kapat'))));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  // ---------- foto modu ----------
  photoMode() {
    const g = this.game;
    G.mode = 'photo';
    g.camCtl.startPhoto(g.onFoot ? g.foot.pos : g.car.pos);
    g.touch.setMode('none');
    $('#hud').style.display = 'none';
    if (!this.composer) {
      this.composer = new EffectComposer(this.r);
      this.composer.addPass(new RenderPass(g.scene, g.camera));
      this.bokeh = new BokehPass(g.scene, g.camera, { focus: 8, aperture: 0.004, maxblur: 0.012 });
      this.composer.addPass(this.bokeh);
      this.composer.addPass(new OutputPass());
    }
    this.composer.setSize(innerWidth, innerHeight);
    this.photoDof = false;
    const canvas = this.r.domElement;
    const filters = [['none', t('Yok')], ['grayscale(1)', t('Siyah-beyaz')], ['sepia(0.8)', t('Sepya')], ['saturate(1.8) contrast(1.1)', t('Canlı')], ['contrast(1.3) brightness(0.9)', t('Sinematik')], ['hue-rotate(160deg) saturate(1.3)', t('Neon')]];
    let filter = 'none';
    const sl = (label, min, max, step, val, fn) => el('label', { class: 'set-row' }, el('span', {}, label), el('input', { type: 'range', min, max, step, value: val, oninput: (e) => fn(+e.target.value) }));
    const panel = el('div', { class: 'photo-ui' },
      el('div', { class: 'photo-panel' },
        el('h3', {}, '📷 ' + t('Foto modu')),
        sl(t('Yakınlaştırma'), 20, 90, 1, g.camCtl.photo.fov, (v) => (g.camCtl.photo.fov = v)),
        sl(t('Mesafe'), 2, 40, 0.5, g.camCtl.photo.dist, (v) => (g.camCtl.photo.dist = v)),
        sl(t('Eğim'), -0.5, 0.5, 0.01, 0, (v) => (g.camCtl.photo.roll = v)),
        el('label', { class: 'set-row' }, el('span', {}, t('Odak bulanıklığı')), el('input', { type: 'checkbox', onchange: (e) => (this.photoDof = e.target.checked) })),
        sl(t('Odak mesafesi'), 1, 40, 0.5, 8, (v) => (this.bokeh.uniforms.focus.value = v)),
        sl(t('Bulanıklık'), 0, 0.03, 0.001, 0.012, (v) => (this.bokeh.uniforms.maxblur.value = v)),
        el('div', { class: 'seg wrap' }, ...filters.map(([f, l]) => el('button', { class: 'btn small', onclick: () => { filter = f; canvas.style.filter = f === 'none' ? '' : f; } }, l))),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => panel.classList.toggle('hideui') }, '👁 ' + t('Arayüzü gizle')),
          el('button', { class: 'btn primary', onclick: () => this.capture(filter) }, '💾 ' + t('Kaydet')),
          el('button', { class: 'btn', onclick: () => this.exitPhoto() }, '✖ ' + t('Çık'))),
        el('p', { class: 'muted small' }, t('Sürükle: döndür • Tekerlek: mesafe • WASD: kamera')),
      ),
      el('button', { class: 'btn photo-show', onclick: () => panel.classList.remove('hideui') }, '👁'),
    );
    this.photoEl = panel;
    document.body.appendChild(panel);
  }
  capture(filter) {
    const g = this.game, r = this.r;
    if (this.photoDof) this.composer.render(); else r.render(g.scene, g.camera);
    const src = r.domElement;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    if (filter && filter !== 'none') x.filter = filter;
    x.drawImage(src, 0, 0);
    x.filter = 'none';
    x.font = `bold ${Math.round(c.height / 40)}px sans-serif`; x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText('OTODÜNYA', 20, c.height - 20);
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `otodunya_${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    sfx('shutter'); g.flash();
    G.profile.stats.photos++;
  }
  exitPhoto() {
    if (this.photoEl) this.photoEl.remove();
    this.r.domElement.style.filter = '';
    G.mode = 'play';
    $('#hud').style.display = '';
    this.game.setOnFoot(this.game.onFoot);
  }
  droneUI(on) {
    if (this.droneEl) { this.droneEl.remove(); this.droneEl = null; }
    if (!on) return;
    this.droneEl = el('div', { class: 'drone-ui' }, el('span', {}, '🚁 ' + t('Drone modu — WASD uç, sürükle bak, Shift hızlı, Boşluk yüksel')),
      el('button', { class: 'btn', onclick: () => this.game.exitDrone() }, '✖ ' + t('Çık')));
    document.body.appendChild(this.droneEl);
  }

  // ---------- eğitim ----------
  tutorial() {
    const g = this.game;
    const mobile = input.touch;
    const steps = [
      { text: mobile ? t('Sağdaki ⬆ ile gaz ver, ⬇ ile fren yap.') : t('W / ↑ ile gaz ver, S / ↓ ile fren yap ve geri git.'), done: () => g.car.kmh > 20 },
      { text: mobile ? t('Soldaki ◀ ▶ ile direksiyonu çevir. Ayarlardan direksiyon simidi veya eğerek sürmeyi seçebilirsin.') : t('A / D veya ← → ile direksiyonu çevir. Boşluk el freni, Shift nitro!'), done: () => Math.abs(g.car.yawRate) > 0.5 },
      { text: t('Haritadaki 🅿️ işaretleri park görevleridir. İşaretin içinde durup etkileşime geç (G / ✋).'), done: null },
      { text: t('Parlayan sandıklara araçla ya da yürüyerek değ: içinden para çıkar! Mini haritada ? olarak görünürler.'), done: null },
      { text: t('Aracını yükseltmek ve modifiye etmek için 🔩 garaja git ya da menüden Garaj\'ı aç.'), done: null },
    ];
    let i = 0;
    const box = el('div', { class: 'tutorial' });
    const render = () => {
      if (i >= steps.length) { box.remove(); G.profile.tutorialDone = true; save(true); g.toast(t('Eğitim tamamlandı! İyi sürüşler 🚗'), 'ok'); return; }
      box.innerHTML = '';
      box.append(el('b', {}, t('Eğitim {a}/{b}', { a: i + 1, b: steps.length })), el('p', {}, steps[i].text),
        el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { i = steps.length; render(); } }, t('Atla')), el('button', { class: 'btn small primary', onclick: () => { i++; render(); } }, t('İleri'))));
    };
    render();
    document.body.appendChild(box);
    const chk = setInterval(() => {
      if (!document.body.contains(box)) { clearInterval(chk); return; }
      const s = steps[i];
      if (s && s.done && G.mode === 'play' && s.done()) { i++; sfx('checkpoint'); render(); }
    }, 300);
  }

  // ---------- otomatik performans ----------
  benchmarkLater() {
    if (G.settings.benchmarked) return;
    setTimeout(() => {
      const fps = G.fpsAvg || 60;
      const S = G.settings;
      let idx = PRESET_ORDER.indexOf(S.preset);
      const target = S.fpsCap || 60;
      if (fps < target * 0.7 && idx > 0) idx = Math.max(0, idx - (fps < target * 0.45 ? 2 : 1));
      else if (fps > target * 0.98 && idx < 3 && G.refresh >= 90) idx++;
      applyPreset(PRESET_ORDER[idx]);
      S.benchmarked = true; saveSettings();
      this.game.applyShadowQuality();
      emit('resize');
      this.game.toast(t('Grafik ayarı cihazına göre seçildi: {p}', { p: t(PRESET_NAMES[PRESET_ORDER[idx]]) }));
    }, 8000);
  }
}

// turnuva sonucu
on('tournamentEnd', (m, time, stars) => {
  const p = G.profile, g = G.game, ui = g.ui;
  const tb = p.tournament;
  if (tb.week !== m.week) { tb.week = m.week; tb.best = null; tb.claimed = false; }
  if (!tb.best || time < tb.best) tb.best = time;
  const board = ui.tournamentBoard(m);
  const rank = board.findIndex((r) => r.me) + 1;
  let rewardTxt = '';
  if (rank >= 1 && rank <= 3 && !tb.claimed) {
    tb.claimed = true;
    const money = [30000, 20000, 12000][rank - 1], gold = [15, 10, 5][rank - 1];
    g.reward(money, gold, 500, t('Turnuva'));
    rewardTxt = t('Özel ödül: 💰 {m} + 🪙 {g}', { m: fmtNum(money), g: gold });
  }
  save(true);
  g.hud.result({ ok: true, title: t('Haftalık Turnuva'), stars, money: 0, xp: 0, extra: t('Süre: {s} sn — Sıralama: {r}. ', { s: time.toFixed(2), r: rank || '-' }) + rewardTxt });
});
