# ADR-0015: 跨 IPC 的失败以错误码与参数传递,措辞留给 renderer

- 状态: 已接受(2026-08-08)

## 背景与问题

主进程与 preload 目前直接抛出中文成句错误(`src/main/index.ts` 21 处 `throw`、`providers/install.ts` 8 条 `SkillOpResult.message`、`preload/index.ts` 6 处、`shared/validate.ts:19-74` 整层校验原因),renderer 取 `e.message` 原样渲染(如 `SessionPane.tsx:286`「会话打不开:{err}」)。这使得界面文案有一部分固化在跨进程边界之外,i18n 无法只在 renderer 侧完成。更坏的是文案已被当作程序值使用:`SubagentsView.tsx` 的 `errLabel` 靠 `includes('不可读')` 决定展示分支——措辞一改,该分支静默失效且没有测试会红。

## 备选项

1. **跨 IPC 只传错误码与参数,不含自然语言;措辞在 renderer 按当前语言生成;校验层一并纳入**
2. 只把用户常见错误结构化,`validate.ts` 这类开发者向诊断保留原文——否决:诊断信息同样会经 `e.message` 冒到 UI(`SessionPane.tsx:286` 的渲染路径不区分错误来源),保留即等于在故障场景下向非中文用户暴露中文,而故障场景恰恰是最需要看懂的时候
3. 错误文案统一英文化、不进 i18n——否决:中文用户在故障场景反而降级;且 `includes` 匹配的隐患原样保留,只是把中文串换成英文串
4. renderer 侧建「中文原句 → 各语措辞」映射表——否决:等于把成句文案当 key,源语言一改措辞映射即断,且无法携带 `轮次下标越界:{i}(共 {n} 轮)` 这类参数

## 决策

选定**方案 1**:我们让跨 IPC 边界的失败一律以错误码加参数的形式传递,不含任何自然语言措辞;renderer 收到后按当前语言渲染。ADR-0001 确立的「shared 三件套」(领域类型 / channel / 结构校验)相应扩为四件,错误码枚举与其参数类型同样收在 `src/shared/`,两端只从此处导入。基于错误语义的分支判断改为按错误码判定,不再匹配文案子串。

## 后果

- 正面:错误措辞可翻译,i18n 得以在 renderer 侧闭合,不留「一半界面能翻、一半不能」的窟窿
- 正面:错误码成为稳定契约,语义分支不再随措辞漂移;`errLabel` 那类隐患在改造中一并消除
- 正面:错误码集合是显式枚举,新增失败路径时「这条要不要给用户看、叫什么」变成必答题,而非随手 throw 一句话
- 负面:每新增一种失败都要同步新增错误码与六语措辞,比直接抛字符串贵;开发期临时诊断的摩擦变大
- 负面:一次性改造面覆盖 main / preload / shared 三处约 40 个抛出点,不是增量能做完的
- 中性:错误码只承载结构级语义,不带堆栈;需要细节时由参数承载
- 中性:`SkillOpResult.message` 这类契约字段的形状随之改变,其现有测试需同步调整

## 来源

2026-08-08 需求对齐会话。调研枚举的现存抛出点:`src/main/index.ts` 行 188/203/204/217/238/244/246/247/251/261/263/264/265/273/275/278/288/302/305/308/318/323/335/348/349/353/359/360,`src/main/providers/install.ts:33,35,38,42,57,69,72,77`,`src/preload/index.ts:29,35,50,57,67,74`,`src/shared/validate.ts:19-74,81`,`src/main/security.ts:87`,`src/renderer/src/md-links.ts:32,36`。文案被当程序值的实例:`src/renderer/src/SubagentsView.tsx` 的 `errLabel`。本条为 ADR-0001(IPC 契约单一类型源与双侧运行时校验)的延伸。

**两处订正(2026-08-09 票 05 实施时发现)**:
1. 上述实例原记为 `MemoryView.tsx:91`,**文件名记错了**(行号恰好相同)。实施时按"否定结论要换手段"做了全库检索(`includes` / `startsWith` / `===` 后跟中文字面量),确认全仓**有且仅有**这一处,在 `SubagentsView.tsx`。
2. 载体形态本 ADR 未定,实施时实测确定:Electron 跨 IPC 回传时 **Error 的自定义属性一律丢失**(只剩 `message` / `stack`),且 message 被包一层 `Error invoking remote method '…': Error: …` 前缀。故码与参数只能序列化进 message,解码需按标记在被包裹的串里定位——`e.code = …` 与直接 `JSON.parse(message)` 两种自然写法都不可行。
