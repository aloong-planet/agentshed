#!/bin/bash
# Build a "test-silenced" copy of the Electron dist: Info.plist gains LSUIElement=true.
#
# Why the plist rather than JS: the Dock icon is registered from the plist during Electron's **native
# bootstrap**,
# while app.dock.hide() only runs in main-process JS hundreds of milliseconds later — so every instance
# flashes and disappears,
# and e2e's 18 instances back to back make the Dock jitter continuously. LSUIElement=true makes it a
# UIElement from the moment
# it registers (no Dock icon, no menu bar), so there is no window in which to flash.
#
# The original is untouched: the copy lives in node_modules/.cache/electron-quiet/ and tests point at it
# through ELECTRON_OVERRIDE_DIST_PATH (natively supported by electron/index.js);
# a normal pnpm dev and the packaged build still use the original, with unchanged Dock behaviour.
#
# Idempotent and version-aware: if the copy's version matches the original and the plist already carries
# the marker → exit immediately;
# it rebuilds automatically after an Electron upgrade. Needed on macOS only; a no-op elsewhere.
set -euo pipefail
[ "$(uname)" = "Darwin" ] || exit 0
cd "$(dirname "$0")/.."

SRC=node_modules/electron/dist
DST=node_modules/.cache/electron-quiet/dist
PLIST="$DST/Electron.app/Contents/Info.plist"

[ -f "$SRC/version" ] || { echo "quiet-electron: cannot find $SRC/version (electron not installed?)" >&2; exit 1; }

# The fast path's criterion includes a completion marker, which only lands **after every step has
# succeeded** — otherwise, if codesign failed
# after the plist was written, the next fast path would judge "ready" from the version plus the plist and
# forever admit a copy with
# an invalid signature (which simply will not start on arm64), with nobody knowing to clear the cache.
if [ -f "$DST/.quiet-ok" ] && [ "$(cat "$DST/version")" = "$(cat "$SRC/version")" ] \
   && /usr/libexec/PlistBuddy -c "Print :LSUIElement" "$PLIST" >/dev/null 2>&1; then
  exit 0
fi

rm -rf "$DST"
mkdir -p "$(dirname "$DST")"
# APFS copy-on-write: seconds and near-zero disk; a non-APFS volume falls back to an ordinary copy
cp -Rc "$SRC" "$DST" 2>/dev/null || cp -R "$SRC" "$DST"

/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST"

# Editing the plist breaks the signature seal; arm64 requires a valid (at least ad-hoc) signature, and
# the original is ad-hoc anyway.
# stderr is not swallowed: under set -e a failure should die with its reason rather than silently leaving
# something half-finished
codesign --force -s - "$DST/Electron.app"

touch "$DST/.quiet-ok"   # The completion marker lands last, and the fast path goes by it
echo "quiet-electron: copy ready ($(cat "$DST/version"))"
