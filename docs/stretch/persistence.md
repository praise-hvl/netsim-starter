# Stretch: save and restore the whole machine

**The idea:** a computer's state is just bytes. Stop the clock, ask every part for its state,
write it to a file; later, check every part *before* changing anything, then put it all back.
That's hibernation, and it's how you'd checkpoint a long simulation.

**Where the code is:**

- `core/memory.ts`: `snapshotMemory`, `restoreMemory` (regions `memory-snapshot`, `memory-restore`)
- `core/cpu-core.ts`: `snapshotCore`, `restoreCore` (`core-snapshot`, `core-restore`)
- `core/scheduler.ts`: `snapshotScheduler`, `restoreScheduler` (`scheduler-snapshot`,
  `scheduler-restore`)
- a peripheral's `snapshot`/`restore` (`<kind>-snapshot`, `<kind>-restore`)
- `bus/saves.ts`: how the bus saves to `saves/<name>.json` and restores **all or nothing**: it sends
  every component `snapshot.check` (each runs its real `restore` without applying it) and only
  sends `snapshot.set` if every part passes.

**The one rule:** a `restore` only checks and rebuilds. It validates the data (with the part's zod
schema) and returns the state, or throws, without changing anything on the way.

**Check it:** `persistence.test.ts` and `peripheral-snapshot.test.ts`; then on the
board, stop the clock, **Save**, restart everything, **Restore**, and the programs finish with
the same memory as a run you never interrupted.

**On your board:** a save/restore control, and a moment where the board visibly "wakes up" in
the restored state.
