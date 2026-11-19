// CHASE CITY background music: "Getaway Club" (original composition).
// Energetic arcade chase, electronic rock, 150 BPM, E (minor with a
// playful major sixth), 48 bars = 76.8 s, seamless loop. Everything here is
// written and synthesized by this script: drum kit, distorted bass, power-
// chord rhythm synth, lead hook, arpeggios, risers; no samples, no third-
// party material. Output: a 16-bit stereo WAV (encode with ffmpeg, see
// scripts/music/README.md). Deterministic (same file every run).
//
//   node scripts/music/compose.mjs out.wav
import { writeFileSync } from "node:fs";

const SR = 44100;
const BPM = 150;
const BEAT = 60 / BPM; // 0.4 s
const STEP = BEAT / 4; // a 16th
const BAR = BEAT * 4; // 1.6 s
const BARS = 48;
const LENGTH = BARS * BAR; // 76.8 s, the loop
const TAIL = 3; // echoes and decays past the loop end, wrapped to the start
const N = Math.round((LENGTH + TAIL) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
// Send buses (summed into the mix at the end).
const echoL = new Float32Array(N), echoR = new Float32Array(N);
const roomIn = new Float32Array(N);

let seed = 20261119;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------ helpers --
function biquadLP(fc, q = 0.707) {
  const w = (2 * Math.PI * fc) / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  const b0 = (1 - c) / 2 / (1 + a), b1 = (1 - c) / (1 + a), a1 = (-2 * c) / (1 + a), a2 = (1 - a) / (1 + a);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const f = (x) => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  f.set = (fc2, q2 = q) => {
    const w2 = (2 * Math.PI * clamp(fc2, 20, SR * 0.45)) / SR, c2 = Math.cos(w2), a2_ = Math.sin(w2) / (2 * q2);
    const n = 1 + a2_;
    f.b0 = (1 - c2) / 2 / n; f.b1 = (1 - c2) / n; f.a1 = (-2 * c2) / n; f.a2 = (1 - a2_) / n;
  };
  return f;
}
// Time-varying low-pass (coefficients recomputed every 32 samples).
function sweepLP(q = 0.9) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 1, b1 = 0, a1 = 0, a2 = 0, k = 0;
  return (x, fc) => {
    if (k++ % 32 === 0) {
      const w = (2 * Math.PI * clamp(fc, 30, SR * 0.45)) / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), n = 1 + a;
      b0 = (1 - c) / 2 / n; b1 = (1 - c) / n; a1 = (-2 * c) / n; a2 = (1 - a) / n;
    }
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
function hp1(fc) {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let xp = 0, y = 0;
  return (x) => ((y = a * (y + x - xp)), (xp = x), y);
}
// Band-limited saw (polyBLEP).
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function saw(phase, dt) {
  return 2 * phase - 1 - blep(phase, dt);
}
function out(i, v, pan = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * Math.cos((pan + 1) * Math.PI / 4) * 1.414;
  R[i] += v * Math.sin((pan + 1) * Math.PI / 4) * 1.414;
}
const at = (bar, step = 0) => Math.round((bar * BAR + step * STEP) * SR);

// ------------------------------------------------------------- drums --
function kick(t0, gain = 1) {
  const n = Math.round(0.42 * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const f = 48 + 110 * Math.exp(-t * 32);
    ph += f / SR;
    const env = Math.exp(-t * 7.5);
    const click = k < 90 ? (rnd() * 2 - 1) * 0.3 * Math.min(1, k / 12) * (1 - k / 90) : 0;
    out(t0 + k, (Math.sin(2 * Math.PI * ph) * env * 0.55 * Math.min(1, k / 12) + click) * gain);
  }
}
function snare(t0, gain = 1, pan = 0.05) {
  const n = Math.round(0.3 * SR);
  const bp = biquadLP(6500, 0.7), hp = hp1(900);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph += (195 - 40 * Math.min(1, t * 20)) / SR;
    const tone = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 28) * 0.4;
    const noise = hp(bp(rnd() * 2 - 1)) * Math.exp(-t * 15) * 0.9;
    const v = (tone + noise) * gain;
    out(t0 + k, v, pan);
    roomIn[t0 + k] += v * 0.35;
  }
}
function hat(t0, gain = 1, open = false, pan = 0.3) {
  const n = Math.round((open ? 0.32 : 0.06) * SR);
  const hp = hp1(7000), hp2 = hp1(5000);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = open ? Math.exp(-t * 9) : Math.exp(-t * 70);
    out(t0 + k, hp(hp2(rnd() * 2 - 1)) * env * 0.5 * gain, pan);
  }
}
function crash(t0, gain = 1) {
  const n = Math.round(1.9 * SR);
  const hp = hp1(3500);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const v = hp(rnd() * 2 - 1) * Math.exp(-t * 2.2) * 0.38 * gain;
    out(t0 + k, v, -0.35);
    roomIn[t0 + k] += v * 0.2;
  }
}
function tom(t0, midi, gain = 1, pan = 0) {
  const n = Math.round(0.35 * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph += mtof(midi) * (1 + 0.5 * Math.exp(-t * 30)) / SR;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) * 0.6 * gain;
    out(t0 + k, v, pan);
    roomIn[t0 + k] += v * 0.25;
  }
}

