// The bus: routes messages between components and owns the clock. It knows nothing about CPUs
// or memory. See "A clock tick, step by step" in docs/ARCHITECTURE.md.
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { defineFsm } from "@/core/fsm";
import {
  CLOCKED_ROLES,
  TICK_REQUESTS,
  envelope,
  parseMessage,
  type ComponentInfo,
  type Message,
  type MessageOf,
  type MessageType,
  type PayloadOf,
} from "@/protocol/messages";
import { restoreSave, writeSave, type SaveIo } from "@/bus/saves";

export type BusOptions = {
  /** Default 127.0.0.1 (this machine only). Use 0.0.0.0 to let a classroom LAN connect. */
  host?: string;
  /** Default 3006. Use 0 in tests to get a free port. */
  port?: number;
  /** Milliseconds between ticks while running. */
  speedMs?: number;
  /** How long to wait for a slow component before carrying on without it. */
  tickTimeoutMs?: number;
  savesDir?: string;
  log?: boolean;
};

export type Bus = {
  url: string;
  port: number;
  tick(): number;
  /** Run exactly one tick (the clock must be stopped). Resolves when the tick is complete. */
  step(): Promise<number>;
  /** Resolves once `count` components are connected (handy in tests and scripts). */
  waitForComponents(count: number): Promise<void>;
  close(): Promise<void>;
};

type BusState = "STOPPED" | "RUNNING" | "TICKING";

export const busFsm = defineFsm<BusState>("Bus", ["STOPPED", "RUNNING", "TICKING"], "STOPPED", [
  { from: ["STOPPED", "RUNNING"], to: "TICKING", on: "step / start / timer" },
  { from: "TICKING", to: "RUNNING", on: "barrier met, clock running" },
  { from: "TICKING", to: "STOPPED", on: "barrier met, clock stopped" },
  { from: "RUNNING", to: "STOPPED", on: "control stop" },
  { from: "TICKING", to: "STOPPED", on: "control reset (abandons the tick)" },
]);

type Connection = {
  socket: WebSocket;
  info: ComponentInfo | null;
  stalled: boolean;
  /**
   * Id of a `reset` this component hasn't acknowledged yet. Until it does, anything it sends
   * was sent before it heard about the reset (a write or tick.done from the abandoned tick),
   * so the bus drops it instead of letting it leak into the fresh system.
   */
  awaitingReset: string | null;
};

type Held = { message: Message; sender: Connection };

/**
 * Bus arbitration: when several components want the bus in the same tick, who goes first?
 * Real buses answer with a fixed priority, and so does this one: requests are handed on
 * sorted by sender id, and each sender's own requests keep the order it sent them in.
 * Without this, two requests to the same address in one tick would be handled in whatever
 * order the network happened to deliver them, and the same program could give different results.
 */
export function arbitrate<T extends { message: Message }>(requests: readonly T[]): T[] {
  // Array.prototype.sort is stable, so equal senders keep their original order.
  return [...requests].sort((a, b) => (a.message.from < b.message.from ? -1 : a.message.from > b.message.from ? 1 : 0));
}

/** Only the bus itself sends these. A component that tries is refused, not forwarded. */
const BUS_ONLY: readonly MessageType[] = ["tick", "reset", "welcome", "joined", "left"];

/** Only the dashboard may drive the whole system (the bus sends some of these itself too). */
const DASHBOARD_ONLY: readonly MessageType[] = [
  "control", "save", "restore", "program.load", "process.add", "cpu.cores", "host.spawn", "host.remove", "snapshot.get", "snapshot.set", "snapshot.check",
];

