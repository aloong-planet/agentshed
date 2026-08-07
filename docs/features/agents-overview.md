# Agents 全局页

## 概述
同时使用 Claude Code 与 Codex 的用户,打开 app 第一眼想知道"两边各是什么状态、各烧了多少"。本页作为默认落地页,把两侧 agent 的全局面貌汇成一屏。

## 能力
- 顶部两张汇总卡:各侧检测状态、token 累计总量、项目数与全局 skills 数;某侧注册表损坏时降级显示错误说明,另一侧不受影响
- Token 分栏(默认):近 30 天日粒度趋势大图(合计/单侧切换)、跨项目按模型拆分;汇总口径含已隐藏与失效项目并有标注
- Skills 分栏:两侧全局库合并单列,侧徽标标示各侧是否存在,软链有标记;不做跨侧内容 diff;磁盘 skill 可折叠预览包内文件(见 [Skills 查看](skills-view.md));全局库条目可发起「安装到…」;插件条目只读、可展开预览包(见 [Plugins 视图](plugins-view.md))
- Subagents 分栏:两侧 subagent 定义合并查看(见 [Subagents 查看](subagents-view.md))
- Plugins 分栏:按侧分组的插件清单与内含组件展开(见 [Plugins 视图](plugins-view.md))
- MCP 分栏:两侧全局 MCP 按来源归类(全局配置 / plugin 自带 / config.toml)
- Memory 分栏:各项目自动记忆的汇总与查看(见 [Memory 查看](memory-view.md))
- 配置分栏:全局 CLAUDE.md、全局 AGENTS.md 渲染阅读,config.toml 只读摘要;缺失显示"无"

## 边界与不做
- 全局库只读:库内容的增删改不经本 app
- 某侧未安装时显示"未检测到",不报错
