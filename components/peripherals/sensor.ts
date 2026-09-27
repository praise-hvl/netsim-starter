// A temperature sensor. The dashboard sets the reading; the sensor writes it to its register and
// raises an interrupt when it crosses the threshold going up (an over-temperature alarm).
// It stays quiet while the reading stays high, and re-arms once it drops back to the threshold.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { Json } from "@/protocol/messages";
import type { PeripheralDefinition, PeripheralEffect } from "@/components/peripherals/peripheral";
import { todo } from "@/core/todo";

type SensorFsmState = "BELOW" | "ABOVE";

export const sensorFsm = defineFsm<SensorFsmState>("Sensor", ["BELOW", "ABOVE"], "BELOW", [
  { from: "BELOW", to: "ABOVE", on: "tick, value > threshold / irq" },
  { from: "ABOVE", to: "BELOW", on: "tick, value <= threshold" },
]);

const byte = z.number().int().min(0).max(255);

const configSchema = z.object({ threshold: byte.default(75) });
type SensorConfig = z.infer<typeof configSchema>;

const inputSchema = z.object({ value: byte });
type SensorInput = z.infer<typeof inputSchema>;

/** What a save file holds. */
const savedSchema = z.object({
  fsm: z.enum(["BELOW", "ABOVE"]),
  threshold: byte,
  value: byte,
  alarms: z.number().int().min(0),
});

const stateSchema = savedSchema.extend({
  /** The reading changed and the register doesn't show it yet. */
  pendingWrite: z.boolean(),
});
type SensorState = z.infer<typeof stateSchema>;

export const sensor: PeripheralDefinition<SensorState, SensorInput, SensorConfig> = {
  kind: "sensor",
  label: "Temperature sensor",
  direction: "input",
  defaultPriority: 3,
  configSchema,
  inputSchema,
  stateSchema,
  fsm: sensorFsm,

  // pendingWrite starts true so the register holds the first reading from tick 1.
  init: (config) => ({ fsm: "BELOW", threshold: config.threshold, value: 0, alarms: 0, pendingWrite: true }),

  onInput(state, input) {
    // @student week=6 part=home id=sensor-input "Store the new reading; the register is written on the next tick"
    // TODO(week 6, sensor-input): Store the new reading; the register is written on the next tick
    // Tests: tests/week-06/   Guide: docs/weeks/week-06.md
    return todo("week 6: sensor-input", state, input);
    // @end
  },

  onTick(state) {
    // @student week=6 part=home id=sensor-tick "Write a changed reading to the register; irq when it crosses the threshold going up"
    // TODO(week 6, sensor-tick): Write a changed reading to the register; irq when it crosses the threshold going up
    // Tests: tests/week-06/   Guide: docs/weeks/week-06.md
    return todo("week 6: sensor-tick", state);
    // @end
  },

  view(state) {
    // @student week=6 part=home id=sensor-view "Show the reading, the threshold and how many alarms fired"
    // TODO(week 6, sensor-view): Show the reading, the threshold and how many alarms fired
    // Tests: tests/week-06/   Guide: docs/weeks/week-06.md
    return todo("week 6: sensor-view", state);
    // @end
  },

  snapshot,
  restore,
};

export function snapshot(state: SensorState): Json {
  // @student week=7 part=home id=sensor-snapshot "Keep what the sensor needs to carry on; leave out what it doesn't"
  // TODO(week 7, sensor-snapshot): Keep what the sensor needs to carry on; leave out what it doesn't
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: sensor-snapshot", state);
  // @end
}

export function restore(data: unknown): SensorState {
  // @student week=7 part=home id=sensor-restore "Validate a saved sensor (it is untrusted input) and rebuild its state"
  // TODO(week 7, sensor-restore): Validate a saved sensor (it is untrusted input) and rebuild its state
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: sensor-restore", data);
  // @end
}
