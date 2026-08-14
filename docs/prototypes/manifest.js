// The prototype registry (a hard rule: add or remove an entry whenever a prototype is created or deleted —
// a rotten registry blinds the gallery)
//
// ── Icons in these prototypes are superseded (2026-08-14, ticket 51) ──
// Every UI prototype below draws its icons as emoji / Unicode characters, which is what the product did
// when they were made. The product now renders inline SVG from the renderer's icon module, and **that
// module is the single source of truth for which glyph carries which meaning** — including one thing no
// prototype shows: the Agents rail and a subagent used to share 🤖 and are now two different icons.
//
// This is scoped rot, not general rot: what these prototypes are *for* — layout, states, interaction,
// copy — is still accurate, and only the glyph layer has moved on. Marking it here rather than staleness
// on each page keeps that distinction, because declaring twelve prototypes stale over their icons would
// throw away the part that is still true. Re-drawing them is tracked separately.
window.PROTOTYPES = [
  { module: 'agents-page',   type: 'ui',    id: 'agents',       name: 'Agents 全局页(默认落地)', path: 'agents-page/prototype-agents.html' },
  { module: 'shell',         type: 'ui',    id: 'app-shell',    name: '双栏壳与扫描态',       path: 'shell/prototype-app-shell.html' },
  { module: 'project-list',  type: 'ui',    id: 'list',         name: '项目图鉴列表',         path: 'project-list/prototype-list.html' },
  { module: 'project-list',  type: 'logic', id: 'visibility',   name: '项目可见性状态机',     path: 'project-list/visibility/index.html' },
  { module: 'project-detail',type: 'ui',    id: 'detail',       name: '详情:装了什么',       path: 'project-detail/prototype-detail.html' },
  { module: 'session-view',  type: 'ui',    id: 'session',      name: '会话页:提问索引与整轮展开', path: 'session-view/prototype-session.html' },
  { module: 'token-stats',   type: 'logic', id: 'scan-cache',   name: '增量扫描与刷新生命周期', path: 'token-stats/scan-cache/index.html' },
  { module: 'skill-install', type: 'ui',    id: 'install',      name: 'Agents·Skills 装卸交互', path: 'skill-install/prototype-install.html' },
  { module: 'skill-install', type: 'logic', id: 'install-flow', name: '装卸操作状态机',       path: 'skill-install/install-flow/index.html' },
  { module: 'skills-view',   type: 'ui',    id: 'skills-preview', name: 'Skills 包预览(折叠+抽屉)', path: 'skills-view/prototype-skills-preview.html' },
  { module: 'appearance',    type: 'ui',    id: 'settings',       name: '设置·语言六选一 + 外观三选一', path: 'appearance/prototype-settings.html' },
  { module: 'plugins-view',  type: 'ui',    id: 'plugin-skill-preview', name: 'Plugins·插件 skill 原地预览', path: 'plugins-view/prototype-plugin-skill-preview.html' },
];
