// Oyun içeriği: yükseltmeler, modifiye, kıyafetler, evler, başarımlar, ipuçları, haritalar
export const MAPS = [
  { id: 'city', name: 'Şehir', level: 1, size: 1400, seed: 11, color: '#4cc9f0' },
  { id: 'highway', name: 'Otoban ve Çöl', level: 3, size: 1800, seed: 22, color: '#f4a261' },
  { id: 'mountain', name: 'Dağ Yolu', level: 6, size: 1500, seed: 33, color: '#52b788' },
  { id: 'offroad', name: 'Arazi', level: 9, size: 1300, seed: 44, color: '#9c6644' },
  { id: 'island', name: 'Ada', level: 12, size: 1500, seed: 55, color: '#00b4d8' },
  { id: 'track', name: 'Yarış Pisti', level: 15, size: 1100, seed: 66, color: '#e63946' },
  { id: 'airport', name: 'Havalimanı', level: 18, size: 1700, seed: 77, color: '#adb5bd' },
];
export const MAP = Object.fromEntries(MAPS.map((m) => [m.id, m]));

export const UPGRADES = [
  { id: 'engine', name: 'Motor', desc: 'Maksimum hız', base: 3000 },
  { id: 'turbo', name: 'Turbo', desc: 'İvme', base: 3500 },
  { id: 'gearbox', name: 'Şanzıman', desc: 'Vites geçişi', base: 2500 },
  { id: 'exhaust', name: 'Egzoz', desc: 'Güç + ses', base: 2000 },
  { id: 'brakes', name: 'Fren', desc: 'Fren gücü', base: 2000 },
  { id: 'tires', name: 'Lastik', desc: 'Yol tutuşu', base: 2500 },
  { id: 'nitro', name: 'Nitro', desc: 'Süre ve güç', base: 4000 },
];
// Seviye fiyatı: base * (1, 2, 3.5, 6, 10) * fiyat çarpanı (araç fiyatına göre)
export const UPG_MULT = [1, 2, 3.5, 6, 10];
export function upgradePrice(u, level, carPrice) {
  const k = 1 + Math.max(0, carPrice) / 150000;
  return Math.round((u.base * UPG_MULT[level] * k) / 100) * 100;
}

export const TUNING_DEFAULT = {
  rideHeight: 0.5, stiffness: 0.5, camber: 0.3, gearRatio: 0.5, diffLock: 0.3,
  weight: 0, ecu: 0.5, brakeBias: 0.6, tirePressure: 0.5,
};
export const TUNING_KEYS = [
  { id: 'rideHeight', name: 'Süspansiyon yüksekliği', l: 'Alçak', r: 'Yüksek' },
  { id: 'stiffness', name: 'Süspansiyon sertliği', l: 'Yumuşak', r: 'Sert' },
  { id: 'camber', name: 'Kamber', l: '0°', r: '-5°' },
  { id: 'gearRatio', name: 'Vites oranları', l: 'Kısa', r: 'Uzun' },
  { id: 'diffLock', name: 'Diferansiyel kilidi', l: 'Açık', r: 'Kilitli' },
  { id: 'weight', name: 'Ağırlık azaltma (karbon)', l: '0 kg', r: '-150 kg', price: 15000 },
  { id: 'ecu', name: 'ECU devir sınırı', l: 'Güvenli', r: 'Agresif', price: 10000 },
  { id: 'brakeBias', name: 'Fren dengesi (ön/arka)', l: 'Arka', r: 'Ön' },
  { id: 'tirePressure', name: 'Lastik basıncı', l: 'Düşük', r: 'Yüksek' },
];
export const TUNING_PROFILES = ['Yarış', 'Drift', 'Günlük'];
export const TUNING_PRESETS = {
  'Yarış': { rideHeight: 0.15, stiffness: 0.85, camber: 0.45, gearRatio: 0.6, diffLock: 0.4, brakeBias: 0.62, tirePressure: 0.55 },
  'Drift': { rideHeight: 0.3, stiffness: 0.7, camber: 0.8, gearRatio: 0.3, diffLock: 1, brakeBias: 0.45, tirePressure: 0.8 },
  'Günlük': { rideHeight: 0.5, stiffness: 0.4, camber: 0.2, gearRatio: 0.5, diffLock: 0.2, brakeBias: 0.6, tirePressure: 0.5 },
};

