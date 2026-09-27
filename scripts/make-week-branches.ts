// `npm run weeks -- [options]`: build the student branches from the reference solution on netsim.
//
//   (no options)          build week-1-start ... week-8-start as local branches
//   --from <ref>          where the solution comes from (default: netsim, or origin/netsim if
//                         there is no local netsim; --verify defaults to HEAD, the code you have)
//   --week N              rebuild only weeks N..8 (after a fix on netsim, mid-course). Branches
//                         that already exist only move forward, so the push is a fast-forward
//   --solution N          also build week-N-solution (regions of weeks 1..N filled in)
//   --verify              for every week N check, in a temporary copy:
//                           weeks < N filled, week N stubbed  -> only week-N tests fail
//                           weeks <= N filled                 -> every test passes
//   --typecheck           with --verify, also run tsc on every generated tree
//   --push <remote>       push every branch this run covered that the remote is behind on
//                         (never force-pushes); says "nothing to push" when it is up to date
//
// Nothing here touches your working tree: trees are built in a temp directory and committed
// with git plumbing. See "Repository model" in docs/COURSE-PLAN.md.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkUniqueIds, findRegions, isRegionFile, readRef, renderFile, type Fill, type Region } from "./lib/regions";

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8];
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim();

function git(args: string[], env: Record<string, string> = {}, cwd = root): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

function pad(week: number): string {
  return String(week).padStart(2, "0");
}

// ── Reading the solution ────────────────────────────────────────────────────────────

type Source = { files: Map<string, string>; regions: Region[]; base: string };

function readSource(ref: string): Source {
  const files = readRef(ref, root);
  const regions = [...files].filter(([file]) => isRegionFile(file)).flatMap(([file, text]) => findRegions(file, text));
  checkUniqueIds(regions);
  return { files, regions, base: git(["rev-parse", ref]) };
}

/** A week's tree: region fill decided by `fill`, only tests and guides up to `week`. */
function buildTree(source: Source, week: number, fill: Fill): Map<string, string> {
  const tree = new Map<string, string>();
  for (const [file, text] of source.files) {
    const weekDir = /^(?:tests\/week-|docs\/weeks\/week-)(\d\d)/.exec(file);
    if (weekDir && Number(weekDir[1]) > week) continue;
    if (file === "course.json") {
      // `week` stays alone on the first line, and the unchanging `note` keeps it apart from the
      // fields students edit (like `peripheral`), so merging next week's branch never conflicts.
      const course = JSON.parse(text) as Record<string, unknown>;
      tree.set(file, `${JSON.stringify({ ...course, week }, null, 2)}\n`);
      continue;
    }
    tree.set(file, isRegionFile(file) ? renderFile(file, text, fill) : text);
  }
  return tree;
}

function writeTree(tree: Map<string, string>, dir: string): void {
  for (const [file, text] of tree) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
}

// ── Committing without touching the working tree ──────────────────────────

/** Store a tree in the object database and return its id. */
function writeTreeObject(tree: Map<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "netsim-tree-"));
  const work = join(dir, "tree");
  try {
    writeTree(tree, work);
    const env = { GIT_DIR: gitDir, GIT_INDEX_FILE: join(dir, ".index"), GIT_WORK_TREE: work };
    git(["add", "-A", "--", "."], env, work);
    return git(["write-tree"], env, work);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function existingBranch(name: string): string | null {
  try {
    return git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
  } catch {
    return null;
  }
}

function isAncestor(ancestor: string, of: string): boolean {
  try {
    git(["merge-base", "--is-ancestor", ancestor, of]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Point `branch` at `tree`, only ever moving it forward:
 * - if the branch exists, the new commit's first parent is its current tip (so a push is a
 *   fast-forward, never a force), and `previous` becomes a second parent when it isn't already
 *   in its history (so students who merged the rebuilt previous week still merge cleanly);
 * - if the tree didn't change, the branch is left alone.
 * Returns the branch's (possibly unchanged) tip.
 */
function publish(branch: string, tree: Map<string, string>, previous: string | null, message: string): { tip: string; changed: boolean } {
  const treeId = writeTreeObject(tree);
  const existing = existingBranch(branch);
  if (existing && git(["rev-parse", `${existing}^{tree}`]) === treeId && (!previous || isAncestor(previous, existing))) {
    return { tip: existing, changed: false };
  }
  const parents = existing ? [existing, ...(previous && !isAncestor(previous, existing) ? [previous] : [])] : previous ? [previous] : [];
  const commit = git(["commit-tree", treeId, "-m", message, ...parents.flatMap((p) => ["-p", p])]);
  git(["update-ref", `refs/heads/${branch}`, commit]);
  return { tip: commit, changed: true };
}

// ── Verifying ───────────────────────────────────────────────────────────────

type TestRun = { failedFiles: string[]; typeErrors: string };

function run(command: string, args: string[], cwd: string): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout }));
  });
}

