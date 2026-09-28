# Week 2: Connecting & Message Protocols

Today your code joins the computer on the projector. You'll write the handshake every part of
the system uses to join the bus, learn to check every message that arrives, and ask a question
and get *your* answer back. At home you build the first real part of the computer: memory.

## Goals

- **Hardware idea:** parts of a computer share a **bus**, and every transfer on it has a sender,
  a receiver and a meaning. A CPU reads memory by putting an **address** on the address bus and
  getting bytes back on the **data bus**. Memory is **byte-addressable**: every byte has its own
  number. Asking for an address that doesn't exist is a **bus fault**, not a silent zero.
- **Software idea:** two programs talking over a **WebSocket** with **JSON messages**; a
  **handshake** (`hello` → `welcome`) and `async`/`await` for "wait until the other side
  answers"; **schemas** and **discriminated unions** (one `type` field decides the payload
  shape); **validating at the boundary**; **request/response correlation** (matching a reply to
  its question by `id` and `replyTo`).

## Before class

1. Pass (or schedule) your week-1 explain-it-back.
2. Merge this week's starter into your `work` branch:

   ```bash
   git fetch upstream
   git merge upstream/week-2-start
   npm install
   ```

   ✅ `course.json` says `"week": 2`. The merge should be clean; if git reports a conflict, you
   edited a file you weren't meant to. Ask before resolving it.
3. Read [ARCHITECTURE.md](../ARCHITECTURE.md): **"The message protocol"** (the envelope, the
   message table, and "A clock tick, step by step") and **"Memory map"**.
4. Skim the [zod docs](https://zod.dev) front page: what is `z.object`, what does `safeParse`
   return, what does `z.infer` do? Five minutes is enough.

## In class: join the bus, check every message, ask questions

You'll work in `components/client.ts`, `scripts/hello.ts` and `protocol/messages.ts`.

1. **Run the week's tests and watch them fail.**

   ```bash
   npx vitest tests/week-02
   ```

   ✅ **Checkpoint:** tests fail with errors that start `week 2:`. That's the `todo()` stub
   telling you where to work. Leave Vitest running in watch mode; it re-runs every time you save.

2. **Read the stub.** Open `components/client.ts` and find `TODO(week 2, handshake)` inside
   `handshake(socket, options)`. Every component in this course (CPU, memory, every peripheral,
   the dashboard) joins the bus through `connect()`, and the first thing `connect()` does is the
   handshake. Read its signature, the `hello` and `welcome` schemas in `protocol/messages.ts`,
   and the place in `connect()` that calls it. With your neighbour: what goes in, what comes
   out, and what does the caller get back?

3. **Write the handshake** (together on the projector). `connect()` has already created the
   `WebSocket` for the bus URL; `handshake()` returns a `Promise` that settles later:
   - When the socket's `open` event fires, send `hello`. `envelope(type, from, to, payload,
     { id, tick })` in `protocol/messages.ts` builds a message with all the envelope fields
     (`type`, `from`, `to`, `id`, `tick`, `payload`) and makes TypeScript check the payload. For
     a first `hello` the tick is 0, `to` is `"bus"`, and the payload is your `role` and `label`.
   - Listen for messages, parse each one with `parseMessage`, and **resolve** with the
     `welcome` message when it arrives. If the bus answers `error` instead (your id is taken, for
     example), **reject** with its message. If the socket errors, reject too.

   ✅ **Checkpoint:** `handshake.test.ts` passes.

4. **Join the class bus.** Open `scripts/hello.ts` and find `TODO(week 2, hello-script)` inside
   `hello(options)`. Finishing it is take-home, but start it now with just enough to connect,
   print one line and hand back the client:

   ```ts
   const print = options.print ?? console.log;
   const client = await connect({ id: options.id, role: "peripheral", kind: "hello", label: `Hello from ${options.id}`, url: options.url });
   print(`connected as ${options.id} at tick ${client.tick}`);
   return client;
   ```

   Point it at the instructor's bus (the address is on the board). Use your GitHub username as
   the id; ids must be unique on a bus (it's lowercased for you).

   ```bash
   BUS_URL=ws://<address-on-the-board>:3006 HELLO_ID=<your-github-username> npm run hello
   ```

   ✅ **Checkpoint:** your name appears as a node on the projected dashboard. Leave it running
   and watch what happens to your node when the instructor starts the clock. (Your client can't
   answer a `tick` yet: that's `handle-tick`, this week's take-home.)

5. **Write one validator by hand.** In `protocol/messages.ts`, find `TODO(week 2, is-mem-read)`.
   Write `isMemRead(value: unknown): value is MessageOf<"mem.read">`. It must check, with
   `typeof` and friends, that `value` is an object, `type` is `"mem.read"`, the envelope fields
   are there with the right types, and `payload.address` and `payload.length` are whole numbers
   in range.

   ✅ **Checkpoint:** the `isMemRead` tests pass. Count your lines. There are about 30 message
   types in `messageSchema`. Multiply.

6. **Read the schemas together.** Scroll through `messageSchema` in the same file. Each line is
   one message type: `message("mem.read", z.object({ address, length: ... }))`. The `message()`
   helper adds the envelope, so each line only describes the payload. `Message`, `MessageOf<T>`
   and `PayloadOf<T>` are all `z.infer` of the schema, never written twice.

7. **Validate at the boundary.** Find `TODO(week 2, parse-message)`. Until now `parseMessage`
   has been a placeholder that trusts everything: it does `JSON.parse` and *casts* the result
   to `Message`, so TypeScript believes it while nothing checks it. Your handshake from step 3
   has been running on that trust. Replace it with real validation,
   `parseMessage(raw: string): ParseResult`: `JSON.parse` (which can throw: catch it and return
   `{ ok: false, error: "not valid JSON" }`), then `messageSchema.safeParse`. On success return
   `{ ok: true, message }`; on failure return an error that says **which field** was wrong (look
   at `error.issues`).

   This is the one place bytes off a socket become a typed `Message`. Find the places in
   `components/client.ts` that call it. Nothing after that line ever sees unchecked data.

   ✅ **Checkpoint:** `messages.test.ts` passes: valid messages parse, and bad JSON, wrong types,
   missing fields and unknown `type` values are rejected with an error that names the field.

8. **Build `request()`** in `components/client.ts` (`TODO(week 2, client-request)`). It sends a
   message with a fresh `id` and returns a promise that settles when the reply comes. The client
   already has a `pending` map (`Map<id, { resolve, reject }>`) and a `settle()` function that,
   when any message with a `replyTo` arrives, looks it up there and resolves it (or rejects it on
   `fault`/`error`). Your job is the other half: send, then put this request's `resolve` and
   `reject` in the map under the id `send` returned.

   Read `settle()` before you write anything. The whole feature is the handshake between your
   three lines and its six.

   ✅ **Checkpoint:** the `request()` tests pass.

9. **Commit.**

   ```bash
   git add -A && git commit -m "week 2: handshake, parseMessage, request()" && git push
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