export const PAINT_TYPES = [
  { id: 'gloss', name: 'Parlak', price: 500, gold: 0, rough: 0.35, metal: 0.1 },
  { id: 'metallic', name: 'Metalik', price: 2000, gold: 0, rough: 0.25, metal: 0.65 },
  { id: 'matte', name: 'Mat', price: 3000, gold: 0, rough: 0.85, metal: 0.05 },
  { id: 'pearl', name: 'Sedef', price: 0, gold: 15, rough: 0.2, metal: 0.4, pearl: true },
  { id: 'chrome', name: 'Krom', price: 0, gold: 40, rough: 0.05, metal: 1.0 },
];
export const PALETTE = ['#f8f9fa', '#adb5bd', '#343a40', '#111111', '#d00000', '#e85d04', '#ffba08', '#7bc043', '#2a9d8f', '#00b4d8', '#3a86ff', '#3c096c', '#ff006e', '#8338ec', '#6b705c', '#9c6644', '#ffd700', '#caf0f8'];
export const VINYLS = [
  { id: 'none', name: 'Yok', price: 0 },
  { id: 'stripes', name: 'Çift şerit', price: 1500 },
  { id: 'flame', name: 'Alev', price: 2500 },
  { id: 'tribal', name: 'Kabile', price: 2500 },
  { id: 'checker', name: 'Damalı', price: 2000 },
  { id: 'number', name: 'Yarış numarası', price: 1000 },
  { id: 'camo', name: 'Kamuflaj', price: 3000 },
  { id: 'lightning', name: 'Şimşek', price: 2000 },
  { id: 'stars', name: 'Yıldızlar', price: 0, gold: 10 },
];
export const BODYKITS = [
  { id: 0, name: 'Standart', price: 0 },
  { id: 1, name: 'Sokak', price: 6000 },
  { id: 2, name: 'Yarış', price: 12000 },
  { id: 3, name: 'Geniş gövde', price: 0, gold: 30 },
];
export const SPOILERS = [
  { id: 0, name: 'Yok', price: 0 },
  { id: 1, name: 'Kısa dudak', price: 1500 },
  { id: 2, name: 'Ördek kuyruğu', price: 3000 },
  { id: 3, name: 'GT kanat', price: 6000 },
  { id: 4, name: 'Dev kanat', price: 0, gold: 20 },
];
export const RIMS = [
  { id: 0, name: 'Standart', price: 0 },
  { id: 1, name: '5 kollu', price: 2000 },
  { id: 2, name: 'Çok kollu', price: 3000 },
  { id: 3, name: 'Disk', price: 2500 },
  { id: 4, name: 'Derin çanak', price: 4000 },
  { id: 5, name: 'Turbin', price: 0, gold: 15 },
];
export const TINTS = [{ v: 0, name: 'Yok' }, { v: 0.35, name: 'Açık' }, { v: 0.6, name: 'Orta' }, { v: 0.85, name: 'Koyu' }];
export const LIGHT_COLORS = ['#ffffff', '#fff3b0', '#a2d2ff', '#cdb4db', '#b9fbc0'];
export const NEONS = [
  { c: null, name: 'Yok', price: 0 },
  { c: '#00f5d4', name: 'Turkuaz', price: 0, gold: 8 },
  { c: '#f72585', name: 'Pembe', price: 0, gold: 8 },
  { c: '#4361ee', name: 'Mavi', price: 0, gold: 8 },
  { c: '#80ff72', name: 'Yeşil', price: 0, gold: 8 },
  { c: '#ff9f1c', name: 'Turuncu', price: 0, gold: 8 },
  { c: 'rainbow', name: 'Gökkuşağı', price: 0, gold: 25 },
];
export const HORNS = [
  { id: 0, name: 'Klasik', price: 0 },
  { id: 1, name: 'Tiz', price: 800 },
  { id: 2, name: 'Kamyon', price: 1500 },
  { id: 3, name: 'Melodi', price: 2500 },
  { id: 4, name: 'Oyuncak', price: 0, gold: 5 },
];
export const PLATES = [
  { id: 0, name: 'Standart', bg: '#ffffff', fg: '#111', band: '#1d4ed8' },
  { id: 1, name: 'Klasik siyah', bg: '#111111', fg: '#fff', band: null },
  { id: 2, name: 'Sarı', bg: '#ffd60a', fg: '#111', band: null },
  { id: 3, name: 'Yeşil', bg: '#e9f5db', fg: '#2d6a4f', band: '#2d6a4f' },
  { id: 4, name: 'Yarış', bg: '#111111', fg: '#ffd60a', band: '#e63946' },
  { id: 5, name: 'Kırmızı', bg: '#fff0f0', fg: '#c1121f', band: '#c1121f' },
];

export const GARAGE_TIERS = [
  { cap: 3, price: 0 },
  { cap: 6, price: 25000 },
  { cap: 10, price: 80000 },
  { cap: 20, price: 250000 },
];

