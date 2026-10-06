// The sound effects (M4.1): chiptune, synthesised with Web Audio, so there are no sound files and nothing to license.
// Each effect has a few takes, which the sound sheet (design/sound.html) plays side by side. Once the designer has
// picked, the takes that weren't chosen are removed. A take schedules its sound on `out` starting at time `t`.

export type SoundName =
  | "move" | "turn_left" | "turn_right" | "bump" | "gate_open" | "guard" | "pick_up" | "bridge" | "capture"
  | "read" | "lost" | "fall" | "crush" | "waypoint"
  | "complete" | "star" | "run_lost" | "error"
  | "menu_move" | "menu_choose" | "hint" | "crown" | "promotion";

export type Take = { label: string; play: (ctx: AudioContext, out: AudioNode, t: number) => void };

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
function run(semis: number[], step: number, type: OscillatorType = "square", dur = step * 1.4, gain = 0.4): Take["play"] {
  return (ctx, out, t) => semis.forEach((s, i) => voice(ctx, out, t, { at: i * step, freq: hz(s), dur, type, gain }));
}

const blip = (semi: number, dur: number, type: OscillatorType = "square", gain = 0.4): Take["play"] => (ctx, out, t) =>
  voice(ctx, out, t, { freq: hz(semi), dur, type, gain });

const glide = (from: number, to: number, dur: number, type: OscillatorType = "square", gain = 0.4): Take["play"] => (ctx, out, t) =>
  voice(ctx, out, t, { freq: hz(from), to: hz(to), dur, type, gain });

