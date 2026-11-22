// All sound is synthesized with WebAudio — no audio files, no network. Engine
// hum follows speed, the siren wails while police are near, gunshots are noise
// bursts, and a low pad plays under the game. The context starts on the first
// user gesture (browsers require it); before that every call is a no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let padOsc = null;
  let padGain = null;
  let muted = false;
  let engineOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, gain by speed.
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 82;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: a square that alternates tone while the gain is up.
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Pad: two slow sines, very low, for the dusk mood.
      padGain = ctx.createGain();
      padGain.gain.value = 0;
      padOsc = ctx.createOscillator();
      padOsc.type = 'sine';
      padOsc.frequency.value = 110;
      const padOsc2 = ctx.createOscillator();
      padOsc2.type = 'sine';
      padOsc2.frequency.value = 164.8;
      padOsc.connect(padGain);
      padOsc2.connect(padGain);
      padGain.connect(master);
      padOsc.start();
      padOsc2.start();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function blip(freq, at, duration, gainValue, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + duration + 0.05);
  }

  return {
    /** Call on any user gesture: creates/resumes the context. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** Engine hum: speed 0..1. Call every frame while driving. */
    engine(speed01, driving) {
      if (!ctx) return;
      const target = driving && !muted ? 0.05 + speed01 * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 48 + speed01 * 110;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 1.5, ctx.currentTime, 0.08);
      engineOn = driving;
    },
    /** Siren on/off; the two-tone alternation is driven by update(). */
    siren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.05 : 0, ctx.currentTime, 0.1);
    },
    /** Pad music on/off. */
    pad(on) {
      if (!ctx) return;
      padGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.5);
    },
    update(dt) {
      if (!ctx || !sirenOsc) return;
      sirenTimer += dt;
      sirenOsc.frequency.value = Math.floor(sirenTimer * 2.2) % 2 === 0 ? 720 : 960;
    },
    shot(rifle) {
      noiseBurst(rifle ? 0.09 : 0.14, rifle ? 3200 : 1800, rifle ? 0.22 : 0.3);
    },
    honk() {
      blip(392, 0, 0.16, 0.18, 'square');
      blip(392, 0.2, 0.16, 0.18, 'square');
    },
    pickup() {
      blip(660, 0, 0.1, 0.2);
      blip(880, 0.09, 0.14, 0.2);
    },
    missionComplete() {
      blip(523, 0, 0.16, 0.22);
      blip(659, 0.13, 0.16, 0.22);
      blip(784, 0.26, 0.16, 0.22);
      blip(1046, 0.39, 0.3, 0.24);
    },
    wasted() {
      blip(392, 0, 0.3, 0.22, 'sawtooth');
      blip(311, 0.25, 0.4, 0.22, 'sawtooth');
    },
    explosion() {
      noiseBurst(0.5, 300, 0.5);
    },
    click() {
      blip(880, 0, 0.06, 0.12);
    },
  };
}
