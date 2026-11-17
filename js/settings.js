// Ayarlar ve grafik ön ayarları
import { G, emit } from './core.js';

const KEY = 'otoyol_settings';

export const PRESETS = {
  verylow: { resScale: 0.5, shadows: 0, reflections: 0, viewDist: 250, traffic: 0.25, particles: 0.25, motionBlur: false, aa: false },
  low: { resScale: 0.65, shadows: 0, reflections: 0, viewDist: 350, traffic: 0.5, particles: 0.5, motionBlur: false, aa: false },
  medium: { resScale: 0.8, shadows: 1, reflections: 1, viewDist: 500, traffic: 0.75, particles: 0.75, motionBlur: true, aa: false },
  high: { resScale: 0.9, shadows: 2, reflections: 1, viewDist: 700, traffic: 1, particles: 1, motionBlur: true, aa: true },
  ultra: { resScale: 1.0, shadows: 3, reflections: 2, viewDist: 1000, traffic: 1.25, particles: 1, motionBlur: true, aa: true },
};
export const PRESET_ORDER = ['verylow', 'low', 'medium', 'high', 'ultra'];
export const PRESET_NAMES = { verylow: 'Çok düşük', low: 'Düşük', medium: 'Orta', high: 'Yüksek', ultra: 'Ultra' };

export function defaultSettings() {
  return {
    lang: 'tr', units: 'kmh',
    preset: 'medium', ...PRESETS.medium,
    fpsCap: 60, showFps: false, dynamicRes: true, adaptive: true, batterySaver: false,
    benchmarked: false,
    volMaster: 0.8, volMusic: 0.5, volEngine: 0.8, volSfx: 0.8, volAmbient: 0.6,
    radio: 0, radioOn: true,
    mobileControl: 'buttons', // buttons | wheel | tilt
    btnScale: 1, btnOpacity: 0.55, btnLayout: {}, tiltSens: 1, steerSens: 1,
    gearbox: 'auto', abs: true, tcs: true, esc: true,
    vibration: true, autoWipers: true, parkHelp: true,
    colorblind: false, textSize: 1, camera: 0, invertCam: false,
  };
}

export function loadSettings() {
  let s = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch (e) { /* yok */ }
  G.settings = s;
  return s;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(G.settings)); } catch (e) { /* yok */ }
  emit('settings');
}

export function applyPreset(name) {
  Object.assign(G.settings, PRESETS[name]);
  G.settings.preset = name;
  saveSettings();
}

// Cihaz gücünü kabaca tahmin et (ilk açılış)
export function guessTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  let score = cores * 1.0 + mem * 0.8 - (mobile ? 4 : 0);
  return score;
}
