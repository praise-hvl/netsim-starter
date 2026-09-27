// One CPU core, drawn from the `cores[i]` the CPU sends in its status.
// Everything shown here is read from the status; the card computes nothing it could read.
import type { z } from "zod";
import type { coreView } from "@/protocol/messages";
import { hex } from "@/protocol/memory-map";
import { hex2 } from "@/app/_lib/format";
import { StateBadge } from "@/app/_components/nodes/node-card";

export type CoreView = z.infer<typeof coreView>;

export function CoreCard({ core }: { core: CoreView }) {
  // @student week=5 part=class id=core-node "Show one core: FSM state, PC, R0-R3, flags, current instruction, process"
  // TODO(week 5, core-node): Show one core: FSM state, PC, R0-R3, flags, current instruction, process
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  void [hex, hex2, StateBadge]; // used once you write the real card
  return <div className="rounded-md border border-dashed border-zinc-300 p-2 text-zinc-400">Core {core.id}: TODO week 5</div>;
  // @end
}