export async function startBus(options: BusOptions = {}): Promise<Bus> {
  const host = options.host ?? process.env.BUS_HOST ?? "127.0.0.1";
  const requestedPort = options.port ?? Number(process.env.BUS_PORT ?? 3006);
  const tickTimeoutMs = options.tickTimeoutMs ?? 2000;
  const savesDir = options.savesDir ?? "saves";
  const log = options.log ? (text: string) => console.log(`[bus] ${text}`) : () => {};

  let state: BusState = "STOPPED";
  let keepRunning = false;
  let speedMs = options.speedMs ?? 500;
  let tick = 0;
  let nextId = 1;
  let tickStartedAt = 0;
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  let clockTimer: ReturnType<typeof setTimeout> | null = null;

  const connections = new Map<string, Connection>();
  /** Clocked components that haven't sent tick.done for the current tick. */
  const waitingFor = new Set<string>();
  /** Requests sent during this tick that haven't been answered yet. */
  const openRequests = new Set<string>();
  /** Memory requests waiting for arbitration (see arbitrate()). */
  let held: Held[] = [];
  const latestStatus = new Map<string, MessageOf<"status">>();
  const tickWaiters: Array<(tick: number) => void> = [];
  const joinWaiters: Array<() => void> = [];
  const busReplies = new Map<string, (reply: Message) => void>();

  // ── Sending ───────────────────────────────────────────────────────────────

  function deliver(connection: Connection, message: Message): void {
    if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(JSON.stringify(message));
  }

  function dashboards(): Connection[] {
    return [...connections.values()].filter((c) => c.info?.role === "dashboard");
  }

  function busMessage<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>, replyTo?: string): Message {
    return envelope(type, "bus", to, payload, { id: `bus-${nextId++}`, tick, replyTo });
  }

  /** Send to the addressee(s), and a copy to every dashboard that isn't already one. */
  function route(message: Message, sender?: Connection): void {
    const recipients = new Set<Connection>();
    if (message.to === "*") {
      for (const c of connections.values()) if (c !== sender && c.info) recipients.add(c);
    } else if (message.to !== "bus") {
      const target = connections.get(message.to);
      if (target) recipients.add(target);
    }
    for (const dashboard of dashboards()) if (dashboard !== sender) recipients.add(dashboard);
    for (const c of recipients) deliver(c, message);
  }

  function sendFromBus<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>, replyTo?: string): Message {
    const message = busMessage(type, to, payload, replyTo);
    route(message);
    return message;
  }

  function askComponent<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>, timeoutMs = 2000): Promise<Message> {
    return new Promise((resolve, reject) => {
      const message = sendFromBus(type, to, payload);
      const timer = setTimeout(() => {
        busReplies.delete(message.id);
        reject(new Error(`${to} did not answer ${type}`));
      }, timeoutMs);
      busReplies.set(message.id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  function publishStatus(): void {
    const stalled = [...connections.values()].filter((c) => c.stalled && c.info).map((c) => c.info!.id);
    sendFromBus("status", "*", {
      state,
      label: "Bus",
      data: { tick, speedMs, running: keepRunning, stalled, openRequests: openRequests.size, waitingFor: [...waitingFor] },
    });
  }

  // ── The clock ─────────────────────────────────────────────────────────────

  function beginTick(): void {
    clockTimer = null;
    state = busFsm.go(state, "TICKING");
    tick++;
    tickStartedAt = Date.now();
    openRequests.clear();
    waitingFor.clear();
    for (const [id, c] of connections) {
      if (c.info && CLOCKED_ROLES.includes(c.info.role) && !c.stalled) waitingFor.add(id);
    }
    tickTimer = setTimeout(onTickTimeout, tickTimeoutMs);
    sendFromBus("tick", "*", {});
    checkBarrier();
  }

  /** True when every clocked component is done and every request has had its reply. */
  function isTickComplete(): boolean {
    // @student week=4 part=class id=tick-barrier "The tick is over when nobody is still working and no request is still open"
    // TODO(week 4, tick-barrier): The tick is over when nobody is still working and no request is still open
    // Tests: tests/week-04/   Guide: docs/weeks/week-04.md
    // Until week 4 the bus only waits for tick.done. Week 4 shows why that isn't enough.
    return waitingFor.size === 0;
    // @end
  }

  /** Hand held requests on, in arbitration order. */
  function releaseHeld(): void {
    const ready = arbitrate(held);
    held = [];
    for (const { message, sender } of ready) route(message, sender);
  }

  function checkBarrier(): void {
    if (state !== "TICKING") return;
    // Everyone has finished the tick, so every request for it is in: arbitrate and send them on.
    if (waitingFor.size === 0 && held.length > 0) releaseHeld();
    if (!isTickComplete()) return;
    endTick();
  }

  function endTick(): void {
    if (tickTimer) clearTimeout(tickTimer);
    tickTimer = null;
    if (held.length > 0) releaseHeld(); // e.g. the watchdog ended the tick early
    state = busFsm.go(state, keepRunning ? "RUNNING" : "STOPPED");
    publishStatus();
    for (const resolve of tickWaiters.splice(0)) resolve(tick);
    if (keepRunning) {
      const wait = Math.max(0, tickStartedAt + speedMs - Date.now());
      clockTimer = setTimeout(beginTick, wait);
    }
  }

  /** The watchdog: carry on without components that didn't finish in time. */
  function onTickTimeout(): void {
    // @student week=6 part=home id=watchdog "Mark every component we're still waiting for as stalled, forget open requests, and end the tick"
    // TODO(week 6, watchdog): Mark every component we're still waiting for as stalled, forget open requests, and end the tick
    // Tests: tests/week-06/   Guide: docs/weeks/week-06.md
    // Until week 6 a slow component just delays the tick; nobody is marked stalled.
    waitingFor.clear();
    openRequests.clear();
    endTick();
    // @end
  }

  function start(): void {
    keepRunning = true;
    if (state === "STOPPED") beginTick();
  }

  function stop(): void {
    keepRunning = false;
    if (clockTimer) clearTimeout(clockTimer);
    clockTimer = null;
    if (state === "RUNNING") state = busFsm.go(state, "STOPPED");
    publishStatus();
  }

  function step(): Promise<number> {
    if (state !== "STOPPED") return Promise.reject(new Error(`can only step while stopped (bus is ${state})`));
    const done = new Promise<number>((resolve) => tickWaiters.push(resolve));
    beginTick();
    return done;
  }

  function reset(): void {
    stop();
    // Abandon a tick in progress: nobody is waited for, and nobody gets marked stalled for it.
    if (tickTimer) clearTimeout(tickTimer);
    tickTimer = null;
    waitingFor.clear();
    openRequests.clear();
    held = [];
    if (state === "TICKING") state = busFsm.go(state, "STOPPED");
    tick = 0;
    for (const resolve of tickWaiters.splice(0)) resolve(tick);
    for (const c of connections.values()) c.stalled = false;
    const announcement = sendFromBus("reset", "*", {});
    for (const c of connections.values()) {
      if (c.info && c.info.role !== "dashboard") c.awaitingReset = announcement.id;
    }
    publishStatus();
  }

  // ── Handling what components send ────────────────────────────────────────

  function refuse(connection: Connection, text: string, replyTo?: string): void {
    const to = connection.info?.id ?? "*";
    deliver(connection, busMessage("error", to, { message: text }, replyTo));
  }

  function handleHello(connection: Connection, message: Message): void {
    if (message.type !== "hello") {
      refuse(connection, "say hello first");
      return;
    }
    const id = message.from;
    if (id === "bus" || connections.has(id)) {
      refuse(connection, `the id "${id}" is already taken`);
      connection.socket.close();
      return;
    }
    const info: ComponentInfo = { id, ...message.payload };
    connection.info = info;
    connections.set(id, connection);
    log(`${id} joined as ${info.role}${info.kind ? ` (${info.kind})` : ""}`);

    const others = [...connections.values()].filter((c) => c !== connection && c.info).map((c) => c.info!);
    deliver(connection, busMessage("welcome", id, { running: keepRunning, speedMs, components: others }, message.id));
    route(busMessage("joined", "*", info), connection);
    if (info.role === "dashboard") {
      for (const status of latestStatus.values()) deliver(connection, status);
      publishStatus();
    }
    for (const resolve of joinWaiters.splice(0)) resolve();
  }

  function handleForBus(connection: Connection, message: Message): void {
    switch (message.type) {
      case "ok":
        return; // e.g. a dashboard acknowledging a reset
      case "tick.done":
        connection.stalled = false;
        if (message.tick === tick) waitingFor.delete(message.from);
        return;
      case "control":
        return handleControl(connection, message);
      case "save":
      case "restore":
        void handlePersistence(connection, message);
        return;
      default:
        refuse(connection, `the bus doesn't handle ${message.type}`, message.id);
    }
  }

  function handleControl(connection: Connection, message: MessageOf<"control">): void {
    const { action, ms } = message.payload;
    if (action === "start") start();
    if (action === "stop") stop();
    if (action === "reset") reset();
    if (action === "step") {
      if (state !== "STOPPED") return refuse(connection, "stop the clock before stepping", message.id);
      void step();
    }
    if (action === "speed") {
      if (ms === undefined) return refuse(connection, "speed needs ms", message.id);
      speedMs = ms;
      publishStatus();
    }
    deliver(connection, busMessage("ok", message.from, {}, message.id));
  }

  async function handlePersistence(connection: Connection, message: MessageOf<"save"> | MessageOf<"restore">): Promise<void> {
    if (state !== "STOPPED") return refuse(connection, `stop the clock before ${message.type}`, message.id);
    const io: SaveIo = {
      tick: () => tick,
      setTick: (value) => {
        tick = value;
      },
      components: () => [...connections.values()].flatMap((c) => (c.info ? [c.info] : [])),
      ask: askComponent,
      waitForComponent: (id) => waitUntil(() => connections.has(id)),
    };
    try {
      if (message.type === "save") await writeSave(savesDir, message.payload.name, io);
      else await restoreSave(savesDir, message.payload.name, io);
      publishStatus();
      deliver(connection, busMessage("ok", message.from, {}, message.id));
    } catch (error) {
      refuse(connection, (error as Error).message, message.id);
    }
  }

  function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (condition()) return resolve();
      const timer = setTimeout(() => reject(new Error("timed out waiting for a component")), timeoutMs);
      const check = () => {
        if (condition()) {
          clearTimeout(timer);
          resolve();
        } else joinWaiters.push(check);
      };
      joinWaiters.push(check);
    });
  }

  /** The `id` of a message that failed validation, if it has one, so the error can answer it. */
  function idOf(raw: string): string | undefined {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value === "object" && value !== null && "id" in value && typeof value.id === "string") return value.id;
    } catch {
      // not even JSON: there's nothing to answer
    }
    return undefined;
  }

  function handleMessage(connection: Connection, raw: string): void {
    const parsed = parseMessage(raw);
    if (!parsed.ok) return refuse(connection, `invalid message: ${parsed.error}`, idOf(raw));
    const message = parsed.message;

    if (!connection.info) return handleHello(connection, message);
    if (message.from !== connection.info.id) return refuse(connection, `you are "${connection.info.id}", not "${message.from}"`, message.id);
    if (connection.awaitingReset !== null) {
      // The component's `ok` to the reset opens the gate; everything before it is stale.
      if (message.replyTo === connection.awaitingReset) connection.awaitingReset = null;
      else log(`dropped ${message.type} from ${message.from}: sent before it saw the reset`);
      return;
    }
    if (BUS_ONLY.includes(message.type)) {
      return refuse(connection, `only the bus may send ${message.type}`, message.id);
    }
    if (DASHBOARD_ONLY.includes(message.type) && connection.info.role !== "dashboard") {
      const who = message.type.startsWith("snapshot.") ? "the bus or a dashboard" : "the dashboard";
      return refuse(connection, `only ${who} may send ${message.type}`, message.id);
    }

    if (message.type === "status") latestStatus.set(message.from, message);

    if (message.to !== "bus" && message.to !== "*" && !connections.has(message.to)) {
      return refuse(connection, `nobody called "${message.to}" is connected`, message.id);
    }

    // Keep the ledger of open requests for the tick barrier.
    if (TICK_REQUESTS.includes(message.type) && state === "TICKING") openRequests.add(message.id);
    if (message.replyTo !== undefined) openRequests.delete(message.replyTo);

    const busReply = message.replyTo === undefined ? undefined : busReplies.get(message.replyTo);
    if (busReply && message.replyTo !== undefined) {
      busReplies.delete(message.replyTo);
      busReply(message);
      route(message, connection);
    } else if (TICK_REQUESTS.includes(message.type) && state === "TICKING") {
      held.push({ message, sender: connection }); // released by checkBarrier, in arbitration order
    } else if (message.to === "bus") {
      route(message, connection); // dashboards see messages to the bus too
      handleForBus(connection, message);
    } else route(message, connection);

    checkBarrier();
  }

  function handleClose(connection: Connection): void {
    const info = connection.info;
    if (!info || connections.get(info.id) !== connection) return;
    connections.delete(info.id);
    latestStatus.delete(info.id);
    waitingFor.delete(info.id);
    log(`${info.id} left`);
    route(busMessage("left", "*", { id: info.id }));
    checkBarrier();
  }

  // ── The server ────────────────────────────────────────────────────────────

  const server = new WebSocketServer({ host, port: requestedPort });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;

  server.on("connection", (socket) => {
    const connection: Connection = { socket, info: null, stalled: false, awaitingReset: null };
    socket.on("message", (data) => handleMessage(connection, data.toString()));
    socket.on("close", () => handleClose(connection));
  });

  log(`listening on ws://${host}:${port}`);

  return {
    url: `ws://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`,
    port,
    tick: () => tick,
    step,
    waitForComponents: (count) => waitUntil(() => connections.size >= count),
    async close() {
      keepRunning = false;
      if (clockTimer) clearTimeout(clockTimer);
      if (tickTimer) clearTimeout(tickTimer);
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
