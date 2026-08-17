// The install/uninstall state machine . The rules live only in reduce; legal is a derived
// query; an illegal event is silently ignored.
// The UI's "stale projects are disabled" is only a narrowed entry point; the target_stale defence also
// holds in the model (reduce refuses to enter the copy step).

/** @typedef {'validating'|'copying'|'installed'|'conflict_blocked'|'failed_cleaned'|'confirming'|'deleting'|'uninstalled'|'cancelled'} Status */
/**
 * @typedef {Object} OpState
 * @property {Status} status
 * @property {string|null} illegal
 * @property {'install'|'uninstall'} kind
 * @property {string} skill
 * @property {string} target
 * @property {string|null} note  The final explanation (the cleanup or blocking reason, and so on)
 */
/** @typedef {{type:'target_ok'}|{type:'conflict_found'}|{type:'target_stale'}|{type:'copy_ok'}|{type:'copy_fail'}|{type:'confirm'}|{type:'cancel'}|{type:'delete_done'}} Action */

/** @type {ReadonlySet<Status>} */
const TERMINAL = new Set(['installed', 'conflict_blocked', 'failed_cleaned', 'uninstalled', 'cancelled']);

/**
 * Entry: an install or uninstall operation begins.
 * @param {'install'|'uninstall'} kind
 * @returns {OpState}
 */
function initial(kind) {
  return {
    status: kind === 'install' ? 'validating' : 'confirming',
    illegal: null, kind, skill: 'tdd', target: 'agentshed', note: null
  };
}

/**
 * @param {OpState} s
 * @param {Action} a
 * @returns {OpState}
 */
function reduce(s, a) {
  const deny = (why) => ({ ...s, illegal: `${a.type} 被忽略:${why}` });
  const ok = (patch) => ({ ...s, illegal: null, ...patch });

  if (TERMINAL.has(s.status)) return deny('操作已终局,重复回调被静默忽略');

  switch (a.type) {
    case 'target_ok':
      if (s.status !== 'validating') return deny('不在校验阶段');
      return ok({ status: 'copying' });
    case 'conflict_found':
      if (s.status !== 'validating') return deny('不在校验阶段');
      return ok({ status: 'conflict_blocked', note: '目标已有同名项目级 skill,阻止且不覆盖' });
    case 'target_stale':
      if (s.status !== 'validating') return deny('不在校验阶段');
      return ok({ status: 'cancelled', note: '目标是失效项目(UI 已禁用入口,模型同样拒绝)' });
    case 'copy_ok':
      if (s.status !== 'copying') return deny('没有进行中的复制');
      return ok({ status: 'installed', note: '解引用深拷贝完成;仅局部刷新该项目' });
    case 'copy_fail':
      if (s.status !== 'copying') return deny('没有进行中的复制');
      return ok({ status: 'failed_cleaned', note: '复制中断(权限/磁盘),半成品已清理,无残缺目录' });
    case 'confirm':
      if (s.status !== 'confirming') return deny('没有待确认的卸载');
      return ok({ status: 'deleting' });
    case 'cancel':
      if (s.status !== 'confirming') return deny('没有待确认的卸载');
      return ok({ status: 'cancelled', note: '用户取消,项目副本原样保留' });
    case 'delete_done':
      if (s.status !== 'deleting') return deny('没有进行中的删除');
      return ok({ status: 'uninstalled', note: '项目副本已删;git 差异由用户自行处理;仅局部刷新' });
    default:
      return deny('未知事件');
  }
}

/** @type {Action[]} */
const ALL_ACTIONS = [
  { type: 'target_ok' },
  { type: 'conflict_found' },
  { type: 'target_stale' },
  { type: 'copy_ok' },
  { type: 'copy_fail' },
  { type: 'confirm' },
  { type: 'cancel' },
  { type: 'delete_done' },
];

/**
 * @param {OpState|null} s
 * @returns {Record<string,{legal:boolean, why:string|null}>}
 */
function legal(s) {
  /** @type {Record<string,{legal:boolean, why:string|null}>} */
  const out = {};
  for (const a of ALL_ACTIONS) {
    if (s === null) { out[a.type] = { legal: false, why: '空态:先发起装或卸' }; continue; }
    const next = reduce(s, a);
    out[a.type] = next.illegal
      ? { legal: false, why: next.illegal.replace(/^\S+ 被忽略:/, '') }
      : { legal: true, why: null };
  }
  return out;
}

window.StateMachine = { initial, reduce, legal, ALL_ACTIONS, TERMINAL };
