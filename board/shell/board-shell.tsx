"use client";
// The frame around your board: pick a recording or the live bus, play, pause, step a tick and
// scrub. You draw the board itself: `children` gets the frame to draw and how far through its
// tick the playback is (0..1, for things in motion).
import type { ReactNode } from "react";
import type { Frame } from "@/board/feed/frames";
import { useFeed, TRACES, type Source, type TraceName } from "@/board/feed/use-feed";
import { BUS_URL } from "@/app/_lib/bus-connection";
import { usePlayback } from "@/board/shell/use-playback";
import { PlaybackBar } from "@/board/shell/playback-bar";
import { SCALE } from "@/board/parts/geometry";
import { INK } from "@/board/parts/colours";

export type BoardView = { frame: Frame; frames: readonly Frame[]; index: number; progress: number };

export type BoardShellProps = {
  title: string;
  source: Source;
  onSource: (source: Source) => void;
  /** The board's size in board units. */
  size: { w: number; h: number };
  children: (view: BoardView) => ReactNode;
};

export function BoardShell({ title, source, onSource, size, children }: BoardShellProps) {
  const feed = useFeed(source);
  const [playback, dispatch] = usePlayback(feed.frames.length, source.kind === "live" ? { follow: true, playing: true } : {});
  const index = Math.min(playback.index, Math.max(0, feed.frames.length - 1));
  const frame = feed.frames[index];
  const margin = 4;

  return (
    <div className="flex h-screen flex-col text-black" style={{ background: INK.paper }}>
      <header className="flex items-center gap-3 border-b-2 border-black bg-white px-4 py-2">
        <h1 className="whitespace-nowrap text-lg font-extrabold tracking-tight">{title}</h1>
        <select
          aria-label="What to show"
          className="rounded-md border-2 border-black bg-white px-2 py-1 text-sm font-semibold"
          value={source.kind === "live" ? "live" : source.name}
          onChange={(e) => {
            const value = e.target.value;
            onSource(value === "live" ? { kind: "live", url: BUS_URL } : { kind: "trace", name: value as TraceName });
            dispatch(value === "live" ? { type: "follow", follow: true } : { type: "seek", index: 0 });
          }}
        >
          {(Object.keys(TRACES) as TraceName[]).map((name) => (
            <option key={name} value={name}>
              {TRACES[name].label}
            </option>
          ))}
          <option value="live">Live bus</option>
        </select>
        <span className="min-w-0 truncate text-sm text-zinc-600">{feed.about}</span>
      </header>
      <main className="min-h-0 flex-1 p-3">
        {frame ? (
          <svg
            className="h-full w-full select-none"
            viewBox={`${-margin * SCALE} ${-margin * SCALE} ${(size.w + 2 * margin) * SCALE} ${(size.h + 2 * margin) * SCALE}`}
            role="img"
            aria-label={title}
          >
            {children({ frame, frames: feed.frames, index, progress: playback.progress })}
          </svg>
        ) : (
          <p className="p-6 text-lg">{feed.error ? `Couldn't load: ${feed.error}` : feed.state === "connecting" ? `Connecting to the bus at ${BUS_URL}…` : "Loading…"}</p>
        )}
      </main>
      <PlaybackBar playback={playback} dispatch={dispatch} frames={feed.frames} live={feed.live} />
    </div>
  );
}
