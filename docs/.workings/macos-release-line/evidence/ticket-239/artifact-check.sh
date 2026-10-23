#!/bin/bash
# Task 13 of #239: an independent check of the published v0.1.0-beta artifacts, downloaded from the GitHub release
# (electron-scaffold macos-signing.md §7 and §10; the project runbook's "Checking a package by hand").
# `spctl --assess` is deliberately not run: on this Mac it is an assessment of the build, and task 16's offline first
# launch from a browser download must be this Mac's first one. `stapler validate` decides the stapled tickets; the
# signature checks do not assess.
# Usage: t239-verify.sh <log file>; exit 0 only when every check passed.
set -u
LOG="$1"
TAG=v0.1.0-beta
V=0.1.0-beta
REPO=aloong-planet/agentshed
IDENT='Developer ID Application: Longfei Zhou (RHQ28XS7D9)'
TEAM=RHQ28XS7D9
APP=Agentshed.app
DMG_NAME="Agentshed-$V-mac-arm64.dmg"
ZIP_NAME="Agentshed-$V-mac-arm64.zip"
EXPECTED_ASSETS="$DMG_NAME
$ZIP_NAME
$ZIP_NAME.blockmap
latest-mac.yml"
# The tagged tree (7dc0c22), for the fuse check, which needs only Node's built-in modules
FUSES_REPO=/Users/loong_zhou/CascadeProjects/agentshed-wt/release-beta
W=$(mktemp -d)
MP=""
FAIL=0
exec > "$LOG" 2>&1

run() { # a check whose exit code decides it: name, command...
  local name="$1"; shift
  echo; echo "## $name: $*"
  "$@"
  local c=$?
  echo "## exit code: $c"
  if [ "$c" -ne 0 ]; then FAIL=1; echo "## FAILED: $name"; fi
  return 0
}
ok() { echo "ASSERT ok: $1"; }
bad() { echo "ASSERT FAILED: $1"; FAIL=1; }
field() { # the value of the first "<key>=" line in a codesign --display output, compared whole, never as a substring
  awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$2"
}
signature() { # name, path: identity, team and timestamp of the signature, each compared whole (§6)
  local out="$W/sig-$1.txt"
  echo; echo "## signature of $1: codesign --display --verbose=4 $2"
  codesign --display --verbose=4 "$2" > "$out" 2>&1
  local c=$?
  cat "$out"; echo "## exit code: $c"
  [ "$c" -eq 0 ] || { bad "$1: codesign --display failed"; return 0; }
  local a t s
  a=$(field Authority "$out"); t=$(field TeamIdentifier "$out"); s=$(field Timestamp "$out")
  [ "$a" = "$IDENT" ] && ok "$1: Authority is '$a'" || bad "$1: Authority is '$a', expected '$IDENT'"
  [ "$t" = "$TEAM" ] && ok "$1: TeamIdentifier is $t" || bad "$1: TeamIdentifier is '$t', expected $TEAM"
  if [ -n "$s" ] && [ "$s" != "none" ]; then ok "$1: Timestamp is '$s'"; else bad "$1: Timestamp is '$s'"; fi
}
plist() { # name, app, key, expected
  local v
  v=$(/usr/libexec/PlistBuddy -c "Print $3" "$2/Contents/Info.plist" 2>&1)
  [ "$v" = "$4" ] && ok "$1: $3 is $v" || bad "$1: $3 is '$v', expected $4"
}
cleanup() {
  if [ -n "$MP" ] && mount | grep -q " on $MP "; then
    hdiutil detach "$MP" > /dev/null 2>&1 || hdiutil detach -force "$MP" > /dev/null 2>&1 || echo "cleanup: could not detach $MP"
  fi
  rm -rf "$W"
}
trap cleanup EXIT

echo "# Task 13 of #239: the published $TAG artifacts, checked independently"
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "macOS: $(sw_vers -productVersion) ($(uname -m)); Xcode tools: $(xcrun --find stapler)"
echo "spctl is not run here (see the header): it follows task 16's offline first launch"

echo; echo "## the release as GitHub reports it"
gh api "repos/$REPO/releases/tags/$TAG" > "$W/release.json"
echo "## exit code: $?"
python3 - "$W/release.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print(json.dumps({k: r[k] for k in ('name', 'tag_name', 'target_commitish', 'prerelease', 'draft', 'published_at')}, indent=1))
for a in r['assets']:
    print(f"asset {a['name']} size={a['size']} digest={a.get('digest')}")
PY
python3 - "$W/release.json" "$W/assets.tsv" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
with open(sys.argv[2], 'w') as f:
    for a in r['assets']:
        f.write(f"{a['name']}\t{a['size']}\t{a['browser_download_url']}\t{a.get('digest') or ''}\n")
PY
got_assets=$(cut -f1 "$W/assets.tsv" | sort)
want_assets=$(echo "$EXPECTED_ASSETS" | sort)
[ "$got_assets" = "$want_assets" ] && ok "the release holds exactly the four expected files" || bad "the release's files: $(echo $got_assets), expected: $(echo $want_assets)"
python3 -c "import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r['prerelease'] and not r['draft'] and r['name']==sys.argv[2] else 1)" "$W/release.json" "$TAG" \
  && ok "the release is public, marked Pre-release, titled $TAG" || bad "the release is not a public pre-release titled $TAG"

