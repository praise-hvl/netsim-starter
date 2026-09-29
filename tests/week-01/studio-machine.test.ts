// The studio's "See the computer you'll build": a replay of one recorded run of the finished
// system. The trace is data (bus messages and status snapshots); the captions are plain words.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corePhase, describeTick, studioPage } from "@/setup.mjs";

type Event = [string, string, string, number?, number?];
type Tick = { t: number; e: Event[]; c: [string, number, string | null, string | null, number][]; p: [string, string][]; q: number; led: number; d: number; b: string; n: number };

/** The trace as it sits in setup.mjs (it's written there by scripts/studio/record-machine.ts). */
function embeddedTrace(): { ticks: Tick[] } {
  const text = readFileSync("setup.mjs", "utf8");
  const match = /\/\* @machine-trace-begin \*\/([\s\S]*?)\/\* @machine-trace-end \*\//.exec(text);
  return JSON.parse(match![1]);
}

describe("the recorded trace", () => {
  const trace = embeddedTrace();
  const ticks = trace.ticks;

  it("covers the whole demo: both programs finish, and the button is pressed once", () => {
    expect(ticks.length).toBeGreaterThan(50);
    expect(ticks.map((t) => t.t)).toEqual(ticks.map((_, i) => ticks[0].t + i));
    expect(ticks.at(-1)!.p).toEqual(expect.arrayContaining([["countdown", "DONE"], ["blink", "DONE"]]));
    const events = ticks.flatMap((t) => t.e);
    expect(events.filter((e) => e[0] === "input")).toHaveLength(1);
    expect(events.filter((e) => e[0] === "irq")).toHaveLength(1);
    expect(ticks.some((t) => t.c.some((c: unknown[]) => c[4] === 1))).toBe(true); // a core ran the handler
    expect(ticks.some((t) => t.led === 1)).toBe(true);
    expect(new Set(ticks.map((t) => t.d))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("holds only messages and status: no program source, no memory contents", () => {
    for (const t of ticks) {
      expect(Object.keys(t).sort()).toEqual(["b", "c", "d", "e", "led", "n", "p", "q", "t"]);
      for (const e of t.e) {
        expect(["mem.read", "mem.data", "mem.write", "mem.ack", "irq", "input"]).toContain(e[0]);
        expect(e.length).toBeLessThanOrEqual(5);
        for (const v of e.slice(3)) expect(typeof v).toBe("number");
      }
    }
    const json = JSON.stringify(trace);
    expect(json).not.toMatch(/\.equ|;\s|\.asm|"bytes"/);
    expect(json.length).toBeLessThan(60_000);
  });
});

describe("the captions", () => {
  const ticks = embeddedTrace().ticks;
  const at = (pred: (t: Tick) => boolean) => ticks.findIndex(pred);
  const captions = (i: number) => describeTick(ticks[i], i > 0 ? ticks[i - 1] : null);

  it("the press, the interrupt and the handler, in plain words", () => {
    const press = at((t) => t.e.some((e: unknown[]) => e[0] === "input"));
    expect(captions(press)).toContain("You pressed the button. The button remembers the press and acts on it at the next tick.");
    const irq = at((t) => t.e.some((e: unknown[]) => e[0] === "irq"));
    expect(irq).toBe(press + 1);
    expect(captions(irq).join(" ")).toMatch(/The button sends an interrupt to the CPU: a signal that means .something happened, deal with me.\. The CPU will handle it at the next tick\./);
    const handler = at((t) => t.c.some((c: unknown[]) => c[4] === 1));
    expect(captions(handler).join(" ")).toMatch(/Core \d puts countdown aside and runs the button's handler: a short program that runs when the button interrupts\./);
    expect(captions(handler).join(" ")).toMatch(/asks Memory for its next instruction: the first instruction of the button's handler/);
  });

  it("the LED and the display say what changed and why", () => {
    const on = at((t) => t.e.some((e: unknown[]) => e[0] === "mem.data" && e[2] === "led-1" && (e[4] as number) >= 128));
    expect(captions(on).join(" ")).toContain("The LED reads its byte from Memory (it checks every tick) and turns on.");
    const write = at((t) => t.e.some((e: unknown[]) => e[0] === "mem.write" && e[3] === 0x3f2));
    expect(captions(write).join(" ")).toMatch(/Core \d \(running countdown\) writes \d into the display's byte in Memory \(0x3F2\): the number to show\./);
  });

  it("every tick has a caption, and none uses a bare technical word", () => {
    ticks.forEach((t, i) => {
      const text = captions(i);
      expect(text.length, `tick ${t.t}`).toBeGreaterThan(0);
      for (const line of text) {
        expect(line, `tick ${t.t}`).not.toMatch(/\birq\b|\bheld\b|WAIT_|FETCH|DECODE|EXECUTE|mem\.|undefined|null|NaN/);
      }
    });
  });

  it("quiet ticks say what the cores are doing", () => {
    expect(describeTick({ t: 5, e: [], c: [["DECODE", 0, "LOADI R0, 9", "countdown", 0]], p: [] }, null)).toEqual([
      "Nothing on the bus this tick. Inside the CPU: Core 1 is working out what the instruction means.",
    ]);
    expect(corePhase("WAIT_FETCH")).toBe("waiting for Memory to send the instruction");
  });
});

it("the page carries the player, the trace and the sketches", () => {
  const page = studioPage("T");
  expect(page).toContain("function machinePlayer");
  expect(page).toContain("function describeTick");
  expect(page).toContain("See the computer you'll build");
  expect(page).toMatch(/const SKETCHES = \{"cpu":"data:image\/webp;base64,/);
  expect(page.length).toBeLessThan(400_000);
});
