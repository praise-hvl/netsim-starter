// setup.mjs, driven with scripted keypresses and a fake laptop: nothing is installed or run
// for real, and nothing touches the network.
import { describe, expect, it } from "vitest";
import {
  courseSteps,
  firstDifference,
  lineReader,
  makeStyle,
  mismatchMessage,
  normalizeCommand,
  parseRemote as setupParseRemote,
  QUIT_MESSAGE,
  runSteps,
} from "@/setup.mjs";
import { parseRemote as doctorParseRemote } from "@/scripts/doctor";

type Result = { code: number; stdout: string; stderr: string };

/** A fake context: answers `ask` from a script and records every command that runs. */
function fakeContext(keys: string[], capture: (argv: string[]) => Result | null = () => null) {
  const printed: string[] = [];
  const ran: string[][] = [];
  const asked: string[] = [];
  const ctx = {
    platform: "mac" as const,
    cwd: "/tmp/course",
    dryRun: false,
    color: false,
    style: makeStyle(false),
    capture: (argv: string[]) => capture(argv),
    execute: (argv: string[]) => {
      ran.push(argv);
      return 0;
    },
    ask: async (question: string) => {
      asked.push(question);
      if (keys.length === 0) throw new Error(`ran out of keypresses at: ${question}`);
      return keys.shift()!;
    },
    print: (line: string) => printed.push(line),
    exists: () => false,
    readText: () => null,
    state: {},
  };
  return { ctx, printed, ran, asked, keys };
}

/** A step that is done once `isDone()` says so, and whose fix is one typed command. */
function step(title: string, isDone: () => boolean, display = "echo fix") {
  return {
    title,
    why: `because ${title}`,
    check: async () => ({ done: isDone(), found: isDone() ? `${title} ok` : `${title} missing` }),
    plan: () => [{ kind: "command" as const, command: { display, argv: display.split(" ") } }],
    hint: () => "hint",
  };
}

describe("the step loop", () => {
  it("shows the checklist first, then pauses on a done step without running anything", async () => {
    const { ctx, printed, ran, asked } = fakeContext(["", ""]);
    const result = await runSteps([step("Node", () => true)], ctx);
    expect(ran).toEqual([]);
    expect(printed).toContain("  ✓  1. Node");
    expect(printed.some((l) => l.includes("Step 1 of 1 · Node"))).toBe(true);
    expect(asked[1]).toContain("Press Enter for the next step");
    expect(result.quit).toBe(false);
  });

  it("runs a command only after the student types it, then re-checks", async () => {
    let installed = false;
    const { ctx, ran, printed } = fakeContext(["", "echo fix", ""]);
    ctx.execute = (argv: string[]) => {
      ran.push(argv);
      installed = true;
      return 0;
    };
    await runSteps([step("git", () => installed)], ctx);
    expect(ran).toEqual([["echo", "fix"]]);
    expect(printed).toContain("    echo fix"); // shown under TYPE THIS COMMAND
    expect(printed.some((l) => l.includes("✓ git ok"))).toBe(true);
  });

  it("accepts extra spaces and either kind of quote", async () => {
    let done = false;
    const { ctx, ran } = fakeContext(["", "  git   config  'x'  ", ""]);
    ctx.execute = (argv: string[]) => {
      ran.push(argv);
      done = true;
      return 0;
    };
    await runSteps([step("quotes", () => done, 'git config "x"')], ctx);
    expect(ran).toHaveLength(1);
  });

  it("shows where a mistyped command differs, and runs nothing", async () => {
    const { ctx, ran, printed } = fakeContext(["", "gh auth logn", "q"]);
    await runSteps([step("gh", () => false, "gh auth login")], ctx);
    expect(ran).toEqual([]);
    const at = printed.findIndex((l) => l.includes("you typed: gh auth logn"));
    expect(printed[at]).toContain("expected:  gh auth login");
    expect(printed[at]).toContain(`${" ".repeat(13 + "gh auth log".length)}^ first difference`);
  });

  it("offers to run it after three misses", async () => {
    let done = false;
    const { ctx, ran, asked } = fakeContext(["", "x", "y", "z", "", ""]);
    ctx.execute = (argv: string[]) => {
      ran.push(argv);
      done = true;
      return 0;
    };
    await runSteps([step("helper", () => done, "gh auth setup-git")], ctx);
    expect(asked.some((q) => q.includes("Enter = let me run it for you"))).toBe(true);
    expect(ran).toEqual([["gh", "auth", "setup-git"]]);
  });

  it("s skips a step and q quits, without running anything", async () => {
    const { ctx, ran, printed } = fakeContext(["", "s", "q"]);
    const result = await runSteps([step("one", () => false), step("two", () => false), step("three", () => false)], ctx);
    expect(ran).toEqual([]);
    expect(result.quit).toBe(true);
    expect(result.marks).toEqual(["skipped", "pending", "pending"]);
    expect(printed.at(-1)).toContain(QUIT_MESSAGE);
  });

  it("never moves between steps without a keypress", async () => {
    const { ctx, asked } = fakeContext(["", "", "", ""]);
    await runSteps([step("a", () => true), step("b", () => true), step("c", () => true)], ctx);
    expect(asked.filter((q) => q.includes("Press Enter for the next step"))).toHaveLength(3);
  });

  it("after a command that didn't fix it, offers try again / skip / quit", async () => {
    const { ctx, printed } = fakeContext(["", "echo fix", "s"]);
    const result = await runSteps([step("stubborn", () => false)], ctx);
    expect(printed.some((l) => l.includes("✗ Still not done: stubborn missing"))).toBe(true);
    expect(result.marks).toEqual(["skipped"]);
  });
});

