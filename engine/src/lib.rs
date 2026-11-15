//! The engine module (ADR-0045), loaded through Node-API by the scan worker, the parse workers and the main process. The
//! accounting moves in from TypeScript one component per change, each proven against the TypeScript implementation by
//! the parity command (`pnpm engine:parity`) before that implementation is removed.
//!
//! Every function it exports catches a panic where it crosses into the application (`#[napi(catch_unwind)]`): the
//! call throws an error naming the panic, and the thread and the process go on (token-stats, Scans and the window).
//!
//! ## Layout
//!
//! - `sides/<side>/`: what differs by agent side — its entry types, the fields its rules read off a line, its parse,
//!   its question rules and its title. A side's items stay private to its directory, except the one adapter it
//!   registers in `sides/mod.rs`, which is the one list of the sides, with the trait they implement. The trait gains a
//!   method only when side-free code calls one.
//! - Side-free modules, which never branch on a side: what more than one side uses, written once — `read/` (lines over
//!   a plain or a zstd stream), `json/` (a line read by `JSON.parse`'s grammar and with its results), `text/` (text as
//!   JavaScript holds it, and the normalisation, noise, title, fingerprint, merge key and `Date.parse` rules over it),
//!   `question/` (the question indexer the sides share) and `store/` (the token store, ADR-0044, which holds each
//!   session file's entry under its path without reading it by side).
//! - `display/`: the display copy's writer, which serialises what the main process hands it by `JSON.stringify`'s
//!   rules and knows nothing of what the copy holds.
//! - `exports/`: every `#[napi]` function, one file per caller, with the conversions between JavaScript's values and
//!   the module's (`exports/js.rs`), which the sides and `display/` read JavaScript values through as the exports do:
//!   no other file reads one, but for the arguments napi-rs converts at the call. An export converts and dispatches,
//!   and holds no rule.
//! - `seams.rs`: the test seams, in builds made for tests only.
//!
//! Nothing is laid down ahead of the change that needs it: no file, module or trait method waits for later work.
//!
//! Why: `src/main/providers/token-stats.ts` is laid out by stage, and every side added grew a piece in every stage —
//! Grok in #130 and #131, Antigravity in #331 and #333 — so one side's rules ended up spread through the whole file,
//! between the other sides'. Here a side is added as a directory and a line in `sides/mod.rs`, and what it shares with
//! the others it takes from the side-free modules rather than writing again.

mod display;
mod exports;
mod json;
mod question;
mod read;
mod seams;
mod sides;
mod store;
mod text;
