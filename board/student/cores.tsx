// Week 7: draw every core as its own lane, the scheduler moving programs between cores, and
// interrupts arriving. The week-7 tests only check the three functions at the top; the look is
// yours. Until this week is built, the board falls back to week 5's single core.
import type { Frame } from "@/board/feed/frames";
import { Label } from "@/board/parts/box";
import { coreColour, INK } from "@/board/parts/colours";
import type { Rect } from "@/board/parts/geometry";
import { hex } from "@/protocol/memory-map";
import { CoreView } from "@/board/student/core";
import { todo } from "@/core/todo";
import { notBuilt } from "@/board/shell/layer";

/** `count` lanes that share `area` top to bottom, with a small gap, never overlapping. */
export function laneRects(count: number, area: Rect): Rect[] {
  // @student week=7 part=class id=board-lane-rects "Split the CPU area into one lane per core"
  // TODO(week 7, board-lane-rects): Split the CPU area into one lane per core
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: board-lane-rects", count, area);
  // @end
}

/** A program moving: onto a core (from null), off one (to null), or straight across. */
export type Move = { program: string; from: number | null; to: number | null };

/** What the scheduler changed between two ticks: every program whose core is different. */
export function schedulerMoves(previous: Pick<Frame, "processes">, frame: Pick<Frame, "processes">): Move[] {
  // @student week=7 part=home id=board-scheduler-moves "Compare the programs' cores between two ticks and list each move"
  // TODO(week 7, board-scheduler-moves): Compare the programs' cores between two ticks and list each move
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: board-scheduler-moves", previous, frame);
  // @end
}

/** An interrupt raised this tick: who raised it, its handler's address, and the core already running that handler (if any). */
export type InterruptMarker = { from: string; vector: number; core: number | null };

export function interruptMarkers(frame: Pick<Frame, "packets" | "cores">): InterruptMarker[] {
  // @student week=7 part=class id=board-interrupt-markers "One marker per irq packet this tick, with the core running its handler"
  // TODO(week 7, board-interrupt-markers): One marker per irq packet this tick, with the core running its handler
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: board-interrupt-markers", frame);
  // @end
}

export type CoresProps = { frame: Frame; previous: Frame | null; rect: Rect };

/** Every core in its own lane, the latest scheduler moves, and any interrupt arriving. */
export function CoresView({ frame, previous, rect }: CoresProps) {
  // @student week=7 part=home id=board-draw-cores "Draw one lane per core, and show the scheduler's moves and arriving interrupts"
  // TODO(week 7, board-draw-cores): Draw one lane per core, and show the scheduler's moves and arriving interrupts
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return notBuilt("week 7: board-draw-cores", frame, previous, rect);
  // @end
}
