# ADR-0012: 插件 skill 预览与启用态解耦;Codex 插件 skills 不并入生效视图

- 状态: 已接受(2026-08-07)

## 背景与问题

skills-view 交付了磁盘 skill 的包预览(文件表 + 抽屉 + 消毒 md 渲染 + 精确路径白名单),插件来源 skill 的预览当时留作另票。现要求"从 Plugins 视图看到插件 skill 的内容"。三股作用力:Skills 分栏的并入规则是「仅有效启用插件的 skills 出现」(ADR-0010/G1);Codex 插件无启用态语义(plugins-view E8,探测式口径「不造假信号」);启用一个插件前先审阅它注入什么是 Plugins 视图的原始诉求(plugins-view User Story 3)。

## 备选项

1. **预览与启用态解耦;Codex 插件 skills 不并入生效视图**——Plugins 展开区的 skill 一律可原地预览(与启用态无关,启用前审阅是刚需;读取无副作用,无假信号风险);Skills 分栏的并入口径维持 G1 不变(仅有效启用、仅 Claude 侧);Codex 插件行新增展开仅列 skills 并原地预览,不进 Skills 分栏。
2. Codex 完整对齐 Claude(并入 Skills 分栏 + 启用态)——否决:需为 Codex 发明启用态语义,E8 已明确其语义未接入,并入即伪造「生效中」信号,违反「不造假信号」纪律。
3. 仅启用的插件 skill 可预览(与 G1 口径一致)——否决:把最有价值的「启用前审阅」场景关在门外;G1 管的是"什么算生效",与"什么可读"是两个问题。
4. 点击跳转到 Skills 分栏行(需求原字面)——否决:插件命名空间行此前不可预览,跳转落点信息增量≈0;即便解锁预览,用户裁定原地预览的上下文连续性更好(2026-08-07 批 2)。Skills 分栏插件行仍解锁为与磁盘 skill 同权预览,但作为独立入口而非跳转落点。

## 决策

选定**方案 1**:我们把插件 skill 的**可读性**与**启用态**解耦——Plugins 展开区(Claude 与 Codex、全局与详情)的 skill 一律可原地预览;**生效视图的并入口径不变**(仅有效启用、仅 Claude 侧,ADR-0010);Codex 插件 skills 永不并入生效视图,除非其启用态语义未来被官方接入(届时新开 ADR)。

## 后果

- 正面:启用前可审阅 skill 全文,Plugins 视图从"看名字"变成"看内容";Codex 侧零假信号;复用 skills-view 全套预览基建与白名单纪律,增量集中在包根解析与 Codex skills 枚举。
- 负面:「Plugins 里能看到的 skill」与「Skills 分栏里列出的 skill」集合不再一致(前者含未启用与 Codex),需要在文档与 UI 文案上把"可读 ≠ 生效"讲清,否则用户可能误以为未启用的 skill 也在生效。
- 中性:预览安全容器从"已知 skills 根"扩展为"扫描登记的插件包根集合"(C9 家族延伸);Codex 插件行为此新增展开区,E8 的"不支持展开"随之收窄为"除 skills 外不支持展开"。

## 来源

2026-08-07 需求对齐会话(三批决策);plugins-view spec E8/G1/User Story 3;skills-view spec Out of Scope「插件包预览另票」;磁盘实证 Codex 插件缓存目录约定与 Claude 同构(`~/.codex/plugins/cache/<marketplace>/<插件>/<版本>/skills/<名>/SKILL.md`)。
