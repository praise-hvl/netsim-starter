// Which cells of the memory grid to highlight, from what Memory reported in its last status.
import type { MemoryStatusData } from "@/protocol/messages";

export type Access = "read" | "write" | null;

/** Was `address` inside the last read or the last write? A write wins if it was both. */
export function accessAt(address: number, memory: Pick<MemoryStatusData, "lastRead" | "lastWrite">): Access {
  // @student week=5 part=home id=memory-node "Return 'write' or 'read' if the address was in the last write or last read range"
  // TODO(week 5, memory-node): Return 'write' or 'read' if the address was in the last write or last read range
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  void [address, memory]; // used once you write the real body
  return null;
  // @end
}
