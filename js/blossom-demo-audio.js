// Tiny Web Audio voice for the How it Works demo: a soft, plucky triangle
// through a low-pass, with a faint echo for space. Nothing like the real
// device's engine — just enough to hear the melody the walk makes.
let ctx = null;
let out = null;

function ensureContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.16;
  master.connect(ctx.destination);

  // dry + a single feedback echo (wet is kept quiet)
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.34;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  out = ctx.createGain();
  out.connect(master);
  out.connect(delay);
  return ctx;
}

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Must be called from a click the first time (autoplay policy).
export async function enableAudio() {
  const c = ensureContext();
  if (!c) return false;
  if (c.state === 'suspended') await c.resume();
  return true;
}

export function playNote(midi) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = midiToHz(midi);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);

  osc.connect(filter);
  filter.connect(env);
  env.connect(out);
  osc.start(t);
  osc.stop(t + 1.2);
}
