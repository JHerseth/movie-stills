// Clockwork Sky — full-length version of movement ii of "The Cartographer's Dream".
// A prog-rock piece in 7/8 (2+2+3) and D minor, rendered entirely by this script: no samples.
//
//   node render.js            -> clockwork-sky.wav (and clockwork-sky.mp3 if ffmpeg is installed)
//
// The pulse never changes (eighth note = 0.2 s); the meter does: 7/8 for the riff sections,
// 4/4 for the bridge and coda.

const fs = require('fs');
const { execFileSync } = require('child_process');

// ───────────────────────── engine ─────────────────────────
const SR = 44100, DUR = 270, LEN = SR * DUR;
const L = new Float32Array(LEN), R = new Float32Array(LEN), V = new Float32Array(LEN); // dry L/R + reverb send
const { exp: E, sin: S, min: mn, max: mx, tanh, PI } = Math, TAU = 2 * PI;
const rn = () => Math.random() * 2 - 1;                 // audio noise
let seed = 1977;                                        // composition decisions are seeded: same song every render
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = a => a[rnd() * a.length | 0];
const mf = n => 440 * 2 ** ((n - 69) / 12);
const E8 = 0.2, BAR7 = 7 * E8, BAR4 = 8 * E8;

// add a voice: start (s), duration (s), gain, pan (-1..1), reverb send, sample function f(t)
function add(t0, d, g, p, rv, f) {
  const s = t0 * SR | 0, n = mn(d * SR | 0, LEN - s), a = g * mn(1, 1 - p), b = g * mn(1, 1 + p), w = g * rv;
  for (let i = 0; i < n; i++) { const v = f(i / SR); L[s + i] += v * a; R[s + i] += v * b; V[s + i] += v * w; }
}
// mix a pre-rendered mono buffer, with an optional ping-pong echo
function mix(buf, t0, g, p, rv, echo = 0) {
  for (let k = 0; k < (echo ? 3 : 1); k++) {
    const s = (t0 + k * 0.3) * SR | 0, gg = g * 0.35 ** k, pp = k % 2 ? -p : p, a = gg * mn(1, 1 - pp), b = gg * mn(1, 1 + pp);
    for (let i = 0; i < buf.length && s + i < LEN; i++) { L[s + i] += buf[i] * a; R[s + i] += buf[i] * b; V[s + i] += buf[i] * gg * rv; }
  }
}

// ───────────────────────── instruments ─────────────────────────
// Hammond: tonewheel wavetable (drawbars 888600400-ish), Leslie wobble, key click, 3rd-harmonic percussion
const OW = new Float32Array(4096);
for (let i = 0; i < 4096; i++) [1, 2, 4, 6, 8, 10, 16].forEach((k, j) => OW[i] += [.8, 1, .7, .5, .4, .15, .3][j] * S(TAU * k * i / 4096) / 3);
const organ = (n, d, perc = 0, fast = 0) => {
  const f = mf(n) / 2, lr = fast ? 41 : 5; let a = 0;
  return t => { a += f * (1 + .002 * S(t * lr)) / SR;
    return (OW[a % 1 * 4096 | 0] * (1 + .25 * S(t * lr)) + perc * S(TAU * 3 * f * 2 * t) * E(-t * 10)) * mn(1, t * 200, (d - t) * 60) + (t < .004 ? rn() * .2 : 0); };
};
const strings = (n, d) => { const f = mf(n); let a = 0, b = 0, l = 0;
  return t => { const w = f * (1 + .004 * S(t * 4.4 + n)); a += w / SR; b += w * 1.005 / SR; return (l += (a % 1 + b % 1 - 1 - l) * .07) * mn(1, t / .4, (d - t) / .5); }; };
const flute = (n, d) => { const f = mf(n); let a = 0;
  return t => { a += f * (1 + .006 * S(t * 30) * mn(1, t)) / SR; return (S(TAU * a) + .25 * S(2 * TAU * a) + rn() * .07) * mn(1, t / .08, (d - t) / .15); }; };
const bass = (n, d) => { const f = mf(n); let l = 0;
  return t => tanh(3 * (l += (t * f % 1 * 2 - 1 + (t * f % 1 < .5 ? .5 : -.5) - l) * (.05 + .3 * E(-t * 15)))) * mn(1, t * 300, (d - t) * 60) * .6; };
