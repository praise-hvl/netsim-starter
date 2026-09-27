// The programs the dashboard can load, as served by app/api/programs. Checked with zod when
// they arrive, like anything else that comes over a wire.
import { z } from "zod";
import { address, byte } from "@/protocol/messages";

export const programListing = z.object({
  name: z.string(),
  file: z.string(),
  address,
  description: z.string(),
  source: z.string(),
  bytes: z.array(byte),
});
export type ProgramListing = z.infer<typeof programListing>;

export async function fetchPrograms(): Promise<ProgramListing[]> {
  const response = await fetch("/api/programs");
  const body: unknown = await response.json();
  const parsed = z.array(programListing).safeParse(body);
  if (response.ok && parsed.success) return parsed.data;
  const reason = z.object({ error: z.string() }).safeParse(body);
  throw new Error(`could not load the programs: ${reason.success ? reason.data.error : response.statusText}`);
}
