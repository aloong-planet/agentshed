// The prototype registry (a hard rule: add or remove an entry whenever a prototype is created or deleted —
// a rotten registry blinds the gallery)
//
// ── Icons ──
// Every icon below comes from _shared/icons.js, the prototypes' one icon table. Do not paste an <svg> into a
// prototype page: two copies of one icon drift apart, and nothing reports it.
//
// Static slots declare the name (`data-icon="Folder"`); rows built at runtime call `ICONS.Folder(16)`.

// The app these prototypes belong to: app-identity.js puts its name and icon on the tab of the gallery and
// of every prototype page. icon is the app icon's path from this directory, in a format a browser shows
// (png/svg/ico — not the .icns the installer uses); null while the app has no icon yet, and the name's
// initials are drawn instead.
window.PROTOTYPE_APP = { name: 'Agentshed', icon: '../../build/icon.png' }

window.PROTOTYPES = [
  { module: 'agents-page',   type: 'ui',    id: 'agents',       name: 'Agents 全局页(默认落地 · 含启动骨架)', path: 'agents-page/prototype-agents.html' },
  { module: 'shell',         type: 'ui',    id: 'app-shell',    name: '双栏壳与扫描态',       path: 'shell/prototype-app-shell.html' },
  { module: 'project-list',  type: 'ui',    id: 'list',         name: '项目图鉴列表(含启动骨架)', path: 'project-list/prototype-list.html' },
  { module: 'project-list',  type: 'logic', id: 'visibility',   name: '项目可见性状态机',     path: 'project-list/visibility/index.html' },
  { module: 'project-detail',type: 'ui',    id: 'detail',       name: '详情:装了什么',       path: 'project-detail/prototype-detail.html' },
  { module: 'project-detail',type: 'ui',    id: 'detail-stale-note', name: '详情:失效移除提示卡', path: 'project-detail/prototype-detail-stale-note.html' },
  { module: 'session-view',  type: 'ui',    id: 'session',      name: '会话页:提问索引与整轮展开', path: 'session-view/prototype-session.html' },
  { module: 'global-search', type: 'ui',    id: 'search',       name: '全局搜索:跨项目搜提问', path: 'global-search/prototype-search.html' },
  { module: 'token-stats',   type: 'logic', id: 'scan-cache',   name: '增量扫描与刷新生命周期', path: 'token-stats/scan-cache/index.html' },
  { module: 'skill-install', type: 'ui',    id: 'install',      name: 'Agents·Skills 装卸交互', path: 'skill-install/prototype-install.html' },
  { module: 'skill-install', type: 'logic', id: 'install-flow', name: '装卸操作状态机',       path: 'skill-install/install-flow/index.html' },
  { module: 'skills-view',   type: 'ui',    id: 'skills-preview', name: 'Skills 包预览(折叠+抽屉)', path: 'skills-view/prototype-skills-preview.html' },
  { module: 'appearance',    type: 'ui',    id: 'settings',       name: '设置·语言 + 外观 + 更新（含左下角更新按钮）', path: 'appearance/prototype-settings.html' },
  { module: 'plugins-view',  type: 'ui',    id: 'plugin-skill-preview', name: 'Plugins·插件 skill 原地预览', path: 'plugins-view/prototype-plugin-skill-preview.html' },
  { module: 'md-preview',    type: 'ui',    id: 'heading-ladder', name: 'Markdown 预览 · 标题层级阶梯', path: 'md-preview/prototype-heading-ladder.html' },
  { module: 'landing-page',  type: 'ui',    id: 'landing',        name: '落地页（中英 · 四种下载状态 · 滚动联动的功能区）', path: 'landing-page/prototype-landing.html' },
];
