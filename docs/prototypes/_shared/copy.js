// Shared: the interface copy two or more prototype pages show, in the languages those pages are drawn in
// (Chinese and English; demo-dimensions.js shows any other choice as English, with a note). It is the
// prototypes' own copy, the baseline the app's dictionary follows. A page spreads a language's entries into
// its own table and keeps there only the copy no other page shows:
//   <script src="../_shared/copy.js"></script>
//   const T = { zh: { ...SharedCopy.zh, mine: '…' }, en: { ...SharedCopy.en, mine: '…' } }
// An entry joins this table when a second page shows the same copy, and leaves it when only one page does.
window.SharedCopy = {
  zh: {
    // Tabs and status (Agents, plugins, project detail)
    tabCfg: '配置',
    // The configuration tab's entry when no file of that name exists (Agents, project detail)
    cfgNone: '无',
    notEnabled: '未启用',
    // Token totals, composition and trend (Agents, project detail)
    winAllShort: '累计总量',
    compCacheRead: 'cache 读',
    compUncached: '未命中输入',
    compOutput: '输出',
    compTipCacheRead: (v) => `${v} · 命中缓存、不必重算的输入`,
    compTipUncached: (v) => `${v} · 含 cache 写(只在报告 cache 写的侧非零):都是这一轮真读进模型的输入`,
    compTipOutput: (v) => `${v} · 模型生成的 token`,
    trendPrefix: '近',
    trendSuffix: '天趋势',
    trendDays: '趋势天数',
    trendTotal: '合计',
    // Component lists (Agents, project detail, skills, install)
    pillSymlink: '软链',
    pillPlugin: '插件',
    pillProject: '项目级',
    pillGlobal: '全局',
    overridesBuiltin: '覆盖内置',
    inherited: '—(继承)',
    cacheOnly: '仅缓存枚举',
    secInstall: '安装记录',
    projectLost: '(项目已失联)',
    srcPlugin: 'plugin 自带',
    secClaudeProject: '项目级 · .claude/skills',
    // The shared skills directory: one group, one install target, loaded by more than one side (project
    // detail, install)
    secShared: '共享 · .agents/skills',
    installTo: '安装到…',
    uninstall: '卸载',
    // A skill package's file table (plugins, skills)
    colFile: '文件',
    colLines: '行数',
    colSize: '大小',
    colMtime: '修改日期',
    tagEntry: '入口',
    close: '关闭',
    // Session search hits (project detail's Sessions tab, global search)
    recentFirst: '最近在前',
    oldestFirst: '最早在前',
    hitCount: (n) => `${n} 条命中`,
    forkUncertain: '剥离存疑',
    // The memory file drawer (Agents, project detail): its meta line, the body's read states, and the notices
    // for links it does not open
    memDrawerMeta: (side, file, ago) => `${side} · ${file} · ${ago}`,
    memLoading: '读取中…',
    memUnreadable: (detail) => `文件不可读:${detail}`,
    memUnreadableDetail: '没有读取权限',
    linkOutOfScope: '链接目标不在可读范围',
    linkProtocolUnsupported: '不支持的链接协议'
  },
  en: {
    tabCfg: 'Config',
    cfgNone: 'None',
    notEnabled: 'Not enabled',
    winAllShort: 'Total',
    compCacheRead: 'Cache reads',
    compUncached: 'Uncached input',
    compOutput: 'Generated output',
    compTipCacheRead: (v) => `${v} · input served from cache, never recomputed`,
    compTipUncached: (v) => `${v} · cache writes included (non-zero only on sides that report them): everything the model read afresh this turn`,
    compTipOutput: (v) => `${v} · tokens the model generated`,
    trendPrefix: 'Last',
    trendSuffix: 'days’ trend',
    trendDays: 'Trend days',
    trendTotal: 'Total',
    pillSymlink: 'symlink',
    pillPlugin: 'Plugin',
    pillProject: 'Project',
    pillGlobal: 'Global',
    overridesBuiltin: 'Overrides built-in',
    inherited: '— (inherited)',
    cacheOnly: 'cache enumeration only',
    secInstall: 'Install records',
    projectLost: ' (project unreachable)',
    srcPlugin: 'bundled with plugin',
    secClaudeProject: 'Project level · .claude/skills',
    secShared: 'Shared · .agents/skills',
    installTo: 'Install to…',
    uninstall: 'Uninstall',
    colFile: 'File',
    colLines: 'Lines',
    colSize: 'Size',
    colMtime: 'Modified',
    tagEntry: 'Entry',
    close: 'Close',
    recentFirst: 'Newest first',
    oldestFirst: 'Oldest first',
    hitCount: (n) => `${n} ${n === 1 ? 'hit' : 'hits'}`,
    forkUncertain: 'uncertain strip',
    memDrawerMeta: (side, file, ago) => `${side} · ${file} · ${ago}`,
    memLoading: 'Loading…',
    memUnreadable: (detail) => `File cannot be read: ${detail}`,
    memUnreadableDetail: 'permission denied',
    linkOutOfScope: 'The link target is outside the readable scope',
    linkProtocolUnsupported: 'Unsupported link protocol'
  }
}
