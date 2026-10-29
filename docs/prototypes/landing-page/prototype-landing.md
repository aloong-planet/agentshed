# Reviewer notes: prototype-landing.html

## Question

How do Agentshed's public landing page — the download website at agentshed.aloongplanet.com, not the app — and
its download offer look and behave? The page draws the long page from header to footer, in Chinese and English,
light and dark, and answers whether it reads right: the hero with the download, the features section that shows
six of the app's views (pinned under the header and turned by the scroll on a wide screen, stacked on a phone),
the three install steps, and the download offer in each of its four states — a formal release from the R2 mirror,
a formal release with every link on GitHub, only a test version, and the list of releases on GitHub when nothing
can be read. It prototypes the landing page feature (`landing-page`).

## Structure basis

- **The page as a whole** follows the long-page form "L1", a direction the owner confirmed, modelled on
  Transfer's landing page: header, hero with the download, features, install steps, download section, footer.
  The download row on a phone — its label on its own line, its buttons sharing the full width below — follows
  Transfer's page as well.
- **The features section** follows a direction the owner confirmed: the layout of a reference page the owner
  supplied. A showcase pins under the header; a narrow left column holds the current step's count ("01 / 06"),
  title and text; the step's screenshot stands large on the right; each turn cross-fades the text and the
  screenshot together, in place. Only that layout is followed: the window frame round the screenshot, the
  palette, the type and the download buttons are this page's own, and the section has no stacked cards, no
  progress dots and no hint to scroll. On a phone the steps stack, each screenshot under its text.
- **The six steps** take one form, in the order the owner confirmed: the overview, what each project has, what
  the agents remember, token usage and trends, sessions revisited, search across projects. Each screenshot is a
  cut of the app screen its image's alt text names; the hero's screenshot is the whole app window, with the
  Search item in its rail.
- **The language toggle** (中文 / EN, at the right of the header) is part of the design: the landing page's own
  switch between its two languages, Chinese and English. It is not demo scaffolding and does not follow the
  gallery's interface-language setting.
- **Colours** follow the prototypes' shared purple theme (the app's palette), with this page's own tokens on
  top, in light and dark.

## Demo scaffolding

- **The floating bar at the bottom** (`data-demo-harness`, labelled "Demo ·") — not part of the design; do not
  implement. Its two groups, 下载状态 and 读取失败, are one choice of four: only a test version, a formal
  release, 有正式版,R2 读不到 and 两处都读不到; the versions on its options are mock values. On the site the
  visitor's browser decides the state: the R2 latest pointer when it reads (formal, from R2); otherwise GitHub's
  public releases API (its latest formal release, with every link on GitHub, or else its newest pre-release, as
  a test version); and the list of releases on GitHub when neither reads, which is also the page before its
  script runs. The site has no such control; the bar's note line says so on the page.
- **Light and dark** follow the gallery's unified settings, which stand in here for the visitor's system
  appearance — not part of the design; do not implement. On the site the visitor's system appearance decides;
  the page has no appearance control.
- **The dashed note box at the foot of the page** (验收 …, 已确认 …, 演示基建 …) — a reviewer note drawn in the
  page; not part of the design; do not implement. Nothing in the product corresponds to it: the site has
  nothing in its place.

## Invalidated conclusions

- **The dashed note box at the foot of the page**: its lists are a log tied to the dates they name, not the
  page's conclusions. Items (h) and (i) are marked 待看原型确认, though the list state and the formal state from
  GitHub are settled, and item (o)'s word-for-word match between the hero paragraph and the README does not
  apply (the box itself says so). Authoritative: what the rest of the page draws, and the landing-page spec for
  the download states and the screenshots.
