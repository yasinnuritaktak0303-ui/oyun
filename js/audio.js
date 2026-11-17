// Ses: WebAudio ile sentezlenen motor sesleri, efektler ve prosedürel radyo müziği
import { G, clamp, seeded } from './core.js';
import { RADIO } from './data/content.js';

let ctx = null;
const bus = {};
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  bus.master = ctx.createGain(); bus.master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
  bus.master.disconnect(); bus.master.connect(comp); comp.connect(ctx.destination);
  for (const k of ['music', 'engine', 'sfx', 'ambient']) { bus[k] = ctx.createGain(); bus[k].connect(bus.master); }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  ambient.init();
}
export function audioCtx() { return ctx; }
export function suspendAudio(v) { if (!ctx) return; if (v) ctx.suspend(); else ctx.resume(); }

export function applyVolumes() {
  if (!ctx) return;
  const s = G.settings;
  bus.master.gain.value = s.volMaster;
  bus.music.gain.value = s.volMusic * 0.5;
  bus.engine.gain.value = s.volEngine * 0.6;
  bus.sfx.gain.value = s.volSfx;
  bus.ambient.gain.value = s.volAmbient * 0.5;
}

function noiseSrc(loop = true) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = loop; return n;
}
function env(g, t, a, peak, dcy, end = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(end, 0.0001), t + a + dcy);
}

