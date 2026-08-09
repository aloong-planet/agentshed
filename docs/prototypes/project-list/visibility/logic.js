// The project visibility state machine (ticket 02). The conventions are in the prototype skill's
// STATE-MACHINE.md:
// zero I/O and zero DOM; the rules live only in reduce and legal is a derived query; an illegal event is
// silently ignored (returning the original state plus an illegal reason).

/** @typedef {'normal'|'stale'|'hidden'|'stale_hidden'|'removed'} Status */
/**
 * @typedef {Object} ProjState
 * @property {Status} status
 * @property {string|null} illegal The last illegal event refused (silently ignored in reality; surfaced in
 *                                 the prototype)
 */
/** @typedef {{type:'scan_missing'}|{type:'scan_restored'}|{type:'hide'}|{type:'unhide'}|{type:'registry_removed'}} Action */

/** The set of terminal states: defined only here @type {ReadonlySet<Status>} */
const TERMINAL = new Set(['removed']);

/**
 * Entry: the scan finds a registry entry.
 * @param {boolean} missing Whether the directory was already missing on disk when found
 * @returns {ProjState}
 */
function initial(missing) {
  return { status: missing ? 'stale' : 'normal', illegal: null };
}

/**
 * The single source of the rules.
 * @param {ProjState} s
 * @param {Action} a
 * @returns {ProjState}
 */
function reduce(s, a) {
  const deny = (why) => ({ ...s, illegal: `${a.type} 被忽略:${why}` });
  const ok = (status) => ({ status, illegal: null });

  if (TERMINAL.has(s.status)) return deny('已从注册表移除(终态),该项目不再存在');

  switch (a.type) {
    case 'scan_missing':
      if (s.status === 'normal') return ok('stale');
      if (s.status === 'hidden') return ok('stale_hidden');
      return deny('已处于失效态,重复的缺失信号无效果');
    case 'scan_restored':
      if (s.status === 'stale') return ok('normal');
      if (s.status === 'stale_hidden') return ok('hidden');
      return deny('目录本就存在,恢复信号无效果');
    case 'hide':
      if (s.status === 'normal') return ok('hidden');
      if (s.status === 'stale') return ok('stale_hidden');
      return deny('已在隐藏状态,重复隐藏无效果');
    case 'unhide':
      if (s.status === 'hidden') return ok('normal');
      if (s.status === 'stale_hidden') return ok('stale');
      return deny('未被隐藏,恢复无效果');
    case 'registry_removed':
      return ok('removed');
    default:
      return deny('未知事件');
  }
}

/** A representative example of each event @type {Action[]} */
const ALL_ACTIONS = [
  { type: 'scan_missing' },
  { type: 'scan_restored' },
  { type: 'hide' },
  { type: 'unhide' },
  { type: 'registry_removed' },
];

/**
 * The admission query: try reduce for each event, and a denial means illegal. The rules only ever live in
 * reduce.
 * @param {ProjState|null} s
 * @returns {Record<string,{legal:boolean, why:string|null}>}
 */
function legal(s) {
  /** @type {Record<string,{legal:boolean, why:string|null}>} */
  const out = {};
  for (const a of ALL_ACTIONS) {
    if (s === null) { out[a.type] = { legal: false, why: '空态:还没有项目,先入场' }; continue; }
    const next = reduce(s, a);
    out[a.type] = next.illegal
      ? { legal: false, why: next.illegal.replace(/^\S+ 被忽略:/, '') }
      : { legal: true, why: null };
  }
  return out;
}

/**
 * Derived: where a project in this state appears in the UI (the single source, referenced by the panel and
 * never rewritten).
 * @param {Status} status
 * @returns {string}
 */
function visibleWhere(status) {
  switch (status) {
    case 'normal': return '主列表';
    case 'stale': return '仅开「显示失效」时可见';
    case 'hidden': return '「已隐藏」入口内';
    case 'stale_hidden': return '「已隐藏」入口内(且带失效标)';
    case 'removed': return '不可见(已退场)';
  }
}

window.StateMachine = { initial, reduce, legal, ALL_ACTIONS, TERMINAL, visibleWhere };
