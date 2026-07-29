// 刷新生命周期状态机(票04)。规则只在 reduce;legal 是派生查询;非法事件静默忽略。
// 管线的纯函数流程见 pipeline.mmd(不建模为状态机——无状态,数据一次流过)。

/** @typedef {'idle'|'scanning'|'writing'|'quit'} Status */
/**
 * @typedef {Object} ScanState
 * @property {Status} status
 * @property {string|null} illegal
 * @property {number} files    已处理会话文件数
 * @property {number} total    本轮枚举出的会话文件总数
 * @property {number} cacheHits 缓存键命中而跳过重算的文件数
 * @property {number} skipped   坏行跳过计数(不弃文件)
 * @property {boolean} warm     热启动(磁盘上已有缓存)
 */
/** @typedef {{type:'refresh'}|{type:'batch_done'}|{type:'corrupt_line'}|{type:'parse_done'}|{type:'write_done'}|{type:'app_quit'}} Action */

/** @type {ReadonlySet<Status>} */
const TERMINAL = new Set(['quit']);

/**
 * 入场:app 启动。
 * @param {boolean} warm 是否热启动(有既存缓存,扫描时可命中)
 * @param {number} total 本轮会话文件总数
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