// ---------------- Motor ----------------
export class EngineSound {
  constructor(engineType, exhaustLvl = 0) {
    this.ok = !!ctx;
    if (!this.ok) return;
    this.type = engineType;
    const ex = exhaustLvl;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(bus.engine);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 2;
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    const drive = 2 + ex * 1.2 + (engineType === 'v8' ? 2 : 0);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * drive); }
    this.shaper.curve = curve;
    this.mix = ctx.createGain(); this.mix.gain.value = 0.5;
    this.mix.connect(this.shaper); this.shaper.connect(this.filter); this.filter.connect(this.out);
    const ev = engineType === 'ev';
    this.o1 = ctx.createOscillator(); this.o1.type = ev ? 'sine' : 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = ev ? 'triangle' : 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = ev ? 'sine' : 'sawtooth';
    this.g1 = ctx.createGain(); this.g2 = ctx.createGain(); this.g3 = ctx.createGain();
    this.g1.gain.value = 0.5; this.g2.gain.value = ev ? 0.15 : 0.35; this.g3.gain.value = ev ? 0.12 : 0.25;
    this.o1.connect(this.g1).connect(this.mix); this.o2.connect(this.g2).connect(this.mix); this.o3.connect(this.g3).connect(this.mix);
    // V8 gurultusu: genlik modülasyonu
    this.am = ctx.createGain(); this.am.gain.value = 1;
    this.mix.disconnect(); this.mix.connect(this.am); this.am.connect(this.shaper);
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
    this.lfoG = ctx.createGain(); this.lfoG.gain.value = engineType === 'v8' ? 0.45 : engineType === 'i4' ? 0.2 : 0.12;
    if (ev) this.lfoG.gain.value = 0;
    this.lfo.connect(this.lfoG).connect(this.am.gain);
    // gürültü (emme/egzoz)
    this.nz = noiseSrc(); this.nzF = ctx.createBiquadFilter(); this.nzF.type = 'bandpass'; this.nzF.Q.value = 0.8;
    this.nzG = ctx.createGain(); this.nzG.gain.value = 0;
    this.nz.connect(this.nzF).connect(this.nzG).connect(this.out);
    // turbo ıslığı
    this.tb = ctx.createOscillator(); this.tb.type = 'sine'; this.tbG = ctx.createGain(); this.tbG.gain.value = 0;
    this.tb.connect(this.tbG).connect(bus.engine);
    // lastik
    this.sq = noiseSrc(); this.sqF = ctx.createBiquadFilter(); this.sqF.type = 'bandpass'; this.sqF.frequency.value = 1150; this.sqF.Q.value = 6;
    this.sqG = ctx.createGain(); this.sqG.gain.value = 0;
    this.sq.connect(this.sqF).connect(this.sqG).connect(bus.sfx);
    // rüzgar
    this.wd = noiseSrc(); this.wdF = ctx.createBiquadFilter(); this.wdF.type = 'lowpass'; this.wdF.frequency.value = 600;
    this.wdG = ctx.createGain(); this.wdG.gain.value = 0;
    this.wd.connect(this.wdF).connect(this.wdG).connect(bus.ambient);
    for (const o of [this.o1, this.o2, this.o3, this.lfo, this.nz, this.tb, this.sq, this.wd]) o.start();
    this.cyl = { i4: 4, v6: 6, v8: 8, v12: 12, ev: 0 }[engineType];
    this.exhaust = ex;
  }
  update(v, active) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    const p = v.p;
    const rpm = Math.max(v.rpm, p.idle || 300);
    const thr = v.throttle;
    let f;
    if (this.type === 'ev') f = 60 + (rpm / p.red) * 900;
    else f = (rpm / 60) * (this.cyl / 2);
    const k = 0.06;
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(this.type === 'ev' ? f * 2.01 : f * 0.5, t, k);
    this.o3.frequency.setTargetAtTime(f * (this.type === 'ev' ? 3.02 : 1.007), t, k);
    this.lfo.frequency.setTargetAtTime(this.type === 'v8' ? f / 4 : f / 2, t, k);
    const r = rpm / p.red;
    this.filter.frequency.setTargetAtTime(300 + r * 2500 + thr * 1500 + this.exhaust * 300, t, k);
    const vol = active ? (0.25 + thr * 0.45 + r * 0.25) * (v.fuel > 0 ? 1 : 0.2) : 0;
    this.out.gain.setTargetAtTime(vol * (v.limiter && Math.random() < 0.5 ? 0.4 : 1), t, 0.05);
    this.nzF.frequency.setTargetAtTime(400 + r * 2000, t, k);
    this.nzG.gain.setTargetAtTime(active ? thr * 0.08 * (1 + this.exhaust * 0.3) : 0, t, k);
    const turbo = ['sport', 'drift', 'super', 'hyper'].includes(p.spec.cls) || this.exhaust >= 3;
    this.tb.frequency.setTargetAtTime(1800 + v.boost * 3500, t, 0.1);
    this.tbG.gain.setTargetAtTime(active && turbo ? v.boost * 0.025 : 0, t, 0.1);
    let slip = 0;
    for (const w of v.wheels) if (w.contact && (w.surf === 1 || w.surf === 7)) slip = Math.max(slip, w.locked || w.spinning ? 1 : clamp((w.slip - 0.12) * 4, 0, 1));
    this.sqG.gain.setTargetAtTime(active && v.speed > 2 ? slip * 0.12 : 0, t, 0.05);
    this.wdG.gain.setTargetAtTime(active ? clamp(v.speed / 60, 0, 1) * 0.25 : 0, t, 0.2);
    if (v.blowoff) { v.blowoff = 0; if (turbo && active) blowoff(); }
    if (v.backfire) { v.backfire = 0; if (active && (this.exhaust >= 2 || ['sport', 'muscle', 'super', 'hyper', 'drift'].includes(p.spec.cls)) && this.type !== 'ev') pop(); }
  }
  stop() {
    if (!this.ok) return;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05); this.sqG.gain.setTargetAtTime(0, t, 0.05); this.wdG.gain.setTargetAtTime(0, t, 0.05); this.tbG.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => { for (const o of [this.o1, this.o2, this.o3, this.lfo, this.nz, this.tb, this.sq, this.wd]) { try { o.stop(); } catch (e) { /* */ } } this.out.disconnect(); }, 300);
  }
}

function blowoff() {
  const t = ctx.currentTime;
  const n = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.35); f.Q.value = 3;
  n.connect(f).connect(g).connect(bus.engine); env(g, t, 0.01, 0.25, 0.4); n.start(t); n.stop(t + 0.5);
}
function pop() {
  const t = ctx.currentTime;
  for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
    const tt = t + i * 0.07 + Math.random() * 0.03;
    const n = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 900;
    n.connect(f).connect(g).connect(bus.engine); env(g, tt, 0.003, 0.5, 0.08); n.start(tt); n.stop(tt + 0.12);
  }
}

