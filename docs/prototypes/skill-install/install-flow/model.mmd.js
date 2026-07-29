// 派生文件:由 sync-mmd.mjs 从本目录 *.mmd 生成,勿手改;改图请改 .mmd 后重跑脚本。
window.MERMAID_SOURCES = window.MERMAID_SOURCES || {};
window.MERMAID_SOURCES["skill-install/install-flow"] = [
  {
    "title": "装卸操作状态机(防护路径全覆盖)",
    "src": "%% title: 装卸操作状态机(防护路径全覆盖)\n%%{init: {\n  'theme': 'base',\n  'htmlLabels': false,\n  'state': { 'htmlLabels': false },\n  'flowchart': { 'htmlLabels': false },\n  'themeVariables': {\n    'primaryColor': '#ECECFF',\n    'primaryBorderColor': '#D5D5FF',\n    'primaryTextColor': '#000000',\n    'lineColor': '#757575',\n    'textColor': '#212121',\n    'edgeLabelBackground': 'transparent',\n    'noteBkgColor': '#FFF6B8',\n    'noteBorderColor': '#E4C800',\n    'noteTextColor': '#5C5100',\n    'tertiaryColor': '#f5f5f5',\n    'background': '#FFFFFF'\n  }\n}}%%\nstateDiagram-v2\n  direction LR\n  [*] --> validating: 发起安装(选定 skill+目标)\n  [*] --> confirming: 发起卸载(项目级副本)\n  validating --> copying: target_ok\n  validating --> conflict_blocked: conflict_found(同名阻止)\n  validating --> cancelled: target_stale(失效项目)\n  copying --> installed: copy_ok\n  copying --> failed_cleaned: copy_fail(清理半成品)\n  confirming --> deleting: confirm\n  confirming --> cancelled: cancel\n  deleting --> uninstalled: delete_done\n  installed --> [*]\n  conflict_blocked --> [*]\n  failed_cleaned --> [*]\n  uninstalled --> [*]\n  cancelled --> [*]\n  note right of copying\n    解引用深拷贝,落地必为真文件\n    失败即清理,不留残缺目录\n  end note\n  note right of confirming\n    确认弹窗显示完整删除路径\n    全局层 skill 无卸载入口(库只读)\n  end note"
  }
];
