# Spec 目录(Specs)

本目录描述**当前版本各功能的需求全景与边界**,面向要改这块代码的人。

- **不变量**:一功能一篇,**slug 与 `docs/features/` 一一对应**;现行描述、**就地改写**(不记变更史,变更史在 git);功能移除即删文件(与 features 同批)。
- **为什么持久**:「失败模式与边界」是全套文档里唯一记录"这个功能穷举过哪些边界、哪些明确不做"的地方——ADR 记决策取舍、features 记当前行为,都不覆盖这一层。丢掉它,下一个改这块代码的人无从判断自己是否想全了。
- **与 features 的分工**:features 面向用户写可见行为(零实现细节);spec 面向开发写需求全景(用户故事、边界穷举、测试决策、明确不做、抽象层实现决策)。
- **与 ADR 的分工**:决策取舍归 ADR,spec 只引用编号不复述。
- **一致性**:每轮开发第 8 步收尾统一回归(spec↔实现↔features↔ADR↔CONTEXT↔原型)。
- tickets 才是用完即丢的施工文档(`.scratch/`),spec 不是。

| Spec | 对应功能 |
|---|---|
| [agents-overview](agents-overview.md) | [Agents 全局页](../features/agents-overview.md) |
| [projects-list](projects-list.md) | [项目全景列表](../features/projects-list.md) |
| [project-detail](project-detail.md) | [项目详情](../features/project-detail.md) |
| [subagents-view](subagents-view.md) | [Subagents 查看](../features/subagents-view.md) |
| [memory-view](memory-view.md) | [Memory 查看](../features/memory-view.md) |
| [plugins-view](plugins-view.md) | [Plugins 视图](../features/plugins-view.md) |
| [token-stats](token-stats.md) | [Token 统计](../features/token-stats.md) |
| [skill-install](skill-install.md) | [Skills 装卸](../features/skill-install.md) |
| [appearance](appearance.md) | [外观主题](../features/appearance.md) |

> 补建说明:本目录自 2026-08-01 建立(spec 转为持久产物)。此前功能的 spec 已随 `.scratch/` 丢弃,已按 features + 既有测试用例 + 代码行为**逆向补建**(各篇头部标注)——边界条目均有对应测试可信,但当初的需求推理过程无法复原;与实现冲突时以实现为准并就地改写。
