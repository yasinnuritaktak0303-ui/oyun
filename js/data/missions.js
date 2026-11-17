// 84 görev: haritalara dağıtılmış, zorluğu giderek artan
export const MTYPES = {
  park: { name: 'Park Etme', icon: '🅿️' },
  tow: { name: 'Çekici', icon: '🪝' },
  taxi: { name: 'Taksi', icon: '🚕' },
  cargo: { name: 'Kargo', icon: '📦' },
  race: { name: 'Yarış', icon: '🏁' },
  drag: { name: 'Drag Yarışı', icon: '🚦' },
  time: { name: 'Zamana Karşı', icon: '⏱️' },
  drift: { name: 'Drift', icon: '💨' },
  speedcam: { name: 'Hız Kamerası', icon: '📸' },
  rules: { name: 'Trafik Kuralları', icon: '🚸' },
};
export const PARK_SUBS = { parallel: 'Paralel park', angle: 'Açılı park', reverse: 'Geri geri park', tight: 'Dar alana park' };

const PLAN = {
  city: ['park:parallel', 'park:reverse', 'rules', 'taxi', 'park:angle', 'time', 'park:tight', 'rules', 'speedcam', 'park:parallel', 'taxi', 'drift', 'park:reverse', 'tow', 'rules', 'park:angle', 'time', 'cargo', 'taxi', 'park:tight'],
  highway: ['speedcam', 'park:reverse', 'time', 'drag', 'cargo', 'taxi', 'drag', 'speedcam', 'race', 'cargo', 'drag', 'race'],
  mountain: ['park:angle', 'time', 'rules', 'drift', 'tow', 'race', 'park:tight', 'cargo', 'time', 'drift', 'race'],
  offroad: ['time', 'park:reverse', 'tow', 'cargo', 'time', 'drift', 'park:tight', 'tow', 'cargo', 'time'],
  island: ['taxi', 'park:parallel', 'rules', 'speedcam', 'taxi', 'park:angle', 'time', 'rules', 'race', 'park:tight', 'taxi'],
  track: ['time', 'drift', 'race', 'park:reverse', 'drift', 'race', 'time', 'drag', 'drift', 'race'],
  airport: ['speedcam', 'park:tight', 'drag', 'time', 'drift', 'park:angle', 'rules', 'speedcam', 'race', 'drag'],
};
const MAP_LEVEL = { city: 0, highway: 1, mountain: 2, offroad: 3, island: 4, track: 5, airport: 6 };

const NAMES = {
  park: ['Kaldırım Ustası', 'Milim Hesabı', 'Sıkışık Otopark', 'Akşam Trafiği', 'Market Önü', 'Hastane Otoparkı', 'Dar Sokak', 'Son Boş Yer'],
  tow: ['Yolda Kaldı', 'Akü Bitti', 'Kaza Yeri', 'Lastik Patladı'],
  taxi: ['İlk Yolcu', 'Acele İşi', 'Havalimanı Transferi', 'Gece Seferi', 'Turist Turu', 'Toplantıya Yetiş'],
  cargo: ['Hassas Yük', 'Market Teslimatı', 'Mobilya Nakli', 'Yumurta Kolisi', 'İnşaat Malzemesi'],
  race: ['Sokak Düellosu', 'Gece Yarışı', 'Viraj Kralları', 'Şampiyonluk Turu', 'Son Tur', 'Büyük Ödül'],
  drag: ['Çeyrek Mil', 'Işık Yeşil!', 'Saniye Avcısı', 'Yarım Mil Canavarı'],
  time: ['Saate Karşı', 'Kurye Koşusu', 'Son Dakika', 'Teslimat Saati', 'Kronometre'],
  drift: ['Yan Yan', 'Duman Gösterisi', 'Kaygan Zemin', 'Drift Kralı'],
  speedcam: ['Flaş!', 'Rüzgar Gibi', 'Radar Avcısı'],
  rules: ['Sürücü Kursu', 'Kurallara Uy', 'Okul Bölgesi', 'Kavşak Sınavı'],
};

export const MISSIONS = [];
(() => {
  let n = 0;
  for (const map in PLAN) {
    const list = PLAN[map];
    list.forEach((code, i) => {
      const [type, sub] = code.split(':');
      n++;
      const tier = Math.min(10, 1 + MAP_LEVEL[map] + Math.floor(i / 2.5));
      const nm = NAMES[type];
      const id = 'm' + String(n).padStart(3, '0');
      const m = {
        id, n, map, type, sub, tier, idx: i,
        name: nm[(i + n) % nm.length] + (sub ? '' : ''),
        reward: Math.round((800 + tier * 900 + (type === 'race' || type === 'drag' ? 1000 : 0)) / 100) * 100,
        xp: 60 + tier * 40,
        gold: tier >= 7 ? Math.floor((tier - 5) / 2) : 0,
        license: type === 'cargo' ? 'C' : type === 'race' || type === 'drag' ? 'R' : null,
        prev: i > 0 ? null : undefined,
        seed: n * 7919,
      };
      MISSIONS.push(m);
    });
  }
  // aynı haritadaki önceki görev
  const lastBy = {};
  for (const m of MISSIONS) { m.prev = lastBy[m.map] || null; lastBy[m.map] = m.id; }
})();
export const MISSION = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

export function missionDesc(m) {
  const T = m.tier;
  switch (m.type) {
    case 'park': return { parallel: 'Aracı iki aracın arasına paralel park et.', angle: 'Aracı açılı park yerine yerleştir.', reverse: 'Aracı park yerine geri geri park et.', tight: 'Aracı dar park yerine çarpmadan sığdır.' }[m.sub];
    case 'tow': return 'Bozulan aracı çekici ile tamirhaneye götür.';
    case 'taxi': return 'Yolcuyu al ve hasarsız, hızlı şekilde hedefe bırak.';
    case 'cargo': return 'Yükü devirmeden ve düşürmeden teslim et.';
    case 'race': return 'Rakiplerini geç ve yarışı birinci bitir.';
    case 'drag': return 'Doğru zamanda vites değiştirerek rakibini yen.';
    case 'time': return 'Süre bitmeden tüm kontrol noktalarından geç.';
    case 'drift': return 'Süre içinde hedef drift puanını topla.';
    case 'speedcam': return 'Hız kamerasının önünden hedef hızın üstünde geç.';
    case 'rules': return 'Kırmızıda dur, sinyal ver, hız sınırına uy ve hedefe ulaş.';
  }
  return '';
}