### Why a Map and not "the next message"?

Two requests can be in flight at once, and replies can come back in any order. If `request()`
just waited for "the next `mem.data`", request A could get request B's bytes. The `id` is a
ticket number; `replyTo` is the ticket stapled to the answer.

## Take-home: ticks, memory, and your hello script

Due before next session. Work alone or in a pair (both of you must pass explain-it-back).

1. **Answer the clock** in `handleTick` (`components/client.ts`, `TODO(week 2, handle-tick)`).
   When a `tick` message arrives: remember its tick number, call every handler registered with
   `client.onTick(...)`, then send `tick.done` to the bus. Messages you send are stamped with the
   tick you remembered, so `tick.done` carries **the same tick number** as the tick it answers.
2. **`core/memory.ts`**: pure functions, no sockets.
   - `read(memory, address, length)` (`TODO(week 2, memory-read)`) returns
     `{ ok: true, value: bytes }`, or `{ ok: false, fault }` if any byte is outside
     `0x000`–`0x3FF`.
   - `write(memory, address, bytes)` (`TODO(week 2, memory-write)`) returns a **new** memory
     (the old one is untouched), or a fault on the same rule.
   - Decide: does a write that is *partly* out of range change anything? (The tests expect: no.
     A faulted write changes nothing. Why is that the safer rule?)
