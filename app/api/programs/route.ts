// GET /api/programs: every program that has a load address, with its assembly source and the
// bytes it assembles to. Assembling needs the file system, so it happens here on the server;
// the dashboard then sends the bytes over the bus with program.load.
import { NextResponse } from "next/server";
import { PROGRAMS } from "@/programs/index";
import { readProgram } from "@/programs/read";
import type { ProgramListing } from "@/app/_lib/programs";

// Read the .asm files on every request, so an edited program is picked up without a rebuild.
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const programs: ProgramListing[] = PROGRAMS.flatMap((p) => (p.address === null ? [] : [{ ...readProgram(p.name), address: p.address }]));
    return NextResponse.json(programs);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