// ---------------- Efektler ----------------
export function sfx(name, o = {}) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const out = bus.sfx;
  const tone = (freq, dur, type = 'sine', vol = 0.2, at = 0, endF) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t + at);
    if (endF) osc.frequency.exponentialRampToValueAtTime(endF, t + at + dur);
    osc.connect(g).connect(out); env(g, t + at, 0.005, vol, dur); osc.start(t + at); osc.stop(t + at + dur + 0.05);
  };
  const noise = (dur, freq, vol, type = 'lowpass', at = 0) => {
    const n = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = freq;
    n.connect(f).connect(g).connect(out); env(g, t + at, 0.005, vol, dur); n.start(t + at); n.stop(t + at + dur + 0.05);
  };
  switch (name) {
    case 'crash': { const v = clamp(o.v || 0.5, 0.1, 1); noise(0.35, 1200, 0.7 * v); tone(70, 0.3, 'sine', 0.6 * v, 0, 40); if (v > 0.6) noise(0.5, 4000, 0.2 * v, 'highpass', 0.05); break; }
    case 'scrape': noise(0.15, 3000, 0.08, 'bandpass'); break;
    case 'coin': tone(988, 0.08, 'square', 0.08); tone(1319, 0.2, 'square', 0.08, 0.08); break;
    case 'chest': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, i * 0.07)); noise(0.4, 6000, 0.05, 'highpass'); break;
    case 'key': [880, 1175, 1568].forEach((f, i) => tone(f, 0.3, 'sine', 0.15, i * 0.1)); break;
    case 'click': tone(1200, 0.03, 'square', 0.05); break;
    case 'beep': tone(o.f || 1600, 0.06, 'sine', 0.12); break;
    case 'tick': tone(o.f || 2400, 0.015, 'square', 0.04); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.12)); break;
    case 'fail': [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.08, i * 0.15)); break;
    case 'level': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.08, i * 0.1)); break;
    case 'nitro': noise(0.6, 900, 0.25, 'bandpass'); break;
    case 'jump': tone(300, 0.2, 'sine', 0.1, 0, 600); break;
    case 'land': noise(0.15, 300, 0.4); break;
    case 'nearmiss': tone(1400, 0.08, 'sine', 0.1); tone(1800, 0.12, 'sine', 0.1, 0.06); break;
    case 'countdown': tone(o.go ? 1320 : 660, o.go ? 0.5 : 0.2, 'square', 0.12); break;
    case 'checkpoint': tone(880, 0.1, 'triangle', 0.15); tone(1320, 0.15, 'triangle', 0.15, 0.08); break;
    case 'shutter': noise(0.08, 5000, 0.2, 'highpass'); noise(0.06, 3000, 0.15, 'highpass', 0.1); break;
    case 'door': tone(120, 0.12, 'sine', 0.3, 0, 60); noise(0.1, 800, 0.2); break;
    case 'step': noise(0.05, 400 + Math.random() * 200, 0.06); break;
    case 'splash': noise(0.6, 1500, 0.35, 'bandpass'); break;
    case 'toll': tone(1047, 0.1, 'sine', 0.1); tone(1568, 0.2, 'sine', 0.1, 0.1); break;
    case 'whoosh': noise(0.4, 2000, 0.15, 'bandpass'); break;
    case 'police': { tone(700, 0.4, 'sawtooth', 0.06, 0, 1100); tone(1100, 0.4, 'sawtooth', 0.06, 0.4, 700); break; }
  }
}

export function horn(type = 0, on = true) {
  if (!ctx) return;
  if (!on) { if (horn.node) { const t = ctx.currentTime; horn.node.g.gain.setTargetAtTime(0, t, 0.03); const n = horn.node; setTimeout(() => n.oscs.forEach((o) => { try { o.stop(); } catch (e) { /* */ } }), 200); horn.node = null; } return; }
  if (horn.node) return;
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(bus.sfx);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500; f.connect(g);
  const defs = [[[415, 'square'], [523, 'square']], [[740, 'square'], [880, 'square']], [[155, 'sawtooth'], [196, 'sawtooth'], [233, 'sawtooth']], [[523, 'triangle']], [[900, 'triangle']]];
  const oscs = defs[type].map(([fr, ty]) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start(); return o; });
  if (type === 3) { const notes = [523, 659, 784, 659, 523, 784]; notes.forEach((n, i) => oscs[0].frequency.setValueAtTime(n, t + i * 0.15)); }
  if (type === 4) { oscs[0].frequency.setValueAtTime(900, t); oscs[0].frequency.linearRampToValueAtTime(600, t + 0.25); }
  g.gain.setTargetAtTime(type === 2 ? 0.22 : 0.15, t, 0.01);
  horn.node = { g, oscs };
}
export function hornBeep(type = 0) { horn(type, true); setTimeout(() => horn(type, false), 250); }

