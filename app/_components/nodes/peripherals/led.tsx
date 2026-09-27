// The LED: lit when its register byte is 128 or more. Reads { value, color } from its status.
import { z } from "zod";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

const ledData = z.object({
  value: z.number().int().min(0).max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ef4444"),
});

export function LedView({ status }: PeripheralViewProps) {
  // @student week=5 part=home id=led-node "Draw a light that is clearly lit when the LED's state is ON, and show its register value"
  // TODO(week 5, led-node): Draw a light that is clearly lit when the LED's state is ON, and show its register value
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  void ledData; // used once you write the real view
  return <div className="py-2 text-center italic text-zinc-400">LED ({status.state}): TODO week 5</div>;
  // @end
}
