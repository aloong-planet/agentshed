# Reviewer notes: prototype-heading-ladder.html

## Question

How the heading ladder of rendered Markdown (h1–h6) tells adjacent levels apart — h3 from h4 above all — and how
one ladder holds on both preview surfaces, the skill file drawer and the `.md` document card. The page draws the
shape-layered ladder on both surfaces from one fixture: h1 with a bottom rule, h2 with a left bar, h3 in the third
accent step, h4 to h6 in grey, sizes stepping down gently. Beside it, it draws the code and table forms the two
surfaces share. The feature is Markdown rendering's typography, the appearance spec's sequence E.

Where each case is drawn: h3, body, then h4 under 「使用流程」; 「排版约定」 (h3) directly followed by 「标题层级」
(h4) with no body between them; the h5/h6 tail; the two long headings at the end, an h3 directly followed by an
h4, both written to wrap; code blocks and lists close to headings; the 「分组对照」 table, with the three alignments,
inline code in cells, a long cell that wraps in the narrow container and four body rows (the stripes visible).
The geometry of the drawer's raw/preview toggle is not what this page judges.

## Structure basis

- The page draws no app window: it is a sheet setting the two preview surfaces side by side over one fixture.
- The left sample is the shared Markdown preview piece, with its bar (the file name and the raw/preview toggle),
  as the file drawer holds it for skill files, a plugin's skill files and memory files.
- The right sample is the `.md` document card on which the app renders a main memory file, a configuration
  document such as CLAUDE.md, and the artifact reader's content: its container and its code, block and list rules.
- The heading ladder, the code forms and the table form: the directions the owner confirmed, stated in the
  appearance spec's sequence E (E1–E7d).

## Demo scaffolding

The page has no demo harness. The interface language, light/dark and colour scheme follow the gallery's settings
and the settings prototype; the page has no switch for them. Of the language, only the drawer's raw/preview toggle
changes.

- The page head — the heading 「Markdown 预览 · 标题层级阶梯」, the paragraph under it and the legend table of the
  ladder's sizes — and the two column captions (「SKILL 文件抽屉(…)」, 「文档卡 .md(…)」): reviewer annotations —
  not part of the design; do not implement. They stay in Chinese in every language.
- The side-by-side sheet: a comparison layout, not an app screen — not part of the design; do not implement. In
  the product each surface sits in its own view: the file drawer opens over the view that lists the file; the
  document card sits where the main memory file and the configuration documents are shown, and in the artifact
  reader.