const pluck = n => { const m = SR / mf(n) | 0, B = Float32Array.from({ length: m }, rn); let i = 0;   // Karplus–Strong
  return () => { const k = i % m, v = B[k]; B[k] = (v + B[(i + 1) % m]) * .4985; i++; return v; }; };
const musicbox = n => { const f = mf(n);
  return t => (S(TAU * f * t) + .35 * S(TAU * 2 * f * t) * E(-t * 3) + .2 * S(TAU * 5.4 * f * t) * E(-t * 9)) * E(-t * 1.6) * mn(1, t * 2000); };
const tick = hi => t => (rn() * .4 + S(TAU * (hi ? 3300 : 2500) * t)) * E(-t * 260) + S(TAU * 900 * t) * E(-t * 70) * .25;
const kick = () => t => tanh(S(TAU * (45 * t + 6 * (1 - E(-25 * t)))) * E(-t * 6) * 2);
const snare = () => t => rn() * E(-t * 12) * .7 + S(TAU * 190 * t) * E(-t * 20) * .6;
const noiseHP = k => { let o = 0; return t => { const r = rn(), v = r - o; o = r; return v * E(-t * k); }; };
const ride = () => { const h = noiseHP(7); return t => h(t) * .5 + S(TAU * 5100 * t) * E(-t * 6) * .15; };
const tom = n => t => S(TAU * mf(n) * (t + .03 * (1 - E(-20 * t)))) * E(-t * 7);
const gong = t => [1, 1.47, 2.09, 2.56, 3.14, 4.2].reduce((s, k, i) => s + S(TAU * k * 70 * t + i) / (i + 1), 0) * E(-t * .4) * mn(1, t * 4) * .4;

// Moog: monophonic line with portamento through a resonant state-variable filter; ns = [[start, midi, dur], ...]
function moog(ns, { glide = .002, bright = 3000, sub = .3 } = {}) {
  const end = ns.at(-1)[0] + ns.at(-1)[2] + .5, out = new Float32Array(end * SR | 0);
  let c = mf(ns[0][1]), a = 0, b = 0, lo = 0, bd = 0, j = 0, e = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR; while (j < ns.length - 1 && t >= ns[j + 1][0]) j++;
    const [s, n, d] = ns[j], on = t >= s && t < s + d, u = t - s;
    c += (mf(n) * (1 + .004 * S(t * 33) * mn(1, mx(0, u - .3))) - c) * glide;   // delayed vibrato on long notes
    a += c / SR; b += c * 1.007 / SR; e += (on - e) * (on ? .01 : .0015);
    const fq = TAU * (400 + bright * E(-u * 3)) / SR, x = a % 1 + b % 1 - 1 + (a * .5 % 1 < .5 ? sub : -sub);
    lo += fq * bd; bd += fq * (x - lo - .4 * bd); out[i] = lo * e;
  }
  return out;
}
const chord = (t, d, notes, g, rv, voice, pan = 0) => notes.forEach((n, j) => add(t, d, g, mx(-1, mn(1, pan + (j - (notes.length - 1) / 2) * .35)), rv, voice(n, d)));

// ───────────────────────── harmony helpers ─────────────────────────
const MINOR_PC = new Set([2, 4, 7]);                    // D, E, G are minor chords here; C, Bb, A, F major
const triad = r => [0, MINOR_PC.has(r % 12) ? 3 : 4, 7];
const scaleFor = r => { const pcs = [2, 4, 5, 7, 9, 10, r % 12 === 9 ? 1 : 0]; // D aeolian, raised 7th over A
  const out = []; for (let n = 50; n <= 98; n++) if (pcs.includes(n % 12)) out.push(n); return out; };
const nearest = (arr, n) => arr.reduce((b, x) => Math.abs(x - n) < Math.abs(b - n) ? x : b);
const tones = r => { const t = triad(r).map(i => (r + i) % 12); const o = []; for (let n = 50; n <= 98; n++) if (t.includes(n % 12)) o.push(n); return o; };
const harmonyBelow = (n, r) => { const sc = scaleFor(r), i = sc.indexOf(nearest(sc, n)); return sc[mx(0, i - 2)]; };

