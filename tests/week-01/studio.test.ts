// The week-1 studio (node setup.mjs): its command line, the gate in front of every command, and the
// local server's checks. Nothing is installed or run for real: commands go to a fake laptop.
import { request } from "node:http";
import { describe, expect, it } from "vitest";
import {
  checkRequest,
  cleanOutput,
  courseSteps,
  createStudio,
  enterAction,
  lastLine,
  lineComplete,
  lineKey,
  linePaste,
  lineStart,
  makeStyle,
  pasteAllowed,
  serveStudio,
  studioPage,
} from "@/setup.mjs";

type Line = ReturnType<typeof lineStart>;
const typeAll = (line: Line, text: string) => [...text].reduce(lineKey, line);

describe("the command line", () => {
  it("starts empty, with the whole command still to type", () => {
    expect(lineStart("gh auth login")).toEqual({ expected: "gh auth login", typed: "", wrong: "" });
  });

  it("takes matching characters one at a time", () => {
    const line = typeAll(lineStart("gh auth login"), "gh au");
    expect(line.typed).toBe("gh au");
    expect(lineComplete(line)).toBe(false);
  });

  it("holds a wrong character in red and blocks until Backspace", () => {
    let line = typeAll(lineStart("gh auth login"), "gh ax");
    expect(line).toMatchObject({ typed: "gh a", wrong: "x" });
    line = typeAll(line, "uth"); // blocked: nothing more goes in
    expect(line).toMatchObject({ typed: "gh a", wrong: "x" });
    line = lineKey(line, "Backspace");
    expect(line).toMatchObject({ typed: "gh a", wrong: "" });
    line = typeAll(line, "uth login");
    expect(lineComplete(line)).toBe(true);
  });

  it("Backspace with nothing wrong removes the last good character", () => {
    expect(lineKey(typeAll(lineStart("git"), "gi"), "Backspace").typed).toBe("g");
    expect(lineKey(lineStart("git"), "Backspace").typed).toBe("");
  });

  it("a character past the end is wrong, so Run only shows for the exact command", () => {
    const line = typeAll(lineStart("npm install"), "npm install ");
    expect(line.wrong).toBe(" ");
    expect(lineComplete(line)).toBe(false);
  });

  it("treats ' and \" as the same", () => {
    expect(lineComplete(typeAll(lineStart('git config "x"'), "git config 'x'"))).toBe(true);
  });

  it("ignores keys that aren't characters", () => {
    const line = lineStart("git");
    expect(lineKey(line, "Shift")).toBe(line);
    expect(lineKey(line, "ArrowLeft")).toBe(line);
  });

  it("refuses paste for short commands, and allows it for ones over 50 characters", () => {
    expect(pasteAllowed("gh repo fork praiseisaac/netsim-starter")).toBe(false);
    expect(linePaste(lineStart("gh auth login"), "gh auth login")).toEqual({ line: lineStart("gh auth login"), blocked: true });
    const long = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
    expect(pasteAllowed(long)).toBe(true);
    const pasted = linePaste(lineStart(long), `${long}\n`);
    expect(pasted.blocked).toBe(false);
    expect(lineComplete(pasted.line)).toBe(true);
  });

  it("Enter runs only a complete command, and moves on from every other state", () => {
    expect(enterAction("ready", "command", false)).toBeNull();
    expect(enterAction("ready", "command", true)).toBe("run");
    expect(enterAction("passed", "", false)).toBe("next");
    expect(enterAction("failed", "", false)).toBe("retry");
    expect(enterAction("waiting", "command", false)).toBe("recheck");
    expect(enterAction("confirm", "", false)).toBe("yes");
    expect(enterAction("running", "command", true)).toBeNull();
    expect(enterAction("checking", "", true)).toBeNull();
  });

  it("output: colours stripped, progress bars keep their last state, the summary is the last line", () => {
    const text = cleanOutput("\x1b[32mstarting\x1b[0m\r\nprogress 10%\rprogress 100%\ndone: 3 packages\n\n");
    expect(text).toBe("starting\nprogress 100%\ndone: 3 packages\n\n");
    expect(lastLine(text)).toBe("done: 3 packages");
  });

  it("the page carries the same functions (it's one file, so the browser gets a copy)", () => {
    const page = studioPage("TOKEN123");
    for (const fn of ["function lineKey", "function linePaste", "function lineComplete", "function enterAction", "function pasteAllowed"]) expect(page).toContain(fn);
    expect(page).toContain('"TOKEN123"');
    expect(page).toContain('name="referrer" content="no-referrer"');
  });
});

// ── The studio with a fake laptop ──────────────────────────────────────────

