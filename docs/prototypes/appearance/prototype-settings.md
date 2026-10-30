# Reviewer notes: prototype-settings.html

## Question

How the settings page reads and behaves in the appearance, i18n and app-update features. The page answers the
form of its three sections and of the update surfaces they work with:

- Language (「语言」): the 「界面语言」 dropdown — 「跟随系统」, a divider, 「简体中文」 and 「English」, each item in its
  own language with the English name beside it, 「跟随系统」 showing the language it resolves to there and on the
  trigger, the current item ticked; the keyboard opens the overlay and cycles its three items.
- Appearance (「外观」): one card with 「模式」 as a three-segment control (「跟随系统」「浅色」「深色」) and 「配色」 as
  three palette cards (「紫」「雾蓝」「琥珀褐」), each a swatch row sampled in the light/dark in effect and a name; a
  choice recolours the page at once, with no save button.
- Updates (「更新」): 「自动检查更新」 as an 「开 / 关」 segmented control; 「当前版本」 with the running version, the
  result line and one button — 「立即检查」, or 「立即安装」 while an update is ready or installing; the footnote,
  replaced in a development run.
- The update button in the navigation rail's bottom group, above Settings, present only while an update is
  downloading (a progress ring), installing (a spinning loader) or ready (the download icon, the only clickable
  state), with its instant tooltip; and the update toasts (the menu check's outcomes, the failed install).

The page opens with an update ready, so the rail button is there to hover. It does not draw the application
menu's 「检查更新…」 item, a native menu; a harness action stands in for it.

The toast the page shows after a mode or palette choice (「外观模式：…」, 「配色已切换为「…」」) is not settled: no
spec states it and the app shows none for these choices. It is a difference between the page and the app, open
until the owner decides it.

## Structure basis

- The app window and the navigation rail, with Settings current: as every prototype page draws them (the shared
  app window and rail pieces).
- The page's order and row form — Language, then Appearance, then Updates, each section a heading, a card of rows
  with the label on the left and the control on the right, and a footnote under the card: the direction the
  owner confirmed, stated in the i18n spec's UI conclusions, the appearance spec's UI decisions and
  app-update::REQ-003/AC-01.
- The language dropdown and its overlay: the direction the owner confirmed, stated in the i18n spec's UI
  conclusions.
- The appearance card (the 「模式」 segmented control, the 「配色」 cards holding a swatch and a name only): the
  direction the owner confirmed, stated in the appearance spec's sequence D and UI decisions.
- The updates card and footnote, and the rail's update button (a 36px rail slot holding a 24px filled circle in
  the accent colour, its glyph in the card colour): the direction the owner confirmed, stated in the app-update
  spec (REQ-001, REQ-003).
- The update button's tooltip: the floating surface's one tooltip form, the one the session page prototype's
  header buttons take.

## Demo scaffolding

- The demo bar at the bottom (「Demo ·」): not part of the design; do not implement. The app has none of these
  controls.
  - 「运行方式」 (「打包版」 / 「开发运行(未打包)」): in the product, whether the app is packaged.
  - 「下次检查返回」 (an update found, 「已是最新」, 「检查失败」): in the product, what GitHub Releases answers to
    the update check. After a played update the first option names the next version.
  - 「点击安装后」 (「安装成功并重启」 / 「安装失败」): in the product, whether the system manages to replace the app.
  - 「动作」: 「自动检查触发」 stands for the launch check and the 24-hour timer; 「菜单「检查更新…」」 for the
    application menu item; 「后台下载失败」 for a background download failing; 「退出再打开」 for the user quitting
    and launching the app again. The restart after an install is played by the page.
  - The two note lines: the readout of the language and light/dark in effect (「生效:…」), which an action's
    message replaces for a few seconds, and the line saying what decides each state in the product.
- The two dashed note boxes at the end of the settings page (「更新 · 验收」… and 「验收」…): reviewer notes drawn
  inside the page — acceptance steps, design choices and implementation points; not part of the design; do not
  implement.
- The system stand-in: with 「跟随系统」 chosen, the page shows the language and light/dark set in the gallery's
  settings; not part of the design; do not implement. In the product the language resolves from the macOS
  preferred languages (English when none is supported) and light/dark follows the macOS appearance.
- Light/dark applied as an attribute on the page's root element: the prototype's stand-in; do not implement. In
  the product the mode decides the light/dark the whole window renders in, its chrome and the native menu
  included (the appearance spec's implementation decisions).
- The shared values: this page writes the language, light/dark and palette every other prototype page shows; the
  gallery's settings write the language and light/dark only, so the palette is changed on this page alone. This
  page's preferences are restored when it reopens. Not part of the design; do not implement. In the product each
  preference is saved by the app and applies to the whole app at once.

## Invalidated conclusions

- The lead line under 「设置」 (「本 app 偏好，对整个界面生效。不写入 Claude / Codex 配置。」 / "Preferences for this
  app only. They apply to the whole interface and are never written to your Claude or Codex configuration."): it
  names two agent sides as if they were all of them. Authoritative: the copy invariant in AGENTS.md, that
  user-facing copy never enumerates the agent sides as an exhaustive set.
- The toast at the bottom centre: this page shows one toast at a time and hides it after 2.2 s. Its timing and
  stacking are the shared toast's, which the Agents page, project detail and session view prototypes draw:
  toasts stack and each leaves after 3.2 s (app-update spec, failure mode G6: the update toasts use the app's
  existing toast).
- The updates note box: the paragraph over items (g)–(k) marks them as awaiting confirmation on the prototype
  (「…待看原型确认」). They are confirmed; the app-update spec is authoritative (REQ-002/AC-03, REQ-004/AC-01,
  REQ-004/AC-04, US-003/AC-02, REQ-003/AC-04).
- The language and appearance note box, item ④: it checks the semantic colours of two agent sides only
  (「CC/CX 语义色均可辨」). Every side's badge colours must stay distinguishable in the six palette × light/dark
  combinations; the appearance spec's sequences B5 and C2 are authoritative.
