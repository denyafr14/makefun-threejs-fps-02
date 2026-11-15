// audio.js — every sound is synthesised with WebAudio at the moment it is needed: no
// audio files, nothing fetched. Short filtered-noise bursts for gunfire, square blips
// for the charge, a low sine thump for the Ember. All functions no-op until unlock()
// has run inside a user gesture, and each caps how many voices play at once.

let ctx = null;
let noiseBuffer = null;
let voices = 0;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 0.5;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

function burst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.2, type = 'bandpass', slideTo = null }) {
  if (!ctx || voices > 10) return;
  voices++;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const filter = ctx.createBiquadFilter();
  filter.type = type; filter.frequency.setValueAtTime(freq, t); filter.Q.value = q;
  if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(t, Math.random() * 0.2, dur + 0.05);
  src.onended = () => { voices--; };
}

function blip({ freq = 880, dur = 0.07, gain = 0.12, type = 'square' }) {
  if (!ctx || voices > 10) return;
  voices++;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type; osc.frequency.value = freq;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
  osc.onended = () => { voices--; };
}

export const sfx = {
  shot(kind) {
    if (kind === 'anvil') burst({ dur: 0.22, freq: 900, gain: 0.32, slideTo: 200 });
    else if (kind === 'ratchet') burst({ dur: 0.09, freq: 2400, gain: 0.16 });
    else burst({ dur: 0.13, freq: 1700, gain: 0.22, slideTo: 500 });
  },
  dryFire() { blip({ freq: 1400, dur: 0.04, gain: 0.06 }); },
  reload() { burst({ dur: 0.06, freq: 700, gain: 0.1 }); setTimeout(() => burst({ dur: 0.06, freq: 500, gain: 0.12 }), 180); },
  hit(head) { blip({ freq: head ? 1560 : 1180, dur: 0.05, gain: 0.1, type: 'sine' }); },
  kill() { blip({ freq: 660, dur: 0.12, gain: 0.12, type: 'triangle' }); },
  hurt() { burst({ dur: 0.1, freq: 300, gain: 0.14, type: 'lowpass' }); },
  throwIt() { burst({ dur: 0.16, freq: 600, gain: 0.06, slideTo: 1600 }); },
  explode() {
    burst({ dur: 0.7, freq: 220, gain: 0.5, type: 'lowpass', slideTo: 40 });
    blip({ freq: 55, dur: 0.5, gain: 0.3, type: 'sine' });
  },
  beep(final) { blip({ freq: final ? 1760 : 1175, dur: final ? 0.16 : 0.06, gain: 0.09 }); },
  plantDone() { blip({ freq: 880, dur: 0.09, gain: 0.1 }); setTimeout(() => blip({ freq: 1320, dur: 0.12, gain: 0.1 }), 110); },
  buy() { blip({ freq: 990, dur: 0.06, gain: 0.08, type: 'triangle' }); },
  roundEnd(win) { blip({ freq: win ? 784 : 392, dur: 0.22, gain: 0.1, type: 'triangle' }); },
  step() { burst({ dur: 0.05, freq: 420, gain: 0.035, type: 'lowpass' }); },
};