// ───────────────────────── musical material ─────────────────────────
const RIFF = [0, 12, 0, 10, 0, 7, 5];                  // bass riff, in eighths, 2+2+3
const CYCLE = [38, 38, 36, 36, 34, 34, 33, 33];         // D D C C Bb Bb A A (one root per 7/8 bar)
// the theme (from the 16k intro), in eighths: [start, midi, length] over one 8-bar CYCLE
const THEME = [[0, 74, 3], [3, 77, 2], [5, 76, 2], [7, 74, 2], [9, 72, 2], [11, 69, 3], [14, 72, 3], [17, 76, 2], [19, 79, 2], [21, 77, 3],
  [24, 76, 2], [26, 72, 2], [28, 74, 3], [31, 77, 2], [33, 81, 4], [37, 79, 2], [39, 77, 3], [42, 76, 3], [45, 73, 2], [47, 76, 2], [49, 81, 7]];
const KT = [];  // kick log (for a future visualiser)

function drums7(t, s, { ride: useRide = false, intensity = 1, fill = false, half = false } = {}) {
  const x = t + s * E8;
  if (s === 0 || (!half && s === 4)) { add(x, .4, .9 * intensity, 0, .1, kick()); KT.push(x); }
  if (half ? s === 4 : (s === 2 || s === 5)) add(x, .3, .5 * intensity, .1, .3, snare());
  if (!half && s === 6 && rnd() < .3) add(x + .1, .15, .12, .1, .2, snare());          // ghost note
  if (useRide) add(x, .5, s % 2 ? .07 : .12, .55, .2, ride());
  else add(x, .06, (s % 2 ? .1 : .18) * intensity, -.55, .1, noiseHP(40));
  if (fill && s >= 3) add(x, .6, .5, (s - 4) * .3, .4, tom(52 - (s - 3) * 3));
}
const crash = (t, g = .35) => add(t, 3, g, .2, .4, noiseHP(1.6));

// one bar of the 7/8 riff
function riffBar(t, r, o = {}) {
  for (let s = 0; s < 7; s++) {
    const x = t + s * E8;
    if (o.bass !== false) add(x, .18, .5, 0, .1, bass(r + RIFF[s], .18));
    if (o.organ !== false && s % 2 === 0 && s < 6) chord(x, s === 4 ? .55 : .35, [...triad(r), 12].map(i => r + 24 + i), .085, .25, (n, d) => organ(n, d, .4, 1), -.4);
    if (o.drums !== false) drums7(t, s, o);
  }
}
function themeNotes(t0, transpose = 0) { return THEME.map(([s, n, l]) => [t0 + s * E8, n + transpose, l * E8 - .02]); }
function playMoog(notes, g, p, opt) { const t0 = notes[0][0]; mix(moog(notes.map(([s, n, d]) => [s - t0, n, d]), opt), t0, g, p, .35, 1); }

// improvised solo over 7/8 bars: rhythmic cells, chord-tone targeting, density rising over time
function improvise(t0, roots, { lo = 62, hi = 93, cells, climb = 0 } = {}) {
  const ns = []; let n = 74;
  roots.forEach((r, b) => {
    const prog = b / roots.length, sc = scaleFor(r).filter(x => x >= lo + climb * prog * 12 && x <= hi);
    const cellSet = cells || [[2, 2, 3], [1, 1, 2, 3], [3, 4], [1, 1, 1, 1, 3], [2, 1, 1, 3], [.5, .5, .5, .5, 2, 3], [1, 1, .5, .5, .5, .5, 3]];
    let cell = pick(prog > .6 && rnd() < .6 ? cellSet.slice(-3) : cellSet), e = 0;
    if (b === roots.length - 1) cell = [7];                                   // land on a long note
    cell.forEach((len, k) => {
      if (k === 0) n = nearest(tones(r).filter(x => x >= sc[0] && x <= sc.at(-1)), n + (rnd() < .5 ? 3 : -2));
      else { const i = sc.indexOf(nearest(sc, n)); n = sc[mx(0, mn(sc.length - 1, i + pick([-2, -1, -1, 1, 1, 2, 3, -3, 4])))]; }
      if (b === roots.length - 1) n = nearest(tones(r), 88);
      ns.push([t0 + (b * 7 + e) * E8, n, len * E8 - .02]); e += len;
    });
  });
  return ns;
}

