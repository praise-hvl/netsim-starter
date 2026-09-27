# Week 1: Introduction & System Roles

By the end of today your code will be talking to a computer that lives on the classroom
projector. By the end of the course, the computer on that screen will be one you built.

## Goals

- **Hardware idea:** a computer is a few parts with different jobs. The **CPU** runs
  instructions, **memory** stores bytes, **I/O devices** (buttons, LEDs, timers) connect it to the
  world. They talk over shared wires, the **bus**, and they move in step with a **clock**.
- **Software idea:** two programs talking over a **WebSocket** by sending **JSON messages**;
  `async`/`await` for "wait until the other side answers"; a **handshake** (`hello` → `welcome`)
  so both sides agree on who is who before anything else happens.

## Before class

1. Install Node.js 22 or newer (`node --version`) and git (`git --version`).
2. Create a GitHub account if you don't have one.
3. Read [ARCHITECTURE.md](../ARCHITECTURE.md), **"The big picture"** and **"The message
   protocol → Envelope"** only (about 10 minutes). Don't worry about the rest yet.
4. Write down one question about how a real CPU talks to memory. Bring it.

## In class: build the handshake

You'll work in `components/client.ts`. Every component in this course (CPU, memory, every
peripheral, the dashboard) joins the bus through `connect()`, and the first thing `connect()`
does is the `handshake()` you write today, so it matters.

1. **Fork and clone.** Fork the course starter repo on GitHub, then:

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

   ✅ **Checkpoint:** `cat course.json` prints `{ "week": 1 }`.

2. **Run the bus on your own machine.**

   ```bash
   npm run bus
   ```

   It prints the address it's listening on (`ws://localhost:3006`). Leave it running in its own
   terminal. The bus is already written: it's infrastructure, like the physical wires on a
   motherboard.

3. **Run the week's tests and watch them fail.**

   ```bash
   npx vitest tests/week-01
   ```

   ✅ **Checkpoint:** you see `handshake.test.ts` failing with an error that starts
   `week 1: connect`. That's the `todo()` stub telling you where to work. Leave Vitest running in
   watch mode; it re-runs every time you save.

4. **Read the stub.** Open `components/client.ts` and find `// TODO(week 1, handshake)` inside
   `handshake(socket, options)`. Read its signature, the `hello` and `welcome` schemas in
   `protocol/messages.ts`, and the place in `connect()` that calls it. With your
   neighbour, answer: what goes in, what comes out, and what does the caller get back?

5. **Wait for the socket to open** (together on the projector). `connect()` already created the
   `WebSocket` for the bus URL; `handshake()` returns a `Promise` that settles later, so listen
   for the socket's `open` event inside it.

6. **Send `hello`** once it's open. Every message has the envelope fields from ARCHITECTURE.md
   (`type`, `from`, `to`, `id`, `tick`, `payload`); `envelope(type, from, to, payload, { id,
   tick })` in `protocol/messages.ts` builds one and makes TypeScript check the payload against
   the type. For a first `hello` the tick is 0, `to` is `"bus"`, and the payload is your `role`
   and `label`. Send it as JSON.

7. **Wait for `welcome`.** Listen for incoming messages, parse them with `parseMessage`, and
   resolve with the `welcome` message when it arrives. If the bus answers `error` instead (say,
   your id is already taken), reject with that message. If the socket errors, reject too.

   ✅ **Checkpoint:** `handshake.test.ts` passes.

8. **Join the class bus.** Open `scripts/hello.ts` and find `TODO(week 1, hello-script)` inside
   `hello(options)`. Finishing it is take-home, but start it now with just enough to connect,
   print one line and hand back the client:

   ```ts
   const print = options.print ?? console.log;
   const client = await connect({ id: options.id, role: "peripheral", kind: "hello", label: `Hello from ${options.id}`, url: options.url });
   print(`connected as ${options.id} at tick ${client.tick}`);
   return client;
   ```

   (The bottom of the file already reads `HELLO_ID` and calls `hello()` when you run it.)

   Stop your local bus, then point at the instructor's bus (the address is on the board). Use
   your GitHub username as the id: ids must be unique on a bus (it's lowercased for you, since
   ids are lowercase letters, digits and dashes).

   ```bash
   BUS_URL=ws://<address-on-the-board>:3006 HELLO_ID=<your-github-username> npm run hello
   ```

   ✅ **Checkpoint:** your name appears as a node on the projected dashboard. Leave it running;
   when the instructor starts the clock, watch what happens to your node while you have no
   `tick.done` yet.

9. **Commit.**

   ```bash
   git add -A && git commit -m "week 1: connect handshake" && git push
   ```

### What the code looks like (shape only)

The point is the shape, not the exact lines. Yours will differ.

