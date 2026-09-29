// Instructor tool: record one run of the finished system for the week-1 studio's machine view.
//   npx tsx scripts/studio/record-machine.ts            print the trace
//   npx tsx scripts/studio/record-machine.ts --write    put it into setup.mjs (between the @machine-trace markers)
// It starts the real bus, Memory, CPU and peripheral host in this process, loads the countdown
// and blink demo, presses the button once, and keeps only what travelled on the bus: message
// types, who sent them to whom, and small status snapshots. No program source goes in the trace.
import { readFileSync, writeFileSync } from "node:fs";
import { startBus } from "@/bus/server";
import { connect } from "@/components/client";
import { startCpu } from "@/components/cpu";
import { startHost } from "@/components/host";
import { startMemory } from "@/components/memory";
import { readProgram } from "@/programs/read";
import type { Message } from "@/protocol/messages";

const PRESS_AT = 24;
const MAX_TICKS = 160;

const bus = await startBus({ port: 0, tickTimeoutMs: 2000 });
const memory = await startMemory({ url: bus.url });
const cpu = await startCpu({ url: bus.url });
const host = await startHost({ url: bus.url });
const dash = await connect({ url: bus.url, id: "recorder", role: "dashboard", label: "Recorder" });
const seen: Message[] = [];
dash.onAny((m) => seen.push(m));

for (const [kind, id, slot] of [["button", "button-1", 0], ["led", "led-1", 1], ["seven-segment", "display-1", 2]] as const) {
  await dash.request("host.spawn", "host", { kind, id, config: {}, slot });
}
for (const name of ["countdown", "blink"]) {
  const program = readProgram(name);
  await dash.request("program.load", "memory", { address: program.address ?? 0, bytes: program.bytes });
  await dash.request("process.add", "cpu", { name, start: program.address ?? 0 });
}
await new Promise((resolve) => setTimeout(resolve, 200));
const start = seen.length;

/** Wait until the bus has closed tick `t` (its own status comes last). */
async function stepAndSettle(): Promise<number> {
  const t = await bus.step();
  const deadline = Date.now() + 3000;
  while (!seen.some((m) => m.type === "status" && m.from === "bus" && (m.payload.data as { tick?: number }).tick === t && m.payload.state !== "TICKING")) {
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return t;
}

let doneAt: number | null = null;
for (let i = 0; i < MAX_TICKS; i++) {
  if (i === PRESS_AT) {
    dash.send("input", "button-1", { action: "press" });
    // The bus doesn't echo a dashboard's own messages back, so note the press here. The button
    // latches it and acts on the next tick.
    seen.push({ type: "input", from: "you", to: "button-1", id: "press", tick: bus.tick() + 1, payload: { action: "press" } } as unknown as Message);
  }
  const t = await stepAndSettle();
  const cpuStatus = [...seen].reverse().find((m) => m.type === "status" && m.from === "cpu");
  const processes = (cpuStatus?.payload as { data?: { processes?: { state: string }[] } } | undefined)?.data?.processes ?? [];
  if (doneAt === null && processes.length > 0 && processes.every((p) => p.state === "DONE")) doneAt = t;
  if (doneAt !== null && t >= doneAt + 3) break;
}

const messages = seen.slice(start);
const trace = buildTrace(messages);
const json = JSON.stringify(trace);
if (process.argv.includes("--write")) {
  const file = "setup.mjs";
  const text = readFileSync(file, "utf8");
  const pattern = /(\/\* @machine-trace-begin \*\/)[\s\S]*?(\/\* @machine-trace-end \*\/)/;
  if (!pattern.test(text)) throw new Error("no @machine-trace markers in setup.mjs");
  writeFileSync(file, text.replace(pattern, (_, a: string, b: string) => `${a} ${json} ${b}`));
  console.log(`wrote ${trace.ticks.length} ticks (${json.length} bytes) into ${file}`);
} else console.log(JSON.stringify(trace, null, 1));

/**
 * One entry per tick: the messages that tick carried (without the clock's own tick/tick.done
 * and the status reports, which become the snapshot), and the state of each part afterwards.
 *   e: [type, from, to, address?, value?]
 *   c: per core [phase, pc, instruction, process name, in a handler]
 */
function buildTrace(all: Message[]) {
  const ticks: unknown[] = [];
  const shown = new Map<string, number>([["led-1", 0], ["display-1", 0]]);
  const names = new Map<number, string>();
  let cores: unknown[] = [];
  let processes: [string, string][] = [];
  let pending = 0;
  let led = false;
  let display = 0;
  let button = "RELEASED";
  let presses = 0;
  const last = all.length ? all[all.length - 1].tick : 0;
  for (let t = all[0]?.tick ?? 1; t <= last; t++) {
    const events: (string | number)[][] = [];
    for (const m of all.filter((x) => x.tick === t)) {
      if (m.type === "status") {
        const data = m.payload.data as Record<string, unknown>;
        if (m.from === "cpu") {
          const cpuData = data as { cores: { state: string; pc: number; instruction: string | null; pid: number | null; inHandler: boolean }[]; processes: { pid: number; name: string; state: string }[]; pendingIrqs: number };
          for (const p of cpuData.processes) names.set(p.pid, p.name);
          cores = cpuData.cores.map((c) => [c.state, c.pc, c.instruction, c.pid === null ? null : (names.get(c.pid) ?? null), c.inHandler ? 1 : 0]);
          processes = cpuData.processes.map((p) => [p.name, p.state]);
          pending = cpuData.pendingIrqs;
        }
        if (m.from === "led-1") led = m.payload.state === "ON";
        if (m.from === "display-1") display = Number(data.value ?? 0);
        if (m.from === "button-1") {
          button = m.payload.state;
          presses = Number(data.presses ?? 0);
        }
        continue;
      }
      if (m.type === "tick" || m.type === "tick.done") continue;
      // The LED and the display read their byte every tick; keep only the reads that change what they show.
      const device = m.from === "led-1" || m.from === "display-1" ? m.from : m.to === "led-1" || m.to === "display-1" ? m.to : null;
      if (device && (m.type === "mem.read" || m.type === "mem.data")) {
        const answer = all.find((x) => x.tick === t && x.type === "mem.data" && x.to === device);
        const value = answer?.type === "mem.data" ? answer.payload.bytes[0] : undefined;
        if (value === undefined || value === shown.get(device)) continue;
        if (m.type === "mem.data") shown.set(device, value);
      }
      if (m.type === "mem.read") events.push([m.type, m.from, m.to, m.payload.address, m.payload.length]);
      else if (m.type === "mem.data") events.push([m.type, m.from, m.to, m.payload.address, m.payload.bytes.length === 1 ? m.payload.bytes[0] : m.payload.bytes.length]);
      else if (m.type === "mem.write") events.push([m.type, m.from, m.to, m.payload.address, m.payload.bytes[0]]);
      else if (m.type === "mem.ack") events.push([m.type, m.from, m.to, m.payload.address]);
      else if (m.type === "irq") events.push([m.type, m.from, m.to, m.payload.vector]);
      else if (m.type === "input") events.push([m.type, m.from, m.to]);
    }
    ticks.push({ t, e: events, c: cores, p: processes, q: pending, led: led ? 1 : 0, d: display, b: button, n: presses });
  }
  return {
    about: "One recorded run of the finished NetSim system: countdown and blink, and one button press. Messages and status only.",
    parts: { cpu: "CPU", memory: "Memory", "button-1": "Button", "led-1": "LED", "display-1": "Display" },
    ticks,
  };
}

await dash.close();
await host.close();
await cpu.close();
await memory.close();
await bus.close();
