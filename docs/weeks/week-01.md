# Week 1: Setup & System Roles

This week is about getting ready. By the end of it you'll have every tool installed, your own
copy of the course code on your laptop, an AI coding assistant that knows the course rules, and a picture
in your head of the computer you're going to build. You'll also watch the finished computer run
on the projector: by week 8, the one on your screen will be yours.

No code to write this week. If you already have everything installed, the setup goes fast and
you can help a neighbour.

## Goals

- **Hardware idea:** a computer is a few parts with different jobs. The **CPU** runs
  instructions, **memory** stores bytes, **I/O devices** (buttons, LEDs, timers) connect it to
  the world. They talk over shared wires, the **bus**, and they move in step with a **clock**.
- **Software idea:** a working setup is part of the job: a runtime (**Node.js**), version
  control (**git** + **GitHub**), an editor (**VS Code**), and a project you can install and
  check with one command (`npm install`, `npm run doctor`). And an AI tool you use to *learn*,
  not to hand in work you can't explain.

## Before class

Do as much of the checklist below as you can at home, on the laptop you'll bring every week.
Anything you get stuck on, we finish in class. At minimum, before you arrive:

1. Create your **GitHub account** (step A1) and send your username to the instructor, so they
   can find your fork (that's where your work is graded).
2. Create your **ChatGPT account** (step A2). Claiming the student offer can take a day if
   verification needs documents, so start early.
3. Charge your laptop and make sure you have ~5 GB free disk space.

## The setup checklist

Work through the sections in order. Each step says how to check it worked. Where macOS and
Windows differ, both are given. (Linux users: follow the macOS steps with your package manager.)

### A. Accounts

**A1. GitHub.** Sign up at [github.com](https://github.com) (free). Use a username you're happy
to show on a CV. Then:

- Turn on two-factor authentication (Settings → Password and authentication). GitHub requires
  it for most accounts anyway.
- Send your username to the instructor, so they can find your fork.
- Optional, recommended: apply for the [GitHub Student Developer Pack](https://education.github.com/pack)
  with your school email. It includes GitHub Copilot for free, which is the course's fallback AI
  tool (see A2).

✅ **Check:** you can sign in, and you can open the course starter repo,
[github.com/praiseisaac/netsim-starter](https://github.com/praiseisaac/netsim-starter).

**A2. ChatGPT and the student offer.** The course's AI tool is **Codex**, which comes with a
ChatGPT account.

1. Sign up at [chatgpt.com](https://chatgpt.com) (free), ideally with your school email.
2. If you're a student at a US college or university, claim the student offer at
   [chatgpt.com/students](https://chatgpt.com/students): **4 months of ChatGPT Plus free**,
   which includes Codex. You verify you're a student through **SheerID** (school sign-in,
   enrollment record, or an uploaded document). **Claim it by October 31, 2026**; after that
   the offer closes.
3. There's also a separate **Codex for university students** credit offer at
   [chatgpt.com/codex/students](https://chatgpt.com/codex/students). Claim it too if you're
   eligible.
4. After the 4 free months, Plus renews as a paid subscription unless you cancel (Settings →
   Account → Manage subscription). Put a reminder in your calendar now.

**If SheerID verification fails:** try the school sign-in option first; if that doesn't work,
upload a document that shows your name, your school and the current term (a class schedule or
enrollment letter works; a student ID without a date often doesn't). You can retry. If it still
fails, tell the instructor and use the fallback: **GitHub Copilot**, free with the GitHub
Student Developer Pack (A1), which also works in VS Code. Everything in this course works with
the free ChatGPT plan or Copilot; the offer just gives you more Codex use.

✅ **Check:** you can sign in at chatgpt.com.

### B. Tools

**B1. Node.js 22 or newer.** Node runs all of this course's code.

- **macOS:** download the **LTS** installer (22 or newer) from
  [nodejs.org](https://nodejs.org) and run it. (If you already use Homebrew: `brew install node`.)
- **Windows:** download the **LTS** Windows installer (`.msi`) from
  [nodejs.org](https://nodejs.org) and run it with the defaults. Leave "Automatically install
  the necessary tools" unticked; you don't need it.

Close and reopen your terminal (macOS: **Terminal**; Windows: **PowerShell**), then:

```bash
node --version   # v22.x or higher
npm --version
```

**B2. git.**

- **macOS:** run `git --version`. If git isn't installed, macOS offers to install the
  "command line developer tools": say **Install**, wait, then run it again.
- **Windows:** download **Git for Windows** from [git-scm.com](https://git-scm.com) and install
  it with the defaults. It includes **Git Credential Manager**, which handles signing in to
  GitHub for you.

Then tell git who you are (use the email of your GitHub account):

```bash
git config --global user.name "Ada Lovelace"
git config --global user.email "you@example.com"
```

✅ **Check:** `git --version` prints a version; `git config user.name` prints your name.

**B3. Signing in to GitHub from the terminal.** You'll push your work to your fork, so git
needs to know it's you.

- **Easiest on both systems:** install the **GitHub CLI** ([cli.github.com](https://cli.github.com);
  macOS `brew install gh`, Windows the `.msi` installer), then run `gh auth login`, choose
  **GitHub.com → HTTPS → Login with a web browser**, and follow the prompts.
- **Windows alternative:** skip `gh`; the first `git push` opens a GitHub sign-in window (Git
  Credential Manager).

✅ **Check:** `gh auth status` says you're logged in (if you installed `gh`).

**B4. VS Code.** Download from [code.visualstudio.com](https://code.visualstudio.com) and
install.

- **macOS:** drag it into Applications. Then open VS Code, press **Cmd+Shift+P**, run **Shell
  Command: Install 'code' command in PATH**, so `code .` opens a folder from the terminal.
- **Windows:** keep **"Add to PATH"** ticked in the installer.

✅ **Check:** `code --version` prints a version (restart the terminal first).

**B5. Codex.** Two parts: the command-line tool and the VS Code extension. Both sign in with
your ChatGPT account.

```bash
npm install -g @openai/codex
codex --version
```

On macOS, if `npm install -g` fails with a permission error, run it again with the standalone
installer from the [Codex CLI docs](https://learn.chatgpt.com/docs/codex/cli) instead. On
Windows, if the npm install fails or `codex` isn't found afterwards, use the Windows install
option on the same page. Don't spend more than 10 minutes on it: the VS Code extension is
enough to do this week's exercise.

Then in VS Code: **Extensions** (the squares icon) → search **Codex** → install **Codex**
by OpenAI (id `openai.chatgpt`). Open it from the side bar and choose **Sign in with ChatGPT**.

Run `codex` once in any folder and choose **Sign in with ChatGPT** there too. Press Ctrl+C to
quit.

✅ **Check:** `codex --version` prints a version, and the Codex panel in VS Code answers a
question like "what is a WebSocket?".

### C. The course code

**C1. Fork the starter repo.** On GitHub, open the course starter repo,
[github.com/praiseisaac/netsim-starter](https://github.com/praiseisaac/netsim-starter), click
**Fork**, and create the fork under your own account (the defaults are fine).

Your fork is **public**, like the starter repo: anyone, including your classmates, can see what
you push. That's normal on GitHub, and a public repo can go on your CV. It also means copying is
easy, which is why every week's grade depends on explaining your own work without notes or AI.

**C2. Clone your fork, connect it to the course, and make your `work` branch.** In the terminal,
go to the folder where you keep projects, then:

```bash
git clone https://github.com/<you>/netsim-starter.git netsim
cd netsim
git remote add upstream https://github.com/praiseisaac/netsim-starter.git
git fetch upstream
git switch -c work upstream/week-1-start   # your branch for the whole course
git push -u origin work
```

- `origin` is **your fork**: where you push your work, and what gets graded.
- `upstream` is **the course repo**: where each new week comes from.
- `work` is **the one branch you'll use all course**. Every week you merge the new week into
  it; you never switch branches.

✅ **Check:** `git remote -v` shows both `origin` (your fork) and `upstream` (the course), and
`git branch --show-current` prints `work`.

**C3. Install and run the doctor.**

```bash
npm install
npm run doctor
```

`npm run doctor` checks everything above in one go and prints one line per check: ✓ passed,
✗ failed (with a `→` hint underneath saying how to fix it), or ! a warning you can ignore. The
seven checks are:

1. Node 22 or newer
2. git knows who you are
3. on the 'work' branch
4. 'upstream' remote set
5. origin is your fork
6. dependencies installed
7. Codex CLI installed

plus a warning-only check for VS Code's `code` command. Fix whatever is ✗ and run it again
until the last line says:

```
doctor: all 7 checks passed
```

✅ **Check:** the last line is `doctor: all 7 checks passed`. Open the project in VS Code:
`code .`

## In class

1. **Setup clinic** (first hour). Finish the checklist, in pairs. When you're green, help the
   pair next to you. Put a green sticky note on your laptop when `npm run doctor` passes, a pink
   one if you're stuck.

2. **System roles, unplugged.** Five volunteers play CLOCK, CPU, MEMORY, BUTTON and LED. Memory
   holds four index cards (addresses 0–3). The clock says "tick", and nobody may act between
   ticks. The CPU asks for card 0 by saying it out loud *to the bus* (the instructor), never
   straight to Memory. Then the button gets pressed mid-tick… Everyone else draws the system as
   it happens. Questions we'll answer together:
   - Who owns time? Why not let everyone keep their own clock?
   - What does the bus know about CPUs? (Nothing. It just carries messages.)
   - When the button is pressed in the middle of a tick, when does the CPU find out?

3. **Watch the real thing.** The instructor runs the finished computer on the projector: the
   bus, the CPU with two cores, memory, a button, an LED, and the dashboard drawing every message
   live. Match each box on screen to a role from the activity. Watch a `mem.read` go out and a
   `mem.data` come back, and press the button.

4. **Map the code.** In VS Code, open [ARCHITECTURE.md](../ARCHITECTURE.md) at "The big picture"
   and "File layout". Find each part from the activity in the file tree: which folder is the
   bus? Where will the CPU's logic live? Where does the dashboard live?

5. **First Codex session, with the rules on.** Open the Codex panel and ask:
   *"What is this project, and what am I supposed to do in week 1?"* It answers from the course
   files, including `AGENTS.md` (see "Using Codex in this course" below). Then ask it to
   "write the handshake in components/client.ts" (that's next week's work; don't keep what it
   writes). Notice that it asks you how you want to approach it, or offers you two options,
   before it writes anything. That's the course's rule: **you decide the design, Codex can do the
   typing.**

## Take-home

Due before next session.

1. **Finish setup.** `npm run doctor` all green on the laptop you'll bring every week.
2. **Write your week-1 notes** in `docs/notes/week-01.md`. The file is there with three
   headings, each with a `<!-- TODO(week 1, …) -->` comment under it. Write under each heading
   (you can delete the comment; comments don't count toward anything):
   - **`## npm run doctor output`:** paste everything it prints inside a ```` ```text ````
     block, ending with `doctor: all 7 checks passed`.
   - **`## Codex: what bus/server.ts does`:** ask Codex to explain `bus/server.ts` to you (ask
     follow-up questions too). Then close the chat and write, **in your own words**, what the
     bus does: who connects to it, what it does on each tick, and why it waits before starting
     the next tick. At least 60 words.
   - **`## One thing I checked myself`:** pick one thing Codex told you and check it by
     reading the code yourself. Say what the claim was, where in `bus/server.ts` you found the
     answer (a function name or line), and whether Codex was right.
3. **Commit and push your `work` branch.**

   ```bash
   git add -A
   git commit -m "week 1: setup and notes"
   git push
   ```

### Acceptance criteria

- [ ] `npm run doctor` ends with `doctor: all 7 checks passed` on your laptop.
- [ ] `npx vitest run tests/week-01` passes. `setup.test.ts` checks your notes are really
      filled in: the doctor output, your own summary, and the thing you checked.
- [ ] Your summary is in your own words: you could say the same thing out loud, without notes.
- [ ] `work` is pushed to your fork (check on GitHub that your commit is there).

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `npm install` | installs the project's packages | ✅ |
| `npm run doctor` | checks your setup: 7 checks, one line each, `→` hints for failures | ✅ |
| `npx vitest run tests/week-01` | this week's test (your notes) | ✅ once your notes are written |
| `npm run bus` | starts the bus on port 3006 (Ctrl+C to stop) | ✅ it runs; nothing connects yet |
| `npm run hello`, `npm run component -- …`, `npm run dev:all` | the parts you build later | ❌ from week 2 onwards |

Tests that gate this week (`tests/week-01/`):

- `setup.test.ts`, four tests. It fails on a fresh copy of the course until you've done the
  setup and written your notes:
  - *runs on Node 22 or newer*
  - *has the npm run doctor output pasted in, with every check passing*
  - *explains bus/server.ts in your own words (60+ words)*
  - *says one thing you checked yourself*

## Explain it back

At the start of next session you'll have a short conversation with the instructor, no notes
and no AI. Be ready to:

1. **Draw the system on paper**: bus, clock, CPU, memory, a couple of devices, the dashboard.
   Say what each one's job is.
2. **Why does the bus hold the clock** instead of each component keeping its own time?
3. **Explain `bus/server.ts` in your own words**, the way you wrote it in your notes. Then
   answer one follow-up question about it.
4. **Show your setup:** `origin` vs `upstream` vs `work`. Where do new weeks come from, and
   where does your work go?

## Using Codex in this course

You're allowed, and encouraged, to use Codex, including to write code for the `TODO(week N, …)`
regions. The rule is: **Codex can help with the writing, but you guide the design.** You decide
what to build, how it's structured and which approach to take; Codex types it and explains it;
you make sure you understand every line before you keep it.

**What `AGENTS.md` makes it do.** Your copy of the course has an `AGENTS.md` file at the top.
Codex reads it automatically and follows it:

- Before writing code, it **asks how you want to approach it**, or offers two short options with
  the trade-off, and lets you choose. It doesn't pick for you.
- It **follows your design**, even if it would have done it differently. If it sees a real
  problem, it says so and you decide.
- It **explains what it wrote**, including the hardware idea behind it, and asks you to run the
  tests.
- It **never edits the tests** to make them pass.
- It leaves the **own-words sections of your notes** (like "Codex: what bus/server.ts does") to
  you: those check *your* understanding.

**Good ways to use Codex:**

- "I want to do this with a Map from id to callback. Write it that way and explain each line."
- "Give me two ways to structure this, with the trade-off, and I'll pick."
- "This test fails with this error. What is it telling me?"
- "Walk me through what you just wrote, line by line. Why this and not that?"
- "Quiz me on this week's ideas before my explain-it-back."

**What you must do yourself:** make the design decisions (the approach, the structure, what
goes where), and be able to explain every line you keep: what it does, why it's there, and the
hardware idea behind it. If Codex writes something you can't explain yet, don't keep it until
you can: ask it to walk you through it, or rewrite it your way.

**Why explain-it-back is no-AI.** Each week's work is checked in a short conversation at the
next session, without notes or AI, where you explain your code and the design choices you made.
That's what's graded, together with the tests. Codex can write code with you; it can't
understand it *for* you. A good rule: if you can't explain a line, you don't have it yet.

| Fine to ask Codex this week | You must be able to explain yourself |
|---|---|
| "How do I install Node 22 on Windows?" | What `origin`, `upstream` and `work` are for |
| "Explain what `bus/server.ts` does" | What the bus does, in your own words |
| "What does this `npm run doctor` error mean?" | Why the bus owns the clock |
| "What is a WebSocket?" | What each part of the system is for |

## Stretch

- Run `npm run bus` in one terminal and `npx vitest tests/week-02` in another. Read the failing
  test names: that's next week's work.
- Read ARCHITECTURE.md's "A clock tick, step by step" diagram. Which messages in it did you see
  on the projector today?
- Ask Codex to quiz you with five questions about the big picture. Answer them without looking.
