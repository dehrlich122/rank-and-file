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
  private readonly voices = new Voices(4);

  /** Wait for the first click or key press, then let the music and effects work. Call once, at startup. */
  start(): void {
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      this.unlocked = true;
      this.context();
      window.setInterval(() => this.tick(), TICK_MS);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    settings.subscribe((next) => {
      this.applyEffectsVolume(next);
      if (next.muted) this.silenceMusic(); // muting is instant; only coming back fades in
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      this.silenceMusic(); // a hidden tab's timers are throttled, so stop at once instead of fading
    });
  }

  /** The track now on (or next to play), for Settings → Sound. */
  nowPlaying(): (typeof TRACKS)[number] {
    return TRACKS[this.track]!;
  }

  /** Play an effect, `after` seconds from now. Silent before the first click or key, when muted, or at 0%. */
  play(name: SoundName, after = 0): void {
    const ctx = this.context();
    const { effects, muted } = settings.get();
    if (!ctx || !this.master || muted || effects === 0 || !this.voices.start(ctx.currentTime + after, lengthOf(name))) return;
    if (ctx.state === "suspended") void ctx.resume();
    EFFECTS[name](ctx, this.master, ctx.currentTime + after + 0.01);
    if (DUCKS.includes(name)) this.duckUntil = performance.now() + (after + lengthOf(name) + 0.4) * 1000;
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

  /** Every 50 ms: fade the music towards what's wanted, fetch and play it when it is, and set its volume. */
  private tick(): void {
    const { music, muted } = settings.get();
    const wanted = !muted && music > 0 && !document.hidden;
    this.fade = Math.min(1, Math.max(0, this.fade + (wanted ? TICK_MS : -TICK_MS) / FADE_MS));
    if (wanted && !this.audio) this.audio = this.createAudio();
    const audio = this.audio;
    if (!audio) return;
    if (wanted && audio.paused) audio.play().catch(() => {}); // refused: the next tick tries again
    if (!wanted && this.fade === 0 && !audio.paused) audio.pause();
    this.duck += ((performance.now() < this.duckUntil ? DUCKED : 1) - this.duck) * 0.2;
    const edge = Number.isFinite(audio.duration) ? Math.min(1, audio.currentTime / EDGE_S, (audio.duration - audio.currentTime) / EDGE_S) : 1;
    audio.volume = Math.min(1, Math.max(0, (music / 100) * this.fade * this.duck * Math.max(0, edge)));
  }

  private createAudio(): HTMLAudioElement {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${TRACKS[this.track]!.file}`);
    audio.loop = TRACKS.length === 1;
    audio.addEventListener("ended", () => {
      this.track = (this.track + 1) % TRACKS.length; // with more than one track, the next
      audio.src = `${import.meta.env.BASE_URL}audio/${TRACKS[this.track]!.file}`;
      audio.play().catch(() => {});
    });
    return audio;
  }
}

/** The app's sound. */
export const sound = new Sound();
