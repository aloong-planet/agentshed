#!/bin/bash
# Tasks 14 and 15 of #240. Task 14: the evidence of the offline first launch (mac-distribution::US-001/AC-02, deferred
# from #239), read back after the network returned. Task 15: `spctl` on the browser-downloaded DMG and the launched app,
# which could only run after task 14 (artifact-check.sh's header).
# The owner downloaded the DMG in Chrome, disconnected Wi-Fi, ran proof.sh (its output is offline-proof.txt), opened the
# DMG, dragged Agentshed into a folder of its own and opened it there; the prompt is offline-launch-prompt.png.
# The log windows are local time (CST, UTC+8) on 2026-10-28.
# Usage: offline-launch-check.sh > <log file> 2>&1; exit 0 only when every check passed.
set -u
DIR=~/Desktop/agentshed-offline-check
APP="$DIR/Agentshed.app"
DMG=~/Downloads/Agentshed-0.1.0-beta.2-mac-arm64.dmg
TAG=v0.1.0-beta.2
# artifact-check.txt: the CDHash of the app in the published DMG and in the published ZIP
RELEASE_APP_CDHASH=24cf8bc0a440915e6a7d9680eb9543dd58b1f78e

FAILS=0
run() {
  local name="$1"; shift
  echo "## $name: $*"
  "$@"; local rc=$?
  echo "(exit $rc)"
  if [ $rc -eq 0 ]; then echo "ok: $name"; else echo "FAIL: $name"; FAILS=$((FAILS + 1)); fi
  echo
}

echo "# offline first launch and spctl, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "macOS: $(sw_vers -productVersion) ($(uname -m))"
echo

echo "# 1. proof.sh, run by the owner in Terminal after disconnecting (offline-proof.txt)"
cat "$DIR/offline-proof.txt"
echo

echo "# 2. Wi-Fi: disconnected from Control Center, reconnected after the launch (airportd)"
/usr/bin/log show --start "2026-10-28 12:20:00" --end "2026-10-28 12:31:00" --style compact \
  --predicate 'process == "airportd" AND (eventMessage CONTAINS "DISASSOC" OR eventMessage CONTAINS "LINK_CHANGED" OR eventMessage CONTAINS "Link down event")'
echo

echo "# 3. Gatekeeper's ticket lookups and assessments in the offline window (syspolicyd)"
/usr/bin/log show --start "2026-10-28 12:24:00" --end "2026-10-28 12:30:00" --style compact --info \
  --predicate 'process == "syspolicyd" AND (eventMessage CONTAINS "cloudkit" OR eventMessage CONTAINS "reachability" OR eventMessage CONTAINS "RHQ28XS7D9" OR eventMessage CONTAINS "notarization date" OR eventMessage CONTAINS "GK process assessment" OR eventMessage CONTAINS "GK eval")'
echo

echo "# 4. Every Gatekeeper scan of this team's code from the release build (01:47) to the end of the offline window"
SCANS=$(/usr/bin/log show --start "2026-10-28 01:40:00" --end "2026-10-28 12:31:00" --style compact --info \
  --predicate 'process == "syspolicyd" AND eventMessage CONTAINS "GK performScan" AND eventMessage CONTAINS "RHQ28XS7D9"')
echo "$SCANS"
N=$(printf '%s\n' "$SCANS" | grep -c 'GK performScan')
echo "scans of team RHQ28XS7D9: $N"
run "the offline launch is this Mac's only scan of the team's code since the release build" test "$N" -eq 1
echo

echo "# 5. The launched copy is the published build"
run "version" /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist"
CD=$(codesign -dvvv "$APP" 2>&1 | sed -n 's/^CDHash=//p')
echo "CDHash=$CD (published: $RELEASE_APP_CDHASH)"
run "CDHash equals the published app's" test "$CD" = "$RELEASE_APP_CDHASH"
run "its own stapled ticket" xcrun stapler validate "$APP"
run "quarantine after the owner's approval" xattr -p com.apple.quarantine "$APP"
echo

echo "# 6. The DMG Chrome downloaded is the published one"
WANT=$(gh api "repos/aloong-planet/agentshed/releases/tags/$TAG" --jq '.assets[] | select(.name == "Agentshed-0.1.0-beta.2-mac-arm64.dmg") | .digest')
GOT="sha256:$(shasum -a 256 "$DMG" | cut -d' ' -f1)"
echo "release asset digest: $WANT"
echo "downloaded DMG:       $GOT"
run "DMG digest equals the release asset's" test -n "$WANT" -a "$WANT" = "$GOT"
echo

echo "# 7. Task 15: spctl, now that the offline launch is done"
run "spctl: the app" spctl --assess -vvv --type execute "$APP"
run "spctl: the DMG" spctl --assess -vvv --type open --context context:primary-signature "$DMG"
SRC=$(spctl --assess -vvv --type execute "$APP" 2>&1; spctl --assess -vvv --type open --context context:primary-signature "$DMG" 2>&1)
run "both are Notarized Developer ID" test "$(printf '%s\n' "$SRC" | grep -c '^source=Notarized Developer ID$')" -eq 2

echo "FAILS=$FAILS"
[ $FAILS -eq 0 ]
echo "CHECK_EXIT=$?"
exit $FAILS