// ---------------------------------------------------------- pitched --
// Distorted bass: two detuned saws, low-pass with a pluck, soft drive.
function bass(t0, midi, steps, gain = 1) {
  const n = Math.round(steps * STEP * SR * 0.92);
  const lp = sweepLP(1.1);
  const f = mtof(midi);
  let a = rnd(), b = rnd(), sub = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    a = (a + f / SR) % 1; b = (b + (f * 1.006) / SR) % 1; sub += f / SR;
    const raw = saw(a, f / SR) + saw(b, (f * 1.006) / SR) * 0.8;
    const cut = 380 + 2200 * Math.exp(-t * 18);
    let v = lp(raw, cut);
    v = Math.tanh(v * 2.2) * 0.55 + Math.sin(2 * Math.PI * sub) * 0.12;
    const env = Math.min(1, k / 60) * (k > n - 300 ? (n - k) / 300 : 1);
    out(t0 + k, v * env * 0.42 * gain);
  }
}
// Rhythm "guitar": power chord (root, fifth, octave) from detuned saws,
// driven hard, palm-muted (short) or ringing (long), panned wide.
function chord(t0, root, steps, gain = 1, muted = true, pan = 0) {
  const n = Math.round(steps * STEP * SR * (muted ? 0.8 : 0.98));
  const lp = sweepLP(0.8), hp = hp1(140);
  const notes = [root, root + 7, root + 12];
  const ph = notes.flatMap(() => [rnd(), rnd()]);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let raw = 0;
    notes.forEach((m, j) => {
      for (let d = 0; d < 2; d++) {
        const f = mtof(m) * (d ? 1.004 : 0.997);
        const idx = j * 2 + d;
        ph[idx] = (ph[idx] + f / SR) % 1;
        raw += saw(ph[idx], f / SR);
      }
    });
    let v = Math.tanh(raw * 0.9) * 0.9;
    v = lp(hp(v), muted ? 900 + 2200 * Math.exp(-t * 25) : 3200);
    const env = Math.min(1, k / 40) * (muted ? Math.exp(-t * 6) : 1) * (k > n - 400 ? (n - k) / 400 : 1);
    out(t0 + k, v * env * 0.4 * gain, pan);
  }
}
// Lead: pulse wave with a short slide into each note and delayed vibrato,
// into the echo bus.
let leadPrev = null;
function lead(t0, midi, steps, gain = 1, pan = 0.12, octaveDouble = false) {
  const n = Math.round(steps * STEP * SR * 0.94);
  const lp = biquadLP(4200, 0.8);
  const from = leadPrev ?? midi;
  leadPrev = midi;
  let ph = 0, ph2 = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const glide = from + (midi - from) * Math.min(1, t / 0.035);
    const vib = t > 0.18 ? Math.sin(2 * Math.PI * 6 * t) * 0.18 * Math.min(1, (t - 0.18) * 5) : 0;
    const f = mtof(glide + vib);
    ph = (ph + f / SR) % 1;
    const dt = f / SR;
    // 30% pulse from two saws.
    let p2 = (ph + 0.3) % 1;
    let v = saw(ph, dt) - saw(p2, dt);
    if (octaveDouble) {
      ph2 = (ph2 + (f * 2) / SR) % 1;
      v += (saw(ph2, (2 * f) / SR)) * 0.35;
    }
    v = lp(v);
    const env = Math.min(1, k / 120) * (0.75 + 0.25 * Math.exp(-t * 8)) * (k > n - 350 ? (n - k) / 350 : 1);
    const s = v * env * 0.3 * gain;
    out(t0 + k, s, pan);
    echoL[t0 + k] += s * 0.5;
    echoR[t0 + k] += s * 0.5;
  }
}
// Arp pluck: triangle-ish with a fast decay.
function pluck(t0, midi, gain = 1, pan = 0) {
  const n = Math.round(0.22 * SR);
  const f = mtof(midi);
  let ph = rnd();
  const lp = biquadLP(3000, 0.7);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    ph = (ph + f / SR) % 1;
    const tri = 1 - 4 * Math.abs(ph - 0.5);
    const v = lp(tri * 0.7 + saw(ph, f / SR) * 0.3) * Math.exp(-t * 14) * 0.26 * gain;
    out(t0 + k, v, pan);
    echoL[t0 + k] += v * 0.3;
    echoR[t0 + k] += v * 0.3;
  }
}
// Riser: noise through a sweeping band, plus a rising saw.
function riser(t0, bars) {
  const n = Math.round(bars * BAR * SR);
  const lp = sweepLP(3), hp = hp1(300);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const v = lp(hp(rnd() * 2 - 1), 400 + 7000 * u * u) * 0.25 * u;
    ph = (ph + mtof(52 + 24 * u) / SR) % 1;
    out(t0 + k, v + saw(ph, 0.01) * 0.035 * u, Math.sin(u * 20) * 0.4);
  }
}

