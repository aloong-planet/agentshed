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
| [subagents-view](subagents-view.md) | [Subagents 查看](../features/subagents-view.md) |
| [memory-view](memory-view.md) | [Memory 查看](../features/memory-view.md) |
| [plugins-view](plugins-view.md) | [Plugins 视图](../features/plugins-view.md) |

> 存量说明:本目录自 2026-08-01 建立(spec 转为持久产物),此前功能的 spec 已随 `.scratch/` 丢弃——它们的现行行为见 `docs/features/`,边界记录缺失,后续改到那些功能时按本规则补建。
