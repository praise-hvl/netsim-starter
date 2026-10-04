# Week 2 · DESIGN: The machine and its bus

Today you design the first part of your computer: the **bus** that connects everything, and the
**memory** that stores bytes. No code today. You'll leave with a design note and a sketch of what
your board will look like, and next week you build it: memory cells lighting up as requests
cross the bus.

## Goals

- **Hardware idea:** a computer is a few parts with different jobs (the CPU runs instructions,
  memory stores bytes, devices connect to the world). They share a **bus** and move in step with a
  **clock**. A memory access is a **request** and a **reply** across the bus. Memory is
  **byte-addressable**: 1 KB here, addresses `0x000` to `0x3FF`, and an address outside it is a
  **fault**, not a silent zero.
- **OS idea:** the clock tick is the system's heartbeat, and the bus is a shared resource that many
  parts want at the same time.
- **Design idea:** before you build, decide the parts, what they say to each other, and what it
  looks like. That's the design note, and it's what you hand your agent next week.

## Before class

1. Make sure `npm run doctor` still ends with `doctor: all 8 checks passed`, and merge this week:

   ```bash
   git fetch upstream && git merge upstream/week-2-start
   ```

2. Read [ARCHITECTURE.md](../ARCHITECTURE.md): **"The big picture"** and, in "The message
   protocol", **"Envelope"** and the **message table** (just the `mem.*` and `fault` rows). About
   10 minutes.
3. Bring your week-1 drawing of the system.

## In class (1 hour)

You work in pairs. Each of you fills in your own design note: open `docs/notes/week-02.md` (it
arrives with this week's merge, with the nine headings from
[the design-note template](../notes/design-note-template.md) and a comment under each saying what
goes there). If it isn't there, copy the template to that path.

1. **Act it out (10 min).** Volunteers play CLOCK, CPU, MEMORY and the BUS (me). Memory holds a
   few index cards with numbers on them, at addresses 0 to 3. The rules:
   - Nobody acts between ticks: you only act when the clock says "tick".
   - The CPU never walks over to Memory. It writes a request slip ("read address 2") and hands it
     to the bus, and the bus delivers it.
   - Round 1: two CPUs send requests, and the replies come back without a name on them. Who gets
     which number?
   - Round 2: every slip gets a ticket number, and every reply says "re: ticket 7".
   - Then someone asks for address 9.

   Talk about it: who owns time? What does the bus know about CPUs? What should happen at
   address 9?

2. **Parts and their jobs (10 min).** Fill in sections 1 and 2 of your note for the bus, the
   clock, memory, and "a component that asks memory for something" (it'll be the CPU later). For
   each part: its job in a few words, and what it knows. (Hint: does the bus know what's in
   memory? Does memory know who's asking?)

3. **Messages (15 min).** Fill in section 3: every message a memory **read** and a memory
   **write** need, including what happens when the address is bad. For each: who sends it, to
   whom, what it carries, and what the receiver does. Then compare with the `mem.*` and `fault`
   rows of ARCHITECTURE.md's message table. What did you name differently? What did you miss?
   Keep your own names if you like them; note the difference in section 7.

4. **One read, tick by tick (10 min).** Fill in section 5 for this scenario: *a component reads
   the byte at `0x010`.* Who sends what on which tick, who waits, and when the reply is used. Ask
   yourselves: why does the reply get **used** on the next tick, not the moment it arrives? (Think
   of round 1 of the activity.)

5. **Sketch the board (10 min).** On paper, draw what this will look like on screen: where the bus
   and memory sit, how a request and its reply travel, how a memory cell shows it was just read or
   written, and what a fault looks like. Don't worry about drawing well. Arrows and labels beat
   art. Photograph it.

6. **Wrap up (5 min).** What's left goes home. Next week you'll hand section 9 of this note to
   your agent, so it builds *your* design.

## Take-home

Due before next session.

1. **Finish your design note** in `docs/notes/week-02.md`, all nine sections. In particular:
   - **Section 4, states and rules:** memory's rule for a read or write that is partly outside
     `0x000`–`0x3FF`. (Does a write that starts inside and ends outside change anything? Decide,
     and say why.)
   - **Section 7, decisions:** at least two, with the option you didn't pick. Good candidates: the
     colours for read, write and fault on the board; whether the bus shows every message or only
     memory traffic; how long a cell stays lit.
   - **Section 9, agent brief:** what your agent should build next week in the board kit's
     week-3 regions: only the bus and memory on the board, and a small panel to send a read or a
     write by hand, since there's no CPU yet.
2. **Commit your sketch** as `docs/notes/week-02-board.jpg` (or `.png`) and link it in section 6.
3. **Commit and push** your `work` branch.

### Acceptance criteria

- [ ] `docs/notes/week-02.md` has all nine sections filled in, in your own words.
- [ ] `npx vitest run tests/week-02` passes: it checks every section of your note is really
      filled in and your sketch file is there.
- [ ] Section 3 covers a read, a write, and the bad-address case, each with from → to, payload,
      and what the receiver does.
- [ ] Section 5 tells the `0x010` read tick by tick, and says why the reply is used on the next
      tick.
- [ ] Your board sketch is committed and linked from section 6.
- [ ] Section 7 has at least two decisions, each with an alternative and a reason.
- [ ] `work` is pushed to your fork.

## Using Codex this week

Today the design is the work, so it's yours: Codex shouldn't write your note. It's a good
sparring partner, though. Use it like this:

| Fine to ask Codex | You must be able to explain yourself |
|---|---|
| "Here's my message table. What case did I miss?" | Every row of your message table |
| "What does a real memory controller do with an out-of-range address?" | Your rule for a partly-out-of-range write, and why |
| "Quiz me on why the reply is used on the next tick." | Why the bus holds the clock |
| "Critique my board sketch: what would confuse someone seeing it for the first time?" | Why you placed things where you did |

## Explain it back

Before next session, explain your design note to me without notes or AI: book a 5-minute slot
with me, or record a 3-minute video (your face and your sketch, no notes) answering the two
questions I post after class. I may also ask one or two people live at the start of class. Be
ready to:

1. **Walk through your sketch:** what each part on it is, and what moves or lights up during one
   memory read.
2. **Pick one message from your table** and explain it end to end: who sends it, what it
   carries, what the receiver does, and what the reply is.
3. **Why does the reply get used on the next tick,** not the moment it arrives?
4. **Defend one decision** from section 7: what you chose, the alternative, and why.

## Stretch

- Design a second memory (or a ROM that can't be written). What changes in your messages and on
  the board?
- Design a device that copies a block of memory without the CPU (that's DMA). Which messages does
  it send, and what does the board show while it runs?
- Read the rest of ARCHITECTURE.md's message table. Which messages will you need in week 4, when
  the CPU arrives?
