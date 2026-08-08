// 原型注册表(硬规则:每生成/删除一个原型同步增删条目,注册表腐烂等于画廊失明)
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
