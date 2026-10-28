#!/bin/bash
# Task 17 of #240, its first step (D4): put the installed v0.1.0-beta back from the byte-for-byte copy made before
# route 1 (route1-staged.txt), so that route 2 (install on quit) starts from the same installation.
# The 0.1.0-beta.2 that route 1 installed is moved aside into the scratchpad, not deleted.
# Usage: route2-restore.sh <scratchpad> > <log file> 2>&1; exit 0 only when every check passed.
set -u
SP="$1"
A=/Applications/Agentshed.app
B="$SP/v0.1.0-beta-backup/Agentshed.app"
ASIDE="$SP/v0.1.0-beta.2-route1/Agentshed.app"
BETA_CDHASH=93cc81731ebf215da53330e9e1bef70acdc7b228

FAILS=0
run() {
  local name="$1"; shift
  echo "## $name: $*"
  "$@"; local rc=$?
  echo "(exit $rc)"
  if [ $rc -eq 0 ]; then echo "ok: $name"; else echo "FAIL: $name"; FAILS=$((FAILS + 1)); fi
  echo
}

echo "# restore v0.1.0-beta for route 2, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "# <scratchpad> is $SP"
echo
run "nothing runs from the installed app" bash -c "! pgrep -f '^$A/Contents/(MacOS/Agentshed|Frameworks/Squirrel.framework/Resources/ShipIt)'"
[ $FAILS -eq 0 ] || { echo "FAILS=$FAILS"; exit $FAILS; }
run "the installed app is route 1's 0.1.0-beta.2" bash -c "[ \"\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' '$A/Contents/Info.plist')\" = 0.1.0-beta.2 ]"
[ $FAILS -eq 0 ] || { echo "FAILS=$FAILS"; exit $FAILS; }
run "move it aside" bash -c "mkdir -p '$(dirname "$ASIDE")' && mv '$A' '$ASIDE'"
run "copy v0.1.0-beta back" ditto "$B" "$A"
run "version" /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$A/Contents/Info.plist"
CD=$(codesign -dvvv "$A" 2>&1 | sed -n 's/^CDHash=//p')
echo "CDHash=$CD (v0.1.0-beta: $BETA_CDHASH)"
run "CDHash is v0.1.0-beta's" test "$CD" = "$BETA_CDHASH"
run "signature" codesign --verify --deep --strict "$A"
run "byte compare with the copy (diff -r, no output = identical)" diff -r "$A" "$B"
run "extended attributes as on the copy" bash -c "[ \"\$(xattr '$A')\" = \"\$(xattr '$B')\" ]"
xattr "$A"
echo
echo "## the version record v0.1.0-beta will read on its launch"
cat ~/Library/Application\ Support/Agentshed/last-run-version.json
echo
echo
echo "FAILS=$FAILS"
[ $FAILS -eq 0 ]
echo "CHECK_EXIT=$?"
exit $FAILS
