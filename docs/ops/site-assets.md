# Website assets

Agentshed's website is built and deployed from the aloong-planet-home repository (`apps/agentshed/`). It takes two
things from the app: its screenshots and its icon. They change there only through a pull request that this repository's
command opens (aloong-planet-home `app-sites::REQ-004/AC-01`); nobody edits them in that repository by hand.

## Sending new assets

```sh
pnpm site:assets --shots <directory>             # opens the pull request
pnpm site:assets --shots <directory> --dry-run   # stops after the local commit and prints what it would send
```

The directory holds the retaken screenshots, exactly twelve files `<view>-<language>.png`: the views `overview`,
`project`, `memory`, `tokens`, `session` and `search`, each in `en` and `zh`, every one a whole PNG of 1840×1035 pixels.
Anything missing, extra, damaged or of another size stops the run before anything is cloned, and every problem is
listed. The command also scales `build/icon.png` to `icon-64.png` and `icon-256.png` with `sips`, so it runs on macOS,
and `build/icon.png` must be committed: the pull request names this repository's HEAD as the source of the assets.

The command clones the website repository into a temporary directory, writes the fourteen files under
`apps/agentshed/public/`, and checks that those are the only paths changed or staged; then it commits on the branch
`assets/agentshed-<date>-<commit>`, pushes it and opens the pull request with `gh`. When every file is already what the
website has, it says so and opens nothing. A failed run keeps its clone and names it. The command never merges the pull request.

## The screenshots

They are taken from the app by hand, at the same size as before (920×517pt at 2×), and never by the command. The
overview, project, tokens and Chinese session cuts show the owner's own data, approved for publication on 2026-10-13;
the memory, search and English session cuts show made-up data. The icon is the app's `build/icon.png`.

## An evidence run

`--title <text>` replaces the pull request's title and `--note <text>` adds a line at the top of its body. They are for
a run whose pull request is not meant to be merged, such as the one that shows the command works end to end: it says so
in both, and the pull request is closed and its branch deleted at once.