// --------------------------------------------------------- the song --
const E = 52, G = 55, A = 57, B = 59, C = 48, D = 50; // power-chord roots (E3...)
const PROG_A = [E, E, C, D, E, E, C, D];
const PROG_B = [A, A, C, D, E, G, A, B];
// Hook (2 bars, 16th steps): [step, midi, length].
const HOOK = [
  [0, 76, 2], [2, 74, 2], [4, 71, 2], [6, 69, 1], [7, 71, 3], [10, 67, 2], [12, 69, 4],
  [16, 76, 2], [18, 79, 2], [20, 76, 1], [21, 74, 1], [22, 71, 2], [24, 69, 2], [26, 71, 2], [28, 64, 4],
];
const HOOK_END = [
  [16, 76, 2], [18, 79, 2], [20, 81, 2], [22, 79, 1], [23, 78, 1], [24, 76, 3], [27, 74, 1], [28, 76, 4],
];
// Answer phrase for the B part (2 bars).
const ANSWER = [
  [0, 69, 3], [3, 71, 3], [6, 73, 2], [8, 76, 6], [16, 74, 3], [19, 73, 3], [22, 71, 2], [24, 69, 3], [27, 67, 1], [28, 66, 4],
];
const SECTIONS = [
  { name: "intro groove", prog: PROG_A, hats: 8, chords: "mute", lead: null, arp: false },
  { name: "hook", prog: PROG_A, hats: 8, chords: "mute", lead: "hook", arp: false },
  { name: "B part", prog: PROG_B, hats: 16, chords: "ring", lead: "answer", arp: true },
  { name: "hook high", prog: PROG_A, hats: 16, chords: "mute", lead: "hookHigh", arp: true },
  { name: "build", prog: PROG_B, hats: 8, chords: "stab", lead: null, arp: true, build: true },
  { name: "climax", prog: PROG_A, hats: 16, chords: "ring", lead: "hookHigh", arp: true, climax: true },
];

