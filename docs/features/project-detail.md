# 项目详情

> 关联决策: ADR-0004

## 概述
"这个项目装了哪些能力、有什么约定、沉淀了什么"是产品原点问题。详情页以八个分栏回答:概览(默认)、Skills、Subagents、Plugins、MCP、Memory、配置、产物。

## 能力
- Skills 生效视图:项目级与全局层并列分组,同名时项目级标「遮蔽全局」、全局级标「被项目级遮蔽」;软链有标记;项目级条目可卸载;另含本项目有效启用插件的内含 skills 组(只读,见 [Plugins 视图](plugins-view.md))
- Subagents 生效视图:项目级与全局层并列,两侧同名均为项目级遮蔽(见 [Subagents 查看](subagents-view.md))
- Plugins:本项目视角的有效启用状态与内含组件展开(见 [Plugins 视图](plugins-view.md))
- MCP:项目 .mcp.json 的 servers 及其启用/禁用/默认状态;无则提示去 Agents 页看全局
- Memory:本项目自动记忆的全文查看(见 [Memory 查看](memory-view.md))
- 配置:项目 CLAUDE.md 与 AGENTS.md 渲染阅读、settings 摘要;缺失显示"无"
- 产物 tab:六类产物按时间倒序平铺,类型 chips 筛选;chips 按自顶向下的推导链排列(CONTEXT.md → ADR → specs → prototypes → features → postmortems);Markdown 点开浮层阅读,prototypes 的 HTML 用系统默认方式打开
- 失效项目仍可打开详情:项目级内容为空态、全局层照常

## 边界与不做
- 会话内容不渲染(仅元数据,见 Token 统计)
- 非八步项目的产物栏显示"未按约定沉淀"空态,不视为错误
