// Araç listesi (tamamı hayali isimler)
// drive: fwd | rwd | awd ; engine: i4 | v6 | v8 | v12 | ev ; body: model tipi
export const CLASSES = [
  { id: 'hatch', name: 'Hatchback' },
  { id: 'sedan', name: 'Sedan' },
  { id: 'suv', name: 'SUV ve Arazi' },
  { id: 'pickup', name: 'Pickup' },
  { id: 'sport', name: 'Spor' },
  { id: 'drift', name: 'Drift' },
  { id: 'muscle', name: 'Kas Arabası' },
  { id: 'super', name: 'Süper Spor' },
  { id: 'hyper', name: 'Hiper' },
  { id: 'work', name: 'İş Araçları' },
  { id: 'secret', name: 'Gizli' },
];

const C = (id, name, cls, vmax, t100, price, o = {}) => ({ id, name, cls, vmax, t100, price, ...o });

export const CARS = [
  C('kivi', 'Kivi', 'hatch', 160, 12, 0, { drive: 'fwd', engine: 'i4', mass: 1050, body: 'hatch', color: '#7bc043' }),
  C('minik', 'Minik', 'hatch', 165, 11.5, 8000, { drive: 'fwd', engine: 'i4', mass: 980, body: 'hatch', color: '#f4a261' }),
  C('serce', 'Serçe', 'hatch', 175, 10.5, 12000, { drive: 'fwd', engine: 'i4', mass: 1080, body: 'hatch', color: '#e9c46a' }),
  C('zipzip', 'Zıpzıp', 'hatch', 185, 9, 18000, { drive: 'fwd', engine: 'i4', mass: 1120, body: 'hatch', color: '#e76f51' }),

  C('doruk', 'Doruk', 'sedan', 190, 9.5, 15000, { drive: 'fwd', engine: 'i4', mass: 1350, body: 'sedan', color: '#457b9d' }),
  C('asil', 'Asil', 'sedan', 200, 9, 22000, { drive: 'fwd', engine: 'v6', mass: 1420, body: 'sedan', color: '#1d3557' }),
  C('vizyon', 'Vizyon', 'sedan', 210, 8, 30000, { drive: 'rwd', engine: 'v6', mass: 1450, body: 'sedan', color: '#a8dadc' }),
  C('prestij', 'Prestij', 'sedan', 230, 6.5, 55000, { drive: 'rwd', engine: 'v8', mass: 1650, body: 'sedan', color: '#222222' }),

  C('kaya', 'Kaya', 'suv', 170, 10, 28000, { drive: 'awd', engine: 'v6', mass: 1900, body: 'suv', color: '#6b705c' }),
  C('toros', 'Toros', 'suv', 185, 9, 35000, { drive: 'awd', engine: 'v6', mass: 1950, body: 'suv', color: '#cb997e' }),
  C('bozkurt', 'Bozkurt', 'suv', 200, 8, 40000, { drive: 'awd', engine: 'v8', mass: 2000, body: 'suv', color: '#495057' }),
  C('mamut', 'Mamut', 'suv', 210, 7, 85000, { drive: 'awd', engine: 'v8', mass: 2400, body: 'suv', color: '#283618' }),

  C('okuz', 'Öküz', 'pickup', 165, 11, 20000, { drive: 'rwd', engine: 'v6', mass: 1900, body: 'pickup', color: '#bc6c25' }),
  C('kartal', 'Kartal', 'pickup', 175, 10, 25000, { drive: 'awd', engine: 'v6', mass: 2000, body: 'pickup', color: '#dda15e' }),
  C('bizon', 'Bizon', 'pickup', 190, 8.5, 45000, { drive: 'awd', engine: 'v8', mass: 2200, body: 'pickup', color: '#9b2226' }),

  C('yildirim', 'Yıldırım', 'sport', 250, 5.5, 90000, { drive: 'rwd', engine: 'v6', mass: 1400, body: 'sport', color: '#ffd60a' }),
  C('akrep', 'Akrep', 'sport', 255, 5.2, 100000, { drive: 'rwd', engine: 'v6', mass: 1380, body: 'sport', color: '#d00000' }),
  C('puma', 'Puma', 'sport', 260, 5, 110000, { drive: 'awd', engine: 'v6', mass: 1450, body: 'sport', color: '#3a86ff' }),
  C('atmaca', 'Atmaca', 'sport', 265, 4.8, 130000, { drive: 'rwd', engine: 'v8', mass: 1420, body: 'sport', color: '#fb5607' }),

  C('kayikci', 'Kayıkçı', 'drift', 235, 5.3, 95000, { drive: 'rwd', engine: 'v6', mass: 1250, body: 'drift', color: '#ff006e' }),
  C('firtina', 'Fırtına', 'drift', 240, 5, 120000, { drive: 'rwd', engine: 'v6', mass: 1230, body: 'drift', color: '#8338ec' }),
  C('duman', 'Duman', 'drift', 245, 4.9, 140000, { drive: 'rwd', engine: 'v8', mass: 1260, body: 'drift', color: '#adb5bd' }),

  C('boga', 'Boğa', 'muscle', 265, 4.7, 160000, { drive: 'rwd', engine: 'v8', mass: 1700, body: 'muscle', color: '#6a040f' }),
  C('kasirga', 'Kasırga', 'muscle', 270, 4.5, 180000, { drive: 'rwd', engine: 'v8', mass: 1720, body: 'muscle', color: '#0077b6' }),
  C('gurzel', 'Gürzel', 'muscle', 280, 4.2, 210000, { drive: 'rwd', engine: 'v8', mass: 1750, body: 'muscle', color: '#111111' }),

  C('simsek', 'Şimşek', 'super', 320, 3.2, 350000, { drive: 'rwd', engine: 'v12', mass: 1450, body: 'super', color: '#ffbe0b' }),
  C('kobra', 'Kobra', 'super', 330, 3, 420000, { drive: 'awd', engine: 'v12', mass: 1500, body: 'super', color: '#38b000' }),
  C('anka', 'Anka', 'super', 345, 2.8, 520000, { drive: 'awd', engine: 'v12', mass: 1480, body: 'super', color: '#f72585' }),

  C('golge', 'Gölge', 'hyper', 380, 2.5, 750000, { drive: 'awd', engine: 'v12', mass: 1400, body: 'hyper', color: '#14213d' }),
  C('meteor', 'Meteor', 'hyper', 400, 2.3, 1000000, { drive: 'awd', engine: 'ev', mass: 1700, body: 'hyper', color: '#e5e5e5' }),

  C('sari', 'Sarı', 'work', 180, 10, 20000, { drive: 'fwd', engine: 'i4', mass: 1400, body: 'sedan', color: '#ffc300', taxi: true }),
  C('yuk', 'Yük', 'work', 150, 13, 30000, { drive: 'rwd', engine: 'i4', mass: 2200, body: 'van', color: '#f8f9fa' }),
  C('kanca', 'Kanca', 'work', 140, 14, 35000, { drive: 'rwd', engine: 'v8', mass: 3200, body: 'tow', color: '#fb8500' }),
  C('dev', 'Dev', 'work', 120, 18, 60000, { drive: 'rwd', engine: 'v8', mass: 7000, body: 'truck', color: '#2a9d8f', license: 'C' }),
  C('devriye', 'Devriye', 'work', 240, 5.5, 80000, { drive: 'awd', engine: 'v8', mass: 1700, body: 'sedan', color: '#f8f9fa', police: true }),

  C('efsane', 'Efsane', 'secret', 420, 2, -1, { drive: 'awd', engine: 'v12', mass: 1350, body: 'hyper', color: '#ffd700', unlock: 'allStars' }),
  C('hayalet', 'Hayalet', 'secret', 360, 2.6, -1, { drive: 'awd', engine: 'ev', mass: 1500, body: 'super', color: '#caf0f8', unlock: 'allGold' }),
  C('pars', 'Pars', 'secret', 300, 3.5, -1, { drive: 'awd', engine: 'v8', mass: 1600, body: 'sport', color: '#f4d35e', unlock: 'level50' }),
];

