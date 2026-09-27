// A bus logger: connects like a dashboard (so it sees every message) and prints one line per
// message, pairing each reply with its request to show how long it took.
//   12  cpu → memory   mem.read 0x010 ×4                 cpu-88
//   12  memory → cpu   mem.data 4 bytes      ↩ cpu-88     2 ms
import { connect, type BusClient } from "@/components/client";
import { hex } from "@/protocol/memory-map";
import type { Message } from "@/protocol/messages";
import { todo } from "@/core/todo";

/** A short human description of a message's payload. */
export function describe(message: Message): string {
  // @student week=2 part=home id=logger "Describe the payload of the message types you care about in a few words"
  // TODO(week 2, logger): Describe the payload of the message types you care about in a few words
  // Tests: tests/week-02/   Guide: docs/weeks/week-02.md
  return todo("week 2: logger", message);
  // @end
}

/** Formats messages one per line, timing each reply against its request. */
export function createLineFormatter(now: () => number = () => Date.now()): (message: Message) => string {
  const sentAt = new Map<string, number>();
  return (message) => {
    sentAt.set(message.id, now());
    const started = message.replyTo === undefined ? undefined : sentAt.get(message.replyTo);
    const latency = started === undefined ? "" : `  ${now() - started} ms`;
    const reply = message.replyTo === undefined ? "" : `  ↩ ${message.replyTo}`;
    const route = `${message.from} → ${message.to}`.padEnd(22);
    return `${String(message.tick).padStart(5)}  ${route} ${message.type} ${describe(message)}`.padEnd(70) + `${message.id}${reply}${latency}`;
  };
}

export type LoggerOptions = {
  url?: string;
  /** Skip the per-tick chatter (tick, tick.done, status). Default true. */
  quiet?: boolean;
  print?: (line: string) => void;
};

export async function startLogger(options: LoggerOptions = {}): Promise<BusClient> {
  const client = await connect({ id: "logger", role: "dashboard", label: "Logger", url: options.url });
  const format = createLineFormatter();
  const print = options.print ?? console.log;
  const skip = new Set<string>(options.quiet === false ? [] : ["tick", "tick.done", "status"]);
  client.onAny((message) => {
    if (!skip.has(message.type)) print(format(message));
  });
  return client;
}
