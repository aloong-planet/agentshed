# A visit counted before the page's last request reached it

**Date**: 2026-11-23 · **Surface**: the site's browser harness (`site/test/support/browser.ts`) and every browser case
that opens a page through `visit()`

## What happened

The harness promises that a request the page makes with no answer fails the visit, naming it. One of its own
self-tests, `a visit with scripts off runs none of the page's scripts`, broke that promise in this ticket's branch. The
self-test first opens the page with no stand-ins and a case that returns at once, and that visit must fail naming the
page's reads. Run alone, it failed as it should. Run together with three other site test files, it passed: the page
had made its reads, and the visit counted none of them.

Nothing shipped wrong: the hole was found in the branch, before merging. A case that passed through it would have
passed while the page asked for something new and unanswered.

## Root cause

`visit()` read its list of unanswered requests as soon as the case returned. A request reaches the harness a moment
after the page makes it, through the browser's protocol to the route handler in the test process. A request the page
made just before or as the case ended had not reached the handler when the list was read, so it was counted after
the check, and the visit passed. On a loaded machine the moment is longer, so the race showed only when several files
ran together.

## Why no test caught it

- The self-tests that prove a stray request fails the visit make that request inside the case and wait for it to be
  refused (`await fetch(stray).catch(…)`, an image's `decode()`), so it had always reached the handler before the case
  returned. No self-test made a request as the case ended.
- Every other browser case answers every read its page makes, so none of them could show a request counted late.

## What it settled

- **A visit settles before it checks.** Once the case is done (and, since #557, once the holds still held are
  released), the page must have made no request for 100ms, and every request the context reported must have finished
  or failed. The wait is bounded at 2s, and at the bound the visit fails naming the requests still in flight. It rests
  on the harness's own request accounting rather than the browser's network idle, which resolves at once when the
  page has reached it before. The quiet window is needed as well: the accounting alone misses a request whose report
  has not reached the harness yet, the very case seen here.
- **A self-test makes a request as the case ends.**
  `a request the page makes as the case ends is waited for, and the visit fails naming it` has the page fetch a stray
  URL 30ms after the case returns. Taking the settle out turns it red on an idle machine, and so does a quiet window
  of 0.
- **The bound has no case on the real order.** No request the harness answers stays in flight: every stand-in and
  file is answered at once, and a hold is released before the settle. The bound's failure is seen only under a
  mutation that settles before the release, where it names the held read.
- **The cost is the quiet window**, about 100ms per visit.
