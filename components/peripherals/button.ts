// A momentary push button: the reference peripheral. Pressing it (from the dashboard) latches
// a press; on the next tick it raises one interrupt and springs back.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";
import { todo } from "@/core/todo";

type ButtonFsmState = "RELEASED" | "PRESSED";

export const buttonFsm = defineFsm<ButtonFsmState>("Button", ["RELEASED", "PRESSED"], "RELEASED", [
  { from: "RELEASED", to: "PRESSED", on: "input press" },
  { from: "PRESSED", to: "RELEASED", on: "tick / irq" },
]);

const stateSchema = z.object({
  fsm: z.enum(["RELEASED", "PRESSED"]),
  presses: z.number().int().min(0),
});
type ButtonState = z.infer<typeof stateSchema>;

export const button: PeripheralDefinition<ButtonState, { action: "press" }, Record<string, never>> = {
  kind: "button",
  label: "Button",
  direction: "input",
  defaultPriority: 0,
  configSchema: z.object({}).strict(),
  inputSchema: z.object({ action: z.literal("press") }),
  stateSchema,
  fsm: buttonFsm,

  init: () => ({ fsm: "RELEASED", presses: 0 }),

  onInput(state) {
    // A second press before the next tick is the same press: the line is already held down.
    if (state.fsm === "PRESSED") return state;
    return { fsm: buttonFsm.go(state.fsm, "PRESSED"), presses: state.presses + 1 };
  },

  onTick(state) {
    if (state.fsm !== "PRESSED") return { state, effects: [] };
    return { state: { ...state, fsm: buttonFsm.go(state.fsm, "RELEASED") }, effects: [{ kind: "irq" }] };
  },

  view(state) {
    // @student week=5 part=class id=button-view "Tell the dashboard what state the button is in and how often it was pressed"
    // TODO(week 5, button-view): Tell the dashboard what state the button is in and how often it was pressed
    // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
    return todo("week 5: button-view", state);
    // @end
  },
};
