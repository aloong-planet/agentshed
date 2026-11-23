# A Worker's main module that would not load

**Date**: 2026-11-23 · **Surface**: the download count's Worker (`scripts/download-count-worker.mjs`), the main module
aloong-planet/infra's `workers` stack deploys

## What happened

The Worker's main module exported the shadow period's two keys, `SHADOW_KEY` and `RUNS_KEY`, as strings, for the
comparison and the workflow's entry to import. A core-tier re-review of the pull request found it, before anything
was deployed. Loaded by workerd 1.20261101.1, as two ES modules with compatibility date 2026-11-01, the module
failed at once: `service main: Uncaught TypeError: Incorrect type for map entry 'RUNS_KEY': the provided value is not
of type 'function or ExportedHandler'.` Deployed like that, no Cron run would have reached the count. The seed and the
shadow file would never have been written, and the run record would have stayed empty. Whether Cloudflare's upload
refuses the module as well was not checked: that needs a deploy.

## Root cause

The runtime reads every export of a Worker's main module as a handler or an entrypoint, and a string is neither. The
module was written as an ordinary ES module that other modules import from, which Node allows.

## Why no test caught it

- Every case imports the module into Node, which checks nothing about what a module exports.
- The Worker's own guard on its modules checked its imports only: that it imports the core and nothing else.
- The test file's list of what Node cannot show named workerd's fetch, but not whether workerd loads the module.

## What it settled

- **The main module exports its handlers object and functions only.** The keys and the SHA-256 form live in the core,
  which the runtime loads as an ordinary module. The Worker, the comparison and the workflow's entry import them from
  there.
- **A case holds the main module to it**: "the Worker's main module exports its handlers and functions only", in
  `scripts/download-count-worker.test.mjs`. It fails on any other kind of export, and it failed on the strings.
- Whether Cloudflare's runtime loads the module is still seen only at the deploy, as the test file's header says.
