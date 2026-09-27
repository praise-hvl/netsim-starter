// Save the whole system to saves/<name>.json, and load it back. The bus asks each component
// for its own snapshot; it never looks inside them.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { componentInfo, json, type ComponentInfo, type Json, type Message, type MessageType, type PayloadOf } from "@/protocol/messages";

export const SAVE_VERSION = 2;

const saveFile = z.object({
  version: z.literal(SAVE_VERSION),
  tick: z.number().int().min(0),
  savedAt: z.string(),
  components: z.record(z.string(), componentInfo.omit({ id: true }).extend({ data: json })),
});
export type SaveFile = z.infer<typeof saveFile>;

/** What saves.ts needs from the bus. Passed in so this file can be tested without a server. */
export type SaveIo = {
  tick(): number;
  setTick(tick: number): void;
  components(): ComponentInfo[];
  ask<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>): Promise<Message>;
  waitForComponent(id: string): Promise<void>;
};

/** Components whose state is worth saving. The dashboard and host have none of their own. */
function isStateful(info: ComponentInfo): boolean {
  return info.role === "cpu" || info.role === "memory" || info.role === "peripheral";
}

export async function writeSave(dir: string, name: string, io: SaveIo): Promise<SaveFile> {
  const components: SaveFile["components"] = {};
  for (const info of io.components().filter(isStateful)) {
    const reply = await io.ask("snapshot.get", info.id, {});
    if (reply.type !== "snapshot") throw new Error(`${info.id} answered snapshot.get with ${reply.type}`);
    const { id, ...rest } = info;
    void id;
    components[info.id] = { ...rest, data: reply.payload.data };
  }
  const save: SaveFile = { version: SAVE_VERSION, tick: io.tick(), savedAt: new Date().toISOString(), components };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.json`), JSON.stringify(save, null, 2));
  return save;
}

export async function restoreSave(dir: string, name: string, io: SaveIo): Promise<SaveFile> {
  let raw: string;
  try {
    raw = await readFile(join(dir, `${name}.json`), "utf8");
  } catch {
    throw new Error(`no save called "${name}"`);
  }
  const parsed = saveFile.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`save "${name}" is damaged: ${z.prettifyError(parsed.error)}`);
  const save = parsed.data;

  const connected = new Set(io.components().map((c) => c.id));
  const host = io.components().find((c) => c.role === "host");

  for (const [id, saved] of Object.entries(save.components)) {
    if (!connected.has(id)) {
      // A peripheral that isn't running any more: ask the host to start it again, in its old slot.
      const { kind, config, slot } = peripheralSpawnInfo(saved.data);
      if (saved.role !== "peripheral" || !host || kind === undefined) throw new Error(`${id} is not connected`);
      const reply = await io.ask("host.spawn", host.id, { kind, id, label: saved.label, config, slot });
      if (reply.type !== "ok") throw new Error(`the host could not start ${id}`);
      await io.waitForComponent(id);
    }
    const reply = await io.ask("snapshot.set", id, { data: saved.data });
    if (reply.type !== "ok") throw new Error(`${id} refused its snapshot`);
  }
  io.setTick(save.tick);
  return save;
}

/** Peripheral snapshots look like { kind, slot, config, state } (see startPeripheral). */
function peripheralSpawnInfo(data: Json): { kind?: string; slot?: number; config: Record<string, Json> } {
  const shape = z.object({ kind: z.string(), slot: z.number().int(), config: z.record(z.string(), json) });
  const parsed = shape.safeParse(data);
  return parsed.success ? parsed.data : { config: {} };
}