export const HOUSES = [
  { id: 'h_city', map: 'city', name: 'Şehir Dairesi', price: 60000, slots: 2 },
  { id: 'h_highway', map: 'highway', name: 'Çöl Evi', price: 45000, slots: 2 },
  { id: 'h_mountain', map: 'mountain', name: 'Dağ Kulübesi', price: 70000, slots: 2 },
  { id: 'h_offroad', map: 'offroad', name: 'Çiftlik Evi', price: 55000, slots: 3 },
  { id: 'h_island', map: 'island', name: 'Sahil Villası', price: 150000, slots: 3 },
  { id: 'h_track', map: 'track', name: 'Pist Locası', price: 120000, slots: 2 },
  { id: 'h_airport', map: 'airport', name: 'Hangar', price: 200000, slots: 4 },
];

// Kıyafetler
export const CLOTHES = {
  shirt: [
    { id: 's0', name: 'Beyaz tişört', color: '#f1f1f1', price: 0 },
    { id: 's1', name: 'Kırmızı tişört', color: '#d62828', price: 300 },
    { id: 's2', name: 'Mavi tişört', color: '#1d4ed8', price: 300 },
    { id: 's3', name: 'Siyah tişört', color: '#222', price: 400 },
    { id: 's4', name: 'Çizgili', color: '#fca311', price: 600, pattern: 'stripe' },
    { id: 's5', name: 'Altın tişört', color: '#ffd700', price: 0, gold: 10 },
  ],
  jacket: [
    { id: 'j0', name: 'Yok', color: null, price: 0 },
    { id: 'j1', name: 'Kot ceket', color: '#3a5a80', price: 1200 },
    { id: 'j2', name: 'Deri ceket', color: '#1a1a1a', price: 2500 },
    { id: 'j3', name: 'Yarış ceketi', color: '#e63946', price: 3000 },
    { id: 'j4', name: 'Neon ceket', color: '#80ff72', price: 0, gold: 15 },
  ],
  pants: [
    { id: 'p0', name: 'Kot', color: '#264f73', price: 0 },
    { id: 'p1', name: 'Siyah', color: '#1b1b1b', price: 400 },
    { id: 'p2', name: 'Bej', color: '#c2a878', price: 400 },
    { id: 'p3', name: 'Eşofman', color: '#6c757d', price: 600 },
    { id: 'p4', name: 'Altın', color: '#d4af37', price: 0, gold: 10 },
  ],
  shoes: [
    { id: 'f0', name: 'Spor beyaz', color: '#f8f9fa', price: 0 },
    { id: 'f1', name: 'Siyah bot', color: '#111', price: 800 },
    { id: 'f2', name: 'Kırmızı', color: '#d00000', price: 600 },
    { id: 'f3', name: 'Neon', color: '#00f5d4', price: 0, gold: 8 },
  ],
  hat: [
    { id: 'h0', name: 'Yok', color: null, price: 0 },
    { id: 'h1', name: 'Kep', color: '#1d4ed8', price: 400, type: 'cap' },
    { id: 'h2', name: 'Bere', color: '#e63946', price: 500, type: 'beanie' },
    { id: 'h3', name: 'Fötr', color: '#5c4033', price: 1500, type: 'fedora' },
    { id: 'h4', name: 'Taç', color: '#ffd700', price: 0, gold: 30, type: 'crown' },
  ],
};
export const SKIN_TONES = ['#f9dcc4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
export const HAIR_COLORS = ['#111', '#4a2c17', '#8b5a2b', '#d4a76a', '#e5e5e5', '#b5179e', '#3a86ff', '#e63946'];
export const HAIR_STYLES = ['Kısa', 'Uzun', 'Kıvırcık', 'At kuyruğu', 'Kel', 'Mohikan'];
export const BEARDS = ['Yok', 'Bıyık', 'Keçi sakal', 'Tam sakal'];
export const GLASSES = ['Yok', 'Numaralı', 'Güneş', 'Spor'];
export const FACES = 8;

export const EMOTES = [
  { id: 'wave', name: 'El salla', emoji: '👋' },
  { id: 'dance', name: 'Dans', emoji: '💃' },
  { id: 'clap', name: 'Alkış', emoji: '👏' },
  { id: 'salute', name: 'Selam', emoji: '🫡' },
  { id: 'cheer', name: 'Sevinç', emoji: '🎉' },
  { id: 'think', name: 'Düşün', emoji: '🤔' },
  { id: 'laugh', name: 'Gül', emoji: '😂' },
  { id: 'point', name: 'Göster', emoji: '👉' },
  { id: 'sit', name: 'Otur', emoji: '😌' },
  { id: 'flex', name: 'Kas göster', emoji: '💪' },
];

export const LICENSES = [
  { id: 'B', name: 'B Sınıfı Ehliyet', desc: 'Başlangıç ehliyeti' },
  { id: 'C', name: 'C Sınıfı Ehliyet', desc: 'Kamyon ve kargo görevleri açılır', need: { park: 4, rules: 2 } },
  { id: 'R', name: 'Yarış Lisansı', desc: 'Yarış ve drag görevleri açılır', need: { park: 8, rules: 3 } },
  { id: 'P', name: 'Profesyonel Lisans', desc: 'Süper spor ve hiper araçlar satın alınabilir', need: { park: 14, rules: 5, race: 4 } },
];

export const RADIO = [
  { id: 'pop', name: 'Pop FM', bpm: 118 },
  { id: 'rap', name: 'Ritim Rap', bpm: 92 },
  { id: 'rock', name: 'Asfalt Rock', bpm: 132 },
  { id: 'elec', name: 'Neon Elektronik', bpm: 126 },
  { id: 'chill', name: 'Sakin Yol', bpm: 80 },
];

export const TIPS = [
  'Altın sandıklar genelde yüksek yerlerde saklıdır.',
  'Arkadan itişli araçlarda el freniyle viraja girerek drift atabilirsin.',
  'Trafikteki araçlara çarpmadan yakından geçersen bonus para kazanırsın.',
  'Nitro, drift yaparken ve yakın geçişlerde de dolar.',
  'Yağmurda yol kayganlaşır, fren mesafen uzar.',
  '4x4 araçlar arazide çamurdan çok daha kolay çıkar.',
  'Sandık radarını garajda yükselterek sandıkları daha uzaktan gör.',
  'Elmas sandığı açmak için haritada saklı 3 anahtarı bul.',
  'Drag yarışında vites göstergesi yeşilken vites değiştir.',
  'Park görevlerinde Yardım Modu yere yön okları çizer.',
  'Benzinin bitmeden istasyona uğra!',
  'Polisten kaçarsan bonus, yakalanırsan ceza alırsın.',
  'Rampalardan atla: havada kalma süren uzadıkça bonus artar.',
  'Ev satın alırsan o haritada başlangıç noktan olur.',
  'Tamirhanede hasarı, oto yıkamada kiri temizleyebilirsin.',
  'Aracını galeride satarsan fiyatının %60\'ını geri alırsın.',
];

// Başarımlar: tip, eşik, ödül
const A = (id, name, desc, stat, goal, money = 0, gold = 0) => ({ id, name, desc, stat, goal, money, gold });
export const ACHIEVEMENTS = [
  A('chest1', 'Hazine Avcısı', 'İlk sandığını aç', 'chests', 1, 1000),
  A('chest10', 'Sandık Toplayıcı', '10 sandık aç', 'chests', 10, 5000),
  A('chest50', 'Define Kralı', '50 sandık aç', 'chests', 50, 20000, 10),
  A('chest200', 'Hazine Efsanesi', '200 sandık aç', 'chests', 200, 50000, 25),
  A('goldchest', 'Altına Dokunan', 'Bir altın sandık aç', 'goldChests', 1, 5000, 5),
  A('diamond', 'Elmas Kalp', 'Elmas sandığı aç', 'diamondChests', 1, 0, 20),
  A('speed100', 'Hızlanıyoruz', '100 km/s\'yi geç', 'topSpeed', 100, 500),
  A('speed200', 'Rüzgar Gibi', '200 km/s\'yi geç', 'topSpeed', 200, 3000),
  A('speed300', 'Ses Duvarı', '300 km/s\'yi geç', 'topSpeed', 300, 20000, 10),
  A('speed400', 'Işık Hızı', '400 km/s\'yi geç', 'topSpeed', 400, 50000, 25),
  A('dist10', 'Yolcu', '10 km sür', 'distance', 10, 1000),
  A('dist100', 'Yol Kurdu', '100 km sür', 'distance', 100, 10000),
  A('dist1000', 'Maratoncu', '1000 km sür', 'distance', 1000, 50000, 15),
  A('park1', 'İlk Park', 'İlk park görevini bitir', 'parkDone', 1, 500),
  A('park25', 'Park Ustası', '25 park görevini bitir', 'parkDone', 25, 15000, 5),
  A('park100', 'Milimetrik', '100 park görevini bitir', 'parkDone', 100, 50000, 20),
  A('mission10', 'Görev Adamı', '10 görev tamamla', 'missionsDone', 10, 5000),
  A('mission50', 'Profesyonel', '50 görev tamamla', 'missionsDone', 50, 30000, 10),
  A('stars100', 'Yıldız Yağmuru', '100 yıldız topla', 'stars', 100, 30000, 15),
  A('drift1k', 'Kaygan', 'Tek driftte 1.000 puan', 'longestDrift', 1000, 1000),
  A('drift10k', 'Yan Yan', 'Tek driftte 10.000 puan', 'longestDrift', 10000, 10000, 5),
  A('drift50k', 'Drift Kralı', 'Tek driftte 50.000 puan', 'longestDrift', 50000, 30000, 15),
  A('jump2', 'Uçuş', '2 saniye havada kal', 'longestJump', 2, 2000),
  A('jump4', 'Kuş Gibi', '4 saniye havada kal', 'longestJump', 4, 10000, 5),
  A('near10', 'Kıl Payı', '10 yakın geçiş yap', 'nearMiss', 10, 2000),
  A('near100', 'Trafik Cambazı', '100 yakın geçiş yap', 'nearMiss', 100, 20000, 5),
  A('car3', 'Koleksiyoncu', '3 araca sahip ol', 'carsOwned', 3, 5000),
  A('car10', 'Galerici', '10 araca sahip ol', 'carsOwned', 10, 50000, 10),
  A('upgrade', 'Usta', 'Bir parçayı 5. seviyeye yükselt', 'maxUpgrade', 1, 5000),
  A('house', 'Ev Sahibi', 'Bir ev satın al', 'houses', 1, 5000),
  A('lic_c', 'Ağır Vasıta', 'C sınıfı ehliyet al', 'licC', 1, 5000),
  A('lic_r', 'Pilot', 'Yarış lisansı al', 'licR', 1, 10000, 5),
  A('lic_p', 'Profesyonel', 'Profesyonel lisans al', 'licP', 1, 25000, 15),
  A('police1', 'Kaçak', 'Polisten kaç', 'escapes', 1, 3000),
  A('police10', 'Yakalanmaz', 'Polisten 10 kez kaç', 'escapes', 10, 20000, 10),
  A('cop5', 'Kanun Adamı', 'Polis modunda 5 aracı durdur', 'busts', 5, 10000, 5),
  A('race1', 'Kazanan', 'Bir yarış kazan', 'racesWon', 1, 3000),
  A('race20', 'Şampiyon', '20 yarış kazan', 'racesWon', 20, 30000, 15),
  A('level10', 'Tecrübeli', '10. seviyeye ulaş', 'level', 10, 10000, 5),
  A('level25', 'Usta Sürücü', '25. seviyeye ulaş', 'level', 25, 40000, 15),
  A('level50', 'Efsane Sürücü', '50. seviyeye ulaş', 'level', 50, 100000, 30),
  A('money1m', 'Milyoner', 'Toplam 1.000.000 para kazan', 'moneyEarned', 1000000, 0, 30),
  A('maps', 'Kâşif', 'Tüm haritaları ziyaret et', 'mapsVisited', 7, 20000, 10),
  A('wash', 'Pırıl Pırıl', 'Aracını yıka', 'washes', 1, 500),
  A('photo', 'Fotoğrafçı', 'Bir fotoğraf kaydet', 'photos', 1, 500),
  A('daily7', 'Sadık Sürücü', '7 gün üst üste giriş yap', 'loginStreak', 7, 10000, 10),
];

export const DAILY_TEMPLATES = [
  { id: 'park', text: '{n} park görevi bitir', stat: 'parkDone', n: [3, 5], money: 3000 },
  { id: 'chest', text: '{n} sandık aç', stat: 'chests', n: [3, 5], money: 2500 },
  { id: 'dist', text: '{n} km sür', stat: 'distance', n: [5, 15], money: 2000 },
  { id: 'near', text: '{n} yakın geçiş yap', stat: 'nearMiss', n: [5, 10], money: 2500 },
  { id: 'drift', text: 'Toplam {n} drift puanı topla', stat: 'driftTotal', n: [5000, 20000], money: 3000 },
  { id: 'mission', text: '{n} görev tamamla', stat: 'missionsDone', n: [2, 4], money: 3500 },
  { id: 'jump', text: '{n} kez rampadan atla', stat: 'jumps', n: [3, 6], money: 2000 },
  { id: 'race', text: '{n} yarış kazan', stat: 'racesWon', n: [1, 2], money: 4000 },
];
export const LOGIN_REWARDS = [
  { money: 1000 }, { money: 1500 }, { money: 2000, gold: 1 }, { money: 3000 }, { money: 4000, gold: 2 }, { money: 5000 }, { money: 20000, gold: 10 },
];