type Result = { code: number; stdout: string; stderr: string };

/** A laptop where things become "installed" when their command runs. */
function fakeLaptop() {
  const installed = new Set<string>(["node"]);
  const streamed: string[][] = [];
  const executed: string[][] = [];
  const say = (stdout: string): Result => ({ code: 0, stdout, stderr: "" });
  const ctx = {
    platform: "mac" as const,
    cwd: "/Users/ada",
    dryRun: false,
    color: false,
    style: makeStyle(false),
    capture: (argv: string[]): Result | null => {
      const line = argv.join(" ");
      if (line === "git --version") return installed.has("git") ? say("git version 2.50") : null;
      if (line.startsWith("git config --global user.")) return installed.has("identity") ? say("Ada") : { code: 1, stdout: "", stderr: "" };
      if (line === "gh --version") return installed.has("gh") ? say("gh version 2.80") : null;
      return null;
    },
    execute: (argv: string[]) => {
      executed.push(argv);
      if (argv.join(" ").startsWith("git config --global user.email")) installed.add("identity");
      return 0;
    },
    stream: (argv: string[], _cwd: string | undefined, onData: (text: string) => void) => {
      streamed.push(argv);
      onData(`ran ${argv.join(" ")}\n`);
      if (argv.join(" ").endsWith("brew install git")) installed.add("git");
      return { done: Promise.resolve(argv.includes("fail") ? 1 : 0), kill: () => {} };
    },
    ask: async () => "",
    print: () => {},
    exists: (path: string) => path === "/opt/homebrew/bin/brew",
    readText: () => null,
    state: {},
  };
  return { ctx, streamed, executed, installed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

async function studioAt(stepIndex = 0) {
  const laptop = fakeLaptop();
  const studio = createStudio(laptop.ctx, courseSteps());
  await studio.start();
  await settle();
  for (let i = 0; i < stepIndex; i++) {
    const snap = studio.snapshot();
    expect(snap.view?.phase).toBe("passed");
    await studio.act({ type: "next", stepId: snap.steps[snap.current].id });
    await settle();
  }
  return { studio, ...laptop };
}

describe("the studio's command gate", () => {
  it("walks the steps in order: step 1 is already done, step 2 waits for its command", async () => {
    const { studio } = await studioAt(1);
    const snap = studio.snapshot();
    expect(snap.total).toBe(15);
    expect(snap.current).toBe(1);
    expect(snap.steps[0].mark).toBe("done");
    expect(snap.view?.phase).toBe("ready");
    expect(snap.view?.actions[0]).toMatchObject({ kind: "command", display: "brew install git", pasteOk: false });
  });

  it("runs the planned command once the typed text matches, then re-checks", async () => {
    const { studio, streamed } = await studioAt(1);
    const result = await studio.act({ type: "run", stepId: "git", index: 0, typed: "brew install git" });
    expect(result.ok).toBe(true);
    await settle();
    expect(streamed).toEqual([["/opt/homebrew/bin/brew", "install", "git"]]);
    expect(studio.snapshot().view?.phase).toBe("passed");
    expect(studio.snapshot().steps[1].found).toBe("git version 2.50 is installed.");
    expect(studio.output().text).toContain("ran /opt/homebrew/bin/brew install git");
  });

  it("refuses a command whose typed text doesn't match, and runs nothing", async () => {
    const { studio, streamed } = await studioAt(1);
    for (const typed of ["rm -rf ~", "brew install gi", "brew install git; rm -rf ~", ""]) {
      expect(await studio.act({ type: "run", stepId: "git", index: 0, typed })).toMatchObject({ ok: false, status: 400 });
    }
    expect(await studio.act({ type: "run", stepId: "git", index: 0 })).toMatchObject({ ok: false });
    expect(streamed).toEqual([]);
  });

  it("only the current step's planned command: another step, another index, or a raw argv are refused", async () => {
    const { studio, streamed } = await studioAt(1);
    expect(await studio.act({ type: "run", stepId: "gh", index: 0, typed: "brew install gh" })).toMatchObject({ ok: false, status: 409 });
    expect(await studio.act({ type: "run", stepId: "git", index: 1, typed: "brew install git" })).toMatchObject({ ok: false, status: 409 });
    expect(await studio.act({ type: "run", stepId: "git", index: 0, typed: "brew install git", argv: ["rm", "-rf", "/"] } as never)).toMatchObject({ ok: true });
    await settle();
    expect(streamed).toEqual([["/opt/homebrew/bin/brew", "install", "git"]]); // the plan's argv, never the browser's
  });

  it("steps can't be done early: next is refused until the step passes, and skip only works on optional steps", async () => {
    const { studio } = await studioAt(1);
    expect(await studio.act({ type: "next", stepId: "git" })).toMatchObject({ ok: false, status: 409 });
    expect(await studio.act({ type: "skip", stepId: "git" })).toMatchObject({ ok: false, status: 409 });
    expect(await studio.act({ type: "next", stepId: "identity" })).toMatchObject({ ok: false, status: 409 });
    expect(studio.snapshot().current).toBe(1);
  });

  it("the identity form runs git config with the answers (as arguments, never through a shell)", async () => {
    const { studio, executed } = await studioAt(1);
    await studio.act({ type: "run", stepId: "git", index: 0, typed: "brew install git" });
    await settle();
    await studio.act({ type: "next", stepId: "git" });
    await settle();
    expect(studio.snapshot().view?.actions[0].kind).toBe("form");
    await studio.act({ type: "submit", stepId: "identity", index: 0, values: { name: "Ada", email: "nope" } });
    expect(studio.snapshot().view?.formError).toBe("That doesn't look like an email address.");
    expect(executed).toEqual([]);
    await studio.act({ type: "submit", stepId: "identity", index: 0, values: { name: "Ada $(whoami)", email: "ada@example.com" } });
    expect(executed).toEqual([
      ["git", "config", "--global", "user.name", "Ada $(whoami)"],
      ["git", "config", "--global", "user.email", "ada@example.com"],
    ]);
    const snap = studio.snapshot();
    expect(snap.view?.phase).toBe("passed");
    expect(snap.steps[2].ran).toEqual(['git config --global user.name "Ada $(whoami)"', 'git config --global user.email "ada@example.com"']);
  });
});

describe("the studio's local server", () => {
  const studio = { port: 4567, token: "a".repeat(32) };
  const base = { method: "GET", host: "127.0.0.1:4567", token: "a".repeat(32) };

  it("accepts the studio's own page", () => {
    expect(checkRequest(base, studio)).toBeNull();
    expect(checkRequest({ ...base, host: "localhost:4567" }, studio)).toBeNull();
    expect(checkRequest({ ...base, method: "POST", origin: "http://127.0.0.1:4567" }, studio)).toBeNull();
  });

  it("needs the token", () => {
    expect(checkRequest({ ...base, token: null }, studio)?.reason).toBe("wrong token");
    expect(checkRequest({ ...base, token: "b".repeat(32) }, studio)?.reason).toBe("wrong token");
    expect(checkRequest({ ...base, token: "a" }, studio)?.reason).toBe("wrong token");
  });

  it("rejects another site (Origin) and another host name (DNS rebinding)", () => {
    expect(checkRequest({ ...base, method: "POST", origin: "https://evil.example" }, studio)?.reason).toBe("wrong origin");
    expect(checkRequest({ ...base, method: "POST", origin: "http://127.0.0.1:9999" }, studio)?.reason).toBe("wrong origin");
    expect(checkRequest({ ...base, method: "POST" }, studio)?.reason).toBe("no origin");
    expect(checkRequest({ ...base, host: "evil.example:4567" }, studio)?.reason).toBe("wrong host");
    expect(checkRequest({ ...base, host: undefined }, studio)?.reason).toBe("wrong host");
  });

  it("over HTTP: only 127.0.0.1, token required, wrong Origin refused, and a good action goes through", async () => {
    const { studio: s, streamed } = await studioAt(1);
    const server = await serveStudio(s, { token: "t".repeat(32) });
    const call = (path: string, { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port: server.port, path, method, headers }, (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
        });
        req.on("error", reject);
        req.end(body);
      });
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=t{32}$/);
      expect((await call("/")).status).toBe(403);
      expect((await call(`/?t=${"x".repeat(32)}`)).status).toBe(403);
      const page = await call(`/?t=${"t".repeat(32)}`);
      expect(page.status).toBe(200);
      expect(page.body).toContain("NetSim Studio");

      const run = JSON.stringify({ type: "run", stepId: "git", index: 0, typed: "brew install git" });
      const good = { "x-studio-token": "t".repeat(32), origin: `http://127.0.0.1:${server.port}` };
      expect((await call("/api/act", { method: "POST", headers: { ...good, origin: "https://evil.example" }, body: run })).status).toBe(403);
      expect((await call("/api/act", { method: "POST", headers: { origin: good.origin }, body: run })).status).toBe(403);
      expect((await call("/api/act", { method: "POST", headers: { ...good, host: "evil.example" }, body: run })).status).toBe(403);
      expect(streamed).toEqual([]);
      expect((await call("/api/act", { method: "POST", headers: good, body: run })).status).toBe(200);
      await settle();
      expect(streamed).toEqual([["/opt/homebrew/bin/brew", "install", "git"]]);
    } finally {
      server.close();
    }
  });

  it("stops by itself once the page has been gone a while (the tab was closed)", async () => {
    const { studio: s } = await studioAt(0);
    let idle = 0;
    const server = await serveStudio(s, { token: "t".repeat(32), idleMs: 50, onIdle: () => idle++ });
    try {
      await new Promise<void>((resolve) => {
        const req = request({ host: "127.0.0.1", port: server.port, path: `/events?t=${"t".repeat(32)}` }, (res) => {
          res.once("data", () => {
            req.destroy(); // the tab closes
            resolve();
          });
        });
        req.end();
      });
      await new Promise((resolve) => setTimeout(resolve, 2_600));
      expect(idle).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});

describe("a slow command", () => {
  it("shows its note while running, and stops with the slow hint after its time limit", async () => {
    const { ctx } = fakeLaptop();
    let killed = 0;
    ctx.stream = () => ({ done: new Promise<number>((resolve) => (ctx as unknown as { finish: (c: number) => void }).finish = resolve), kill: () => (killed++, (ctx as unknown as { finish: (c: number) => void }).finish(143)) });
    const step = {
      id: "slow",
      title: "Slow",
      technical: "slow",
      explain: "a slow one",
      why: "to test",
      example: "done",
      check: async () => ({ done: false, found: "not yet" }),
      plan: () => [{ kind: "auto" as const, command: { display: "codex --version", argv: ["codex", "--version"], note: "macOS is checking Codex", slowNote: "Look for a macOS dialog about codex and click Open.", timeoutMs: 30 } }],
      hint: () => "hint",
    };
    const studio = createStudio(ctx, [step]);
    void studio.start();
    await settle();
    expect(studio.snapshot().view).toMatchObject({ phase: "running", note: "macOS is checking Codex" });
    expect(studio.snapshot().view?.startedAt).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(killed).toBe(1);
    expect(studio.snapshot().view).toMatchObject({ phase: "failed", error: { what: "`codex --version` didn't finish within 0 minutes.", fix: "Look for a macOS dialog about codex and click Open." } });
  });
});

describe("review fixes", () => {
  const HOMEBREW = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

  it("after the Homebrew installer, the step moves on to brew install with a fresh command line", async () => {
    const laptop = fakeLaptop();
    let brewInstalled = false;
    const ctx = {
      ...laptop.ctx,
      exists: (path: string) => brewInstalled && path === "/opt/homebrew/bin/brew",
      openTerminal: () => {},
    };
    const gh = courseSteps().find((s) => s.id === "gh")!;
    const studio = createStudio(ctx, [gh]);
    await studio.start();
    await settle();
    let snap = studio.snapshot();
    expect(snap.view?.actions[0]).toMatchObject({ display: HOMEBREW, waitFor: "terminal", pasteOk: true });
    const before = snap.view!.attempt;
    await studio.act({ type: "run", stepId: "gh", index: 0, typed: HOMEBREW });
    await settle();
    expect(studio.snapshot().view?.phase).toBe("waiting");

    await studio.act({ type: "recheck", stepId: "gh" }); // back too early: still waiting
    expect(studio.snapshot().view).toMatchObject({ phase: "waiting", note: "Not finished yet: gh isn't installed yet." });

    brewInstalled = true; // the installer finished in Terminal
    await studio.act({ type: "recheck", stepId: "gh" });
    snap = studio.snapshot();
    expect(snap.view).toMatchObject({ phase: "ready", index: 0 });
    expect(snap.view!.attempt).toBeGreaterThan(before); // the page starts a new command line
    expect(snap.view?.actions[0].display).toBe("brew install gh");
    expect(await studio.act({ type: "run", stepId: "gh", index: 0, typed: HOMEBREW })).toMatchObject({ ok: false, status: 400 });
    expect(await studio.act({ type: "run", stepId: "gh", index: 0, typed: "brew install gh" })).toMatchObject({ ok: true });
    await settle();
    expect(laptop.streamed.at(-1)).toEqual(["/opt/homebrew/bin/brew", "install", "gh"]);
  });

  it("Switch account starts a new attempt, so gh auth login is typed again from the start", async () => {
    const laptop = fakeLaptop();
    const ctx = { ...laptop.ctx, capture: (argv: string[]) => (argv.join(" ") === "gh api user --jq .login" ? { code: 0, stdout: "bob", stderr: "" } : null) };
    const login = courseSteps().find((s) => s.id === "gh-login")!;
    const studio = createStudio(ctx, [login]);
    await studio.start();
    await settle();
    expect(studio.snapshot().view).toMatchObject({ phase: "confirm", ask: "Is bob the GitHub account you'll use for this course?" });
    const before = studio.snapshot().view!.attempt;
    await studio.act({ type: "confirm", stepId: "gh-login", answer: "switch" });
    expect(studio.snapshot().view).toMatchObject({ phase: "ready" });
    expect(studio.snapshot().view!.attempt).toBeGreaterThan(before);
    expect(studio.snapshot().view?.actions[0].display).toBe("gh auth login");
  });

  it("after typing gh auth login and answering Yes, the step isn't 'already done'", async () => {
    const laptop = fakeLaptop();
    let signedIn = false;
    const ctx = {
      ...laptop.ctx,
      capture: (argv: string[]) => (argv.join(" ") === "gh api user --jq .login" && signedIn ? { code: 0, stdout: "ada", stderr: "" } : null),
      stream: (argv: string[], _cwd: string | undefined, onData: (text: string) => void) => {
        signedIn = true;
        onData("✓ Logged in as ada\n");
        return { done: Promise.resolve(0), kill: () => {} };
      },
    };
    const login = courseSteps().find((s) => s.id === "gh-login")!;
    const studio = createStudio(ctx, [login]);
    await studio.start();
    await settle();
    await studio.act({ type: "run", stepId: "gh-login", index: 0, typed: "gh auth login" });
    await settle();
    expect(studio.snapshot().view?.phase).toBe("confirm");
    await studio.act({ type: "confirm", stepId: "gh-login", answer: "yes" });
    expect(studio.snapshot().view).toMatchObject({ phase: "passed", already: false });
    expect(studio.snapshot().steps[0].found).toBe("You're signed in to GitHub as ada.");
  });

  it("a browser sign-in that's still running can be started again (the tab was closed)", async () => {
    const laptop = fakeLaptop();
    let killed = 0;
    const ctx = { ...laptop.ctx, stream: () => ({ done: new Promise<number>(() => {}), kill: () => killed++ }) };
    const login = courseSteps().find((s) => s.id === "gh-login")!;
    const studio = createStudio(ctx, [login]);
    await studio.start();
    await settle();
    await studio.act({ type: "run", stepId: "gh-login", index: 0, typed: "gh auth login" });
    expect(studio.snapshot().view).toMatchObject({ phase: "running", waitFor: "browser" });
    expect(await studio.act({ type: "retry", stepId: "gh-login" })).toMatchObject({ ok: true });
    await settle();
    expect(killed).toBe(1);
    expect(studio.snapshot().view).toMatchObject({ phase: "ready" });
  });

  it("a running command that isn't a browser sign-in can't be interrupted by retry", async () => {
    const laptop = fakeLaptop();
    const ctx = { ...laptop.ctx, stream: () => ({ done: new Promise<number>(() => {}), kill: () => {} }) };
    const studio = createStudio(ctx, courseSteps());
    await studio.start();
    await settle();
    await studio.act({ type: "next", stepId: "node" });
    await settle();
    await studio.act({ type: "run", stepId: "git", index: 0, typed: "brew install git" });
    expect(await studio.act({ type: "retry", stepId: "git" })).toMatchObject({ ok: false, status: 409 });
  });

  it("step 10's preview has nothing to type, and no preview lists what the studio runs itself", () => {
    const { ctx } = fakeLaptop();
    const snap = createStudio(ctx, courseSteps()).snapshot();
    const byId = (id: string) => snap.steps.find((s) => s.id === id)!;
    expect(byId("upstream").preview).toEqual([]);
    expect(byId("codex").preview).toEqual(["npm install -g @openai/codex", "codex login"]);
  });
});

it("doing a step again starts its list of 'the studio ran' afresh", async () => {
  const { studio } = await studioAt(1);
  await studio.act({ type: "run", stepId: "git", index: 0, typed: "brew install git" });
  await settle();
  await studio.act({ type: "next", stepId: "git" });
  await settle();
  await studio.act({ type: "submit", stepId: "identity", index: 0, values: { name: "Ada", email: "ada@example.com" } });
  expect(studio.snapshot().steps[2].ran).toHaveLength(2);
  await studio.act({ type: "next", stepId: "identity" });
  await settle();
  await studio.act({ type: "back", stepId: studio.snapshot().steps[3].id, to: 3 });
  await settle();
  expect(studio.snapshot().current).toBe(2);
  expect(studio.snapshot().steps[2].ran).toEqual([]);
});
