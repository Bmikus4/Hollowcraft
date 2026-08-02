# Two ways a harness in here lies

Both were found on 2026-08-02, both in checks that had been green for weeks, and both are
easy to reintroduce. Before adding a check, test it for each.

**1. An action followed by a fixed sleep.** `doThing(); await sleep(250); expect(...)` is a
bet on frame timing: it passes while frames are quick and fails when one is slow. Widening
the sleep only lowers the failure rate. **Test:** run it ten times, not three — one-in-six
flakiness survives three runs better than half the time. **Fix:** poll for the state with a
deadline. Waiting for a condition is deterministic; waiting for a duration is not. Where you
must wait for *absence* ("nothing happened"), a fixed wait is unavoidable — make it generous
and say why in a comment.

**2. An assertion scoped to a global the world moves by itself.** `assert-qdrop` checked
that the world's drop count had not changed over a window. `drops` is world-wide, so any
unrelated item spawning into it failed the guard — and in the other direction, waiting for
that count to *rise* let an unrelated drop satisfy the check, so it **passed with the feature
switched off**. **Test:** run under the kill switch and count. If a harness catches fewer
failures than it has claims, the missing ones are false passes. **Fix:** assert on state the
check set itself — the inventory slot, not the world's drop list.

Two corollaries worth the same attention:

- **A guard that has never been observed rejecting anything is not evidence.** `assert-br-overlaps`
  grew a minimum-sample guard that could not fire; `--minwalls=N` exists purely to prove it
  can. If you add a guard, add the way to make it trigger.
- **Do not sample a milestone from outside.** `assert-mesh-not-starved` read "generation units
  before meshing started" from a 250ms poll and reported 211 one day and 78 the next on
  identical code. Latch the milestone in the engine where it happens; poll intervals are not
  measurements.

Report the numbers, not the verdict. "PASS" hides a spread; "74, 53, 53, 41, 48" shows a
threshold sitting inside it.
