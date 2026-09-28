#!/usr/bin/env node
// NetSim setup: gets a laptop ready for the course, one step at a time.
//
//   macOS:   curl -fsSL https://raw.githubusercontent.com/praiseisaac/netsim-starter/week-1-start/setup.mjs -o setup.mjs && node setup.mjs
//   Windows: irm https://raw.githubusercontent.com/praiseisaac/netsim-starter/week-1-start/setup.mjs -OutFile setup.mjs; node setup.mjs
//   Again, inside the course folder: npm run setup      (add --dry-run to only show the commands)
//
// Every step checks first. If it's already done you see ✓ and press Enter to go on. If not,
// you type the command yourself (it's shown in grey), and the step checks again after it runs.
// No dependencies: only Node's built-in modules, so it runs before the course repo exists.
// @ts-check
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const STARTER = "praiseisaac/netsim-starter";
export const STARTER_URL = `https://github.com/${STARTER}.git`;
const HOMEBREW_INSTALL = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
const REOPEN_TERMINAL = "Close and reopen the terminal, then run `node setup.mjs` again (new programs only show up in a new terminal).";

/**
 * @typedef {{ code: number, stdout: string, stderr: string }} RunResult
 * @typedef {"mac" | "windows" | "linux"} Platform
 * @typedef {{ display: string, argv: string[], cwd?: string }} Command
 *   `display` is what the student types; `argv` is what actually runs.
 * @typedef {{ kind: "command", command: Command } | { kind: "prompt", run: (ctx: Context) => Promise<void> }} Action
 * @typedef {{ done: boolean, found: string }} CheckResult
 *   With `peek`, a check only looks: it never asks a question, prints, or changes anything.
 * @typedef {{ bold: (s: string) => string, dim: (s: string) => string, green: (s: string) => string, red: (s: string) => string, yellow: (s: string) => string }} Style
 * @typedef {{
 *   title: string,
 *   why: string,
 *   optional?: boolean,
 *   check: (ctx: Context, peek?: boolean) => Promise<CheckResult>,
 *   plan: (ctx: Context) => Action[],
 *   hint: (ctx: Context) => string,
 * }} Step
 * @typedef {{
 *   platform: Platform,
 *   cwd: string,
 *   dryRun: boolean,
 *   color: boolean,
 *   style: Style,
 *   capture: (argv: string[], cwd?: string) => RunResult | null,
 *   execute: (argv: string[], cwd?: string) => number,
 *   ask: (question: string) => Promise<string>,
 *   print: (line: string) => void,
 *   exists: (path: string) => boolean,
 *   readText: (path: string) => string | null,
 *   state: { login?: string, parent?: string, repoDir?: string },
 * }} Context
 */

// ── Showing and typing commands ────────────────────────────────────────────

/**
 * ANSI styles, or plain text when colour is off (NO_COLOR, or output isn't a terminal).
 * @param {boolean} color
 * @returns {Style}
 */
export function makeStyle(color) {
  /** @param {number} open @param {number} close */
  const wrap = (open, close) => (/** @type {string} */ text) => (color ? `\x1b[${open}m${text}\x1b[${close}m` : text);
  return { bold: wrap(1, 22), dim: wrap(2, 22), green: wrap(32, 39), red: wrap(31, 39), yellow: wrap(33, 39) };
}

/**
 * Compare what was typed with the command: extra spaces and ' vs " don't matter.
 * @param {string} text
 */