// ───────────────────────── the arrangement ─────────────────────────
let t = 0;
const sec = (name) => console.log(`${(t / 60 | 0)}:${String((t % 60).toFixed(1)).padStart(4, '0')}  ${name}`);

// 1. Intro — the clock is wound: ticks in 2+2+3, a music box plays the theme, strings and organ swell
sec('intro: clock & music box');
for (let b = 0; b < 12; b++) {
  const bt = t + b * BAR7;
  [0, 2, 4].forEach((s, k) => add(bt + s * E8, .15, .35, k === 2 ? .4 : -.4, .5, tick(k !== 1)));
  if (b >= 4) { const r = CYCLE[(b - 4) % 8]; chord(bt, BAR7 + .3, [0, 7, 12, 12 + triad(r)[1]].map(i => r + 12 + i), .08 * mn(1, (b - 3) / 4), .6, strings); }
  if (b >= 8) chord(bt, BAR7, [62, 65, 69], .03 * (b - 7), .5, organ);
}
THEME.filter(([s]) => s < 28).forEach(([s, n, l]) => add(t + s * E8, 2, .19, .3, .7, musicbox(n + 12)));
THEME.filter(([s]) => s >= 28).forEach(([s, n, l]) => add(t + 4 * BAR7 + (s - 28) * E8, 2, .19, -.3, .7, musicbox(n + 12)));
add(t + 11 * BAR7, 6, .4, 0, .7, gong);
for (let s = 0; s < 7; s++) add(t + 11 * BAR7 + s * E8, .6, .3 + s * .06, (s - 3) * .25, .4, tom(52 - s * 2));
t += 12 * BAR7;

// 2. Main riff — organ, bass, drums
sec('main riff');
crash(t);
for (let b = 0; b < 16; b++) riffBar(t + b * BAR7, CYCLE[b % 8], { fill: b === 15, intensity: b < 8 ? .85 : 1 });
t += 16 * BAR7;

// 3. Theme — Moog melody, second time with organ harmony a third below
sec('theme');
crash(t);
for (let b = 0; b < 16; b++) riffBar(t + b * BAR7, CYCLE[b % 8], { organ: b >= 8 ? false : true, fill: b === 15 });
playMoog(themeNotes(t), .22, .25);
playMoog(themeNotes(t + 8 * BAR7), .22, .25);
themeNotes(t + 8 * BAR7).forEach(([s, n, d], i) => add(s, d, .07, -.4, .4, organ(harmonyBelow(n, CYCLE[(THEME[i][0] / 7) | 0]), d, .3, 1)));
chord(t + 8 * BAR7, 8 * BAR7, [62, 69], .04, .6, strings);
t += 16 * BAR7;

// 4. Riff with organ answers
sec('riff + organ answers');
crash(t, .25);
for (let b = 0; b < 8; b++) {
  const bt = t + b * BAR7, r = CYCLE[b];
  riffBar(bt, r, { fill: b === 7 });
  if (b % 2 === 1) [0, 1, 2, 3].forEach(k => add(bt + (3 + k) * E8, .18, .1, -.5, .3, organ(scaleFor(r).filter(x => x >= 74)[3 - k] , .18, .5, 1)));
}
t += 8 * BAR7;

// 5. Bridge — the meter opens into 4/4: Gm  Bb  C  A, flute then Moog on the tune
sec('bridge (4/4)');
const BR = [43, 46, 48, 45];
const BRIDGE = [[0, 74, 4], [4, 70, 2], [6, 72, 2], [8, 74, 4], [12, 77, 2], [14, 74, 2], [16, 76, 3], [19, 72, 3], [22, 74, 2], [24, 73, 6], [30, 76, 2],
  [32, 79, 4], [36, 77, 2], [38, 74, 2], [40, 77, 4], [44, 74, 2], [46, 72, 2], [48, 76, 4], [52, 79, 2], [54, 81, 2], [56, 81, 6], [62, 76, 2]];