describe("the course steps", () => {
  const steps = courseSteps();
  const byTitle = (title: string) => steps.find((s) => s.title === title)!;
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: "" });

  it("has the 15 steps in order", () => {
    expect(steps.map((s) => s.title)).toEqual([
      "Node 22 or newer",
      "git installed",
      "git knows who you are",
      "GitHub CLI (gh)",
      "Signed in to GitHub",
      "git signs in with that account",
      "ChatGPT account and the student offer",
      "Your fork of the starter repo",
      "Your fork on this laptop",
      "upstream remote",
      "The work branch, on GitHub",
      "VS Code, with the code command",
      "Codex CLI, signed in",
      "Course dependencies",
      "npm run doctor",
    ]);
  });

  it("the first look (peek) never asks a question", async () => {
    const { ctx, asked } = fakeContext([], (argv) => (argv[0] === "gh" ? ok("ada") : null));
    for (const s of steps) await s.check(ctx, true);
    expect(asked).toEqual([]);
  });

  it("asks whether the signed-in GitHub account is the right one", async () => {
    const { ctx } = fakeContext(["n"], (argv) => (argv.join(" ") === "gh api user --jq .login" ? ok("bob") : null));
    expect(await byTitle("Signed in to GitHub").check(ctx)).toEqual({ done: false, found: "signed in as bob, but that's not the one" });
  });

  it("fills in the student's username in the clone command", async () => {
    const { ctx } = fakeContext([]);
    ctx.state = { login: "ada", parent: "/Users/ada/code" };
    const clone = byTitle("Your fork on this laptop").plan(ctx)[1];
    expect(clone.kind === "command" && clone.command.display).toBe("gh repo clone ada/netsim-starter netsim");
    expect(clone.kind === "command" && clone.command.cwd).toBe("/Users/ada/code");
  });

  it("does the work branch one command at a time", () => {
    const { ctx } = fakeContext([]);
    const plan = byTitle("The work branch, on GitHub").plan(ctx);
    expect(plan.map((a) => (a.kind === "command" ? a.command.display : "prompt"))).toEqual([
      "git fetch upstream",
      "git switch -c work upstream/week-1-start",
      "git push -u origin work",
    ]);
  });

  it("uses winget on Windows and puts Homebrew first on a Mac without it", () => {
    const { ctx } = fakeContext([]);
    const gh = byTitle("GitHub CLI (gh)");
    expect(gh.plan({ ...ctx, platform: "windows" }).map((a) => a.kind === "command" && a.command.display)).toEqual(["winget install --id GitHub.cli -e"]);
    const mac = gh.plan(ctx).map((a) => a.kind === "command" && a.command.display);
    expect(mac[0]).toContain("Homebrew/install");
  });

  it("the upstream check accepts the starter in any URL form", async () => {
    const { ctx } = fakeContext([], (argv) => (argv.includes("get-url") ? ok("git@github.com:praiseisaac/netsim-starter.git") : null));
    expect((await byTitle("upstream remote").check(ctx)).done).toBe(true);
  });
});