export function normalizeCommand(text) {
  return text.trim().replace(/\s+/g, " ").replace(/'/g, '"');
}

/**
 * Index of the first character where two (normalized) lines differ, or -1 if they're equal.
 * @param {string} typed
 * @param {string} expected
 */
export function firstDifference(typed, expected) {
  if (typed === expected) return -1;
  let i = 0;
  while (i < typed.length && i < expected.length && typed[i] === expected[i]) i++;
  return i;
}

/**
 * The "you typed / expected" message, with ^ under the first difference.
 * @param {string} typedRaw
 * @param {string} expectedRaw
 */
export function mismatchMessage(typedRaw, expectedRaw) {
  const typed = normalizeCommand(typedRaw);
  const expected = normalizeCommand(expectedRaw);
  const at = firstDifference(typed, expected);
  return [`  you typed: ${typed}`, `  expected:  ${expected}`, `             ${" ".repeat(at)}^ first difference`].join("\n");
}

/**
 * Ask the student to type `command`. Nothing runs before a match.
 * @param {Context} ctx
 * @param {Command} command
 * @returns {Promise<"run" | "skip" | "quit">}
 */
async function typeToRun(ctx, command) {
  ctx.print(`  ${ctx.style.bold("TYPE THIS COMMAND")}`);
  ctx.print(`    ${ctx.style.dim(command.display)}`);
  let misses = 0;
  for (;;) {
    const line = await ctx.ask(misses >= 3 ? "  > (Enter = let me run it for you) " : "  > ");
    const answer = line.trim().toLowerCase();
    if (answer === "s") return "skip";
    if (answer === "q") return "quit";
    if (answer === "" && misses >= 3) return "run";
    if (answer === "") continue;
    if (normalizeCommand(line) === normalizeCommand(command.display)) return "run";
    misses++;
    ctx.print(ctx.style.yellow(mismatchMessage(line, command.display)));
    ctx.print(misses >= 3 ? "  Try once more, or press Enter and I'll run it for you." : "  Try again (s = skip this step, q = quit).");
  }
}

// ── Remotes and credentials (a small copy of scripts/doctor.ts, which setup can't import) ──

/**
 * OWNER/REPO from any GitHub URL form, or null.
 * @param {string} url
 * @returns {{ protocol: "https" | "ssh", host: string, owner: string, repo: string } | null}
 */
export function parseRemote(url) {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const https = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (https) return { protocol: "https", host: https[1], owner: https[2], repo: https[3] };
  const sshUrl = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (sshUrl) return { protocol: "ssh", host: sshUrl[1], owner: sshUrl[2], repo: sshUrl[3] };
  const scp = /^(?:[^@/:]+@)?([^/:\\]{2,}):([^/]+)\/([^/]+)$/.exec(trimmed);
  if (scp) return { protocol: "ssh", host: scp[1], owner: scp[2], repo: scp[3] };
  return null;
}

/**
 * Does git have a credential helper for `host`? Without one it asks for a password, which GitHub rejects.
 * @param {Context} ctx
 * @param {string} [host]
 * @param {string} [cwd]
 */
export function hasCredentialHelper(ctx, host = "github.com", cwd) {
  /** @param {string} key */
  const helpers = (key) => (ctx.capture(["git", "config", "--get-all", key], cwd)?.stdout ?? "").split("\n").filter((l) => l.trim());
  return helpers(`credential.https://${host}.helper`).length > 0 || helpers("credential.helper").length > 0;
}

// ── Small helpers the steps share ──────────────────────────────────────────

/**
 * Output of a command that succeeded, or null.
 * @param {Context} ctx
 * @param {string[]} argv
 * @param {string} [cwd]
 */
function output(ctx, argv, cwd) {
  const result = ctx.capture(argv, cwd);
  return result && result.code === 0 ? result.stdout.trim() : null;
}

/** @param {Context} ctx */
const repoDir = (ctx) => ctx.state.repoDir ?? ctx.cwd;
/**
 * @param {string} display
 * @param {string[]} argv
 * @param {string} [cwd]
 * @returns {Action}
 */
const cmd = (display, argv, cwd) => ({ kind: "command", command: { display, argv, cwd } });

/**
 * Homebrew's `brew`, even if a fresh install isn't on PATH yet.
 * @param {Context} ctx
 */
function brew(ctx) {
  if (output(ctx, ["brew", "--version"])) return "brew";
  for (const path of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) if (ctx.exists(path)) return path;
  return null;
}

/**
 * On a Mac without Homebrew, installing it comes first, as its own typed command.
 * @param {Context} ctx
 * @param {string} formula
 * @returns {Action[]}
 */
function withBrew(ctx, formula) {
  const b = brew(ctx);
  if (b) return [cmd(`brew install ${formula}`, [b, "install", ...formula.split(" ")])];
  return [cmd(HOMEBREW_INSTALL, ["/bin/bash", "-c", HOMEBREW_INSTALL])];
}

/** @param {string} id */
const winget = (id) => cmd(`winget install --id ${id} -e`, ["winget", "install", "--id", id, "-e", "--accept-source-agreements", "--accept-package-agreements"]);

/**
 * The GitHub account gh is using now, or null.
 * @param {Context} ctx
 */
function ghLogin(ctx) {
  return output(ctx, ["gh", "api", "user", "--jq", ".login"]);
}

// ── The steps ──────────────────────────────────────────────────────────────

/** @returns {Step[]} */
export function courseSteps() {
  return [
    {
      title: "Node 22 or newer",
      why: "The course code and its tests run on Node.",
      check: async () => {
        const major = Number(process.versions.node.split(".")[0]);
        return { done: major >= 22, found: `Node ${process.versions.node}` };
      },
      plan: (ctx) => (ctx.platform === "windows" ? [winget("OpenJS.NodeJS.LTS")] : ctx.platform === "mac" ? withBrew(ctx, "node@22") : []),
      hint: (ctx) => (ctx.platform === "windows" ? REOPEN_TERMINAL : "Install Node 22 LTS from https://nodejs.org, open a new terminal, and run this again."),
    },
    {
      title: "git installed",
      why: "git keeps the history of your work and sends it to GitHub.",
      check: async (ctx) => {
        const version = output(ctx, ["git", "--version"]);
        return { done: version !== null, found: version ?? "git not found" };
      },
      plan: (ctx) =>
        ctx.platform === "windows"
          ? [winget("Git.Git")]
          : brew(ctx)
            ? withBrew(ctx, "git")
            : [cmd("xcode-select --install", ["xcode-select", "--install"])],
      hint: (ctx) =>
        ctx.platform === "windows" ? REOPEN_TERMINAL : "If a window popped up, finish the install there, then press Enter to check again.",
    },
    {
      title: "git knows who you are",
      why: "Every commit is signed with a name and email; use the email on your GitHub account.",
      check: async (ctx) => {
        const name = output(ctx, ["git", "config", "--global", "user.name"]);
        const email = output(ctx, ["git", "config", "--global", "user.email"]);
        return { done: Boolean(name && email), found: name && email ? `${name} <${email}>` : "name or email not set" };
      },
      plan: () => [
        {
          kind: "prompt",
          run: async (ctx) => {
            const name = (await ctx.ask("  Your name (as it should appear on commits): ")).trim();
            const email = (await ctx.ask("  Your GitHub email: ")).trim();
            if (name) ctx.execute(["git", "config", "--global", "user.name", name]);
            if (email) ctx.execute(["git", "config", "--global", "user.email", email]);
          },
        },
      ],
      hint: () => "Both a name and an email are needed.",
    },
    {
      title: "GitHub CLI (gh)",
      why: "gh signs you in to GitHub and makes your fork, without copying tokens around.",
      check: async (ctx) => {
        const version = output(ctx, ["gh", "--version"]);
        return { done: version !== null, found: version?.split("\n")[0] ?? "gh not found" };
      },
      plan: (ctx) => (ctx.platform === "windows" ? [winget("GitHub.cli")] : withBrew(ctx, "gh")),
      hint: (ctx) =>
        ctx.platform === "windows" ? REOPEN_TERMINAL : "If Homebrew was just installed, run the two `eval` lines it printed (or open a new terminal), then run this again.",
    },
    {
      title: "Signed in to GitHub",
      why: "Your fork and your pushes belong to this account.",
      check: async (ctx, peek) => {
        const login = ghLogin(ctx);
        if (!login) return { done: false, found: "not signed in" };
        if (peek) return { done: false, found: `signed in as ${login} (you'll confirm it)` };
        const answer = (await ctx.ask(`  Is ${login} the account you'll use for this course? (y/n) `)).trim().toLowerCase();
        if (answer.startsWith("y")) {
          ctx.state.login = login;
          return { done: true, found: `signed in as ${login}` };
        }
        return { done: false, found: `signed in as ${login}, but that's not the one` };
      },
      plan: () => [cmd("gh auth login --web -h github.com -p https", ["gh", "auth", "login", "--web", "-h", "github.com", "-p", "https"])],
      hint: () => "If you're already signed in to the right account too, `gh auth switch --user <name>` picks it.",
    },
    {
      title: "git signs in with that account",
      why: "Without this, git asks for a password, and GitHub doesn't accept passwords.",
      check: async (ctx) => {
        const ok = hasCredentialHelper(ctx);
        return { done: ok, found: ok ? "git has a credential helper for github.com" : "no credential helper for github.com" };
      },
      plan: () => [cmd("gh auth setup-git", ["gh", "auth", "setup-git"])],
      hint: () => "Make sure the previous step (signed in to GitHub) is done first.",
    },
    {
      title: "ChatGPT account and the student offer",
      why: "The course's AI assistant is Codex, which comes with ChatGPT.",
      optional: true,
      check: async (ctx, peek) => {
        if (peek) return { done: false, found: "you'll be asked" };
        const answer = (await ctx.ask("  Do you have a ChatGPT account, with the student offer claimed? (y/n) ")).trim().toLowerCase();
        return { done: answer.startsWith("y"), found: answer.startsWith("y") ? "you said yes" : "not yet" };
      },
      plan: () => [
        {
          kind: "prompt",
          run: async (ctx) => {
            ctx.print("  Do this in your browser (it can't be checked from here):");
            ctx.print("    1. Sign up or sign in at https://chatgpt.com");
            ctx.print("    2. Claim the student offer at https://chatgpt.com/students (by October 31)");
            ctx.print("    3. Codex credits for students: https://chatgpt.com/codex/students");
            await ctx.ask("  Press Enter when you're done (or to carry on and do it later) ");
          },
        },
      ],
      hint: () => "No problem: you can finish this later. Press s to move on.",
    },
    {
      title: "Your fork of the starter repo",
      why: "Your own copy on GitHub, where you push your work.",
      check: async (ctx) => {
        const login = ctx.state.login ?? ghLogin(ctx);
        if (!login) return { done: false, found: "not signed in to GitHub yet" };
        ctx.state.login = login;
        // It has to be a real fork: the starter itself (Praise's account) doesn't count.
        const info = output(ctx, ["gh", "repo", "view", `${login}/netsim-starter`, "--json", "nameWithOwner,isFork", "--jq", '.nameWithOwner + " " + (.isFork|tostring)']);
        const [name, isFork] = (info ?? "").split(" ");
        if (!info) return { done: false, found: `no ${login}/netsim-starter yet` };
        return { done: isFork === "true", found: isFork === "true" ? `github.com/${name}` : `github.com/${name} isn't a fork of ${STARTER}` };
      },
      plan: () => [cmd(`gh repo fork ${STARTER} --clone=false`, ["gh", "repo", "fork", STARTER, "--clone=false"])],
      hint: () => "Check you're signed in to the right account (step 5), then try again.",
    },
    {
      title: "Your fork on this laptop",
      why: "You work in a local copy (a clone) and push it back to your fork.",
      check: async (ctx) => {
        const here = output(ctx, ["git", "rev-parse", "--show-toplevel"], ctx.cwd);
        const candidates = [here, join(ctx.state.parent ?? ctx.cwd, "netsim")].filter((d) => d !== null);
        for (const dir of candidates) {
          const pkg = ctx.readText(join(dir, "package.json"));
          if (pkg && ctx.exists(join(dir, ".git")) && /"name":\s*"simulated-cpu"/.test(pkg)) {
            ctx.state.repoDir = dir;
            return { done: true, found: dir };
          }
        }
        return { done: false, found: "no clone of the course found here" };
      },
      plan: (ctx) => [
        {
          kind: "prompt",
          run: async (ctx2) => {
            const answer = (await ctx2.ask(`  Which folder should the course go in? (Enter = ${ctx2.cwd}) `)).trim();
            ctx2.state.parent = resolve(ctx2.cwd, answer || ".");
          },
        },
        {
          kind: "command",
          get command() {
            const login = ctx.state.login ?? "<you>";
            return { display: `gh repo clone ${login}/netsim-starter netsim`, argv: ["gh", "repo", "clone", `${login}/netsim-starter`, "netsim"], cwd: ctx.state.parent ?? ctx.cwd };
          },
        },
      ],
      hint: () => "The fork has to exist first (step 8). If the netsim folder already exists, pick another parent folder.",
    },
    {
      title: "upstream remote",
      why: "upstream is the starter repo: each week's new work comes from there.",
      check: async (ctx) => {
        const url = output(ctx, ["git", "remote", "get-url", "upstream"], repoDir(ctx));
        const remote = url ? parseRemote(url) : null;
        const ok = remote !== null && `${remote.owner}/${remote.repo}`.toLowerCase() === STARTER.toLowerCase();
        return { done: ok, found: url ?? "no remote called upstream" };
      },
      plan: (ctx) => {
        const exists = output(ctx, ["git", "remote", "get-url", "upstream"], repoDir(ctx)) !== null;
        const verb = exists ? "set-url" : "add";
        return [cmd(`git remote ${verb} upstream ${STARTER_URL}`, ["git", "remote", verb, "upstream", STARTER_URL], repoDir(ctx))];
      },
      hint: () => "Run it inside the course folder (step 9).",
    },
    {
      title: "The work branch, on GitHub",
      why: "You do all your work on 'work' and push it to your fork.",
      check: async (ctx) => {
        const branch = output(ctx, ["git", "branch", "--show-current"], repoDir(ctx));
        const tracking = output(ctx, ["git", "rev-parse", "--abbrev-ref", "work@{upstream}"], repoDir(ctx));
        return { done: branch === "work" && tracking === "origin/work", found: branch ? `on '${branch}'${tracking ? `, tracking ${tracking}` : ", not pushed yet"}` : "not in the course folder" };
      },
      plan: (ctx) => {
        const dir = repoDir(ctx);
        const hasWork = output(ctx, ["git", "rev-parse", "--verify", "--quiet", "refs/heads/work"], dir) !== null;
        return [
          cmd("git fetch upstream", ["git", "fetch", "upstream"], dir),
          hasWork ? cmd("git switch work", ["git", "switch", "work"], dir) : cmd("git switch -c work upstream/week-1-start", ["git", "switch", "-c", "work", "upstream/week-1-start"], dir),
          cmd("git push -u origin work", ["git", "push", "-u", "origin", "work"], dir),
        ];
      },
      hint: () => "If the push was refused, `npm run doctor` will tell you which account git pushes as.",
    },
    {
      title: "VS Code, with the code command",
      why: "The editor the course uses; `code .` opens the project from the terminal.",
      optional: true,
      check: async (ctx) => {
        const version = output(ctx, ["code", "--version"]);
        return { done: version !== null, found: version?.split("\n")[0] ?? "code not found" };
      },
      plan: (ctx) => (ctx.platform === "windows" ? [winget("Microsoft.VisualStudioCode")] : withBrew(ctx, "--cask visual-studio-code")),
      hint: (ctx) =>
        ctx.platform === "windows"
          ? REOPEN_TERMINAL
          : "If VS Code is installed but `code` isn't found: in VS Code press Cmd+Shift+P and run \"Shell Command: Install 'code' command in PATH\". This step is optional.",
    },
    {
      title: "Codex CLI, signed in",
      why: "Codex is the course's AI assistant; you direct the design, it can help write code.",
      check: async (ctx) => {
        const version = output(ctx, ["codex", "--version"]);
        const auth = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
        if (!version) return { done: false, found: "codex not found" };
        return { done: ctx.exists(auth), found: ctx.exists(auth) ? `${version}, signed in` : `${version}, not signed in` };
      },
      plan: (ctx) => {
        const installed = output(ctx, ["codex", "--version"]) !== null;
        return [
          ...(installed ? [] : [cmd("npm install -g @openai/codex", ["npm", "install", "-g", "@openai/codex"])]),
          cmd("codex login", ["codex", "login"]),
        ];
      },
      hint: (ctx) => (ctx.platform === "windows" ? `${REOPEN_TERMINAL} (Codex on Windows also works well inside WSL.)` : "Finish signing in in the browser window, then try again."),
    },
    {
      title: "Course dependencies",
      why: "The libraries the course code uses (zod, vitest, Next.js...).",
      check: async (ctx) => {
        const dir = repoDir(ctx);
        const ok = ctx.exists(join(dir, "node_modules", "zod", "package.json")) && ctx.exists(join(dir, "node_modules", "vitest", "package.json"));
        return { done: ok, found: ok ? "node_modules present" : "not installed yet" };
      },
      plan: (ctx) => [cmd("npm install", ["npm", "install"], repoDir(ctx))],
      hint: () => "Run it inside the course folder (step 9).",
    },
    {
      title: "npm run doctor",
      why: "The same checks the course uses; paste its output into docs/notes/week-01.md.",
      check: async (ctx, peek) => {
        if (peek) return { done: false, found: "runs at the end" };
        const result = ctx.capture(["npm", "run", "-s", "doctor"], repoDir(ctx));
        const text = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`.trim();
        const ok = /doctor: all 8 checks passed/.test(text);
        if (text) for (const line of text.split("\n")) ctx.print(`    ${line}`);
        return { done: ok, found: ok ? "doctor: all 8 checks passed" : "some checks still fail (see above)" };
      },
      plan: (ctx) => [cmd("npm run doctor", ["npm", "run", "doctor"], repoDir(ctx))],
      hint: () => "Each ✗ line says how to fix it; most are covered by the earlier steps (rerun this script).",
    },
  ];
}

// ── The step loop ──────────────────────────────────────────────────────────

/** @typedef {"done" | "pending" | "skipped"} Mark */

/**
 * The checklist: ✓ done, • still to do, – skipped.
 * @param {Context} ctx
 * @param {Step[]} steps
 * @param {Mark[]} marks
 */
function printChecklist(ctx, steps, marks) {
  const symbol = { done: ctx.style.green("✓"), pending: "•", skipped: ctx.style.dim("–") };
  steps.forEach((step, i) => {
    const mark = marks[i] ?? "pending";
    const label = `${String(i + 1).padStart(2)}. ${step.title}${step.optional ? " (optional)" : ""}`;
    ctx.print(`  ${symbol[mark]} ${mark === "skipped" ? ctx.style.dim(`${label} (skipped)`) : label}`);
  });
}

/**
 * Walk through the steps. Never moves on without a keypress, and never runs a command the
 * student didn't type (or ask to have run after three tries).
 * @param {Step[]} steps
 * @param {Context} ctx
 */
export async function runSteps(steps, ctx) {
  const { bold } = ctx.style;
  ctx.print(bold("NetSim: Building a Simulated Computer System"));
  ctx.print("I'll walk you through setting up your laptop, one step at a time.");
  ctx.print("Each step checks first. Nothing runs until you type it yourself.\n");

  // A quick look at where things stand. Nothing is asked or changed here.
  /** @type {Mark[]} */
  const marks = [];
  for (const step of steps) marks.push((await step.check(ctx, true)).done ? "done" : "pending");
  ctx.print(bold("Your checklist"));
  printChecklist(ctx, steps, marks);
  if ((await ctx.ask("\nPress Enter to start (q = quit) ")).trim().toLowerCase() === "q") return { marks, quit: true };

  for (const [i, step] of steps.entries()) {
    ctx.print(`\n${bold(`Step ${i + 1} of ${steps.length} · ${step.title}`)}${step.optional ? " (optional)" : ""}`);
    ctx.print(`  ${bold("WHY")}     ${step.why}`);
    const outcome = await doStep(step, ctx);
    if (outcome === "quit") {
      ctx.print(`\n${QUIT_MESSAGE}`);
      return { marks, quit: true };
    }
    marks[i] = outcome === "done" ? "done" : "skipped";
  }

  ctx.print(`\n${bold("Your checklist")}`);
  printChecklist(ctx, steps, marks);
  const left = steps.filter((s, i) => marks[i] !== "done" && !s.optional);
  ctx.print(
    left.length === 0
      ? `\n${ctx.style.green("All set.")} Next: open docs/weeks/week-01.md and do the take-home.`
      : `\nNext: finish the skipped steps (run \`node setup.mjs\` again), then open docs/weeks/week-01.md and do the take-home.`,
  );
  return { marks, quit: false };
}

export const QUIT_MESSAGE = "Run node setup.mjs again anytime; finished steps are remembered because they're re-checked.";

/**
 * @param {Step} step
 * @param {Context} ctx
 * @returns {Promise<"done" | "skipped" | "quit">}
 */
async function doStep(step, ctx) {
  /** @param {string} text @param {boolean} ok */
  const status = (text, ok) => ctx.print(`  ${ctx.style.bold("STATUS")}  ${ok ? ctx.style.green(`✓ ${text}`) : text}`);
  for (;;) {
    const found = await step.check(ctx);
    if (found.done) {
      status(found.found, true);
      const answer = (await ctx.ask("  Press Enter for the next step (q = quit) ")).trim().toLowerCase();
      return answer === "q" ? "quit" : "done";
    }
    status(`not done yet: ${found.found}`, false);

    for (const action of step.plan(ctx)) {
      if (action.kind === "prompt") {
        await action.run(ctx);
        continue;
      }
      const choice = await typeToRun(ctx, action.command);
      if (choice !== "run") return choice === "skip" ? "skipped" : "quit";
      if (ctx.dryRun) {
        ctx.print(ctx.style.dim(`  (dry run: not running ${action.command.display})`));
        continue;
      }
      const code = ctx.execute(action.command.argv, action.command.cwd);
      if (code !== 0) ctx.print(ctx.style.yellow(`  That command exited with code ${code}.`));
    }

    if (ctx.dryRun) {
      await ctx.ask("  (dry run) Press Enter for the next step ");
      return "skipped";
    }
    const again = await step.check(ctx);
    if (again.done) continue; // the loop shows ✓ and pauses
    ctx.print(ctx.style.red(`  ✗ Still not done: ${again.found}`));
    ctx.print(`  → ${step.hint(ctx)}`);
    const answer = (await ctx.ask("  Enter = try again, s = skip, q = quit ")).trim().toLowerCase();
    if (answer === "s") return "skipped";
    if (answer === "q") return "quit";
  }
}

// ── Running for real ───────────────────────────────────────────────────────

/**
 * Reads answers one line at a time. Lines that arrive before a question is asked wait in a
 * queue, so typing ahead (or piping answers in) works like a person typing each one. When the
 * input ends (Ctrl+D, or piped input runs out), `onEnd` is called instead of hanging.
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @param {() => void} onEnd
 */
export function lineReader(input, output, onEnd) {
  const terminal = Boolean(/** @type {{ isTTY?: boolean }} */ (output).isTTY);
  const rl = createInterface({ input, output, terminal });
  // A terminal echoes what you type, Enter included. Piped input isn't echoed, so end the line ourselves.
  const endLine = () => {
    if (!terminal) output.write("\n");
  };
  /** @type {string[]} */
  const queued = [];
  /** @type {((line: string) => void) | null} */
  let waiting = null;
  let ended = false;
  rl.on("line", (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      endLine();
      resolve(line);
    } else queued.push(line);
  });
  rl.on("close", () => {
    ended = true;
    if (waiting) onEnd(); // someone is waiting for an answer that will never come
  });
  return {
    rl,
    /** @param {string} question */
    ask: (question) => {
      output.write(question);
      const next = queued.shift();
      if (next !== undefined) {
        endLine();
        return Promise.resolve(next);
      }
      if (ended) {
        onEnd();
        return new Promise(() => {}); // onEnd exits; this answer never arrives
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    close: () => rl.close(),
  };
}

/**
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Context & { close: () => void }}
 */
export function realContext({ dryRun = false } = {}) {
  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  // On Windows, npm, gh and code are .cmd files, which need a shell to start.
  const shell = platform === "windows";
  // Ctrl+C, Ctrl+D or the end of piped input: leave cleanly, with a word on how to pick up again.
  /** @param {number} code */
  const leave = (code) => {
    console.log(`\n\n${QUIT_MESSAGE}`);
    process.exit(code);
  };
  const reader = lineReader(process.stdin, process.stdout, () => leave(0));
  reader.rl.on("SIGINT", () => leave(130));
  process.on("SIGINT", () => leave(130));
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  return {
    platform,
    cwd: process.cwd(),
    dryRun,
    color,
    style: makeStyle(color),
    capture: (argv, cwd) => {
      const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", shell, timeout: 60_000 });
      if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === "ENOENT") return null;
      return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    execute: (argv, cwd) => spawnSync(argv[0], argv.slice(1), { cwd, stdio: "inherit", shell }).status ?? 1,
    ask: reader.ask,
    print: (line) => console.log(line),
    exists: (path) => existsSync(path),
    readText: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    state: {},
    close: reader.close,
  };
}

async function main() {
  const ctx = realContext({ dryRun: process.argv.includes("--dry-run") });
  if (ctx.platform === "windows") ctx.print("(Windows support is untested on a real Windows machine so far. Tell Praise how it goes.)");
  if (ctx.dryRun) ctx.print("(dry run: commands are shown and typed, but not run)");
  const { quit } = await runSteps(courseSteps(), ctx);
  ctx.close();
  process.exitCode = quit ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
