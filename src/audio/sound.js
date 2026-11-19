import { clamp } from "../game/config.js";
export function soundTargets(sim) {
  const p = sim.player,
    speed = Math.hypot(p.vx, p.vz);
  const lateral = Math.abs(p.vx * Math.cos(p.angle) - p.vz * Math.sin(p.angle));
  const nearest = Math.min(
    200,
    ...sim.police
      .filter((c) => c.state === "active")
      .map((c) => Math.hypot(c.x - p.x, c.z - p.z)),
  );
  // Tire screech: only for a real, held turn at speed (a tap of the
  // button or a slow turn stays quiet); louder and higher with more speed
  // and a harder turn or slide.
  const turnLoad = (Math.abs(p.turn || 0) * speed) / 24 + lateral * 0.2;
  const screech =
    clamp((turnLoad - 1.05) / 0.75, 0, 1) * clamp((speed - 9) / 7, 0, 1);
  return {
    engineHz: 45 + speed * 6,
    engineGain: 0.012 + clamp(speed / 24, 0, 1) * 0.035,
    sirenGain: 0.06 * Math.pow(clamp(1 - nearest / 75, 0, 1), 2),
    skidGain: 0.055 * screech,
    skidHz: 980 + speed * 14 + clamp(turnLoad, 0, 2.5) * 90,
  };
}
// Background music: "Getaway Club", an original composition made for this
// game (scripts/music/compose.mjs renders it; docs/audio-assets.md). The
// file is loaded on the first user gesture (never autoplayed), loops
// sample-exactly, goes through the master gain (so mute silences it) and
// sits under the gameplay sounds: lower still while paused or on a menu,
// dipped under explosions.
export const MUSIC = {
  url: "audio/chase-city-bgm.mp3",
  loopSeconds: 76.8, // 48 bars at 150 BPM
  playing: 0.26,
  idle: 0.1,
};
// Sound effects are synthesized locally; the music is the only file.
export class SoundSystem {
  constructor(
    factory = () => {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Audio ? new Audio() : null;
    },
  ) {
    this.factory = factory;
    this.context = null;
    this.muted = false;
    this.running = false;
    this.available = true;
    this.voices = new Set();
    this.lastExplosion = 0;
    this.lastImpact = 0;
    this.lastCity = 0;
    this.cooldowns = {};
    this.lastTargets = null;
    this.music = { state: "none", source: null, gain: null };
  }
  unlock() {
    try {
      if (!this.context) {
        const context = this.factory();
        if (!context) {
          this.available = false;
          return Promise.resolve(false);
        }
        this.context = context;
        this.build();
      }
      // Called directly within START/resume/mute user gestures, including Safari.
      return Promise.resolve(this.context.resume())
        .then(() => {
          try {
            this.startMusic();
          } catch {
            this.music.state = "failed";
          }
          return true;
        })
        .catch(() => {
          this.available = false;
          return false;
        });
    } catch {
      this.available = false;
      return Promise.resolve(false);
    }
  }
  build() {
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.45;
    this.compressor = c.createDynamicsCompressor();
    Object.assign(this.compressor.threshold, { value: -12 });
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.compressor.connect(this.master);
    this.master.connect(c.destination);
    // Music bus: straight to the master (not squeezed by the effects'
    // compressor, which would pump it under every crash).
    this.music.gain = c.createGain();
    this.music.gain.gain.value = 0;
    this.music.gain.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = this.noise.getChannelData(0);
    let n = 12345;
    for (let i = 0; i < data.length; i++) {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      data[i] = n / 2147483648 - 1;
    }
    this.loops = {};
    for (const name of ["engine", "siren"]) {
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.connect(this.compressor);
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = name === "engine" ? 500 : 1800;
      filter.Q.value = 0.7;
      filter.connect(gain);
      const source = c.createOscillator();
      source.type = name === "engine" ? "sawtooth" : "sine";
      source.frequency.value = name === "engine" ? 45 : 650;
      source.connect(filter);
      source.start();
      this.loops[name] = { source, gain, filter };
    }
    this.loops.skid = this.buildScreech();
  }
  // Tire screech: one sustained voice, never stacked. Modelled on rubber
  // stick-slip on asphalt rather than on oscillators (which sound
  // electronic): broadband noise rings a bank of narrow resonances (the
  // squeal and two inharmonic partials), its pitch drifts at random a
  // little, its level chatters irregularly (the tread gripping and letting
  // go), and a soft high scrub sits under it. Two noise sources played at
  // different rates never line up, so there is no audible loop. update()
  // only moves its level and pitch (loop.pitch). Its sources exist only
  // while it sounds, so it costs nothing between turns.
  buildScreech() {
    const c = this.context;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(this.compressor);
    // Chatter: the level wobbles irregularly round 1 (AM by slow noise).
    const chatter = c.createGain();
    chatter.gain.value = 1;
    chatter.connect(gain);
    const PARTIALS = [
      [1, 34, 1.0],
      [2.13, 26, 0.42],
      [3.37, 20, 0.18],
    ];
    const bands = PARTIALS.map(([ratio, q, level]) => {
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1100 * ratio;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = level * 13; // narrow bands pass little energy
      f.connect(g);
      g.connect(chatter);
      return { f, ratio };
    });
    const scrub = c.createBiquadFilter();
    scrub.type = "highpass";
    scrub.frequency.value = 3200;
    const scrubGain = c.createGain();
    scrubGain.gain.value = 0.07;
    scrub.connect(scrubGain);
    scrubGain.connect(chatter);
    // Modulators: slow pitch drift (+-45 cents) and fast level chatter.
    const driftLp = c.createBiquadFilter();
    driftLp.type = "lowpass";
    driftLp.frequency.value = 5;
    const drift = c.createGain();
    drift.gain.value = 45 * 18; // low-passed noise is quiet: scale up
    driftLp.connect(drift);
    for (const b of bands) drift.connect(b.f.detune);
    const chatLp = c.createBiquadFilter();
    chatLp.type = "bandpass";
    chatLp.frequency.value = 38;
    chatLp.Q.value = 0.7;
    const chat = c.createGain();
    chat.gain.value = 2.2;
    chatLp.connect(chat);
    chat.connect(chatter.gain);
    const loop = { gain, level: 0, live: null, quietSince: 0, hz: 1100 };
    loop.pitch = (hz, time = 0.08) => {
      loop.hz = hz;
      for (const b of bands) b.f.frequency.setTargetAtTime(hz * b.ratio, c.currentTime, time);
    };
    loop.start = () => {
      const src = (rate) => {
        const n = c.createBufferSource();
        n.buffer = this.noise;
        n.loop = true;
        n.playbackRate.value = rate;
        return n;
      };
      const a = src(1),
        b2 = src(0.913),
        m1 = src(0.71),
        m2 = src(1.37);
      for (const band of bands) {
        band.f.frequency.value = loop.hz * band.ratio;
        a.connect(band.f);
      }
      b2.connect(scrub);
      m1.connect(driftLp);
      m2.connect(chatLp);
      // Start at a random point in the buffer each time.
      loop.live = [a, b2, m1, m2];
      for (const s of loop.live) s.start(0, Math.random() * 0.9);
    };
    loop.stop = () => {
      for (const s of loop.live || [])
        try {
          s.stop();
          s.disconnect();
        } catch {}
      loop.live = null;
    };
    return loop;
  }
  parameter(param, value, time = 0.04) {
    param.setTargetAtTime(value, this.context.currentTime, time);
  }
  setMuted(value) {
    this.muted = value;
    if (this.master) this.parameter(this.master.gain, value ? 0 : 0.45, 0.015);
    if (value) this.stopVoices();
  }
  // Fetch, decode and start the music loop once (after a user gesture).
  startMusic() {
    const m = this.music;
    if (!this.context || !m.gain || m.state !== "none" || typeof fetch !== "function") return;
    m.state = "loading";
    const c = this.context;
    const base = globalThis.document?.baseURI ?? globalThis.location?.href;
    const url = base ? new URL(MUSIC.url, base).href : MUSIC.url;
    Promise.resolve()
      .then(() => fetch(url))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => new Promise((ok, fail) => {
        // Old Safari only has the callback form.
        const p = c.decodeAudioData(data, ok, fail);
        if (p?.then) p.then(ok, fail);
      }))
      .then((buffer) => {
        const source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        // Skip the encoder's leading padding: the track starts on a hit.
        const ch = buffer.getChannelData(0);
        let first = 0;
        while (first < Math.min(ch.length, 8192) && Math.abs(ch[first]) < 1e-4) first++;
        source.loopStart = first / buffer.sampleRate;
        source.loopEnd = Math.min(buffer.duration, source.loopStart + MUSIC.loopSeconds);
        source.connect(m.gain);
        source.start(0, source.loopStart);
        m.source = source;
        m.state = "playing";
        this.musicLevel();
      })
      .catch(() => {
        m.state = "failed"; // the game carries on without music
      });
  }
  // Music level for the current state (fades, never jumps).
  musicLevel(time = 0.6) {
    const m = this.music;
    if (!m.gain || !this.context) return;
    this.parameter(m.gain.gain, this.running ? MUSIC.playing : MUSIC.idle, time);
  }
  // Briefly lower the music under a big sound.
  duck(depth = 0.45, hold = 0.25) {
    const m = this.music;
    if (!m.gain || m.state !== "playing" || !this.running) return;
    const g = m.gain.gain, now = this.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(MUSIC.playing * (1 - depth), now, 0.04);
    g.setTargetAtTime(MUSIC.playing, now + hold, 0.5);
  }
  setRunning(value) {
    this.running = value;
    this.musicLevel(value ? 0.8 : 0.3);
    if (!value && this.context) {
      for (const loop of Object.values(this.loops || {})) {
        try {
          this.parameter(loop.gain.gain, 0, 0.015);
        } catch {}
      }
      // Paused / finished: no screech sources running in the background.
      if (this.loops?.skid?.live) this.loops.skid.stop();
      this.stopVoices();
    }
  }
  reset() {
    this.lastExplosion = 0;
    this.lastImpact = 0;
    this.cooldowns = {};
    this.stopVoices();
  }
  stopVoices() {
    for (const voice of [...this.voices]) {
      try {
        voice.source.stop();
      } catch {}
      voice.dispose();
    }
  }
  voice(kind, strength = 1, frequency = 200, delay = 0) {
    if (kind === "explosion") this.duck(0.35, 0.2);
    if (kind === "bigExplosion") {
      this.duck(0.6, 0.6);
      return this.bigExplosion(strength, delay);
    }
    if (
      !this.context ||
      this.muted ||
      !this.available ||
      this.context.state !== "running"
    )
      return;
    const c = this.context,
      now = c.currentTime;
    // Compare scheduled start times so staged chain-reaction explosions
    // queued in the same frame each get their own voice.
    if (
      kind !== "tone" &&
      kind !== "horn" &&
      Math.abs(now + delay - (this.cooldowns[kind] ?? -100)) < 0.07
    )
      return;
    if (this.voices.size >= 6) return;
    this.cooldowns[kind] = now + delay;
    const osc = kind === "tone" || kind === "horn";
    const source = osc ? c.createOscillator() : c.createBufferSource();
    const gain = c.createGain(),
      filter = c.createBiquadFilter();
    const duration =
      kind === "explosion"
        ? 0.85
        : kind === "collision"
          ? 0.2
          : kind === "horn"
            ? 0.32
            : 0.19;
    const start = now + delay,
      amplitude =
        ((kind === "explosion"
          ? 0.26
          : kind === "collision"
            ? 0.14
            : kind === "horn"
              ? 0.045
              : 0.07) *
          clamp(strength, 0.1, 1)) /
        Math.sqrt(1 + this.voices.size);
    if (osc) {
      // V1.9 car horn: a short square-wave beep.
      source.type = kind === "horn" ? "square" : "sine";
      source.frequency.value = frequency;
    } else {
      source.buffer = this.noise;
      source.playbackRate.value = kind === "explosion" ? 0.65 : 1;
    }
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      kind === "explosion" ? 1200 : kind === "collision" ? 2200 : 2500,
      start,
    );
    if (kind === "explosion")
      filter.frequency.exponentialRampToValueAtTime(90, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    const voice = {
      source,
      dispose: () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
      },
    };
    source.onended = voice.dispose;
    this.voices.add(voice);
    source.start(start);
    source.stop(start + duration + 0.03);
  }
  // Major explosion: a sub-bass drop (thump), a sharp crack, a noisy body
  // that darkens, and a low rumble tail (~2.5 s). One at a time: another
  // within 0.35 s is merged into it. Levels sit under the compressor, so
  // there is no clipping; loudness order: impact < car < major.
  bigExplosion(strength = 1, delay = 0) {
    if (!this.context || this.muted || !this.available || this.context.state !== "running") return;
    const c = this.context,
      start = c.currentTime + delay;
    if (Math.abs(start - (this.cooldowns.bigExplosion ?? -100)) < 0.35) return;
    if (this.voices.size >= 6) return;
    this.cooldowns.bigExplosion = start;
    const k = clamp(strength, 0.15, 1);
    const nodes = [];
    const out = c.createGain();
    out.gain.value = k;
    out.connect(this.compressor);
    nodes.push(out);
    const env = (g, peak, attack, decay, at = start) => {
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    };
    // Thump: sine sweeping 75 -> 30 Hz.
    const sub = c.createOscillator(),
      subGain = c.createGain();
    sub.frequency.setValueAtTime(75, start);
    sub.frequency.exponentialRampToValueAtTime(30, start + 0.9);
    env(subGain, 0.42, 0.006, 1.0);
    sub.connect(subGain);
    subGain.connect(out);
    // Crack: high-passed noise, 70 ms.
    const crack = c.createBufferSource(),
      hp = c.createBiquadFilter(),
      crackGain = c.createGain();
    crack.buffer = this.noise;
    hp.type = "highpass";
    hp.frequency.value = 1400;
    env(crackGain, 0.2, 0.002, 0.07);
    crack.connect(hp);
    hp.connect(crackGain);
    crackGain.connect(out);
    // Body: low-passed noise closing from 2 kHz to 140 Hz over 1.3 s.
    const body = c.createBufferSource(),
      lp = c.createBiquadFilter(),
      bodyGain = c.createGain();
    body.buffer = this.noise;
    body.playbackRate.value = 0.7;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2000, start);
    lp.frequency.exponentialRampToValueAtTime(140, start + 1.3);
    env(bodyGain, 0.34, 0.006, 1.3);
    body.connect(lp);
    lp.connect(bodyGain);
    bodyGain.connect(out);
    // Rumble tail: very low noise swelling in, dying over ~2.5 s.
    const tail = c.createBufferSource(),
      tl = c.createBiquadFilter(),
      tailGain = c.createGain();
    tail.buffer = this.noise;
    tail.loop = true;
    tail.playbackRate.value = 0.35;
    tl.type = "lowpass";
    tl.frequency.value = 140;
    // Swells in, holds, then dies away slowly (time constant 0.55 s).
    tailGain.gain.setValueAtTime(0, start);
    tailGain.gain.linearRampToValueAtTime(0.75, start + 0.25);
    tailGain.gain.setTargetAtTime(0, start + 0.45, 0.55);
    tail.connect(tl);
    tl.connect(tailGain);
    tailGain.connect(out);
    nodes.push(subGain, hp, crackGain, lp, bodyGain, tl, tailGain);
    const sources = [sub, crack, body, tail];
    const voice = {
      source: tail,
      dispose: () => {
        for (const n of [...sources, ...nodes])
          try {
            n.disconnect();
          } catch {}
        this.voices.delete(voice);
      },
    };
    tail.onended = voice.dispose;
    this.voices.add(voice);
    for (const s of sources) s.start(start);
    sub.stop(start + 1.1);
    crack.stop(start + 0.1);
    body.stop(start + 1.35);
    tail.stop(start + 2.7);
  }
  finish(success) {
    this.setRunning(false);
    [...(success ? [523, 659, 784] : [220, 164, 110])].forEach((hz, i) =>
      this.voice("tone", 1, hz, i * 0.12),
    );
  }
  update(sim) {
    if (!this.context || !this.available) return;
    if (!this.running) return;
    try {
      const targets = soundTargets(sim);
      this.lastTargets = targets;
      this.parameter(this.loops.engine.source.frequency, targets.engineHz);
      this.parameter(
        this.loops.siren.source.frequency,
        700 + 240 * Math.sin(this.context.currentTime * 5.5),
        0.025,
      );
      for (const name of ["engine", "siren"])
        this.parameter(this.loops[name].gain.gain, targets[`${name}Gain`]);
      // Screech: fades in fast (0.06 s), out slowly (0.22 s); pitch follows.
      const skid = this.loops.skid;
      const now = this.context.currentTime;
      skid.hz = targets.skidHz;
      if (targets.skidGain > 0 && !skid.live) skid.start();
      if (targets.skidGain > 0) skid.quietSince = now;
      else if (skid.live && now - skid.quietSince > 1.2) skid.stop(); // faded out a while ago
      this.parameter(skid.gain.gain, targets.skidGain, targets.skidGain > skid.level ? 0.06 : 0.22);
      skid.level = targets.skidGain;
      skid.pitch(targets.skidHz, 0.08);
      for (const event of sim.events)
        if (event.id > this.lastExplosion) {
          this.lastExplosion = event.id;
          if (event.type === "explosion")
            this.voice(
              // A gas station or a structure going up is a bigger sound
              // than a car (a layered blast, see bigExplosion).
              event.cause === "gas" || event.major ? "bigExplosion" : "explosion",
              1 -
                Math.min(
                  0.8,
                  Math.hypot(event.x - sim.player.x, event.z - sim.player.z) /
                    120,
                ),
              200,
              // Staged chain-reaction links sound when they are shown.
              event.delay || 0,
            );
        }
      // V1.9 city: knocked props, crashes and horns nearby.
      for (const event of sim.city?.events || [])
        if (event.id > (this.lastCity || 0)) {
          this.lastCity = event.id;
          const d = Math.hypot(event.x - sim.player.x, event.z - sim.player.z);
          if (d > 45) continue;
          const near = 1 - d / 50;
          if (event.type === "traffic" && event.action === "honk") {
            this.voice("horn", near, 392);
            this.voice("horn", near, 494, 0.02);
          } else if (event.action === "break" || event.action === "crash")
            this.voice("collision", near * Math.min(1, event.strength / 15));
          else if (event.action === "land")
            this.voice("collision", near * 0.6, 200, 0);
        }
      for (const event of sim.impacts)
        if (event.id > this.lastImpact) {
          this.lastImpact = event.id;
          this.voice("collision", event.strength / 25);
        }
    } catch {
      this.available = false;
      this.setRunning(false);
    }
  }
}
