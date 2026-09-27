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

Fridays, 2–3 hours per session. Each week has an **in-class build** (together, live) and a
**take-home portion** (on your own or in a pair).

| Week | Topic | You build |
|---|---|---|
| 1 | [Introduction & System Roles](docs/weeks/week-01.md) | The handshake every component uses to join the bus |
| 2 | [Message Protocols](docs/weeks/week-02.md) | Message validation, request/reply, the Memory component |
| 3 | [Component FSM Logic](docs/weeks/week-03.md) | Instruction decoding and the CPU core's fetch–decode–execute state machine |
| 4 | [System Integration](docs/weeks/week-04.md) | The CPU on the bus, the tick barrier, a round-robin scheduler |
| 5 | [React Flow Visualization](docs/weeks/week-05.md) | Dashboard nodes; the LED peripheral end to end |
| 6 | [Timing & Interrupt Simulation](docs/weeks/week-06.md) | Interrupts, the Timer, a sensor of your choice, the bus watchdog |
| 7 | [Polish & Documentation](docs/weeks/week-07.md) | Save/restore the whole machine; diagrams generated from your code |
| 8 | [Final Demo & Reflection](docs/weeks/week-08.md) | Your own program, live, on your own computer |

Each week's guide has the goals, what to read before class, the in-class steps, the take-home
with its acceptance criteria, the exact commands that work that week, and the questions you'll
answer at the start of the next session.

**Prerequisites:** loops and functions, basic Node.js and TypeScript, git basics (clone,
commit, push), and a rough idea of what a CPU, memory and I/O are for.

### Using AI

You may use AI tools. What's graded is whether you understand the hardware idea and your own
code: each week ends with a short **explain-it-back** conversation, without notes or AI, where
you walk through what you built. Every week guide has a "Using AI this week" box saying what's
fine to ask and what you must be able to explain yourself. A good rule: if you can't explain a
line, you don't have it yet.

## Getting started (week 1)

You'll need **Node.js 22+** (`node --version`) and **git**.

1. **Fork** the course starter repo on GitHub (your instructor will share the link), then:

   ```bash
   git clone https://github.com/<you>/<starter-repo>.git netsim
   cd netsim
   git remote add upstream https://github.com/<instructor>/<starter-repo>.git
   git fetch upstream
   git switch -c work upstream/week-1-start   # your branch for the whole course
   git push -u origin work
   npm install
   ```

   All your work for the whole course goes on `work`. Every week you merge the new week into
   it; you never switch branches.

2. Check it works:

   ```bash
   npm run bus                    # the bus, on ws://localhost:3006 (leave it running)
   npx vitest tests/week-01       # this week's tests: they fail until you write the code
   ```

3. Open [docs/weeks/week-01.md](docs/weeks/week-01.md) and follow along.

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
npm run bus                          # just the bus (week 1+)
npm run hello                        # week 1: say hello to the bus (HELLO_ID=you)
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
