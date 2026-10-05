#!/usr/bin/env node
// node setup-week N: NetSim Studio for week N's class. It walks you through getting ready (setup in
// week 1, then each new week), and once week N is in, it opens that week's page, note and board.
//   node setup-week 2              the studio, in your browser
//   node setup-week 2 --terminal   the same steps, in this terminal
// It runs setup.mjs (next to this file) with --week N; everything else is passed along.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [week, ...rest] = process.argv.slice(2);
if (!/^\d+$/.test(week ?? "") || Number(week) < 1) {
  console.log("Which week? For example: node setup-week 2");
  process.exit(2);
}
const setup = join(dirname(fileURLToPath(import.meta.url)), "setup.mjs");
const run = spawnSync(process.execPath, [setup, "--week", String(Number(week)), ...rest], { stdio: "inherit" });
process.exit(run.status ?? 1);
