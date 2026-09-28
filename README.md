# NetSim: build a computer out of messages

NetSim is a small simulated computer (a dual-core 8-bit CPU, 1 KB of memory, and devices like
buttons, timers, LEDs and sensors) where every part is a separate program talking over a
WebSocket **bus** in step with a shared **clock**. A live dashboard draws every part and every
message as it happens.

It is also an 8-week course. Each week you build one piece of it, and each piece runs on the
pieces you built before. By week 8 the computer on the screen is one you wrote.

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React Flow](https://img.shields.io/badge/React%20Flow-12-purple)
![Vitest](https://img.shields.io/badge/tests-Vitest-yellow)

## The course

I'm Praise Daramola, and I teach this course: Mondays, 1 hour per session. Each week has an
**in-class build** (together, live) and a **take-home portion** (on your own or in a pair).

| Week | Topic | You build |
|---|---|---|
| 1 | [Setup & System Roles](docs/weeks/week-01.md) | Your accounts, tools and copy of the code; the parts of a computer and their jobs |
| 2 | [Connecting & Message Protocols](docs/weeks/week-02.md) | The handshake every component uses to join the bus, message validation, request/reply, the Memory component |
| 3 | [Component FSM Logic](docs/weeks/week-03.md) | Instruction decoding and the CPU core's fetch–decode–execute state machine |
| 4 | [System Integration](docs/weeks/week-04.md) | The CPU on the bus, the tick barrier, a round-robin scheduler |
| 5 | [React Flow Visualization](docs/weeks/week-05.md) | Dashboard nodes; the LED peripheral end to end |
| 6 | [Timing & Interrupt Simulation](docs/weeks/week-06.md) | Interrupts, the Timer, a sensor of your choice, the bus watchdog |
| 7 | [Polish & Documentation](docs/weeks/week-07.md) | Save/restore the whole machine; diagrams generated from your code |
| 8 | [Final Demo & Reflection](docs/weeks/week-08.md) | Your own program, live, on your own computer |

Each week's guide has the goals, what to read before class, the in-class steps, the take-home
with its acceptance criteria, the exact commands that work that week, and the explain-it-back
questions you'll answer before the next session.

**Prerequisites:** loops and functions, basic Node.js and TypeScript, git basics (clone,
commit, push), and a rough idea of what a CPU, memory and I/O are for.

### Using AI: Codex

The course's AI tool is **Codex** (from ChatGPT); GitHub Copilot is the fallback. US college
students can get ChatGPT Plus, which includes Codex, free for 4 months: week 1 shows how to
claim it (by October 31, 2026).

Codex may write code with you, including in the `TODO(week N, …)` regions, but **you guide the
design**: you decide the approach and the structure, and Codex does the typing. Your copy of the
course has an `AGENTS.md` that makes Codex ask how you want to approach something (or offer two
options) before it writes, follow your design, explain what it wrote, and never edit the tests.
What's graded is whether you understand the hardware idea and your own code: each week's work is
checked in a short **explain-it-back** with me before the next session, **without notes or AI**:
a booked 5-minute slot, or a 3-minute video (your face and your screen) answering two questions
I post after class. You walk through what you built and why. I may also ask one or two people
live at the start of class. A good rule: if you can't explain a line,
you don't have it yet.

## Getting started (week 1)

Week 1 is all setup, and [its guide](docs/weeks/week-01.md) walks through it. You make a
GitHub account and a ChatGPT account (and claim the student offer) and install **Node.js 22+**
by hand; then a guided setup tool does the rest, one step at a time, with you typing each
command:

```bash
# macOS
curl -fsSL https://raw.githubusercontent.com/praiseisaac/netsim-starter/week-1-start/setup.mjs -o setup.mjs && node setup.mjs
```

```powershell
# Windows (PowerShell). Not yet tried on a real Windows machine: tell me how it goes.
irm https://raw.githubusercontent.com/praiseisaac/netsim-starter/week-1-start/setup.mjs -OutFile setup.mjs; node setup.mjs
```

It installs git, the GitHub CLI, VS Code and Codex, signs you in, forks the course, clones your
fork into a `netsim` folder, makes your `work` branch, installs the packages, and ends with
`npm run doctor`. Rerun it any time (inside the course folder: `npm run setup`). If it doesn't
work for you, the week-1 guide has the same steps by hand.

All your work for the whole course goes on `work`. Every week you merge the new week into it;
you never switch branches.

**Every week after that**, before class, on your `work` branch:

```bash
git fetch upstream
git merge upstream/week-N-start      # N = this week's number
npm install
```

That merge only adds the new week's tests and guide, so it won't conflict with your code.

## How the code is laid out

```
core/         Pure logic: ISA, assembler, CPU core FSM, scheduler, interrupts, memory
protocol/     Every message on the wire (zod schemas + types), the memory map
bus/          The bus server: routing, clock, tick barrier; save/restore
components/   The programs that join the bus: client, CPU, memory, peripherals
programs/     Demo programs in assembly (*.asm)
app/          The dashboard (Next.js + React Flow)
tests/        week-01 … week-08, one folder per week
docs/         ARCHITECTURE.md, COURSE-PLAN.md, weeks/
```

Places you'll write code are marked with `TODO(week N, …)` comments. Each one names the test
that checks it and the week guide that explains it.

## Running it

Which of these work depends on the week: parts that later weeks build throw a clear `todo`
error until you get there. Your week guide lists exactly what works.

```bash
npm run setup                        # week 1: the guided setup (rerun any time)
npm run doctor                       # week 1: check your setup
npm run bus                          # just the bus
npm run hello                        # week 2: say hello to the bus (HELLO_ID=you)
npm run component -- memory cpu host # components (memory: week 2+, cpu: week 4+; LOG=1 prints all traffic)
npm run dev:all                      # bus + memory + cpu + host + dashboard at http://localhost:3005 (week 4+)
npm run demo                         # load the demo programs and peripherals, start the clock
npm run asm -- programs/countdown.asm            # assemble and print a listing (week 3+)
npx vitest                           # tests in watch mode (only weeks up to course.json's week)
npx vitest run tests/week-03         # one week's tests, once
npm run fsm:export                   # write docs/diagrams/*.md from the transition tables (week 7)
npm run course:catch-up -- 3         # copy the published week-3 solution into your regions
```

## Read more

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the map of the whole system: the message
  protocol, a clock tick step by step, the instruction set, every state machine
- [docs/COURSE-PLAN.md](docs/COURSE-PLAN.md): how the weeks fit together and how the week
  branches are made
- [docs/weeks/](docs/weeks/): one guide per week

## License

MIT
