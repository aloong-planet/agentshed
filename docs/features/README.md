# 功能目录(Features)

本目录描述**当前版本已具备功能的现行行为**,面向人的产品全景。
- 不变量:出现在本目录 = 当前版本可用;行为变更就地改写;功能移除删除文件。
- 未来计划见 roadmap;历史见 git/Release Notes;实现与决策见 docs/adr。
- 内容规则:只写用户可见行为,零实现细节;术语从 CONTEXT.md。

| 功能 | 一句话 |
|---|---|
| [Agents 全局页](agents-overview.md) | 默认落地页:两侧 agent 的全局面貌与总消耗一眼可见 |
| [项目全景列表](projects-list.md) | 两侧注册项目的并集列表,可筛可搜可隐藏 |
| [项目详情](project-detail.md) | 单项目装了什么:各组件生效视图、MCP、配置与产物 |
| [Subagents 查看](subagents-view.md) | 两侧 subagent 定义合并查看,项目内谁生效一目了然 |
| [Memory 查看](memory-view.md) | agent 记住了每个项目的什么,汇总与全文可查 |
| [Plugins 视图](plugins-view.md) | 插件按侧分组、各视角启用状态如实、内含组件可展开 |
| [Token 统计](token-stats.md) | 每项目与跨项目的 token 消耗、趋势与会话轨迹 |
| [会话查看](session-view.md) | 会话列表 → 提问主干 → 按需取回整轮(工具/子代理/推理)→ 搜索直达;fork 与分叉归一,不可还原处显式标注 |
| [Skills 装卸](skill-install.md) | 从全局库给指定项目安装/卸载 skills,全程有防护 |
| [Skills 查看](skills-view.md) | 折叠预览 skill 包内文件与正文(无跨侧 diff) |
| [外观主题](appearance.md) | 全 app 明暗(跟随系统/浅色/深色)× 配色(紫/雾蓝/琥珀褐),两维独立 |
| [界面语言](i18n.md) | 界面六语可切换,默认跟随系统偏好语言 |