// Uzaktaki araçların kısa kornası
export function npcHorn(dist = 20) {
  if (!ctx || dist > 60) return;
  const t = ctx.currentTime, g = ctx.createGain();
  const vol = 0.12 * (1 - dist / 60);
  g.connect(bus.sfx);
  for (const fr of [380, 480]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr + Math.random() * 30; o.connect(g); o.start(t); o.stop(t + 0.5); }
  env(g, t, 0.01, vol, 0.45);
}

// ---------------- Ortam ----------------
const ambient = {
  init() {
    this.rain = noiseSrc(); this.rainF = ctx.createBiquadFilter(); this.rainF.type = 'highpass'; this.rainF.frequency.value = 800;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    this.rain.connect(this.rainF).connect(this.rainG).connect(bus.ambient); this.rain.start();
    this.city = noiseSrc(); this.cityF = ctx.createBiquadFilter(); this.cityF.type = 'lowpass'; this.cityF.frequency.value = 300;
    this.cityG = ctx.createGain(); this.cityG.gain.value = 0;
    this.city.connect(this.cityF).connect(this.cityG).connect(bus.ambient); this.city.start();
    this.sea = noiseSrc(); this.seaF = ctx.createBiquadFilter(); this.seaF.type = 'lowpass'; this.seaF.frequency.value = 500;
    this.seaG = ctx.createGain(); this.seaG.gain.value = 0;
    this.sea.connect(this.seaF).connect(this.seaG).connect(bus.ambient); this.sea.start();
  },
};
export function updateAmbient(o) {
  if (!ctx || !ambient.rain) return;
  const t = ctx.currentTime;
  ambient.rainG.gain.setTargetAtTime(o.rain ? 0.25 : 0, t, 0.5);
  ambient.cityG.gain.setTargetAtTime(o.city ? 0.12 : 0.03, t, 0.5);
  ambient.seaG.gain.setTargetAtTime(o.sea ? 0.1 + Math.sin(t * 0.5) * 0.05 : 0, t, 0.5);
}