3. **The Memory component** in `components/memory.ts`, `answer()`
   (`TODO(week 2, memory-handler)`): on `mem.read` reply `mem.data`; on `mem.write` or
   `program.load` reply `mem.ack`; on a bad address reply `fault` with code `OUT_OF_RANGE`.
   Every reply sets `replyTo` (the client's `reply(request, type, payload)` does that for you).
4. **Finish `hello()` in `scripts/hello.ts`** (`TODO(week 2, hello-script)`). It connects with
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

5. **Watch it all with the logger.** The bus logger is a tool you're given
   (`components/logger.ts`): it connects like a dashboard, so it sees every message, and prints
   one line each, pairing every reply with its request and timing it. Run your memory with it:

   ```bash
   npm run bus                          # terminal 1
   LOG=1 npm run component -- memory    # terminal 2
   HELLO_ID=ada npm run hello           # terminal 3
   ```

   ```
      12  cpu → memory           mem.read 0x010 ×4                 cpu-88
      12  memory → cpu           mem.data 4 bytes                  memory-7  ↩ cpu-88  2 ms
   ```

   Use `LOG=1` whenever you want to see what's really on the bus, in every week from now on.

6. Commit on your `work` branch and push.

### Acceptance criteria

- [ ] `npx vitest run tests/week-02` passes, and so does week 1 (`npx vitest run`).
- [ ] Your `tick.done` always carries the tick number of the `tick` it answers, never "the
      latest tick" or a counter of your own.
- [ ] `memory.test.ts`: reads return exactly what was written; edges `0x000` and `0x3FF` work;
      `0x400` and "starts in range, ends out of range" both fault and change nothing.
- [ ] `memory-over-bus.test.ts`: a test client writes, reads back the same bytes, and gets a
      `fault` for an out-of-range address.
- [ ] `core/memory.ts` imports nothing from `components/`, `bus/` or `app/`.
- [ ] `npm run hello` prints the lines above; start a second one with a different `HELLO_ID`
      and watch the first print `joined`, then Ctrl+C it and watch `left`. (The `tick` lines
      only appear while a clock is running, e.g. on the class bus.)
- [ ] `work` is pushed to your fork.

## Tests and commands this week

| Command | What it does | Works this week? |
|---|---|---|
| `npx vitest tests/week-02` | this week's tests in watch mode | ✅ |
| `npx vitest run` | everything unlocked so far, once (what grading uses) | ✅ |
| `npm run bus` | the bus on port 3006 | ✅ |
| `npm run hello` | your hello script (`HELLO_ID=you`; `BUS_URL=ws://…:3006` to join another bus) | ✅ once you write it |
| `npm run component -- memory` | your Memory component (`LOG=1` to watch the traffic) | ✅ after the take-home |
| `npm run component -- cpu` | the CPU | ❌ `todo` until weeks 3–4 |
| `npm run dev:all` | the whole system + dashboard | ❌ useful from week 4 |

Tests that gate this week (`tests/week-02/`):

- `handshake.test.ts`: a client that connects gets `welcome` and knows the bus's current tick.
- `messages.test.ts`: `isMemRead` and `parseMessage` (valid, bad JSON, unknown type, wrong
  field), and `request()` (a fake peer answers; no memory yet).
- `ticks.test.ts`: the client answers every `tick` with `tick.done` for the same tick number,
  and each registered handler runs once per tick.
- `hello.test.ts`: `hello()` reports who is here, who joins and leaves, and every 10th tick.
- `memory.test.ts`: pure `read`/`write` and bounds.
- `memory-over-bus.test.ts`: bus + your Memory component + a test client, in one process.
- The rest of the folder (for example `logger.test.ts`) tests tools you're given; they already
  pass.

## Explain it back

At the start of next session, no notes and no AI. Be ready to:

1. **Walk through your `handshake()`** line by line: when does the promise resolve, and what
   happens if the `welcome` never comes?
2. **What happens if your client never sends `tick.done`?** (What is the bus waiting for?
   You saw it happen in class.)
3. **Show a message your validator rejects** and explain what would break *later* if it got
   through.
4. **How does a reply find its way back** to the right `request()` call? Point at the line that
   does the matching.
5. **Why is the address 16 bits** in the instruction when memory is only 1 KB (10 bits)?

## Using Codex this week

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "How do I wrap a WebSocket `open` event in a Promise?" | Why `connect()` must wait for `welcome` before returning |
| "How do I read the `issues` in a zod `safeParse` error?" | Why validation happens once, at the socket, and nowhere else |
| "What's the difference between `parse` and `safeParse`?" | How `id` and `replyTo` connect a reply to its request |
| "Explain this TypeScript error" | Why `tick.done` carries the tick number it answers |
| "I'll check the whole range first, then copy. Write `write()` that way and explain it" | Why a partly-out-of-range write must change nothing |

Codex may write code with you, but **you decide the design**: for `request()`, for example,
*you* choose how pending requests are stored and matched before it types anything. Write
`isMemRead` by hand in class, though: its whole point is that *you* feel how tedious and
error-prone hand validation is, so you know what the schema is doing.

## Stretch

- Make `handshake()` reject with a clear error if `welcome` doesn't arrive within 2 seconds.
- Make `request()` reject with a timeout error if no reply comes within 1 second, and clean up
  the `Map` entry either way. Why does forgetting to clean up leak memory?
- Make `hello.ts` print a live count: `3 components connected`, updated on each join/leave.
