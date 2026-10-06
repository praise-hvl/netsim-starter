// What the board's pieces mean, in plain words. Hovering a piece of the board pauses it and shows
// one of these in a popover (the shell does that for anything with a data-explain attribute). The
// parts fill it in by themselves from what you give them; pass `explain` to say it your own way.
import { hex } from "@/protocol/memory-map";

/** What each kind of message on the bus does. */
const MESSAGES: { words: string[]; text: string }[] = [
  { words: ["mem.read", "read", "ask", "load?"], text: "A read: a core asks memory for some bytes. Memory answers in this same tick, and the core uses the answer on the next tick." },
  { words: ["mem.data", "data", "bytes", "reply", "answer"], text: "Data: memory's answer to a read, carrying the bytes. It's matched to its request by the request's id." },
  { words: ["mem.write", "write", "store"], text: "A write: a core asks memory to change some bytes (a STORE)." },
  { words: ["mem.ack", "ack", "ok", "done"], text: "OK: memory confirms a write worked. A bad address gets a fault instead." },
  { words: ["fault", "error"], text: "A fault: the request failed (for example an address outside memory). It's a reply too, never a silent zero." },
  { words: ["irq", "interrupt"], text: "An interrupt: a device asks a core to stop what it's doing and run its handler. The core takes it between instructions." },
  { words: ["input", "press", "button"], text: "A press: someone pressed a button. The button turns it into an interrupt for the CPU." },
  { words: ["program.load", "load", "program"], text: "A program load: a program's bytes are written into memory before it runs." },
];

/** The explanation for a packet with this word on it (or this message type), if the board knows it. */
export function explainMessage(word: string): string {
  const w = word.trim().toLowerCase();
  return MESSAGES.find((m) => m.words.includes(w))?.text ?? `A message on the bus: "${word}". Every message goes through the bus, from one part to another.`;
}

/** What a core is doing in each phase of its cycle (and the step names a board often uses). */
const PHASES: Record<string, string> = {
  IDLE: "Idle: no program on this core right now.",
  FETCH: "Fetch: the core asks memory for the next instruction's 4 bytes, at its PC.",
  WAIT_FETCH: "Waiting for the instruction: the bytes come back during this tick; the core uses them on the next.",
  DECODE: "Decode: the core works out which instruction the 4 bytes are, and its operands.",
  EXECUTE: "Execute: the core does the instruction (changes a register, the flags or the PC, or asks memory).",
  WAIT_DATA: "Waiting for data: a LOAD or STORE asked memory; the answer is used on the next tick.",
  HALTED: "Halted: the program ran HALT and is finished.",
  FAULT: "Fault: the program stopped because something went wrong (a bad address or instruction).",
  fetch: "Fetch: getting the next instruction from memory.",
  decode: "Decode: working out what the instruction means.",
  execute: "Execute: doing the instruction.",
  idle: "Idle: nothing running on this core.",
};

/** The explanation for a phase or step named somewhere in `text` (e.g. a lane's detail "FETCH · PC 0x004"). */
export function explainPhase(text: string): string {
  const found = Object.keys(PHASES)
    .sort((a, b) => b.length - a.length)
    .find((name) => new RegExp(`(^|[^A-Za-z_])${name}([^A-Za-z_]|$)`).test(text));
  return found ? PHASES[found] : "";
}

/** A memory cell: its address and value, and whether this tick read or wrote it. */
export function explainCell(address: number, value: number | undefined, { read = false, written = false } = {}): string {
  const now = written ? " It was written this tick." : read ? " It was read this tick." : "";
  return `Memory at ${hex(address)} (byte ${address})${value === undefined ? "" : ` holds ${value}`}.${now}`;
}
