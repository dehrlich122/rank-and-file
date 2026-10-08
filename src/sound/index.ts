// Sound (M4.1): the soundtrack and the effects, behind one object the app uses.
//
// Browsers refuse to make sound before the player has clicked or pressed a key, so nothing starts until the first
// one; `start()` waits for it. The music is an <audio> element, fetched only when it is wanted (on, not muted, not
// at 0%, tab showing), so a player who turns it off never downloads it. It fades in and out, dips at the loop point
// and under the big moments, and pauses while the tab is hidden. The effects are synthesised (effects.ts).
import { settings, type Settings } from "../settings";
import { EFFECTS, type SoundName } from "./effects";
import { lengthOf, Voices } from "./events";

/** The soundtrack, in the order it plays. One track just loops; another is a file in public/audio/, a line here and one in CREDITS.md. */
export const TRACKS = [{ file: "elysium.mp3", title: "Elysium", credit: "Music by Karl Casey @ White Bat Audio" }];

const FADE_MS = 1200; // fading the music in or out
const EDGE_S = 1.2; // dipping at the start and the end of a track, so a loop doesn't jar
const TICK_MS = 50;
const DUCKED = 0.35; // the music's level under a big moment
const DUCKS: SoundName[] = ["complete", "crown", "promotion"];

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private audio: HTMLAudioElement | null = null;
  private track = 0;
  private unlocked = false;
  private fade = 0; // 0 to 1: the music's fade in or out
  private duck = 1;
  private duckUntil = 0; // performance.now() time
  private readonly voices = new Voices();
  private timer: number | undefined; // the music's 50 ms tick: running only while there is something to fade
  private lastTry = 0; // when the music last asked the browser to play

  /** Wait for the first click or key press, then let the music and effects work. Call once, at startup. */
  start(): void {
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      this.unlocked = true;
      this.context();
      this.wake();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    settings.subscribe((next) => {
      this.applyEffectsVolume(next);
      if (next.muted) this.silenceMusic(); // muting is instant; only coming back fades in
      this.wake();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.silenceMusic(); // a hidden tab's timers are throttled, so stop at once instead of fading
      else this.wake();
    });
  }

  /** Play an effect, `after` seconds from now. Silent before the first click or key, when muted, or at 0%. */
  play(name: SoundName, after = 0): void {
    const ctx = this.context();
    const { effects, muted } = settings.get();
    if (!ctx || !this.master || muted || effects === 0 || !this.voices.start(ctx.currentTime + after, lengthOf(name))) return;
    if (ctx.state === "suspended") void ctx.resume();
    EFFECTS[name](ctx, this.master, ctx.currentTime + after + 0.01);
    if (DUCKS.includes(name)) {
      this.duckUntil = performance.now() + (after + lengthOf(name) + 0.4) * 1000;
      this.wake();
    }
  }

  private silenceMusic(): void {
    this.fade = 0;
    if (!this.audio) return;
    this.audio.volume = 0;
    this.audio.pause();
  }

  private context(): AudioContext | null {
    if (!this.unlocked || typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyEffectsVolume(settings.get());
    }
    return this.ctx;
  }

  private applyEffectsVolume({ effects, muted }: Settings): void {
    if (this.master) this.master.gain.value = muted ? 0 : effects / 100;
  }

  private wake(): void {
    if (this.unlocked && this.timer === undefined) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** Every 50 ms while there is something to do: fade the music towards what's wanted, fetch and play it when it is, and set its volume. */
  private tick(): void {
    const { music, muted } = settings.get();
    const wanted = !muted && music > 0 && !document.hidden;
    this.fade = Math.min(1, Math.max(0, this.fade + (wanted ? TICK_MS : -TICK_MS) / FADE_MS));
    if (wanted && !this.audio) this.audio = this.createAudio();
    const audio = this.audio;
    this.duck += ((performance.now() < this.duckUntil ? DUCKED : 1) - this.duck) * 0.2;
    if (!audio) return this.rest(wanted);
    if (wanted && audio.paused && performance.now() - this.lastTry > 1000) {
      this.lastTry = performance.now();
      audio.play().catch(() => {}); // refused (before a click, say): tried again in a second
    }
    if (!wanted && this.fade === 0 && !audio.paused) audio.pause();
    const edge = Number.isFinite(audio.duration) ? Math.min(1, audio.currentTime / EDGE_S, (audio.duration - audio.currentTime) / EDGE_S) : 1;
    const volume = Math.min(1, Math.max(0, (music / 100) * this.fade * this.duck * Math.max(0, edge)));
    if (Math.abs(audio.volume - volume) > 0.002) audio.volume = volume;
    this.rest(wanted);
  }

  /** Stop ticking when nothing is playing, fading or ducked: the next setting change, duck or return to the tab starts it again. */
  private rest(wanted: boolean): void {
    const quiet = !wanted && this.fade === 0 && (this.audio?.paused ?? true) && Math.abs(this.duck - 1) < 0.01;
    if (!quiet || this.timer === undefined) return;
    window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private url(): string {
    return `${import.meta.env.BASE_URL}audio/${TRACKS[this.track]!.file}`;
  }

  private createAudio(): HTMLAudioElement {
    const audio = new Audio(this.url());
    audio.loop = TRACKS.length === 1;
    audio.addEventListener("ended", () => {
      this.track = (this.track + 1) % TRACKS.length; // with more than one track, the next
      audio.src = this.url();
      audio.play().catch(() => {});
    });
    return audio;
  }
}

/** The app's sound. */
export const sound = new Sound();
