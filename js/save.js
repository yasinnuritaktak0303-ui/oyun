// Kayıt sistemi: 3 slot, otomatik kayıt
import { G, emit } from './core.js';
import { TUNING_DEFAULT } from './data/content.js';

const KEY = 'otoyol_save_';
let uidCounter = Date.now() % 100000;

export function newCarEntry(id) {
  return {
    uid: 'c' + (uidCounter++) + Math.floor(Math.random() * 1000),
    id,
    upgrades: { engine: 0, turbo: 0, gearbox: 0, exhaust: 0, brakes: 0, tires: 0, nitro: 0 },
    engineSwap: null,
    tuning: { ...TUNING_DEFAULT },
    tuningProfiles: {},
    tuningBought: {},
    cos: {
      paint: null, paintType: 'gloss', paint2: '#ffffff',
      vinyl: { id: 'none', color: '#ffffff', scale: 1, rot: 0, x: 0.5, y: 0.5 },
      kit: 0, spoiler: 0, rim: 0, rimColor: '#c0c0c0', rimSize: 0, tint: 0,
      light: '#ffffff', neon: 0, horn: 0, plate: { type: 0, text: '34 OYN 01' },
    },
    damage: 0, dirt: 0, fuel: 1,
  };
}

export function newProfile(name = 'Sürücü') {
  const kivi = newCarEntry('kivi');
  return {
    v: 1, name, created: Date.now(), playTime: 0,
    money: 5000, gold: 0, xp: 0, level: 1,
    cars: [kivi], currentCar: kivi.uid, garageTier: 0,
    houses: [], homeMap: 'city',
    char: { gender: 0, skin: 1, face: 0, hair: 0, hairColor: 1, beard: 0, glasses: 0, shirt: 's0', jacket: 'j0', pants: 'p0', shoes: 'f0', hat: 'h0' },
    clothes: ['s0', 'j0', 'p0', 'f0', 'h0'],
    goldUnlocks: [],
    licenses: ['B'],
    missions: {},
    achievements: {},
    stats: {
      distance: 0, topSpeed: 0, longestDrift: 0, longestJump: 0, moneyEarned: 0, chests: 0,
      goldChests: 0, diamondChests: 0, parkDone: 0, missionsDone: 0, stars: 0, nearMiss: 0,
      escapes: 0, busts: 0, racesWon: 0, washes: 0, photos: 0, jumps: 0, driftTotal: 0, rulesDone: 0, raceDone: 0,
    },
    chestsOpened: {}, keys: {}, goldFound: [],
    daily: null, login: { last: null, streak: 0 },
    radar: 0, tutorialDone: false,
    leaderboard: { drag: [], drift: [], race: {} },
    tournament: { week: null, best: null, claimed: false },
    mapsVisited: ['city'], lastMap: 'city', chestHuntWeek: null,
  };
}

export function slotInfo(i) {
  try {
    const raw = localStorage.getItem(KEY + i);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { name: p.name, level: p.level, money: p.money, cars: p.cars.length, saved: p.saved || p.created };
  } catch (e) { return null; }
}

export function loadSlot(i) {
  try {
    const raw = localStorage.getItem(KEY + i);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // eksik alanları tamamla (eski kayıtlar için)
    const base = newProfile(p.name);
    for (const k in base) if (p[k] === undefined) p[k] = base[k];
    for (const k in base.stats) if (p.stats[k] === undefined) p.stats[k] = 0;
    for (const c of p.cars) {
      const b = newCarEntry(c.id);
      for (const k in b) if (c[k] === undefined) c[k] = b[k];
      for (const k in b.cos) if (c.cos[k] === undefined) c.cos[k] = b.cos[k];
      for (const k in b.tuning) if (c.tuning[k] === undefined) c.tuning[k] = b.tuning[k];
    }
    return p;
  } catch (e) { return null; }
}

export function deleteSlot(i) { localStorage.removeItem(KEY + i); }

let lastSave = 0;
export function save(force = false) {
  if (!G.profile || G.slot === undefined) return;
  const now = performance.now();
  if (!force && now - lastSave < 3000) return;
  lastSave = now;
  try {
    G.profile.saved = Date.now();
    localStorage.setItem(KEY + G.slot, JSON.stringify(G.profile));
    localStorage.setItem(KEY + 'last', String(G.slot));
    emit('saved');
  } catch (e) { console.warn('Kayıt başarısız', e); }
}

export function lastSlot() {
  const v = localStorage.getItem(KEY + 'last');
  return v === null ? null : +v;
}

export function currentCarEntry() {
  const p = G.profile;
  return p.cars.find((c) => c.uid === p.currentCar) || p.cars[0];
}
