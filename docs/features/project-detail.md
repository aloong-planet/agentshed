# 项目详情

> 关联决策: ADR-0004

## 概述
"这个项目装了哪些能力、有什么约定、沉淀了什么"是产品原点问题。详情页以六个分栏回答:概览(默认)、Skills、Plugins、MCP、配置、产物。

## 能力
- Skills 生效视图:项目级与全局层并列分组,同名时项目级标「遮蔽全局」、全局级标「被项目级遮蔽」;软链有标记;项目级条目可卸载
- Plugins:全局 plugin 清单(生效于所有项目,只读)
- MCP:项目 .mcp.json 的 servers 及其启用/禁用/默认状态;无则提示去 Agents 页看全局
- 配置:项目 CLAUDE.md 与 AGENTS.md 渲染阅读、settings 摘要;缺失显示"无"
- 产物 tab:五类产物(ADR/CONTEXT.md/features/postmortems/prototypes)按时间倒序平铺,类型 chips 筛选;Markdown 点开浮层阅读,prototypes 的 HTML 用系统默认方式打开
- 失效项目仍可打开详情:项目级内容为空态、全局层照常

## 边界与不做
- 会话内容不渲染(仅元数据,见 Token 统计)
- 非八步项目的产物栏显示"未按约定沉淀"空态,不视为错误
