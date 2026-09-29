// setup.mjs, driven with scripted keypresses and a fake laptop: nothing is installed or run
// for real, and nothing touches the network.
import { readFileSync } from "node:fs";
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
    id: title,
    title,
    technical: title,
    explain: `what ${title} means`,
    example: `${title} ok`,
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
  const byId = (id: string) => steps.find((s) => s.id === id)!;
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: "" });
  const displays = (plan: ReturnType<(typeof steps)[number]["plan"]>, ctx: Parameters<(typeof steps)[number]["plan"]>[0]) =>
    plan.map((a) => (a.kind === "command" || a.kind === "auto" ? (typeof a.command === "function" ? a.command(ctx) : a.command).display : a.kind));

  it("has the 15 steps of the spec, in order", () => {
    expect(steps.map((s) => s.title)).toEqual([
      "Is Node installed?",
      "Is git installed?",
      "Who should your work be signed by?",
      "Install the GitHub tool",
      "Sign in to GitHub",
      "Let git use that sign-in",
      "ChatGPT and the student offer",
      "Make your own copy of the course",
      "Download it to this laptop",
      "Connect it to the course",
      "Make your work branch",
      "Put your branch on GitHub",
      "Install VS Code",
      "Install and sign in to Codex",
      "Get the course's packages, then check everything",
    ]);
    expect(steps.filter((s) => s.optional).map((s) => s.id)).toEqual(["chatgpt", "vscode"]);
    expect(steps.filter((s) => s.diagram).map((s) => s.id)).toEqual(["fork", "clone", "upstream", "work", "push"]);
    expect(new Set(steps.map((s) => s.id)).size).toBe(15);
  });

  it("the week-1 guide lists the same steps, in the same order", () => {
    const guide = readFileSync("docs/weeks/week-01.md", "utf8");
    const list = guide.split("**The steps**, exactly as the studio shows them:")[1].trim().split("\n\n")[0];
    expect(list.split("\n")).toEqual(steps.map((s, i) => `${i + 1}. ${s.title}${s.optional ? " (optional)" : ""}`));
  });

  it("the macOS notes on Codex's first run only show on a Mac", () => {
    const { ctx } = fakeContext([]);
    const version = (platform: "mac" | "windows") => {
      const plan = byId("codex").plan({ ...ctx, platform });
      const a = plan.find((x) => x.kind === "auto");
      return a?.kind === "auto" ? a.command : null;
    };
    expect(version("mac")?.note).toContain("macOS");
    expect(version("windows")?.note).toBeUndefined();
    expect(version("windows")?.slowNote).toBeUndefined();
  });

  it("every step explains its technical name and why it matters", () => {
    for (const s of steps) {
      expect(s.technical, s.id).toBeTruthy();
      expect(s.explain.length, s.id).toBeGreaterThan(10);
      expect(s.why.length, s.id).toBeGreaterThan(10);
    }
  });

  it("checks never ask a question: they only look", async () => {
    const { ctx, asked } = fakeContext([], (argv) => (argv[0] === "gh" ? ok("ada") : null));
    for (const s of steps) await s.check(ctx);
    expect(asked).toEqual([]);
  });

  it("asks whether the signed-in GitHub account is the right one, and remembers a yes", async () => {
    const { ctx } = fakeContext([], (argv) => (argv.join(" ") === "gh api user --jq .login" ? ok("bob") : null));
    const login = byId("gh-login");
    expect(await login.check(ctx)).toEqual({ done: false, found: "Signed in to GitHub as bob.", ask: "Is bob the GitHub account you'll use for this course?" });
    login.confirm!(ctx, false);
    expect((await login.check(ctx)).done).toBe(false);
    login.confirm!(ctx, true);
    expect(await login.check(ctx)).toEqual({ done: true, found: "You're signed in to GitHub as bob." });
  });

  it("forks without cloning (the studio answers gh's clone question with No)", () => {
    const { ctx } = fakeContext([]);
    const [fork] = byId("fork").plan(ctx);
    expect(fork.kind === "command" && typeof fork.command !== "function" && fork.command).toMatchObject({
      display: "gh repo fork praiseisaac/netsim-starter",
      argv: ["gh", "repo", "fork", "praiseisaac/netsim-starter", "--clone=false"],
    });
  });

  it("asks for a folder, then fills in the student's username in the clone command", () => {
    const { ctx } = fakeContext([]);
    ctx.state = { login: "ada" } as typeof ctx.state;
    const [folder, clone] = byId("clone").plan(ctx);
    expect(folder.kind).toBe("folder");
    if (folder.kind !== "folder") return;
    (ctx as unknown as { isDir: () => boolean }).isDir = () => true;
    expect(folder.submit(ctx, "/Users/ada/code")).toBeNull();
    const command = clone.kind === "command" && typeof clone.command === "function" ? clone.command(ctx) : null;
    expect(command?.display).toBe("gh repo clone ada/netsim-starter netsim");
    expect(command?.cwd).toBe("/Users/ada/code");
  });

  it("step 10 has nothing to type once gh linked upstream: the studio makes it fetch every week, then fetches", () => {
    const { ctx } = fakeContext([], (argv) => (argv.includes("get-url") ? ok("https://github.com/praiseisaac/netsim-starter.git") : null));
    const plan = byId("upstream").plan(ctx);
    expect(displays(plan, ctx)).toEqual(['git remote set-branches upstream "*"', "git fetch upstream"]);
    expect(plan.map((a) => a.kind)).toEqual(["auto", "auto"]);
    expect(plan[0].kind === "auto" && plan[0].command.argv).toEqual(["git", "remote", "set-branches", "upstream", "*"]);
  });

  /** A course folder whose upstream is the starter, fetching `refspec`, with week 1 fetched. */
  const upstreamLaptop = (refspec: string) =>
    fakeContext([], (argv) =>
      argv.includes("get-url")
        ? ok("git@github.com:praiseisaac/netsim-starter.git")
        : argv.join(" ") === "git config --get-all remote.upstream.fetch"
          ? ok(`${refspec}\n`)
          : argv.includes("--verify")
            ? ok("abc123")
            : null,
    ).ctx;

  it("the upstream check accepts the starter in any URL form, once every week is fetched", async () => {
    expect((await byId("upstream").check(upstreamLaptop("+refs/heads/*:refs/remotes/upstream/*"))).done).toBe(true);
  });

  it("upstream linked for one branch only (how gh repo clone leaves a fork) isn't done: week 2 would never arrive", async () => {
    expect(await byId("upstream").check(upstreamLaptop("+refs/heads/week-1-start:refs/remotes/upstream/week-1-start"))).toEqual({
      done: false,
      found: "upstream is linked, but only for some of the course's branches.",
    });
  });

  it("step 6 isn't done just because git has osxkeychain: only gh's helper for github.com counts", async () => {
    const git = (answers: Record<string, string>) => fakeContext([], (argv) => (argv.join(" ") in answers ? ok(answers[argv.join(" ")]) : null)).ctx;
    const helper = byId("git-helper");
    // Apple's and Homebrew's git: a general osxkeychain helper, and nothing from gh.
    expect((await helper.check(git({ "git config --global --get-all credential.helper": "osxkeychain" }))).done).toBe(false);
    expect(displays(helper.plan(git({})), git({}))).toEqual(["gh auth setup-git"]);
    // After `gh auth setup-git`.
    const withGh = git({ "git config --global --get-all credential.helper": "osxkeychain", "git config --global --get-all credential.https://github.com.helper": "\n!/opt/homebrew/bin/gh auth git-credential" });
    expect(await helper.check(withGh)).toEqual({ done: true, found: "git signs in to GitHub with your gh account." });
  });

  it("the work branch and the push are one typed command each", () => {
    const { ctx } = fakeContext([]);
    expect(displays(byId("work").plan(ctx), ctx)).toEqual(["git switch -c work upstream/week-1-start"]);
    expect(displays(byId("push").plan(ctx), ctx)).toEqual(["git push -u origin work"]);
  });

  it("Codex is installed, started once where you can see it, then signed in (in the browser)", () => {
    const { ctx } = fakeContext([]);
    const plan = byId("codex").plan(ctx);
    expect(displays(plan, ctx)).toEqual(["npm install -g @openai/codex", "codex --version", "codex login"]);
    const [, version, login] = plan.map((a) => (a.kind === "command" || a.kind === "auto") && typeof a.command !== "function" ? a.command : null);
    expect(plan[1].kind).toBe("auto");
    expect(version?.note).toContain("macOS is checking Codex before its first run");
    expect(version?.slowNote).toContain("click Open");
    expect(version?.timeoutMs).toBeGreaterThanOrEqual(10 * 60_000);
    expect(login?.waitFor).toBe("browser");
    // Every codex the studio starts skips the update check.
    for (const c of [version, login]) expect(c?.argv.slice(1, 3)).toEqual(["-c", "check_for_update_on_startup=false"]);
    version?.record?.(ctx, "codex-cli 0.158.0\n");
    expect(ctx.state).toMatchObject({ codexVersion: "0.158.0" });
  });

  it("the Codex check never runs codex (its first run can wait minutes for macOS)", async () => {
    const ran: string[][] = [];
    const { ctx } = fakeContext([], (argv) => {
      ran.push(argv);
      return null;
    });
    await byId("codex").check(ctx);
    byId("codex").plan(ctx);
    expect(ran.filter((argv) => argv[0] === "codex")).toEqual([]);
  });

  it("the last step installs the packages, then passes only when the doctor says all 8 checks passed", () => {
    const { ctx } = fakeContext([]);
    const plan = byId("doctor").plan(ctx);
    expect(displays(plan, ctx)).toEqual(["npm install", "npm run doctor"]);
    const doctor = plan[1].kind === "command" && typeof plan[1].command !== "function" ? plan[1].command : null;
    expect(doctor?.judge?.({ code: 0, stdout: "  ✓ Node\ndoctor: all 8 checks passed", stderr: "" }).done).toBe(true);
    expect(doctor?.judge?.({ code: 1, stdout: "  ✗ on the 'work' branch\ndoctor: 7 of 8 checks passed", stderr: "" })).toEqual({
      done: false,
      found: "Still failing: ✗ on the 'work' branch",
    });
  });

  it("uses winget on Windows and puts Homebrew first on a Mac without it", () => {
    const { ctx } = fakeContext([]);
    const gh = byId("gh");
    expect(displays(gh.plan({ ...ctx, platform: "windows" }), ctx)).toEqual(["winget install --id GitHub.cli -e"]);
    const mac = gh.plan(ctx);
    expect(displays(mac, ctx)[0]).toContain("Homebrew/install");
    expect(mac[0].kind === "command" && typeof mac[0].command !== "function" && mac[0].command.waitFor).toBe("terminal");
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
  const fork = courseSteps().find((s) => s.id === "fork")!;
  const answer = (isFork: boolean) => () => ({ code: 0, stdout: `ada/netsim-starter ${isFork}`, stderr: "" });
  const run = async (isFork: boolean) => {
    const ctx = { state: { login: "ada" }, capture: answer(isFork) } as unknown as Parameters<typeof fork.check>[0];
    return fork.check(ctx);
  };
  expect((await run(true)).done).toBe(true);
  expect(await run(false)).toEqual({ done: false, found: "github.com/ada/netsim-starter isn't a fork of praiseisaac/netsim-starter." });
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