SECTIONS.forEach((sec, si) => {
  const bar0 = si * 8;
  crash(at(bar0), si === 0 ? 0.6 : 1);
  for (let b = 0; b < 8; b++) {
    const bar = bar0 + b, root = sec.prog[b];
    const lastBar = b === 7;
    // Drums.
    const kicks = sec.build && b < 6 ? [0, 8] : sec.climax ? [0, 3, 8, 10, 14] : [0, 6, 8, 10];
    for (const s of kicks) kick(at(bar, s), sec.build ? 0.8 : 1);
    if (!(sec.build && b >= 6)) for (const s of [4, 12]) snare(at(bar, s), 0.9);
    for (let s = 0; s < 16; s += sec.hats === 16 ? 1 : 2) hat(at(bar, s), s % 4 === 2 ? 1 : 0.6, false, 0.3);
    if (b % 2 === 1 && !sec.build) hat(at(bar, 14), 0.8, true);
    if (sec.build && b >= 6) {
      // Snare roll speeding up into the climax.
      const per = b === 6 ? 2 : 1;
      for (let s = 0; s < 16; s += per) snare(at(bar, s), 0.4 + 0.5 * ((b - 6) * 16 + s) / 32, (s % 2 ? -0.2 : 0.2));
    } else if (lastBar && si !== SECTIONS.length - 1) {
      // Fill: toms down the kit.
      [[8, 50], [10, 47], [12, 43], [14, 40]].forEach(([s, m], i) => tom(at(bar, s), m, 0.9, 0.4 - i * 0.25));
    } else if (lastBar) {
      // Last bar of the loop: a short fill that lands back on the intro.
      for (const s of [8, 10, 11, 12, 13, 14, 15]) snare(at(bar, s), 0.5 + s * 0.02);
    }
    // Bass: driving 8ths, octave jumps on the off-beats in busy parts.
    const bassRoot = root - 24 + (root >= 57 ? -12 : 0);
    if (sec.build && b < 6) bass(at(bar), bassRoot, 16, 0.9);
    else for (let s = 0; s < 16; s += 2) bass(at(bar, s), bassRoot + (sec.hats === 16 && s % 4 === 2 ? 12 : 0), 2);
    // Rhythm chords.
    if (sec.chords === "mute") for (let s = 0; s < 16; s += 2) chord(at(bar, s), root, 2, s % 4 ? 0.8 : 1, true, s % 4 ? 0.55 : -0.55);
    else if (sec.chords === "ring") { chord(at(bar), root, 8, 0.75, false, -0.6); chord(at(bar, 8), root, 8, 0.75, false, 0.6); }
    else if (sec.chords === "stab") for (const s of [0, 3, 6]) chord(at(bar, s), root, 2, 0.9, true, s === 3 ? 0.5 : -0.5);
    // Arps: chord tones in 16ths an octave up.
    if (sec.arp) {
      const tones = [root + 12, root + 19, root + 24, root + 28 - (root === E || root === A || root === B ? 1 : 0)];
      for (let s = 0; s < 16; s++) pluck(at(bar, s), tones[[0, 1, 2, 3, 2, 1][s % 6]], s % 4 === 0 ? 1 : 0.7, Math.sin(s) * 0.5);
    }
  }
  // Lead phrases, two bars each.
  if (sec.lead)
    for (let ph = 0; ph < 4; ph++) {
      const bar = bar0 + ph * 2;
      const phrase = sec.lead === "answer" ? ANSWER : ph === 3 ? [...HOOK.slice(0, 7), ...HOOK_END] : HOOK;
      const up = sec.lead === "hookHigh" ? 12 : 0;
      for (const [s, m, len] of phrase) lead(at(bar, s), m + (sec.lead === "answer" ? 0 : up) - (up && m + up > 91 ? 12 : 0), len, sec.climax ? 1.1 : 1, 0.12, sec.lead === "hookHigh");
    }
  if (sec.build) riser(at(bar0 + 4), 4);
});

// ------------------------------------------------------- effects/mix --
// Ping-pong echo, a dotted 8th.
{
  const d = Math.round(STEP * 3 * SR);
  for (let i = d; i < N; i++) {
    echoL[i] += echoR[i - d] * 0.38;
    echoR[i] += echoL[i - d] * 0.38;
  }
  const lpL = biquadLP(3500), lpR = biquadLP(3500);
  for (let i = 0; i < N; i++) {
    L[i] += lpL(i >= d ? echoR[i - d] : 0) * 0.55;
    R[i] += lpR(i >= d ? echoL[i - d] : 0) * 0.55;
  }
}
// Small room on the drums (four combs, two all-passes).
{
  const combs = [1116, 1188, 1277, 1356].map((len) => ({ buf: new Float32Array(len), i: 0, len, fb: 0.72, lp: 0 }));
  const aps = [556, 441].map((len) => ({ buf: new Float32Array(len), i: 0, len }));
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.75 + c.lp * 0.25;
      c.buf[c.i] = roomIn[i] + c.lp * c.fb;
      c.i = (c.i + 1) % c.len;
      s += y;
    }
    for (const a of aps) {
      const y = a.buf[a.i];
      a.buf[a.i] = s + y * 0.5;
      a.i = (a.i + 1) % a.len;
      s = y - s * 0.5;
    }
    L[i] += s * 0.12;
    R[i] += s * 0.1;
  }
}
// Seamless loop: everything that rings past the end is added to the start.
const LOOP = Math.round(LENGTH * SR);
for (let i = LOOP; i < N; i++) {
  L[i - LOOP] += L[i];
  R[i - LOOP] += R[i];
}
// Master: gentle glue (soft clip), then normalise to -1 dBFS peak.
let peak = 0;
for (let i = 0; i < LOOP; i++) {
  L[i] = Math.tanh(L[i] * 0.9);
  R[i] = Math.tanh(R[i] * 0.9);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = Math.pow(10, -1 / 20) / peak;
const wav = Buffer.alloc(44 + LOOP * 4);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + LOOP * 4, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(LOOP * 4, 40);
for (let i = 0; i < LOOP; i++) {
  wav.writeInt16LE(Math.round(clamp(L[i] * norm, -1, 1) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(clamp(R[i] * norm, -1, 1) * 32767), 46 + i * 4);
}
writeFileSync(process.argv[2] || "chase-city-bgm.wav", wav);
console.log(`wrote ${(LOOP / SR).toFixed(2)} s, ${BARS} bars at ${BPM} BPM, loop samples ${LOOP}`);
