# ADR-0005: Token 统计对齐 ccusage(全树扫描 + 去重 + 四项口径)

- 状态: 已接受(2026-07-30)

## 背景与问题

初版口径(ADR-0003)按注册表项目累加、总量只算 input+output、无去重。与事实数据对不上:①未注册/已清注册的项目会话漏计;②Claude subagent 转写会以新 requestId **重放父消息**(ccusage 源码注释坐实),逐行累加导致双重计费;③用户以 ccusage 为对账基准,总量口径不一致(ccusage 四项全加)。

## 备选项

1. **对齐 ccusage(源码级核实,仓库 ccusage/ccusage Rust 实现)**:Claude 递归扫 `~/.claude/projects` 全树(与注册表无关);条目级去重——精确键 `message.id + requestId`,任一方 `isSidechain` 时回退 message.id-only,保留非 sidechain、其次 token 四项和更大者;总量 = input+output+cacheCreation+cacheRead 四项全加;`<synthetic>`/缺失模型计总量不入模型桶;日切默认本地时区
2. 维持 ADR-0003 口径(cache 单列不计入、按注册项目累加)——被本条取代:与用户对账基准冲突,且漏计与双计是事实性错误
3. 完全复刻 ccusage 全部细节(XDG 双根、CLAUDE_CONFIG_DIR、null 字段拒收、advisor 迭代拆分、-fast 后缀)——暂缓:主干对齐已满足对账需求,长尾细节按需补(重启条件:数字与 ccusage 仍有可感差异)

## 决策

选定**方案 1**。Codex 侧口径保持原生:total = input + output + cacheWrite(其 input 已含 cached,不重复加);增量缓存改存**条目级**数据——去重必须跨文件,在聚合层进行,不能缓存去重后的结果。

## 后果

- 正面:与 ccusage 可对账;消除 subagent 重放双计与未注册项目漏计;总量含 cache 后数字量级与用户直觉(ccusage 报表)一致
- 负面:缓存体积增大(条目级);两侧 total 语义不完全同构(Codex cached 是 input 子集,天然无法四项全加)
- 中性:ADR-0003 标记为已被本条取代;XDG 第二数据根等长尾差异入遗留清单

## 来源

ccusage 源码级调研(2026-07-30,main@a71d92eb2fc9:rust/adapters/claude/src/lib.rs 的 push_deduped_entry/should_replace_deduped_entry、paths.rs 全树枚举、ccusage-core/types.rs TokenCounts::total);本机 subagents 目录实测。
