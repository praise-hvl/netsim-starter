"use client";
// The data feed as a React hook: frames from a recorded trace, or from a live bus. This and the
// pure files next to it (trace.ts, frames.ts, stream.ts) are the whole feed; nothing here knows
// how the board is drawn, and nothing needs Node (it runs in any browser).
import { useEffect, useRef, useState } from "react";
import type { BusClient } from "@/components/client";
import type { Message } from "@/protocol/messages";
import { BUS_URL, connectDashboard, welcomeMessage } from "@/app/_lib/bus-connection";
import { buildFrames, type Frame } from "@/board/feed/frames";
import { appendMessages, createStream, withOpenTick } from "@/board/feed/stream";
import { parseTrace } from "@/board/feed/trace";

export type Source = { kind: "trace"; name: TraceName } | { kind: "live"; url: string };

/** The recordings that come with the board (scripts/board/record-trace.ts makes them). */
export const TRACES = {
  "2-cores": { label: "Recording · 2 cores", load: () => import("@/board/recordings/trace-2-cores.json") },
  "8-cores": { label: "Recording · 8 cores", load: () => import("@/board/recordings/trace-8-cores.json") },
} as const;
export type TraceName = keyof typeof TRACES;

/** What the live bus lets the board do. */
export type LiveControls = {
  press(id: string): void;
  control(action: "start" | "stop" | "step"): void;
};

export type Feed = {
  frames: Frame[];
  state: "loading" | "ready" | "connecting" | "live" | "closed";
  about: string;
  error: string | null;
  live: LiveControls | null;
};

const RETRY_MS = 2000;

export function useFeed(source: Source): Feed {
  const trace = useTraceFeed(source.kind === "trace" ? source.name : null);
  const live = useLiveFeed(source.kind === "live" ? source.url : null);
  return source.kind === "trace" ? trace : live;
}

const LOADING: Feed = { frames: [], state: "loading", about: "", error: null, live: null };

function useTraceFeed(name: TraceName | null): Feed {
  // Remember which recording a feed came from, so switching shows "loading" until the new one is in.
  const [loaded, setLoaded] = useState<{ name: TraceName; feed: Feed } | null>(null);
  useEffect(() => {
    if (name === null) return;
    let stopped = false;
    TRACES[name]
      .load()
      .then((module) => {
        if (stopped) return;
        const trace = parseTrace(module.default);
        setLoaded({ name, feed: { frames: buildFrames(trace.components, trace.messages), state: "ready", about: trace.about, error: null, live: null } });
      })
      .catch((error: unknown) => {
        if (!stopped) setLoaded({ name, feed: { ...LOADING, state: "closed", error: error instanceof Error ? error.message : String(error) } });
      });
    return () => {
      stopped = true;
    };
  }, [name]);
  return loaded !== null && loaded.name === name ? loaded.feed : LOADING;
}

function useLiveFeed(url: string | null): Feed {
  const [feed, setFeed] = useState<Feed>({ frames: [], state: "connecting", about: "", error: null, live: null });
  const stream = useRef(createStream());

  useEffect(() => {
    if (url === null) return;
    let stopped = false;
    let client: BusClient | null = null;
    let frame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const queue: Message[] = [];

    // At a fast clock the bus sends hundreds of messages a second; draw once per screen frame.
    function enqueue(message: Message): void {
      queue.push(message);
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        stream.current = appendMessages(stream.current, queue.splice(0));
        setFeed((f) => ({ ...f, frames: withOpenTick(stream.current) }));
      });
    }

    async function open(): Promise<void> {
      setFeed((f) => ({ ...f, state: "connecting", error: null }));
      try {
        client = await connectDashboard(url ?? BUS_URL);
        if (stopped) return void client.close();
        const c = client;
        enqueue(welcomeMessage(c));
        c.onAny(enqueue);
        c.onClose(() => {
          if (stopped) return;
          setFeed((f) => ({ ...f, state: "closed", error: "lost the connection to the bus", live: null }));
          retry = setTimeout(open, RETRY_MS);
        });
        const live: LiveControls = {
          press(id) {
            const sentId = c.send("input", id, { action: "press" });
            // The bus doesn't echo our own messages, so put the press on the board ourselves.
            enqueue({ type: "input", from: c.id, to: id, id: sentId, tick: c.tick, payload: { action: "press" } });
          },
          control(action) {
            c.send("control", "bus", { action });
          },
        };
        setFeed((f) => ({ ...f, state: "live", about: `Live: the bus at ${url}.`, live }));
      } catch (error) {
        if (stopped) return;
        setFeed((f) => ({ ...f, state: "closed", error: error instanceof Error ? error.message : String(error) }));
        retry = setTimeout(open, RETRY_MS);
      }
    }

    stream.current = createStream();
    void open();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(retry);
      void client?.close();
    };
  }, [url]);
  return feed;
}
