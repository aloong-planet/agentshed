# Application icon assets

- `icon.png`: canonical production artwork, icy cyan, RGBA PNG.
- `icon-dev.png`: canonical development artwork, golden yellow, RGBA PNG.
- `icon.icns`: production macOS bundle icon, generated from `icon.png`.

Run `bash build/generate-icon.sh` on macOS after replacing the production PNG. It generates all ten
standard iconset representations (16 through 1024 physical pixels) using `sips` and `iconutil`.
PNG and ICNS outputs are committed, so ordinary builds need no image-processing dependencies.
`electron-builder.yml` selects the ICNS; an unpackaged macOS run loads the development PNG relative
to the built main module. No installed Electron binary or application data is modified.

The user-approved source images are retained in the application-icon visual study. Their exterior
checkerboard was painted into RGB data. With the user's approval, preparation removed only the bright
background connected to the image boundary (luminance greater than 105), using the continuous dark
casing rim as the boundary. A one-pixel inward cut with a 0.45-pixel feather removes mixed edge pixels.
The enclosed core, light segments and metal supports retain their source RGB pixels unchanged.

The prepared PNGs are the source for future packaging; do not regenerate their design during a build.
