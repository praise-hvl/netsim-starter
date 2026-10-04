// A lane: a coloured strip with a title and a line of detail. Good for one core, one process,
// one queue: anything that has a name and a "what is it doing now".
import { Box, Label } from "@/board/parts/box";
import { INK } from "@/board/parts/colours";
import type { Rect } from "@/board/parts/geometry";

export type LaneProps = {
  rect: Rect;
  title: string;
  /** What it's doing now, in plain words. */
  detail?: string;
  /** null draws it grey: nothing happening. */
  colour: string | null;
  /** Faded, e.g. while another lane is in focus. */
  dimmed?: boolean;
};

export function Lane({ rect, title, detail, colour, dimmed = false }: LaneProps) {
  const middle = rect.y + rect.h / 2;
  const twoLines = detail !== undefined && rect.h >= 9;
  return (
    <g opacity={dimmed ? 0.25 : 1}>
      <Box rect={rect} fill={colour ?? INK.lightGrey} width={1.3} />
      <Label x={rect.x + 2} y={twoLines ? middle - 2.2 : middle} anchor="start" size={12} weight={700}>
        {twoLines ? title : `${title}${detail ? ` · ${detail}` : ""}`}
      </Label>
      {twoLines && (
        <Label x={rect.x + 2} y={middle + 2.4} anchor="start" size={11} weight={500}>
          {detail}
        </Label>
      )}
    </g>
  );
}