export const CAR = Object.fromEntries(CARS.map((c) => [c.id, c]));

// Profesyonel lisans gerektiren sınıflar
export const PRO_CLASSES = ['super', 'hyper'];

// Gövde boyutları (m): uzunluk, genişlik, yükseklik, dingil mesafesi, teker yarıçapı, yerden yükseklik
export const BODY_DIMS = {
  hatch: { L: 3.9, W: 1.75, H: 1.45, wb: 2.45, r: 0.31, clr: 0.16 },
  sedan: { L: 4.7, W: 1.82, H: 1.42, wb: 2.8, r: 0.33, clr: 0.15 },
  suv: { L: 4.8, W: 1.95, H: 1.8, wb: 2.85, r: 0.39, clr: 0.24 },
  pickup: { L: 5.3, W: 1.95, H: 1.8, wb: 3.2, r: 0.39, clr: 0.25 },
  sport: { L: 4.4, W: 1.9, H: 1.25, wb: 2.6, r: 0.34, clr: 0.11 },
  drift: { L: 4.4, W: 1.78, H: 1.3, wb: 2.55, r: 0.32, clr: 0.12 },
  muscle: { L: 4.9, W: 1.95, H: 1.35, wb: 2.85, r: 0.35, clr: 0.13 },
  super: { L: 4.6, W: 2.0, H: 1.15, wb: 2.7, r: 0.35, clr: 0.1 },
  hyper: { L: 4.7, W: 2.02, H: 1.12, wb: 2.75, r: 0.36, clr: 0.09 },
  van: { L: 5.2, W: 2.0, H: 2.3, wb: 3.3, r: 0.36, clr: 0.18 },
  tow: { L: 6.2, W: 2.2, H: 2.4, wb: 3.6, r: 0.45, clr: 0.3 },
  truck: { L: 8.2, W: 2.45, H: 3.2, wb: 4.6, r: 0.52, clr: 0.32 },
};

export const ENGINES = {
  i4: { name: '4 Silindir', cyl: 4, idle: 850, red: 6800, mult: 1.0, price: 0 },
  v6: { name: 'V6', cyl: 6, idle: 750, red: 7200, mult: 1.18, price: 25000 },
  v8: { name: 'V8', cyl: 8, idle: 700, red: 7000, mult: 1.35, price: 60000 },
  v12: { name: 'V12', cyl: 12, idle: 800, red: 8500, mult: 1.55, price: 150000 },
  ev: { name: 'Elektrik', cyl: 0, idle: 0, red: 16000, mult: 1.45, price: 120000 },
};
export const ENGINE_ORDER = ['i4', 'v6', 'v8', 'v12', 'ev'];
