// The parse worker (#159): one of the threads ParsePool runs. It parses whatever job the pool posts and
// posts the result back, one job at a time. It touches only the file it is given — the cache and every
// decision about it stay with the token engine, on the thread that started this one — so the parse path
// imports nothing from electron, which a worker thread cannot load.
import { parentPort, workerData } from 'node:worker_threads'
import { loadEngineModule } from './engine-module'
import type { ParseWorkerData } from './parse-pool'
import { runParseJob, type ParseJob } from './providers/token-stats'

const port = parentPort
if (!port) throw new Error('parse-worker runs only as a worker thread')
// The engine module (ADR-0045), loaded as the worker starts: one that will not load here fails the worker, and the pool
// parses its files on the thread that runs the scan, saying so once (`[parse-pool]`)
loadEngineModule((workerData as ParseWorkerData).engine)
port.on('message', (job: ParseJob) => {
  void runParseJob(job).then((result) => port.postMessage(result))
})