crash(t);
for (let b = 0; b < 16; b++) {
  const bt = t + b * BAR4, r = BR[b % 4];
  chord(bt, BAR4 + .05, [...triad(r), 12].map(i => r + 12 + i), .07, .4, (n, d) => organ(n, d, 0, 0), .2);
  chord(bt, BAR4 + .3, triad(r).map(i => r + 12 + i), .05, .6, strings);
  for (let s = 0; s < 8; s++) {
    const x = bt + s * E8;
    add(x, .18, .45, 0, .1, bass(r - 12 + [0, 0, 12, 0, 0, 12, 0, 7][s], .18));
    if (s === 0 || s === 3 || (b >= 8 && s === 5)) { add(x, .4, .85, 0, .1, kick()); KT.push(x); }
    if (s === 2 || s === 6) add(x, .3, .5, .1, .3, snare());
    add(x, .06, s % 2 ? .08 : .15, -.3, .1, noiseHP(40));
    if (b === 15 && s >= 4) add(x, .6, .5, (s - 6) * .3, .4, tom(55 - s * 2));
  }
  if (b === 8) crash(bt);
}
BRIDGE.forEach(([s, n, l]) => add(t + s * E8, l * E8, .16, .3, .6, flute(n, l * E8)));
playMoog(BRIDGE.map(([s, n, l]) => [t + 8 * BAR4 + s * E8, n, l * E8 - .02]), .2, -.2);
BRIDGE.forEach(([s, n, l]) => add(t + 8 * BAR4 + s * E8, l * E8, .08, .4, .6, flute(n + 12, l * E8)));
t += 16 * BAR4;

// 6. Riff modulates up a tone to E minor, then home
sec('riff in E minor, then D');
crash(t);
const CYCLE_E = CYCLE.map(r => r + 2);
for (let b = 0; b < 16; b++) riffBar(t + b * BAR7, b < 8 ? CYCLE_E[b] : CYCLE[b - 8], { fill: b === 7 || b === 15 });
crash(t + 8 * BAR7);
t += 16 * BAR7;

// 7. Interlude — the clockwork winds down: twelve-string arpeggios, ticking, music box
sec('interlude (quiet)');
const IC = [[50, 57, 60, 64, 65], [46, 53, 57, 62, 65], [43, 50, 58, 62, 69], [45, 52, 57, 62, 67]], AP = [0, 2, 4, 1, 3, 2, 4];
add(t, 7, .45, 0, .7, gong);
for (let b = 0; b < 16; b++) {
  const bt = t + b * BAR7, c = IC[(b >> 1) % 4];
  for (let s = 0; s < 7; s++) {
    const x = bt + s * E8, k = AP[s];
    add(x, 2, .22, (k - 2) * .3, .4, pluck(c[k]));
    add(x + .012, 2, .1, (2 - k) * .3, .4, pluck(c[k] + 12));
    if (s % 2 === 0 && s < 6) add(x, .15, .14, s === 4 ? .3 : -.3, .5, tick(s !== 2));
  }
  add(bt, BAR7, .3, 0, .2, bass(c[0] - 12, BAR7 - .05));
  if (b % 2 === 0) chord(bt, 2 * BAR7 + .3, c.slice(1, 4), .035, .7, strings);
}
themeNotes(t + 8 * BAR7, 12).forEach(([s, n]) => add(s, 2, .1, .3, .7, musicbox(n)));
t += 16 * BAR7;

// 8. Unison run — the prog signature: organ, bass and Moog in 16th-note lockstep, accents 4+4+6
sec('unison run');
const run = [];
for (let b = 0; b < 8; b++) {
  const bt = t + b * BAR7, r = CYCLE[b], sc = scaleFor(r), top = sc.indexOf(nearest(sc, [86, 84, 82, 81, 86, 88, 89, 93][b]));
  for (let k = 0; k < 14; k++) {
    if (b === 7 && k % 4) continue;                                 // last bar: three hits (on 1, 2, 3 of 2+2+3), then silence
    if (b === 7 && k > 8) break;
    const n = b === 7 ? [74, 81, 86][k / 4] : sc[mx(0, top - k + (k >= 8 ? 3 : 0))], x = bt + k * E8 / 2, acc = k === 0 || k === 4 || k === 8;
    run.push([x, n, (b === 7 ? E8 : E8 / 2) - .01]);
    add(x, .09, acc ? .13 : .08, -.35, .25, organ(n, .09, .5, 1));
    add(x, .09, .4, 0, .1, bass(n - 36, .09));
  }
  if (b < 7) for (let s = 0; s < 7; s++) {
    const x = bt + s * E8;
    if (s === 0 || s === 2 || s === 4) { add(x, .4, .7 + b * .04, 0, .1, kick()); KT.push(x); }
    if (s === 6 || (b >= 4 && s === 5)) add(x, .3, .4 + b * .05, .1, .3, snare());
    add(x, .06, .15, -.3, .1, noiseHP(40));
    if (b === 6 && s >= 3) add(x, .6, .5, (s - 4) * .3, .4, tom(52 - (s - 3) * 3));
  }
  else [0, 2, 4].forEach(s => { add(bt + s * E8, .4, 1, 0, .1, kick()); add(bt + s * E8, .3, .6, 0, .4, snare()); crash(bt + s * E8, .2); });
}
playMoog(run, .16, .3, { glide: .02, bright: 2500 });
t += 8 * BAR7;