// ---------------- Radyo ----------------
// Tamamen prosedürel, özgün müzik üreticisi (5 kanal)
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], penta: [0, 3, 5, 7, 10] };
const STYLE = {
  pop: { scale: 'major', prog: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4]], kick: '1000100010001000', snare: '0000100000001000', hat: '1010101010101010', bass: 'root8', lead: 0.6, pad: 'saw', root: [60, 62, 65, 67] },
  rap: { scale: 'minor', prog: [[0, 5, 3, 4], [0, 0, 5, 6], [0, 3, 0, 4]], kick: '1000001000100000', snare: '0000100000001000', hat: '1111111111111111', bass: 'sub', lead: 0.35, pad: 'tri', root: [57, 58, 60, 62] },
  rock: { scale: 'minor', prog: [[0, 6, 5, 6], [0, 3, 4, 3], [0, 5, 6, 4]], kick: '1000100110001000', snare: '0000100000001000', hat: '1010101010101010', bass: 'root8', lead: 0.55, pad: 'dist', root: [52, 55, 57, 59] },
  elec: { scale: 'minor', prog: [[0, 5, 3, 6], [0, 3, 5, 4], [0, 6, 5, 4]], kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100010', bass: 'offbeat', lead: 0.7, pad: 'saw', root: [57, 60, 62, 64] },
  chill: { scale: 'dorian', prog: [[0, 3, 4, 3], [0, 5, 3, 4], [1, 4, 0, 5]], kick: '1000000010000000', snare: '0000100000001000', hat: '0010001000100010', bass: 'root', lead: 0.3, pad: 'tri', root: [55, 57, 60, 62] },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const radio = {
  on: false, station: 0, timer: null, nextTime: 0, step: 0, song: null, title: '',
  start(station) {
    if (!ctx) return;
    this.stop();
    this.on = true; this.station = station;
    this.newSong();
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  },
  stop() { this.on = false; if (this.timer) clearInterval(this.timer); this.timer = null; },
  newSong() {
    const st = RADIO[this.station];
    const sty = STYLE[st.id];
    const r = seeded(Date.now() & 0xffffff);
    this.song = {
      st, sty, r, bpm: st.bpm + r.int(-6, 6), prog: r.pick(sty.prog), root: r.pick(sty.root), bars: 0, maxBars: r.int(24, 40),
      melody: Array.from({ length: 16 }, () => (r() < sty.lead ? r.int(0, 6) : -1)),
      melody2: Array.from({ length: 16 }, () => (r() < sty.lead ? r.int(0, 6) : -1)),
    };
    const adj = ['Gece', 'Yol', 'Mavi', 'Rüzgar', 'Asfalt', 'Neon', 'Sahil', 'Yıldız', 'Uzak', 'Hızlı', 'Sessiz', 'Altın'];
    const noun = ['Sürüş', 'Şehir', 'Işıklar', 'Viraj', 'Ufuk', 'Rüya', 'Kalp', 'Dalga', 'Hikâye', 'Yolculuk'];
    this.title = r.pick(adj) + ' ' + r.pick(noun);
    this.step = 0;
  },
  schedule() {
    if (!this.on || !ctx) return;
    const s = this.song;
    const spb = 60 / s.bpm / 4; // 16'lık
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step++;
      if (this.step % 16 === 0) { s.bars++; if (s.bars >= s.maxBars) this.newSong(); }
    }
  },
  playStep(step, t, spb) {
    const s = this.song, sty = s.sty;
    const i = step % 16, bar = Math.floor(step / 16);
    const scale = SCALES[sty.scale];
    const chordDeg = s.prog[bar % 4];
    const note = (deg, oct = 0) => s.root + scale[((deg % scale.length) + scale.length) % scale.length] + 12 * (Math.floor(deg / scale.length) + oct);
    const out = bus.music;
    const section = Math.floor(s.bars / 8) % 3; // giriş/ana/köprü
    if (sty.kick[i] === '1' && !(section === 0 && s.bars < 2)) this.kick(t, out);
    if (sty.snare[i] === '1' && s.bars >= 2) this.snare(t, out);
    if (sty.hat[i] === '1') this.hat(t, out, i % 4 === 2 ? 0.05 : 0.03);
    // bas
    const bassOn = sty.bass === 'root8' ? i % 2 === 0 : sty.bass === 'offbeat' ? i % 4 === 2 : sty.bass === 'sub' ? i === 0 || i === 7 || i === 10 : i === 0 || i === 8;
    if (bassOn) this.synth(t, mtof(note(chordDeg, -2)), spb * (sty.bass === 'sub' ? 3 : 1.8), sty.bass === 'sub' ? 'sine' : 'sawtooth', 0.12, 500, out);
    // pad akoru
    if (i === 0) for (const k of [0, 2, 4]) this.synth(t, mtof(note(chordDeg + k, 0)), spb * 15, sty.pad === 'tri' ? 'triangle' : 'sawtooth', sty.pad === 'dist' ? 0.035 : 0.025, sty.pad === 'dist' ? 1800 : 1200, out, true);
    // melodi
    if (s.bars >= 4 && section !== 2) {
      const m = (bar % 2 ? s.melody2 : s.melody)[i];
      if (m >= 0) this.synth(t, mtof(note(chordDeg + m, 1)), spb * 1.6, sty.id === 'chill' ? 'sine' : 'square', 0.035, 2500, out);
    }
  },
  synth(t, f, dur, type, vol, cutoff, out, pad) {
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cutoff;
    o.connect(fl).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (pad ? 0.3 : 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  },
  kick(t, out) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    o.connect(g).connect(out); env(g, t, 0.002, 0.5, 0.25); o.start(t); o.stop(t + 0.3);
  },
  snare(t, out) {
    const n = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 1500; n.connect(f).connect(g).connect(out);
    env(g, t, 0.002, 0.18, 0.15); n.start(t); n.stop(t + 0.2);
  },
  hat(t, out, v) {
    const n = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 7000; n.connect(f).connect(g).connect(out);
    env(g, t, 0.001, v, 0.04); n.start(t); n.stop(t + 0.06);
  },
};