describe("typing commands", () => {
  it("normalizes spaces and quotes", () => {
    expect(normalizeCommand(`  git  config --global user.name  'Ada L' `)).toBe('git config --global user.name "Ada L"');
  });

  it("finds the first difference", () => {
    expect(firstDifference("gh auth", "gh auth")).toBe(-1);
    expect(firstDifference("gh auht", "gh auth")).toBe(5);
    expect(mismatchMessage("gh auht", "gh auth").split("\n")[2]).toBe(`${" ".repeat(13 + 5)}^ first difference`);
  });
});

it("setup.mjs and the doctor read remote URLs the same way", () => {
  for (const url of [
    "https://github.com/ada/netsim.git",
    "https://ada@github.com/ada/netsim/",
    "git@github.com:ada/netsim.git",
    "ssh://git@github.com:22/ada/netsim.git",
    "github-ada:ada/netsim",
    "../starter.git",
  ]) {
    const a = setupParseRemote(url);
    const b = doctorParseRemote(url);
    expect(a && { owner: a.owner, repo: a.repo }, url).toEqual(b && { owner: b.owner, repo: b.repo });
  }
});

it("the fork step only counts a real fork, not the starter itself", async () => {
  const fork = courseSteps().find((s) => s.title === "Your fork of the starter repo")!;
  const answer = (isFork: boolean) => () => ({ code: 0, stdout: `ada/netsim-starter ${isFork}`, stderr: "" });
  const run = async (isFork: boolean) => {
    const ctx = { state: { login: "ada" }, capture: answer(isFork) } as unknown as Parameters<typeof fork.check>[0];
    return fork.check(ctx);
  };
  expect((await run(true)).done).toBe(true);
  expect(await run(false)).toEqual({ done: false, found: "github.com/ada/netsim-starter isn't a fork of praiseisaac/netsim-starter" });
});

describe("reading answers", () => {
  const streams = async () => {
    const { PassThrough } = await import("node:stream");
    const input = new PassThrough();
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk: Buffer) => (written += chunk.toString()));
    return { input, output, written: () => written };
  };

  it("keeps lines typed ahead (or piped in) for the next questions, in order", async () => {
    const { input, output } = await streams();
    const reader = lineReader(input, output, () => {});
    input.write("first\nsecond\n");
    await new Promise((resolve) => setImmediate(resolve));
    expect(await reader.ask("1? ")).toBe("first");
    expect(await reader.ask("2? ")).toBe("second");
    const third = reader.ask("3? ");
    input.write("third\n");
    expect(await third).toBe("third");
    reader.close();
  });

  it("ends cleanly when the input closes mid-run, instead of hanging", async () => {
    const { input, output } = await streams();
    let ended = 0;
    const reader = lineReader(input, output, () => ended++);
    input.write("only answer\n");
    input.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(await reader.ask("1? ")).toBe("only answer");
    void reader.ask("2? "); // no more input: onEnd is called
    expect(ended).toBe(1);
  });

  it("ends cleanly when the input closes while a question is waiting", async () => {
    const { input, output } = await streams();
    let ended = 0;
    const reader = lineReader(input, output, () => ended++);
    void reader.ask("waiting? ");
    input.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(ended).toBe(1);
  });
});
