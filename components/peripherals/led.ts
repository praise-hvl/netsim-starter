// An LED: an output device. Every tick it reads its register byte and lights up when the byte
// is 128 or more (the top bit is set). The CPU never tells it "turn on"; a program just does
// `STORE R0, <register>` and the LED sees the new byte on its next read.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";
import { todo } from "@/core/todo";

type LedFsmState = "OFF" | "ON";

export const ledFsm = defineFsm<LedFsmState>("LED", ["OFF", "ON"], "OFF", [
  { from: "OFF", to: "ON", on: "tick, register >= 128" },
  { from: "ON", to: "OFF", on: "tick, register < 128" },
]);

/** The smallest register value that lights the LED. */
export const LED_THRESHOLD = 128;

const configSchema = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ef4444") });
type LedConfig = z.infer<typeof configSchema>;

const stateSchema = z.object({
  fsm: z.enum(["OFF", "ON"]),
  color: z.string(),
  /** The register byte from the last read. */
  value: z.number().int().min(0).max(255),
});
type LedState = z.infer<typeof stateSchema>;

export const led: PeripheralDefinition<LedState, never, LedConfig> = {
  kind: "led",
  label: "LED",
  direction: "output",
  defaultPriority: 0,
  configSchema,
  // The LED takes no input from the dashboard: only its register controls it.
  inputSchema: z.never(),
  stateSchema,
  fsm: ledFsm,

  init: (config) => ({ fsm: "OFF", color: config.color, value: 0 }),

  onInput: (state) => state,

  onTick(state, { register }) {
    // @student week=5 part=home id=led-tick "Follow the register byte (ON at 128 or more) and ask for it again"
    // TODO(week 5, led-tick): Follow the register byte (ON at 128 or more) and ask for it again
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    return todo("week 5: led-tick", state);
    // @end
  },

  view(state) {
    // @student week=5 part=home id=led-view "Tell the dashboard whether the LED is lit, its colour and the register value"
    // TODO(week 5, led-view): Tell the dashboard whether the LED is lit, its colour and the register value
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    return todo("week 5: led-view", state);
    // @end
  },
};
