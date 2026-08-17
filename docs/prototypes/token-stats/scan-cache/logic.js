// The refresh lifecycle state machine . The rules live only in reduce; legal is a derived
// query; an illegal event is silently ignored.
// The pipeline's pure-function flow is in pipeline.mmd (not modelled as a state machine — it is stateless
// and the data flows through once).

/** @typedef {'idle'|'scanning'|'writing'|'quit'} Status */
/**
 * @typedef {Object} ScanState
 * @property {Status} status
 * @property {string|null} illegal
 * @property {number} files    Session files processed so far
 * @property {number} total    Total session files enumerated this round
 * @property {number} cacheHits Files skipped from recomputation because the cache key hit
 * @property {number} skipped   Bad lines skipped (without discarding the file)
 * @property {boolean} warm     A warm start (a cache already exists on disk)
 */
/** @typedef {{type:'refresh'}|{type:'batch_done'}|{type:'corrupt_line'}|{type:'parse_done'}|{type:'write_done'}|{type:'app_quit'}} Action */

/** @type {ReadonlySet<Status>} */
const TERMINAL = new Set(['quit']);

/**
 * Entry: the app starts.
 * @param {boolean} warm Whether this is a warm start (an existing cache the scan can hit)
 * @param {number} total The total session files this round
 * @returns {ScanState}
 */
function initial(warm, total) {
  return { status: 'idle', illegal: null, files: 0, total, cacheHits: 0, skipped: 0, warm };
}

/**
 * @param {ScanState} s
 * @param {Action} a
 * @returns {ScanState}
 */
function reduce(s, a) {
  const deny = (why) => ({ ...s, illegal: `${a.type} 被忽略:${why}` });
  const ok = (patch) => ({ ...s, illegal: null, ...patch });

  if (TERMINAL.has(s.status)) return deny('app 已退出(终态)');

  switch (a.type) {
    case 'refresh':
      if (s.status === 'scanning') return deny('扫描进行中,重复刷新被去重');
      if (s.status === 'writing') return deny('正在写缓存,此刻的刷新被去重');
      return ok({ status: 'scanning', files: 0, cacheHits: 0, skipped: 0 });
    case 'batch_done': {
      if (s.status !== 'scanning') return deny('没有进行中的扫描');
      if (s.files >= s.total) return deny('文件已全部处理完,等待 parse_done');
      const step = Math.min(3, s.total - s.files);
      return ok({ files: s.files + step, cacheHits: s.warm ? s.cacheHits + Math.min(2, step) : s.cacheHits });
    }
    case 'corrupt_line':
      if (s.status !== 'scanning') return deny('没有进行中的扫描');
      return ok({ skipped: s.skipped + 1 });
    case 'parse_done':
      if (s.status !== 'scanning') return deny('没有进行中的扫描');
      if (s.files < s.total) return deny(`还有 ${s.total - s.files} 个文件未处理`);
      return ok({ status: 'writing' });
    case 'write_done':
      if (s.status !== 'writing') return deny('没有进行中的写盘');
      return ok({ status: 'idle' });
    case 'app_quit':
      return ok({ status: 'quit' });
    default:
      return deny('未知事件');
  }
}

/** @type {Action[]} */
const ALL_ACTIONS = [
  { type: 'refresh' },
  { type: 'batch_done' },
  { type: 'corrupt_line' },
  { type: 'parse_done' },
  { type: 'write_done' },
  { type: 'app_quit' },
];

/**
 * @param {ScanState|null} s
 * @returns {Record<string,{legal:boolean, why:string|null}>}
 */
function legal(s) {
  /** @type {Record<string,{legal:boolean, why:string|null}>} */
  const out = {};
  for (const a of ALL_ACTIONS) {
    if (s === null) { out[a.type] = { legal: false, why: '空态:先启动 app' }; continue; }
    const next = reduce(s, a);
    out[a.type] = next.illegal
      ? { legal: false, why: next.illegal.replace(/^\S+ 被忽略:/, '') }
      : { legal: true, why: null };
  }
  return out;
}

window.StateMachine = { initial, reduce, legal, ALL_ACTIONS, TERMINAL };