export const EFFECTS: Record<SoundName, Take[]> = {
  // -- on the board ----------------------------------------------------------------------------------------
  move: [
    { label: "soft tick", play: blip(-5, 0.05, "triangle", 0.35) },
    { label: "pixel step", play: blip(7, 0.04, "square", 0.25) },
    { label: "low pat", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-24), to: hz(-31), dur: 0.07, type: "sine", gain: 0.6 }); burst(ctx, out, t, 0, 0.03, 900, 0.15); } },
  ],
  turn_left: [
    { label: "down chirp", play: run([7, 0], 0.045, "square", 0.06, 0.3) },
    { label: "down blip", play: glide(9, 2, 0.09, "triangle", 0.4) },
  ],
  turn_right: [
    { label: "up chirp", play: run([0, 7], 0.045, "square", 0.06, 0.3) },
    { label: "up blip", play: glide(2, 9, 0.09, "triangle", 0.4) },
  ],
  bump: [
    { label: "dull thud", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-26), to: hz(-36), dur: 0.14, type: "sine", gain: 0.8 }); burst(ctx, out, t, 0, 0.06, 500, 0.3); } },
    { label: "buzz knock", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-22), dur: 0.1, type: "sawtooth", gain: 0.35 }); burst(ctx, out, t, 0, 0.05, 1200, 0.25); } },
  ],
  gate_open: [
    { label: "rising arpeggio", play: run([0, 4, 7, 12, 16], 0.06, "square", 0.12, 0.3) },
    { label: "unlock sweep", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-5), to: hz(19), dur: 0.22, type: "sawtooth", gain: 0.25 }); voice(ctx, out, t, { at: 0.22, freq: hz(19), dur: 0.12, type: "square", gain: 0.3 }); } },
    { label: "two-tone ding", play: run([12, 19], 0.1, "triangle", 0.25, 0.5) },
  ],
  guard: [
    { label: "low buzz", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-20), dur: 0.22, type: "sawtooth", gain: 0.4 }); voice(ctx, out, t, { freq: hz(-20) * 1.02, dur: 0.22, type: "sawtooth", gain: 0.3 }); } },
    { label: "wrong-answer drop", play: run([-5, -10], 0.11, "square", 0.14, 0.35) },
  ],
  pick_up: [
    { label: "bright blip", play: run([12, 19], 0.05, "square", 0.08, 0.3) },
    { label: "coin ping", play: run([19, 24], 0.06, "triangle", 0.14, 0.5) },
    { label: "sparkle", play: run([16, 19, 23, 28], 0.035, "square", 0.07, 0.25) },
  ],
  bridge: [
    { label: "sweep and knock", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-10), to: hz(5), dur: 0.14, type: "square", gain: 0.3 }); voice(ctx, out, t, { at: 0.14, freq: hz(-24), to: hz(-30), dur: 0.1, type: "sine", gain: 0.7 }); } },
    { label: "plank lay", play: (ctx, out, t) => { burst(ctx, out, t, 0, 0.08, 1500, 0.3); voice(ctx, out, t, { at: 0.08, freq: hz(-17), dur: 0.1, type: "triangle", gain: 0.6 }); } },
  ],
  capture: [
    { label: "crunchy hit", play: (ctx, out, t) => { burst(ctx, out, t, 0, 0.12, 3000, 0.5); voice(ctx, out, t, { at: 0.05, freq: hz(-12), to: hz(-24), dur: 0.15, type: "sawtooth", gain: 0.4 }); } },
    { label: "slash", play: (ctx, out, t) => { burst(ctx, out, t, 0, 0.08, 6000, 0.35); voice(ctx, out, t, { freq: hz(19), to: hz(-5), dur: 0.1, type: "square", gain: 0.25 }); voice(ctx, out, t, { at: 0.09, freq: hz(-19), dur: 0.1, type: "sine", gain: 0.6 }); } },
  ],
  read: [
    { label: "scan flutter", play: run([12, 14, 16, 19, 21, 24], 0.03, "square", 0.05, 0.22) },
    { label: "data sweep", play: glide(5, 24, 0.18, "triangle", 0.35) },
  ],
  lost: [
    { label: "drop", play: glide(7, -17, 0.35, "square", 0.35) },
    { label: "descending three", play: run([7, 2, -5], 0.12, "square", 0.18, 0.35) },
  ],
  fall: [
    { label: "long fall", play: glide(14, -24, 0.6, "triangle", 0.5) },
    { label: "whistle and thud", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(19), to: hz(-5), dur: 0.45, type: "sine", gain: 0.4 }); voice(ctx, out, t, { at: 0.45, freq: hz(-30), dur: 0.12, type: "sine", gain: 0.8 }); } },
  ],
  crush: [
    { label: "slam", play: (ctx, out, t) => { burst(ctx, out, t, 0, 0.18, 1800, 0.6); voice(ctx, out, t, { freq: hz(-28), to: hz(-40), dur: 0.2, type: "sawtooth", gain: 0.6 }); } },
    { label: "gate shut", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-14), to: hz(-26), dur: 0.12, type: "square", gain: 0.4 }); burst(ctx, out, t, 0.1, 0.16, 800, 0.6); } },
  ],
  waypoint: [
    { label: "clean ping", play: blip(24, 0.18, "triangle", 0.5) },
    { label: "double ping", play: run([19, 24], 0.07, "triangle", 0.16, 0.45) },
  ],

  // -- outcomes ----------------------------------------------------------------------------------------------
  complete: [
    { label: "three-note fanfare", play: run([0, 4, 7], 0.11, "square", 0.22, 0.35) },
    { label: "triumph", play: (ctx, out, t) => { run([0, 4, 7, 12], 0.09, "square", 0.18, 0.3)(ctx, out, t); voice(ctx, out, t, { at: 0.36, freq: hz(16), dur: 0.4, type: "triangle", gain: 0.5 }); } },
    { label: "bright chime", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(12), dur: 0.5, type: "triangle", gain: 0.45 }); voice(ctx, out, t, { at: 0.08, freq: hz(19), dur: 0.5, type: "triangle", gain: 0.4 }); voice(ctx, out, t, { at: 0.16, freq: hz(24), dur: 0.6, type: "triangle", gain: 0.35 }); } },
  ],
  star: [
    { label: "rising ping", play: blip(21, 0.2, "triangle", 0.5) },
    { label: "twinkle", play: run([24, 31], 0.05, "square", 0.12, 0.25) },
  ],
  run_lost: [
    { label: "low descending phrase", play: run([-2, -5, -9, -14], 0.14, "sawtooth", 0.2, 0.3) },
    { label: "sad two", play: run([-5, -10], 0.22, "triangle", 0.35, 0.5) },
  ],
  error: [
    { label: "harsh buzz", play: (ctx, out, t) => voice(ctx, out, t, { freq: hz(-17), dur: 0.28, type: "sawtooth", gain: 0.4 }) },
    { label: "double buzz", play: (ctx, out, t) => { voice(ctx, out, t, { freq: hz(-14), dur: 0.1, type: "square", gain: 0.35 }); voice(ctx, out, t, { at: 0.14, freq: hz(-14), dur: 0.1, type: "square", gain: 0.35 }); } },
  ],

  // -- the chrome -------------------------------------------------------------------------------------------
  menu_move: [
    { label: "tiny tick", play: blip(19, 0.03, "square", 0.18) },
    { label: "soft blip", play: blip(14, 0.05, "triangle", 0.3) },
  ],
  menu_choose: [
    { label: "confirm blip", play: run([12, 19], 0.05, "square", 0.09, 0.3) },
    { label: "select ping", play: run([14, 21], 0.06, "triangle", 0.16, 0.4) },
  ],
  hint: [
    { label: "soft chime", play: run([16, 21], 0.09, "triangle", 0.3, 0.4) },
    { label: "bulb", play: glide(5, 17, 0.14, "sine", 0.45) },
  ],
  crown: [
    { label: "longer chime", play: run([12, 16, 19, 24], 0.12, "triangle", 0.45, 0.4) },
    { label: "royal four", play: run([7, 12, 16, 19], 0.15, "square", 0.3, 0.25) },
  ],
  promotion: [
    { label: "big rising phrase", play: run([0, 4, 7, 12, 16, 19, 24], 0.12, "square", 0.3, 0.3) },
    { label: "choir-ish swell", play: (ctx, out, t) => { [0, 7, 12, 16, 19].forEach((s, i) => voice(ctx, out, t, { at: i * 0.14, freq: hz(s), dur: 1.1 - i * 0.1, type: "triangle", gain: 0.3 })); voice(ctx, out, t, { at: 0.8, freq: hz(24), dur: 0.9, type: "triangle", gain: 0.45 }); } },
  ],
};
