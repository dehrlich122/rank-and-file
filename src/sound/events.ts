// Which sound each thing that happens makes (M4.1), as plain functions so they're testable without audio.
import type { Facing, GameEvent, LevelResult, WorldState } from "../py/protocol";
import type { SoundName } from "./effects";

const TURNING: Facing[] = ["north", "east", "south", "west"]; // clockwise, so a step along it is a right turn

/** The sounds one event makes, given the world before it (null when there isn't one). */
export function soundsFor(event: GameEvent, before: WorldState | null): SoundName[] {
  switch (event.kind) {
    case "turn": {
      const steps = before ? (TURNING.indexOf(event.state.facing) - TURNING.indexOf(before.facing) + 4) % 4 : 1;
      return [steps === 3 ? "turn_left" : "turn_right"];
    }
    case "move":
      return before && event.state.crossed.length > before.crossed.length ? ["move", "waypoint"] : ["move"];
    case "bump":
    case "gate_open":
    case "guard":
    case "pick_up":
    case "bridge":
    case "capture":
    case "read":
    case "lost":
    case "fall":
    case "crush":
      return [event.kind];
    default:
      return []; // waiting and clock ticks are silent
  }
}

/**
 * The sounds of a step's events, in order. A long walk is thinned at higher speeds so it doesn't turn into a buzz:
 * every second square at 2×, only the first and last of a run of moves at 4×. Other events always sound.
 */
export function soundsForStep(events: GameEvent[], before: WorldState | null, speed: number): SoundName[][] {
  let previous = before;
  let place = 0; // this event's place in its run of moves, from 1
  return events.map((event, i) => {
    place = event.kind === "move" ? place + 1 : 0;
    const last = event.kind === "move" && events[i + 1]?.kind !== "move"; // the end of its run
    const keep = event.kind !== "move" || speed < 2 || last || (speed < 4 ? place % 2 === 1 : place === 1);
    const sounds = soundsFor(event, previous);
    previous = event.state;
    return keep ? sounds : sounds.filter((name) => name !== "move");
  });
}

/** The sounds that end a run, each with the seconds after the run's last frame it comes: the verdict, then a star for each earned. */
export function outcomeSounds(result: LevelResult): Array<{ sound: SoundName; after: number }> {
  if (result.status === "solved") {
    const stars = result.stars.filter((star) => star.earned).length;
    return [{ sound: "complete" as const, after: 0 }, ...Array.from({ length: stars }, (_, i) => ({ sound: "star" as const, after: 0.5 + i * 0.2 }))];
  }
  if (result.status === "lost") return [{ sound: "run_lost", after: 0.3 }];
  if (result.status === "error" || result.status === "timeout" || result.status === "constraint") return [{ sound: "error", after: 0.1 }];
  return []; // incomplete or finished: nothing to mark
}

/** About how long each sound lasts, in seconds: what counts towards the limit on sounds at once, and how long the music ducks. */
const LONG: Partial<Record<SoundName, number>> = { promotion: 1.6, crown: 0.9, complete: 0.7, fall: 0.6, lost: 0.4, run_lost: 0.6 };
export const lengthOf = (name: SoundName): number => LONG[name] ?? 0.25;

/** At most `max` sounds at once: a new one is dropped, not queued, while that many are still playing. */
export class Voices {
  private ends: number[] = [];
  constructor(private readonly max = 4) {}

  /** Whether a sound starting at `now` and lasting `length` seconds may play; if so, it's counted. */
  start(now: number, length: number): boolean {
    this.ends = this.ends.filter((end) => end > now);
    if (this.ends.length >= this.max) return false;
    this.ends.push(now + length);
    return true;
  }
}
