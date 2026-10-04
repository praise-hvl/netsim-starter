// Your board: the simulated computer, drawn by you, live from the bus or from a recording.
//   /board                 the 2-core recording
//   /board?source=8-cores  the 8-core recording
//   /board?source=live     the live bus (npm run dev:all, or npm run bus + components)
// The board itself is in board/student/board.tsx.
import { MyBoard } from "@/board/student/board";
import { BUS_URL } from "@/app/_lib/bus-connection";
import type { Source } from "@/board/feed/use-feed";

export const metadata = { title: "My board", description: "The simulated computer, drawn as a board" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { source } = await searchParams;
  const initial: Source = source === "live" ? { kind: "live", url: BUS_URL } : source === "8-cores" ? { kind: "trace", name: "8-cores" } : { kind: "trace", name: "2-cores" };
  return <MyBoard initialSource={initial} />;
}
