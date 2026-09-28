// `npm run doctor`: is this machine and this clone ready for the course?
// Every failed check says how to fix it. Exits non-zero while a required check fails.
// You paste its output into docs/notes/week-01.md, and tests/week-01/setup.test.ts checks it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type Check = {
  name: string;
  ok: boolean;
  /** Optional checks only warn: the course works without them. */
  required: boolean;
  /** What was found, e.g. "v22.11.0". */
  detail: string;
  /** How to fix it, shown when the check fails. */
  fix: string;
};

/** The last line when everything required passes, e.g. "doctor: all 7 checks passed". */
export const ALL_GOOD = /^doctor: all (\d+) checks passed$/m;

/** Run a command and return its trimmed output, or null if it can't run or fails. */
function output(command: string, args: string[], cwd: string): string | null {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function runChecks(root: string = process.cwd()): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, fix: string, required = true) => checks.push({ name, ok, required, detail, fix });

  const [major] = process.versions.node.split(".").map(Number);
  add("Node 22 or newer", major >= 22, `v${process.versions.node}`, "Install Node 22 LTS or newer from https://nodejs.org, then open a new terminal.");

  const git = output("git", ["--version"], root);
  const name = output("git", ["config", "user.name"], root);
  const email = output("git", ["config", "user.email"], root);
  add(
    "git knows who you are",
    Boolean(git && name && email),
    !git ? "git not found" : name && email ? `${name} <${email}>` : "user.name or user.email not set",
    !git
      ? "Install git from https://git-scm.com/downloads (on macOS, `xcode-select --install` also works)."
      : 'Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` (your GitHub email).',
  );

  const branch = output("git", ["branch", "--show-current"], root);
  add(
    "on the 'work' branch",
    branch === "work",
    branch ? `on '${branch}'` : "not in a git clone",
    "`cd` into your clone of the course, then `git switch work` (the first time: `git switch -c work upstream/week-1-start`).",
  );

  const upstream = output("git", ["remote", "get-url", "upstream"], root);
  add(
    "'upstream' remote set",
    upstream !== null,
    upstream ?? "no remote called upstream",
    "Run `git remote add upstream <the starter repo URL from Praise>`, then `git fetch upstream`.",
  );

  const origin = output("git", ["remote", "get-url", "origin"], root);
  add(
    "origin is your fork",
    origin !== null && origin !== upstream,
    origin === null ? "no remote called origin" : origin === upstream ? "origin is the starter repo, not your fork" : origin,
    "Fork the starter repo on GitHub, then point origin at your fork: `git remote set-url origin <your fork's URL>`.",
  );

  const installed = existsSync(join(root, "node_modules", "zod", "package.json")) && existsSync(join(root, "node_modules", "vitest", "package.json"));
  add("dependencies installed", installed, installed ? "node_modules present" : "node_modules missing", "Run `npm install` in the course folder.");

  const codex = output("codex", ["--version"], root);
  add(
    "Codex CLI installed",
    codex !== null,
    codex ?? "not found",
    "Run `npm install -g @openai/codex`, then run `codex` once and sign in with your ChatGPT account.",
  );

  const code = output("code", ["--version"], root);
  add(
    "VS Code 'code' command",
    code !== null,
    code?.split("\n")[0] ?? "not found",
    "Optional. In VS Code, open the command palette and run \"Shell Command: Install 'code' command in PATH\".",
    false,
  );

  return checks;
}

function main(): void {
  const checks = runChecks();
  for (const check of checks) {
    const mark = check.ok ? "✓" : check.required ? "✗" : "!";
    console.log(`${mark} ${check.name.padEnd(26)} ${check.detail}`);
    if (!check.ok) console.log(`    → ${check.fix}`);
  }
  const required = checks.filter((c) => c.required);
  const failed = required.filter((c) => !c.ok);
  if (failed.length === 0) {
    console.log(`\ndoctor: all ${required.length} checks passed`);
  } else {
    console.log(`\ndoctor: ${failed.length} of ${required.length} checks failed; fix the ✗ lines above and run it again`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
