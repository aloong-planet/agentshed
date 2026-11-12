// The scan worker (ADR-0043): the one thread, kept for the run, that owns the token engine and its cache and
// runs every scan — the session walk, the registries and components, the plan, the parses on the parse workers
// it starts itself, the aggregation and the cache write. The main process sends it requests (scan-client.ts)
// and keeps what belongs to the window and to the archive. Like the parse worker, it imports nothing from
// electron, which a worker thread cannot load.
import { parentPort, workerData } from 'node:worker_threads'
import { ParsePool } from './parse-pool'
import { Scanner } from './providers/scanner'
import { answerScans, type ScanWorkerData } from './scan-protocol'

const port = parentPort
if (!port) throw new Error('scan-worker runs only as a worker thread')
const data = workerData as ScanWorkerData
const scanner = new Scanner(data.cacheDir, new ParsePool(data.parseScript, data.poolSize))
// Ends this thread and the parse workers it started, at once (measured under Electron 43.2.0, 2026-11-12: a
// timer either had pending never fires): whatever the scan would have done next is not done
answerScans(port, scanner, () => process.exit(0))
