// 项目可见性状态机(票02)。约定见 prototype skill 的 STATE-MACHINE.md:
// 零 I/O、零 DOM;规则只在 reduce,legal 是派生查询;非法事件静默忽略(返回原状态+illegal 原因)。

/** @typedef {'normal'|'stale'|'hidden'|'stale_hidden'|'removed'} Status */
/**
 * @typedef {Object} ProjState
 * @property {Status} status
 * @property {string|null} illegal 上一个被拒绝的非法事件(现实中静默忽略;原型里外显)
 */
/** @typedef {{type:'scan_missing'}|{type:'scan_restored'}|{type:'hide'}|{type:'unhide'}|{type:'registry_removed'}} Action */

/** 终态集合:只此一处定义 @type {ReadonlySet<Status>} */
const TERMINAL = new Set(['removed']);

/**
 * 入场:扫描发现注册表条目。
 * @param {boolean} missing 发现时磁盘目录是否已缺失
 * @returns {ProjState}
 */
function initial(missing) {
  return { status: missing ? 'stale' : 'normal', illegal: null };
}

/**
 * 唯一的规则出处。
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

/** 每种事件的代表样例 @type {Action[]} */
const ALL_ACTIONS = [
  { type: 'scan_missing' },
  { type: 'scan_restored' },
  { type: 'hide' },
  { type: 'unhide' },
  { type: 'registry_removed' },
];

/**
 * 准入条件查询:对每个事件试跑 reduce,被 deny 即非法。规则永远只有 reduce 一处。
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
 * 派生:该状态下项目出现在 UI 的哪里(唯一出处,面板引用,不重写)。
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
