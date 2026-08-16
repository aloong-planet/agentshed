# Postmortems

One file per trap, append-only. **Written the same time the real bug is diagnosed**: the symptom,
the root cause, why no test caught it, and the defence that was put in place.

| Date | Event |
|---|---|
| 2026-07-30 | [A cache structure change without a version bump crashed startup](2026-07-30-cache-version-crash.md) |
| 2026-08-02 | [Three defences we thought existed and that were not defending anything](2026-08-02-guards-that-were-not-there.md) (an algorithm change without a cache version bump giving a false green; a new field missed by the same-version guard; citing a test that never runs as a guard rail) |
| 2026-08-02 | [Implementing from a list vs implementing from the data: the noise list missed 60%](2026-08-02-noise-list-vs-real-data.md) (the research-phase list missed a shape accounting for 63% and listed one that does not exist; noise is layered, and sampling the input side cannot see the second layer) |
| 2026-08-04 | [Smoke went red three times: a silent lock exit, and the evidence destroyed three times over](2026-08-04-smoke-silent-lock-exit.md) |
| 2026-08-11 | [A bounding box is not a painted pixel](2026-08-11-a-rect-is-not-a-pixel.md) (a compound selector that stopped matching left the install popover off-screen for months; every "is it visible" check passes on an element that paints nowhere, and the measuring harness was wrong three times before the measurement was) |
| 2026-08-16 | [A prototype's width readout was blind to the copy it hard-coded](2026-08-16-prototype-copy-blindspot.md) (the filter row's six-language fit was confirmed against a readout two-thirds of whose copy never changed language; the e2e built for the worst reachable state found the overflow before shipping) |