echo; echo "## downloads (resumed until the size GitHub reports; then sha256 against GitHub's digest)"
while IFS=$'\t' read -r name size url digest; do
  for i in $(seq 1 30); do
    curl -sSL --max-time 600 -C - -o "$W/$name" "$url" < /dev/null
    have=$(stat -f %z "$W/$name" 2>/dev/null || echo 0)
    [ "$have" = "$size" ] && break
    [ "$have" -gt "$size" ] && rm -f "$W/$name"
  done
  have=$(stat -f %z "$W/$name" 2>/dev/null || echo 0)
  [ "$have" = "$size" ] && ok "$name: $have bytes, after $i attempt(s)" || bad "$name: $have bytes, GitHub reports $size"
  sha=$(shasum -a 256 "$W/$name" | cut -d' ' -f1)
  if [ -z "$digest" ]; then bad "$name: GitHub reports no digest"; elif [ "sha256:$sha" = "$digest" ]; then ok "$name: sha256 $sha equals GitHub's digest"; else bad "$name: sha256 $sha, GitHub's digest $digest"; fi
done < "$W/assets.tsv"

DMG="$W/$DMG_NAME"
ZIP="$W/$ZIP_NAME"

echo; echo "# The DMG"
run "DMG: image integrity" hdiutil verify "$DMG"
run "DMG: signature" codesign --verify --verbose=4 "$DMG"
signature DMG "$DMG"
run "DMG: its own stapled ticket" xcrun stapler validate "$DMG"

echo; echo "# The app inside the DMG"
MP=$(mktemp -d)
run "DMG: mounted read-only, hidden from Finder" hdiutil attach -readonly -nobrowse -mountpoint "$MP" "$DMG"
echo "volume contents:"; ls -lA "$MP"
apps=$(cd "$MP" && ls -d *.app 2>/dev/null)
[ "$apps" = "$APP" ] && ok "the volume holds exactly one app, $APP" || bad "the volume's apps: '$apps'"
[ -L "$MP/Applications" ] && [ "$(readlink "$MP/Applications")" = "/Applications" ] && ok "the volume links to /Applications (US-001/AC-04)" || bad "no Applications link on the volume"
run "DMG app: its own stapled ticket" xcrun stapler validate "$MP/$APP"
run "DMG app: signature, deep and strict" codesign --verify --deep --strict --verbose=2 "$MP/$APP"
signature "DMG app" "$MP/$APP"
plist "DMG app" "$MP/$APP" LSMinimumSystemVersion 12.0
plist "DMG app" "$MP/$APP" CFBundleShortVersionString "$V"
run "DMG app: Electron fuses" node "$FUSES_REPO/scripts/check-fuses.mjs" "$MP/$APP"
run "DMG: detached" hdiutil detach "$MP"
MP=""

echo; echo "# The app inside the ZIP (the ZIP itself is never written to)"
D="$W/zip-out"; mkdir "$D"
run "ZIP: extracted" ditto -x -k "$ZIP" "$D"
entries=$(ls -A "$D")
[ "$entries" = "$APP" ] && ok "the ZIP holds exactly $APP" || bad "the ZIP's entries: '$entries'"
run "ZIP app: its own stapled ticket" xcrun stapler validate "$D/$APP"
run "ZIP app: signature, deep and strict" codesign --verify --deep --strict --verbose=2 "$D/$APP"
signature "ZIP app" "$D/$APP"
plist "ZIP app" "$D/$APP" CFBundleShortVersionString "$V"

echo; echo "# The update metadata against the published ZIP"
cat "$W/latest-mac.yml"
python3 - "$W/latest-mac.yml" "$ZIP" "$ZIP_NAME" "$V" <<'PY'
import base64, hashlib, os, sys, yaml
meta = yaml.safe_load(open(sys.argv[1]))
zip_path, zip_name, version = sys.argv[2], sys.argv[3], sys.argv[4]
data = open(zip_path, 'rb').read()
sha512 = base64.b64encode(hashlib.sha512(data).digest()).decode()
size = os.path.getsize(zip_path)
fails = []
def check(cond, text):
    print(('ASSERT ok: ' if cond else 'ASSERT FAILED: ') + text)
    if not cond: fails.append(text)
check(meta.get('version') == version, f"metadata version is {meta.get('version')!r}")
files = meta.get('files') or []
check(len(files) == 1 and files[0].get('url') == zip_name, f"metadata lists exactly the ZIP: {[f.get('url') for f in files]}")
if files:
    check(files[0].get('sha512') == sha512, f"metadata's sha512 for the ZIP equals the published ZIP's ({sha512[:16]}…)")
    check(files[0].get('size') == size, f"metadata's size for the ZIP equals the published ZIP's ({size})")
check(meta.get('path') == zip_name and meta.get('sha512') == sha512, "metadata's top-level path and sha512 name the same ZIP")
sys.exit(1 if fails else 0)
PY
[ $? -eq 0 ] || FAIL=1

echo
echo "CHECK_EXIT=$FAIL"
exit "$FAIL"