```ts
return new Promise((resolve, reject) => {
  socket.addEventListener("open", () => socket.send(JSON.stringify(hello)), { once: true });
  socket.addEventListener("message", onMessage);  // resolve(welcome) or reject(error)
  socket.addEventListener("error", () => reject(new Error("could not reach the bus")));
});
```

Why wrap events in a promise? Because "open the socket, then send, then wait for a reply" is a
*sequence*, and a promise lets the caller write `const welcome = await handshake(...)` and read
it top to bottom instead of nesting callbacks.

## Take-home

Due before next session. Work alone or in a pair (both of you must pass explain-it-back).

1. **Handle ticks** in `handleTick` (`components/client.ts`, `TODO(week 1, handle-tick)`). When
   a `tick` message arrives: remember its tick number, call every handler registered with
   `client.onTick(...)`, then send `tick.done` to the bus. Messages you send are stamped with the
   tick you remembered, so `tick.done` carries **the same tick number** as the tick it answers.
2. **Finish `hello()` in `scripts/hello.ts`** (`TODO(week 1, hello-script)`). It connects with
   the id it's given, prints the other components listed in `welcome`, then prints a line each
   time someone joins or leaves, and one every 10th tick. Print through `options.print`, not
   `console.log`, so the test can read your lines.

   ```
   connected as ada-laptop at tick 812
   already here: cpu (cpu), memory (memory)
   + sam-laptop joined as peripheral
   tick 820
   - sam-laptop left
   ```

3. Commit on your `work` branch and push it to your fork. Paste your script's output into the
   commit message.

### Acceptance criteria

- [ ] `npx vitest run tests/week-01` passes (`handshake.test.ts`, `ticks.test.ts`, `hello.test.ts`).
- [ ] Your `tick.done` always carries the tick number of the `tick` it answers, never
      "the latest tick" or a counter of your own.
- [ ] `npm run hello` against a running `npm run bus` prints the lines above. Start a second
      one in another terminal with a different `HELLO_ID` and watch the first print `joined`.
      (The `tick` lines only appear while a clock is running, e.g. on the class bus.)
- [ ] Ctrl-C on the second script makes the first print `left`.
- [ ] `work` pushed to your fork, with the script's output in a commit message.

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `npm run bus` | starts the bus on port 3006 | ✅ |
| `npx vitest tests/week-01` | week-1 tests in watch mode | ✅ |
| `npx vitest run tests/week-01` | same, run once (what CI and grading use) | ✅ |
| `npm run hello` | runs `scripts/hello.ts` (`HELLO_ID=you`; add `BUS_URL=ws://…:3006` to join another bus) | ✅ once you write it |
| `npm run component -- cpu` / `memory` | CPU / Memory components | ❌ throws `todo` until weeks 3–4 |
| `npm run dev:all` | the whole system + dashboard | ❌ useful from week 4 |

Tests that gate this week (`tests/week-01/`):

- `handshake.test.ts`: a client that connects gets `welcome` and knows the bus's current tick.
- `ticks.test.ts`: the client answers every `tick` with `tick.done` for the same tick number,
  and the handler you registered is called once per tick.
- `hello.test.ts`: `hello()` reports who is here, who joins and leaves, and every 10th tick.

## Explain it back

At the start of next session you'll have a 5-minute conversation with the instructor, no notes
and no AI. Be ready to:

1. **Draw the system on paper**: bus, clock, CPU, memory, a couple of devices, the dashboard.
   Point to where your `handshake()` sits.
2. **Why does the bus hold the clock** instead of each component keeping its own time?
3. **What happens if your client never sends `tick.done`?** (Hint: what is the bus waiting for?)
4. Open your `handshake()` and walk through it line by line: when does the promise resolve, and
   what would happen if the `welcome` never came?

## Using AI this week

| Fine to ask an AI | You must be able to explain yourself |
|---|---|
| "How do I wrap a WebSocket `open` event in a Promise?" | Why `connect()` must wait for `welcome` before returning |
| "What does `JSON.parse` throw on bad input?" | What each envelope field (`from`, `to`, `id`, `tick`) is for |
| "Explain this TypeScript error to me" | Why `tick.done` carries the tick number it answers |
| Help formatting the output of `hello.ts` | What the bus does while it waits for you |

If an AI writes a line you can't explain, delete it and write it again yourself. The instructor
will point at a random line of your code and ask what it does.

## Stretch

- Make `hello.ts` print a live count: `3 components connected`, updated on each join/leave.
- Make `handshake()` reject with a clear error if `welcome` doesn't arrive within 2 seconds.
- Read ARCHITECTURE.md's "A clock tick, step by step" diagram and find the line where your
  `tick.done` appears in it.
