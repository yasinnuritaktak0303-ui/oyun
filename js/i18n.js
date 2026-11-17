// Çeviri: anahtarlar Türkçe metnin kendisidir. İngilizce sözlük en.js içindedir.
import { EN } from './i18n_en.js';
import { G } from './core.js';

export function lang() { return (G.settings && G.settings.lang) || 'tr'; }

export function t(s, vars) {
  let out = s;
  if (lang() === 'en' && EN[s] !== undefined) out = EN[s];
  if (vars) for (const k in vars) out = out.split('{' + k + '}').join(vars[k]);
  return out;
}

export function fmtNum(n) {
  return Math.round(n).toLocaleString(lang() === 'en' ? 'en-US' : 'tr-TR');
}

export function speedUnit() { return G.settings && G.settings.units === 'mph' ? 'mph' : t('km/s'); }
export function speedVal(kmh) { return G.settings && G.settings.units === 'mph' ? kmh * 0.621371 : kmh; }