// 9. Moog solo over the riff (ride cymbal), then an organ solo
sec('moog solo');
crash(t, .45);
const soloRoots = [...CYCLE, ...CYCLE, ...CYCLE];
for (let b = 0; b < 24; b++) riffBar(t + b * BAR7, soloRoots[b], { ride: true, organ: b % 8 < 4, fill: b % 8 === 7 });
for (let b = 0; b < 24; b += 2) chord(t + b * BAR7, 2 * BAR7 + .2, triad(soloRoots[b]).map(i => soloRoots[b] + 24 + i), .03, .6, strings);
playMoog(improvise(t, soloRoots, { climb: 1 }), .22, .3);
t += 24 * BAR7;

sec('organ solo');
crash(t, .4);
for (let b = 0; b < 16; b++) riffBar(t + b * BAR7, CYCLE[b % 8], { ride: b < 8, organ: false, fill: b === 15 });
improvise(t, [...CYCLE, ...CYCLE], { lo: 67, hi: 96, cells: [[1, 1, 1, 1, 3], [.5, .5, .5, .5, 1, 1, 3], [1, .5, .5, 1, .5, .5, 3], [.5, .5, .5, .5, .5, .5, .5, .5, .5, .5, 2], [2, 2, 3]] })
  .forEach(([s, n, d]) => add(s, d, .13, -.4, .35, organ(n, d, .6, 1)));
for (let b = 0; b < 16; b++) chord(t + b * BAR7, BAR7, [...triad(CYCLE[b % 8])].map(i => CYCLE[b % 8] + 12 + i), .04, .3, (n, d) => organ(n, d, 0, 1), .3);
t += 16 * BAR7;

// 10. Theme returns, full band, Moog + harmony + strings
sec('theme returns');
for (let p = 0; p < 2; p++) {
  const t0 = t + p * 8 * BAR7;
  crash(t0, .45);
  for (let b = 0; b < 8; b++) { riffBar(t0 + b * BAR7, CYCLE[b], { fill: p === 1 && b === 7 }); if (b % 2 === 0 && b) crash(t0 + b * BAR7, .2); }
  playMoog(themeNotes(t0), .24, .25);
  if (p) themeNotes(t0).forEach(([s, n, d], i) => add(s, d, .1, -.3, .5, strings(harmonyBelow(n, CYCLE[(THEME[i][0] / 7) | 0]), d)));
  for (let b = 0; b < 8; b += 2) chord(t0 + b * BAR7, 2 * BAR7 + .3, triad(CYCLE[b]).map(i => CYCLE[b] + 24 + i), .045, .6, strings);
}
t += 16 * BAR7;

// 11. Coda — half-time 4/4, the progression turns to D major; gong; the clock winds down
sec('coda');
const CODA = [38, 34, 36, 38, 43, 45, 46, 45];
for (let b = 0; b < 8; b++) {
  const bt = t + b * BAR4, r = CODA[b], q = r === 38 && b === 0 ? 3 : 4;
  chord(bt, BAR4 + .05, [0, q, 7, 12].map(i => r + 24 + i), .08, .4, (n, d) => organ(n, d, 0, 0), .2);
  chord(bt, BAR4 + .4, [0, q, 7].map(i => r + 24 + i), .06, .6, strings);
  add(bt, BAR4 - .05, .5, 0, .15, bass(r, BAR4 - .05));
  add(bt, .4, .9, 0, .2, kick()); KT.push(bt);
  add(bt + 4 * E8, .3, .55, .1, .5, snare());
  for (let s = 0; s < 8; s += 2) add(bt + s * E8, .5, .08, .35, .3, ride());
  if (b % 2 === 0) crash(bt, .3);
  if (b === 7) for (let s = 0; s < 8; s++) add(bt + s * E8, .6, .4 + s * .05, (s - 4) * .25, .4, tom(55 - s * 2));
}
playMoog([[0, 74, 4], [4, 77, 2], [6, 76, 2], [8, 74, 6], [14, 72, 2], [16, 76, 4], [20, 79, 4], [24, 81, 8], [32, 83, 6], [38, 81, 2], [40, 81, 4], [44, 79, 4],
  [48, 77, 4], [52, 76, 4], [56, 73, 4], [60, 76, 4]].map(([s, n, l]) => [t + s * E8, n, l * E8 - .02]), .22, .25);