async function runTests(tree: Map<string, string>, typecheck: boolean): Promise<TestRun> {
  // realpath: on macOS the temp dir is a symlink, and Vitest reports the resolved path.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "netsim-verify-")));
  try {
    writeTree(tree, dir);
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
    const report = join(dir, "vitest.json");
    await run("npx", ["vitest", "run", "--reporter=json", `--outputFile=${report}`], dir);
    const result = JSON.parse(readFileSync(report, "utf8")) as { testResults: Array<{ name: string; status: string }> };
    const failedFiles = result.testResults.filter((t) => t.status !== "passed").map((t) => t.name.slice(dir.length + 1));
    let typeErrors = "";
    if (typecheck) {
      const tsc = await run("npx", ["tsc", "--noEmit", "--incremental", "false"], dir);
      if (tsc.status !== 0) typeErrors = tsc.stdout;
    }
    return { failedFiles, typeErrors };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Run jobs a few at a time; each vitest run is mostly waiting on sockets and timers. */
async function pool<T>(jobs: Array<() => Promise<T>>, size: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
  return results;
}

async function verify(source: Source, typecheck: boolean): Promise<boolean> {
  const jobs = WEEKS.flatMap((week) => [
    // Student view at the start of the week, assuming earlier weeks are done...
    () => runTests(buildTree(source, week, (r) => (r.week < week ? "solution" : "stub")), typecheck),
    // ...and at the end of the week.
    () => runTests(buildTree(source, week, (r) => (r.week <= week ? "solution" : "stub")), typecheck),
  ]);
  const results = await pool(jobs, Math.max(2, Math.floor(availableParallelism() / 2)));

  let allGood = true;
  const report = (good: boolean, text: string) => {
    console.log(`${good ? "✓" : "✗"} ${text}`);
    if (!good) allGood = false;
  };
  for (const [i, week] of WEEKS.entries()) {
    const start = results[i * 2];
    const end = results[i * 2 + 1];
    const outsideWeek = start.failedFiles.filter((f) => !f.startsWith(`tests/week-${pad(week)}/`));
    report(outsideWeek.length === 0, `week ${week} start: no test outside week ${week} fails${outsideWeek.length ? ` (failing: ${outsideWeek.join(", ")})` : ""}`);
    if (source.regions.some((r) => r.week === week)) {
      report(start.failedFiles.length > 0, `week ${week} start: week ${week}'s tests fail until its regions are done`);
    }
    if (start.typeErrors) report(false, `week ${week} start: type errors\n${start.typeErrors}`);
    report(end.failedFiles.length === 0, `week ${week} done: every test passes${end.failedFiles.length ? ` (failing: ${end.failedFiles.join(", ")})` : ""}`);
    if (end.typeErrors) report(false, `week ${week} done: type errors\n${end.typeErrors}`);
  }
  return allGood;
}

// ── Pushing ─────────────────────────────────────────────────────────────────

/** Push the branches the remote doesn't already have at the same commit (never forced). */
function pushBranches(remote: string, branches: readonly string[]): void {
  const remoteTips = new Map(
    git(["ls-remote", "--heads", remote])
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split(/\s+/);
        return [ref.replace("refs/heads/", ""), sha] as const;
      }),
  );
  const behind = branches.filter((b) => remoteTips.get(b) !== git(["rev-parse", `refs/heads/${b}`]));
  if (behind.length === 0) {
    console.log(`nothing to push: ${remote} already has ${branches.join(", ")}`);
    return;
  }
  git(["push", remote, ...behind.map((b) => `refs/heads/${b}:refs/heads/${b}`)]);
  console.log(`pushed to ${remote}: ${behind.join(", ")}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function defaultRef(): string {
  if (process.argv.includes("--verify") && !process.argv.includes("--build")) return "HEAD";
  for (const ref of ["netsim", "origin/netsim"]) {
    try {
      git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return ref;
    } catch {
      // try the next one
    }
  }
  throw new Error("no netsim branch here; pass --from <ref> (e.g. --from HEAD)");
}

const sourceRef = option("--from") ?? defaultRef();
const source = readSource(sourceRef);
console.log(`solution: ${sourceRef} (${source.base.slice(0, 7)})`);
console.log(`${source.regions.length} @student regions in ${new Set(source.regions.map((r) => r.file)).size} files`);
for (const week of WEEKS) {
  const regions = source.regions.filter((r) => r.week === week);
  console.log(`  week ${week}: ${regions.map((r) => `${r.id}${r.part === "home" ? "*" : ""}`).join(", ") || "-"}`);
}
console.log("  (* = take-home)");

if (process.argv.includes("--verify")) {
  const ok = await verify(source, process.argv.includes("--typecheck"));
  if (!ok) process.exit(1);
}

if (!process.argv.includes("--verify") || process.argv.includes("--build")) {
  const fromWeek = Number(option("--week") ?? 1);
  const from = source.base.slice(0, 7);
  /** Every branch this run covered, changed or not: that is what --push sends. */
  const covered: string[] = [];
  let previous = fromWeek > 1 ? existingBranch(`week-${fromWeek - 1}-start`) : null;
  if (fromWeek > 1 && !previous) throw new Error(`--week ${fromWeek} needs an existing week-${fromWeek - 1}-start`);
  for (const week of WEEKS.filter((w) => w >= fromWeek)) {
    const branch = `week-${week}-start`;
    const result = publish(branch, buildTree(source, week, () => "stub"), previous, `[PD]: Week ${week} starter\n\nGenerated from ${from} by scripts/make-week-branches.ts.`);
    console.log(`${result.changed ? "updated" : "unchanged"} ${branch}`);
    covered.push(branch);
    previous = result.tip;
  }

  const solution = option("--solution");
  if (solution) {
    const week = Number(solution);
    const branch = `week-${week}-solution`;
    const tree = buildTree(source, week, (r) => (r.week <= week ? "solution" : "stub"));
    const result = publish(branch, tree, existingBranch(`week-${week}-start`), `[PD]: Week ${week} reference solution\n\nGenerated from ${from}.`);
    console.log(`${result.changed ? "updated" : "unchanged"} ${branch}`);
    covered.push(branch);
  }

  const remote = option("--push");
  if (remote) pushBranches(remote, covered);
}
