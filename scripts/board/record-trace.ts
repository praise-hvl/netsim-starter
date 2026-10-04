// Record one run of the machine for the board (/board) to replay without a bus.
//   tsx scripts/board/record-trace.ts --cores 2      writes board/recordings/trace-2-cores.json
// It starts the real bus, Memory, CPU and peripheral host in this process, loads a few
// programs, presses the button once, and keeps every message the dashboard tap saw. The board
// replays the file through the same code it uses for a live bus. It records whatever machine
// this repo runs, so once your own parts work you can record your own.
import { writeFileSync } from "node:fs";
import { startBus } from "@/bus/ws-server";
import { connect } from "@/components/client";
import { startCpu } from "@/components/cpu";
import { startHost } from "@/components/host";
import { startMemory } from "@/components/memory";
import { assemble } from "@/core/asm";
import { readProgram } from "@/programs/read";
import { envelope, type Message, type MessageType, type PayloadOf } from "@/protocol/messages";
import type { VizTrace } from "@/board/feed/trace";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const CORES = Number(flag("cores", "2"));
const OUT = flag("out", `board/recordings/trace-${CORES}-cores.json`);
const PRESS_AT = 20;
const MAX_TICKS = 220;

/**
 * Small programs that only exist for the recording: each one counts up and keeps every count
 * in its own memory cell, so the RAM grid shows who wrote what. (STORE takes a fixed address,
 * so the loop is written out.)
 */
function tally(cells: number[], step: number): string {
  const lines = ["LOADI R0, 0", `LOADI R1, ${step}`];
  for (const cell of cells) lines.push("ADD R0, R1", `STORE R0, ${cell}`);
  lines.push("HALT");
  return lines.join("\n");
}

type Load = { name: string; address: number; bytes: number[] };

/**
 * Where each tally program lives (44 bytes each): the gaps after countdown (0x000) and blink
 * (0x080), then 0x0C0 upwards. Their counts go in 0x1E0-0x1FF, 4 bytes each.
 */
const TALLY_HOMES = [0x0c0, 0x0f0, 0x120, 0x150, 0x180, 0x1b0, 0x020, 0x050];
function programs(cores: number): Load[] {
  const builtIn = ["countdown", "blink"].map((name) => {
    const program = readProgram(name);
    return { name, address: program.address ?? 0, bytes: program.bytes };
  });
  // On 2 cores, one extra program so somebody always waits their turn. On more cores, one extra
  // per core (up to 8), so there are always more programs than cores and the scheduler moves
  // them around: otherwise core N would just run program N from start to finish.
  const extra = cores <= 2 ? 1 : Math.min(8, cores);
  const loads: Load[] = [...builtIn];
  for (let i = 0; i < extra; i++) {
    const address = TALLY_HOMES[i];
    const cells = [0, 1, 2, 3].map((k) => 0x1e0 + i * 4 + k);
    loads.push({ name: `tally-${i + 1}`, address, bytes: assemble(tally(cells, i + 1), { origin: address }) });
  }
  return loads;
}

const bus = await startBus({ port: 0, tickTimeoutMs: 2000 });
const memory = await startMemory({ url: bus.url });
const cpu = await startCpu({ url: bus.url, cores: CORES });
const host = await startHost({ url: bus.url });
const dash = await connect({ url: bus.url, id: "recorder", role: "dashboard", label: "Recorder" });
const components = dash.welcome.components;
const seen: Message[] = [];
dash.onAny((m) => {
  if (m.type === "joined") components.push(m.payload);
  seen.push(m);
});

/** The bus doesn't echo a dashboard's own messages back, so note them here. */
async function request<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>): Promise<void> {
  seen.push(envelope(type, "you", to, payload, { id: `you-${seen.length}`, tick: bus.tick() }));
  await dash.request(type, to, payload);
}

for (const [kind, id, slot] of [["button", "button-1", 0], ["led", "led-1", 1], ["seven-segment", "display-1", 2], ["timer", "timer-1", 3]] as const) {
  await request("host.spawn", "host", { kind, id, config: kind === "timer" ? { interval: 40 } : {}, slot });
}
for (const program of programs(CORES)) {
  await request("program.load", "memory", { address: program.address, bytes: program.bytes });
  await request("process.add", "cpu", { name: program.name, start: program.address });
}
await new Promise((resolve) => setTimeout(resolve, 200));

/** Wait until the bus has closed tick `t` (its own status comes last). */
async function stepAndSettle(): Promise<number> {
  const t = await bus.step();
  const deadline = Date.now() + 3000;
  const closed = () => seen.some((m) => m.type === "status" && m.from === "bus" && m.payload.data.tick === t && m.payload.state !== "TICKING");
  while (!closed() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  return t;
}

let doneAt: number | null = null;
for (let i = 0; i < MAX_TICKS; i++) {
  if (i === PRESS_AT) {
    dash.send("input", "button-1", { action: "press" });
    seen.push(envelope("input", "you", "button-1", { action: "press" }, { id: "press", tick: bus.tick() }));
  }
  const t = await stepAndSettle();
  const cpuStatus = seen.findLast((m) => m.type === "status" && m.from === "cpu");
  const processes = (cpuStatus?.type === "status" ? (cpuStatus.payload.data.processes as { state: string }[] | undefined) : undefined) ?? [];
  if (doneAt === null && processes.length > 0 && processes.every((p) => p.state === "DONE")) doneAt = t;
  if (doneAt !== null && t >= doneAt + 4) break;
}

await dash.close();
await host.close();
await cpu.close();
await memory.close();
await bus.close();

// Keep the first full memory picture; later ones only repeat what the writes already say.
let keptMemory = false;
const messages = seen.filter((m) => {
  if (m.type === "tick.done") return false;
  if (m.type === "status" && m.from === "memory") {
    if (keptMemory) return false;
    keptMemory = true;
  }
  return true;
});
const trace: VizTrace = {
  version: 1,
  about: `One recorded run of the finished NetSim system on ${CORES} cores: ${programs(CORES).map((p) => p.name).join(", ")}, a timer, and one button press.`,
  cores: CORES,
  components: components.filter((c) => c.role !== "dashboard"),
  messages,
};
writeFileSync(OUT, JSON.stringify(trace));
console.log(`wrote ${messages.length} messages, ticks up to ${messages.at(-1)?.tick ?? 0}, ${JSON.stringify(trace).length} bytes to ${OUT}`);