t += 8 * BAR4;

sec('final chord');
const DMAJ = [50, 57, 62, 66, 69, 74, 78];
crash(t, .5); add(t, .4, 1, 0, .1, kick()); add(t, 9, .7, 0, .7, gong);
chord(t, 7, DMAJ, .07, .4, (n, d) => organ(n, d, 0, 0), .2);
chord(t, 8, DMAJ, .06, .6, strings);
add(t, 7, .5, 0, .2, bass(38, 7));
mix(moog([[0, 90, 6]], { glide: .0005 }), t, .16, .2, .5, 1);
t += 6;

// the clock slows and stops; the music box plays the riff one last time
sec('clock winds down');
let tt = t, gap = .2;
for (let k = 0; k < 22; k++) { add(tt, .15, .22 - k * .007, k % 2 ? .3 : -.3, .6, tick(k % 2 === 0)); tt += gap; gap *= 1.09; }
let mt = t + .6, mg = .32;
[74, 86, 74, 84, 74, 81, 79, 74].forEach((n, k) => { add(mt, 3, .13, .2, .8, musicbox(n)); mt += mg; mg *= 1.13; });
add(mt + .6, 5, .14, 0, .9, musicbox(74)); add(mt + .6, 5, .07, 0, .9, musicbox(86));
const END = mx(mt + 6, tt + 1);
sec('end');

// ───────────────────────── master ─────────────────────────
function reverb() {
  for (let c = 0; c < 2; c++) {
    const O = c ? R : L, cl = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(x => x + c * 23), cb = cl.map(x => new Float32Array(x)), lp = cl.map(() => 0);
    const al = [556, 441, 341, 225].map(x => x + c * 23), ab = al.map(x => new Float32Array(x));
    for (let i = 0; i < LEN; i++) {
      const x = V[i] * .025; let y = 0;
      for (let k = 0; k < 8; k++) { const B = cb[k], p = i % cl[k], o = B[p]; lp[k] = o * .7 + lp[k] * .3; B[p] = x + lp[k] * .87; y += o; }
      for (let k = 0; k < 4; k++) { const B = ab[k], p = i % al[k], o = B[p]; B[p] = y + o * .5; y = o - y; }
      O[i] += y * .45;
    }
  }
}
reverb();
const n = mn(LEN, Math.ceil(END * SR));
let peak = 0; for (let i = 0; i < n; i++) peak = mx(peak, Math.abs(L[i]), Math.abs(R[i]));
const pcm = Buffer.alloc(44 + n * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  const fade = mn(1, (n - i) / (SR * 1.5));
  pcm.writeInt16LE(tanh(L[i] * 1.4 / peak) * .92 * fade * 32767 | 0, 44 + i * 4);
  pcm.writeInt16LE(tanh(R[i] * 1.4 / peak) * .92 * fade * 32767 | 0, 46 + i * 4);
}
const out = __dirname + '/clockwork-sky';
fs.writeFileSync(out + '.wav', pcm);
console.log(`wrote ${out}.wav  (${(n / SR / 60 | 0)}:${String(Math.round(n / SR % 60)).padStart(2, '0')})`);
try {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out + '.wav', '-codec:a', 'libmp3lame', '-b:a', '192k',
    '-metadata', 'title=Clockwork Sky', '-metadata', "album=The Cartographer's Dream", out + '.mp3']);
  console.log(`wrote ${out}.mp3`);
} catch { console.log('(ffmpeg not found — skipping mp3)'); }
