# Application icon assets

- `icon.png`: canonical production artwork, icy cyan, RGBA PNG.
- `icon-dev.png`: canonical development artwork, golden yellow, RGBA PNG.
- `icon.icns`: production macOS bundle icon, generated from `icon.png`.

Run `bash build/generate-icon.sh` on macOS after replacing the production PNG. It generates all ten
standard iconset representations (16 through 1024 physical pixels) using `sips` and `iconutil`.
PNG and ICNS outputs are committed, so ordinary builds need no image-processing dependencies.
`electron-builder.yml` selects the ICNS; an unpackaged macOS run loads the development PNG relative
to the built main module. No installed Electron binary or application data is modified.

The current approved artwork uses an evenly dark graphite-gray casing, no overhead lighting gradient, and
subdued upper support highlights matching the lower supports. The prepared PNGs are the source for
future packaging; do not regenerate their design during a build.

Both approved previews contain a painted exterior checkerboard. Using the previously
authorized preparation, pixels brighter than luminance 105 connected to the boundary become
transparent; a one-pixel inward cut and a 0.45-pixel feather clean the silhouette edge. Both variants
preserve their approved source RGB pixels unchanged.
