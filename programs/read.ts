// Node only: read a program's assembly source and assemble it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "@/core/asm";
import { findProgram, type ProgramInfo } from "@/programs/index";

export type LoadedProgram = ProgramInfo & { source: string; bytes: number[] };

/**
 * `symbols` fills in names the program doesn't define itself, e.g. { VECTOR, COUNTER, REGISTER }
 * for an interrupt handler. `origin` defaults to the program's own address (or VECTOR).
 */
export function readProgram(name: string, symbols: Record<string, number> = {}, origin?: number): LoadedProgram {
  const info = findProgram(name);
  if (!info) throw new Error(`no program called "${name}"`);
  // Resolved from the project root, which is where npm scripts and Next both run.
  const source = readFileSync(join(process.cwd(), "programs", info.file), "utf8");
  const bytes = assemble(source, { origin: origin ?? info.address ?? symbols.VECTOR ?? 0, symbols });
  return { ...info, source, bytes };
}
