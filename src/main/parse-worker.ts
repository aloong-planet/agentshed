// The parse worker (#159): one of the threads ParsePool runs. It parses whatever job the pool posts and
// posts the result back, one job at a time. It touches only the file it is given — the cache and every
// decision about it stay on the main thread (TokenEngine) — so the parse path imports nothing from
// electron, which a worker thread cannot load.
import { parentPort } from 'node:worker_threads'
import { runParseJob, type ParseJob } from './providers/token-stats'

const port = parentPort
if (!port) throw new Error('parse-worker runs only as a worker thread')
port.on('message', (job: ParseJob) => {
  void runParseJob(job).then((result) => port.postMessage(result))
})
