// The prototype registry (a hard rule: add or remove an entry whenever a prototype is created or deleted —
// a rotten registry blinds the gallery)
//
// ── Icons ──
// Every icon below comes from _shared/icons.js, which is **generated** from the app's icon module by
// sync-icons.mjs. Do not paste an <svg> into a prototype: `pnpm check:ui --cross` fails when the generated
// file drifts from the app, and a hand-pasted one is invisible to that check.
//
// Static slots declare the name (`data-icon="Folder"`); rows built at runtime call `ICONS.Folder(16)`.

window.PROTOTYPES = [
  { module: 'agents-page',   type: 'ui',    id: 'agents',       name: 'Agents 全局页(默认落地)', path: 'agents-page/prototype-agents.html' },
  { module: 'agents-page',   type: 'ui',    id: 'agents-skeleton', name: 'Agents 页启动骨架(扫描中)', path: 'agents-page/prototype-agents-skeleton.html' },
  { module: 'shell',         type: 'ui',    id: 'app-shell',    name: '双栏壳与扫描态',       path: 'shell/prototype-app-shell.html' },
  { module: 'project-list',  type: 'ui',    id: 'list',         name: '项目图鉴列表',         path: 'project-list/prototype-list.html' },
  { module: 'project-list',  type: 'ui',    id: 'list-skeleton', name: '项目列表启动骨架(扫描中)', path: 'project-list/prototype-list-skeleton.html' },
  { module: 'project-list',  type: 'logic', id: 'visibility',   name: '项目可见性状态机',     path: 'project-list/visibility/index.html' },
  { module: 'project-detail',type: 'ui',    id: 'detail',       name: '详情:装了什么',       path: 'project-detail/prototype-detail.html' },
  { module: 'project-detail',type: 'ui',    id: 'detail-stale-note', name: '详情:失效移除提示卡', path: 'project-detail/prototype-detail-stale-note.html' },
  { module: 'session-view',  type: 'ui',    id: 'session',      name: '会话页:提问索引与整轮展开', path: 'session-view/prototype-session.html' },
  { module: 'token-stats',   type: 'logic', id: 'scan-cache',   name: '增量扫描与刷新生命周期', path: 'token-stats/scan-cache/index.html' },
  { module: 'skill-install', type: 'ui',    id: 'install',      name: 'Agents·Skills 装卸交互', path: 'skill-install/prototype-install.html' },
  { module: 'skill-install', type: 'logic', id: 'install-flow', name: '装卸操作状态机',       path: 'skill-install/install-flow/index.html' },
  { module: 'skills-view',   type: 'ui',    id: 'skills-preview', name: 'Skills 包预览(折叠+抽屉)', path: 'skills-view/prototype-skills-preview.html' },
  { module: 'appearance',    type: 'ui',    id: 'settings',       name: '设置·语言六选一 + 外观三选一', path: 'appearance/prototype-settings.html' },
  { module: 'plugins-view',  type: 'ui',    id: 'plugin-skill-preview', name: 'Plugins·插件 skill 原地预览', path: 'plugins-view/prototype-plugin-skill-preview.html' },
  { module: 'md-preview',    type: 'ui',    id: 'heading-ladder', name: 'Markdown 预览 · 标题层级阶梯', path: 'md-preview/prototype-heading-ladder.html' },
];
