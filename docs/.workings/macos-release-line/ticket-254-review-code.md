# Code review — #254

Ticket: [#254](https://github.com/aloong-planet/agentshed/issues/254). Date 2026-10-23. Implementation: 22c8ce6 on
`fix/app-update-e2e-first-step` (from 1349d76). The review read the change as first committed and folded its one fix,
the doc comment's wording, into that unpushed commit. Scope: the
scripted update source's `holdFirstStep` (`src/main/update-source.ts`), its four unit cases, and the two app-update e2e
cases that take it.

## Underlying premises

- **The launch check runs while the window is still loading.** `src/main/index.ts:684` creates the window and starts
  loading the page, and `:750` starts the update controller, whose first tick is the launch check; the slot first shows
  614–654 ms after launch, and with 100 ms steps the first value seen is already 20 (`evidence/ticket-254/diag-before.txt`).
  Holds. **Finding (fixed):** the new doc comment said the timer starts "before the window shows". The window exists
  by then, and only its page is still loading. Reworded to "while the window is still loading".
- **A script being rewritten can be read half-written**, the cause the `holding` comment gives. Measured: a reader
  parsing the script while another process rewrites it in a tight loop failed on 6,599 of 45,063 reads, 5,400 of them
  on an empty file (`evidence/ticket-254/midwrite-read.txt`). Holds.
- **The e2e comments' "however late the window shows"**: the late-observer loops read 3 s and 1.5 s late, and pass held
  and fail unheld (`late-observer.txt`, `late-observer-failed-download.txt`). Holds.
- **The existing doc comment's "reads its script at every request"** stays true, and the hold extends it to the held
  step.

## Runnability

- The held step's state, all ways in and out:
  - in: a download whose own script has `holdFirstStep: true`, at its first step;
  - out: the script as it stands no longer says `holdFirstStep: true` (release), the download is cancelled (it throws,
    U3), or the process ends.
  - **Finding (fixed before the commit, at step 4):** the first version polled for every download, so a download
    whose own script never asked for the hold could be held by a later script that did, or held forever if the script
    went away. Now only a download whose own script asked waits (U4, red before the fix).
- Closing the app while held: `app.close()` took 90–96 ms, against 78–111 ms for a download held after its last step
  with no timer (`evidence/ticket-254/close-while-held.txt`). The 50 ms poll does not hold up teardown.
- Failure paths and how far each escapes:
  - an unreadable script keeps the download held: self-contained, only that download, and it is released at the next
    whole read;
  - a script deleted while held keeps it held until the app closes: self-contained and only reachable from a test,
    since the cases delete their files after `app.close()`.
- No race with the controller: the progress still reaches it through `onProgress`, and the held step is a state a real
  download also passes through (a step not yet followed by the next).

## Security

- The hold exists only in the scripted source, which runs only when `AGENTSHED_UPDATE_SCRIPT` is set
  (`chooseUpdateSource`; app-update Failure F2, production never sets it). It reads the same file the seam already
  reads; no new input, path or permission. Nothing is logged.

## Consistency

- Invariants this change could break:
  - a script without the field behaves exactly as before, with no extra read (U4 guards it);
  - the ten other cases in `app-update.spec.ts` and every case in the menu and settings files pass unchanged
    (`evidence/ticket-254/targeted.txt`: 38 e2e).
- Conventions: `holdFirstStep` follows the script's existing vocabulary (`download: 'hold'`); the unit cases follow the
  file's style (inline scripts, a small helper beside `write` and `requests`); comments state what and why at the
  existing density.
- Smells, on the code this change brings in:
  - duplicated code: the cancellation's `throw` appears twice in the loop, once per place it is checked. Exempt:
    extracting a one-line throw would add a name for no gain;
  - the rest of the baseline list: no hit.
- Class-level check of the defect, "a case waits to see a state the scripted download holds only for a fixed time":
  every e2e use of the scripted source was enumerated by search (`ticket-254-tasks.md`, Facts). Of the 8 cases in that
  pattern, 2 had margins inside the window's load time and both take the hold. The other 6 leave 1.1–2 s; they are
  recorded in the test review's Coverage section, with impact, recommendation and an open destination for the owner.

## Refactoring list

None. The one smell found is exempt (above).

## Document sync this review adds

None beyond the checklist: the doc comment's fix is in the change itself.

## The increment after the owner's decision (2026-10-23, on e4a86dd, before its commit)

Scope: the check's hold (`holdCheck`) in the scripted source and its two unit cases; the six timed downloads and six
timed checks in the three update e2e files moved to the holds; the "no toast" reads of `app-update.spec.ts` (against a
later notice) and `app.spec.ts` (counted once); the toast recorder and the menu item's click copied into
`app-update.spec.ts`.

### Underlying premises

- **A launch check that answers at once is answered before the window listens, and a notice it sent never shows** (the
  new doc comment and E2a's comment). Measured under a planted notice: a failed launch check answering at once showed no
  toast, 2 of 2; answering after 2 s showed it, 2 of 2 (`evidence/ticket-254/plant-check-notice.txt`). The window's
  notice listener is registered in an effect after its page loads (`UpdateSlot.tsx:60`–`:66`), while the check starts
  just after the window is created (`src/main/index.ts:684`, `:750`). Holds.
- **A menu click has asked once `app.evaluate` returns** (E13's comment): `menuCheck` calls `updates?.check()` before its
  first `await` (`src/main/index.ts:571`–`:574`), and a check in flight is joined synchronously. Holds, by the code.
- **A window's requests reach the main process in order** (E13's comment, the barrier before the release): "Check now"
  clicked with the check held, then `getSettingsCheck` at once, said "checking" 60 times of 60
  (`evidence/ticket-254/ipc-order.txt`). A sample, consistent with Electron's in-order delivery over one renderer's
  channel; the comment says only what the case relies on.
- **"Notices reach the window in order"** (E2's and E3's comments): every update notice goes through one `webContents.send`
  call on one channel (`sendUpdateNotice`, `src/main/index.ts:577`–`:580`), and a notice a failure sends is sent in the
  same task as the failure. Holds by the code; the planted notices were caught in that order (P2, P3).
- **A retried "no toast" waits out a 3.2 s toast** (the comments at E2a's old read and E9): measured with P2 on the old
  E2 and P4 on the old E9 (`plant-notice-old-e2.txt`, `plant-startup-toast.txt`).

### Runnability

- The check's held state, all ways in and out: in, a check whose own script has `holdCheck: true`; out, the script as it
  stands no longer says so (release), or the process ends. A check has no cancel path in the scripted source, as before.
  U5 and U6 cover the release and the own-script guard (red before their code).
- The cases release after the event each must see or make: P1b (the holds ignored, every step at once) turned exactly
  the 13 cases that take a hold red, and none of the other 25.
- Failure paths: an unreadable script keeps a check held, as for the step: self-contained, released at the next whole
  read.

### Security

- Unchanged in kind: the new field is read only by the scripted source, which runs only when `AGENTSHED_UPDATE_SCRIPT`
  is set. No new input or path.

### Consistency

- Invariants: every e2e that goes through the scripted source passes, and so does the whole of `app.spec.ts`
  (`targeted-2.txt`: 123 e2e); a script without the new fields behaves as before (U4, U6).
- Conventions: the new field follows `holdFirstStep`; the unit cases follow the file's style; comments state what and
  why.
- Smells:
  - duplicated code: `recordToasts` and `clickMenuCheck` now exist in both `menu-check-updates.spec.ts` and
    `app-update.spec.ts`. Exempt: each update e2e file defines its own helpers (`fixture`, `launch`, `script` and
    `requests` are already in all three), and no e2e file imports a local module (`rg -ln "from '\./" e2e`: none). A
    shared module would be a new convention for one pair of helpers;
  - the rest of the baseline list: no hit.
- Class-level checks run in this increment: the timed checks (`rg -n "checkMs" e2e`: six, all converted) and the retried
  "no toast" reads (every one in `e2e/`: two moved to a later notice, one counted once, three deliberate waits kept),
  recorded in the test review's Coverage.

### Refactoring list

None. The one smell is exempt (above).
