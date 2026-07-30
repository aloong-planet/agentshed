# ADR-0006: Codex 用量统计口径(ccusage 对齐)

- 状态: 已接受(2026-07-30)

## 背景与问题

首版 Codex 统计**恒为 0**,两个解析假设与真实数据不符:①rollout 首行含内嵌 base_instructions,实测 208 个文件里 206 个首行 >8KB(最大 42KB),固定 8KB 缓冲截断致 JSON 解析失败、整条会话丢弃;②token 事件的真实形状是顶层 `type:"event_msg"` + `payload.type:"token_count"` + `payload.info`,而实现匹配的是顶层 `type:"token_count"` + 顶层 `info`,**永不命中**。此外整会话累计记在首日,跨天会话归日错误。

## 备选项

1. **对齐 ccusage 的 codex adapter(源码级)**:两数据根 `sessions/` + `archived_sessions/`;逐轮 `last_token_usage` 增量按事件时间戳归日;fork/subagent 会话按 `forked_from_id` / `source.subagent.thread_spawn.parent_thread_id` 找父,取父会话 fork 时刻前的事件序列与子会话开头**逐条按值匹配**剥离重放;首条即不匹配则退化为「重写突发」启发式(前两事件间隔 ≤1s 即连续跳到间隔 >1s 处);口径 input 净化(减 cached)、cached 计 cacheRead、total 四项全加
2. 取末条 `total_token_usage` 作会话总量——否决:跨天会话无法分摊,且 fork 重放导致重复计费(实测 07-28 会多算 4.6 倍)
3. 逐轮 last 累加但不做 fork 剥离——否决:实测 07-28 多算 4.6 倍(449M vs 98M)
4. 官方接口——(未留档,定位排除)Codex CLI 无用量查询命令,本地 rollout 的 token_count 事件即事实上的统计途径

## 决策

选定**方案 1**。archived_sessions 与 fork 剥离缺一不可:补前者使 07-21 从 38.6M 修正到 127.8M(基准 127.5M),后者使 07-28 从 449M 修正到 98.2M(基准 97.8M)。

## 后果

- 正面:Codex 从"完全无数据"到与 ccusage 逐日差 ≤1.2%;跨天会话正确分摊;fork/subagent 重放不再双计
- 负面:仍有 ≤1.2% 系统性偏多——ccusage 另有 speed/service_tier 后缀、codex-auto-review 回退表、response_item 类事件等细节未复刻(见遗留清单)
- 中性:模型名取末条 turn_context(会话主模型近似),多模型会话不精确

## 来源

ccusage 源码(rust/adapters/codex/src/{paths,replay,parser}.rs,main@2026-07-30)、本机 208 个 rollout 实测、逐日对账脚本 `src/main/providers/ccusage-parity.test.ts`(PARITY=1 运行)。
