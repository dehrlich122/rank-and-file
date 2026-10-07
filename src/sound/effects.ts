// The sound effects (M4.1): chiptune, synthesised with Web Audio, so there are no sound files and nothing to license.
// Each is the take the designer picked from the sound sheet (docs/M4/M4.1.md); the others are in git history.

export type SoundName =
  | "move" | "turn_left" | "turn_right" | "bump" | "gate_open" | "guard" | "pick_up" | "bridge" | "capture"
  | "read" | "lost" | "fall" | "crush" | "waypoint"
  | "complete" | "star" | "run_lost" | "error"
  | "menu_move" | "menu_choose" | "hint" | "crown" | "promotion";

/** Schedules a sound on `out`, starting at time `t` of `ctx`. */
export type Play = (ctx: AudioContext, out: AudioNode, t: number) => void;

/** The frequency `semi` semitones above A4 (440 Hz). */
const hz = (semi: number): number => 440 * 2 ** (semi / 12);

interface Voice {
  at?: number; // seconds after `t`
  freq: number;
  to?: number; // glide to this frequency over the voice's length
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function voice(ctx: AudioContext, out: AudioNode, t: number, v: Voice): void {
  const start = t + (v.at ?? 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = v.type ?? "square";
  osc.frequency.setValueAtTime(v.freq, start);
  if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
  const peak = v.gain ?? 0.5;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + v.dur);
  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + v.dur + 0.02);
}

/** A burst of filtered noise: the crunch, thud and scan of the effects. */
function burst(ctx: AudioContext, out: AudioNode, t: number, at: number, dur: number, cutoff: number, gain = 0.5): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t + at);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
  source.connect(filter).connect(amp).connect(out);
  source.start(t + at);
}

/** Notes (semitones from A4) one after another, `step` seconds apart. */
function run(semis: number[], step: number, type: OscillatorType = "square", dur = step * 1.4, gain = 0.4): Play {
  return (ctx, out, t) => semis.forEach((s, i) => voice(ctx, out, t, { at: i * step, freq: hz(s), dur, type, gain }));
}

const blip = (semi: number, dur: number, type: OscillatorType = "square", gain = 0.4): Play => (ctx, out, t) =>
  voice(ctx, out, t, { freq: hz(semi), dur, type, gain });

const glide = (from: number, to: number, dur: number, type: OscillatorType = "square", gain = 0.4): Play => (ctx, out, t) =>
  voice(ctx, out, t, { freq: hz(from), to: hz(to), dur, type, gain });

export const EFFECTS: Record<SoundName, Play> = {
  // -- on the board ----------------------------------------------------------------------------------------
  move: blip(7, 0.04, "square", 0.25),
  turn_left: run([7, 0], 0.045, "square", 0.06, 0.3),
  turn_right: run([0, 7], 0.045, "square", 0.06, 0.3),
  bump: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-22), dur: 0.1, type: "sawtooth", gain: 0.35 }); burst(ctx, out, t, 0, 0.05, 1200, 0.25); },
  gate_open: run([12, 19], 0.1, "triangle", 0.25, 0.5),
  guard: run([-5, -10], 0.11, "square", 0.14, 0.35),
  pick_up: run([19, 24], 0.06, "triangle", 0.14, 0.5),
  bridge: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-10), to: hz(5), dur: 0.14, type: "square", gain: 0.3 }); voice(ctx, out, t, { at: 0.14, freq: hz(-24), to: hz(-30), dur: 0.1, type: "sine", gain: 0.7 }); },
  capture: (ctx, out, t) => { burst(ctx, out, t, 0, 0.12, 3000, 0.5); voice(ctx, out, t, { at: 0.05, freq: hz(-12), to: hz(-24), dur: 0.15, type: "sawtooth", gain: 0.4 }); },
  read: glide(5, 24, 0.18, "triangle", 0.35),
  lost: glide(7, -17, 0.35, "square", 0.35),
  fall: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(19), to: hz(-5), dur: 0.45, type: "sine", gain: 0.4 }); voice(ctx, out, t, { at: 0.45, freq: hz(-30), dur: 0.12, type: "sine", gain: 0.8 }); },
  crush: (ctx, out, t) => { burst(ctx, out, t, 0, 0.18, 1800, 0.6); voice(ctx, out, t, { freq: hz(-28), to: hz(-40), dur: 0.2, type: "sawtooth", gain: 0.6 }); },
  waypoint: run([19, 24], 0.07, "triangle", 0.16, 0.45),

  // -- outcomes ----------------------------------------------------------------------------------------------
  complete: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(12), dur: 0.5, type: "triangle", gain: 0.45 }); voice(ctx, out, t, { at: 0.08, freq: hz(19), dur: 0.5, type: "triangle", gain: 0.4 }); voice(ctx, out, t, { at: 0.16, freq: hz(24), dur: 0.6, type: "triangle", gain: 0.35 }); },
  star: run([24, 31], 0.05, "square", 0.12, 0.25),
  run_lost: run([-5, -10], 0.22, "triangle", 0.35, 0.5),
  error: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-14), dur: 0.1, type: "square", gain: 0.35 }); voice(ctx, out, t, { at: 0.14, freq: hz(-14), dur: 0.1, type: "square", gain: 0.35 }); },

  // -- the chrome -------------------------------------------------------------------------------------------
  menu_move: blip(19, 0.03, "square", 0.18),
  menu_choose: run([14, 21], 0.06, "triangle", 0.16, 0.4),
  hint: glide(5, 17, 0.14, "sine", 0.45),
  crown: run([12, 16, 19, 24], 0.12, "triangle", 0.45, 0.4),
  promotion: run([0, 4, 7, 12, 16, 19, 24], 0.12, "square", 0.3, 0.3),
};
