#!/bin/bash
# Task 17 of #240: a timeline of route 2 (install on quit), written while the owner runs it. Every second it reads
# which Agentshed processes run from /Applications (with the renderer's version argument), ShipIt, the installed
# bundle's version and ShipIt's new log lines, and prints a line whenever any of them changes. Right after ShipIt
# reports the installation it saves the unified log of the install, whose info-level lines age out within minutes.
# It ends once a run of 0.1.0-beta.2 has started, or after an hour.
# Usage: route2-watch.sh <unified log file> > <log file> 2>&1
set -u
ULOG="$1"
A=/Applications/Agentshed.app
L=~/Library/Caches/agentshed.aloong.com.ShipIt/ShipIt_stderr.log
SEEN=$(wc -l < "$L")
PREV=""
SAVED=0
END=$((SECONDS + 3600))
echo "# route 2 timeline from $(date '+%Y-%m-%d %H:%M:%S %Z'); ShipIt's log had $SEEN lines"
while [ $SECONDS -lt $END ]; do
  MAIN=$(pgrep -f "^$A/Contents/MacOS/Agentshed\$" | tr '\n' ' ')
  SHIP=$(pgrep -f "^$A/Contents/Frameworks/Squirrel.framework/Resources/ShipIt" | tr '\n' ' ')
  R=$(pgrep -f "Agentshed Helper \(Renderer\).*--app-path=$A/Contents/Resources/app.asar" | head -1)
  RV=""
  [ -n "$R" ] && RV=$(ps -o command= -p "$R" | grep -o -- '--agentshed-app-version=[^ ]*')
  VER=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$A/Contents/Info.plist" 2>/dev/null)
  STATE="main=[${MAIN% }] renderer=[${RV#--agentshed-app-version=}] shipit=[${SHIP% }] bundle=$VER"
  if [ "$STATE" != "$PREV" ]; then
    echo "$(date '+%H:%M:%S') $STATE"
    PREV="$STATE"
  fi
  N=$(wc -l < "$L")
  if [ "$N" -gt "$SEEN" ]; then
    sed -n "$((SEEN + 1)),${N}p" "$L" | sed 's/^/    shipit-log| /'
    SEEN=$N
  fi
  if [ $SAVED -eq 0 ] && grep -q 'Installation completed successfully' <(sed -n '/12:43:28.449/,$p' "$L"); then
    sleep 3
    /usr/bin/log show --last 5m --style compact --info --debug \
      --predicate 'process == "ShipIt" OR (process == "syspolicyd" AND eventMessage CONTAINS "RHQ28XS7D9")' > "$ULOG" 2>&1
    echo "$(date '+%H:%M:%S') saved the unified log of the install ($(wc -l < "$ULOG") lines)"
    SAVED=1
  fi
  if [ "${RV#--agentshed-app-version=}" = "0.1.0-beta.2" ]; then
    echo "$(date '+%H:%M:%S') a run of 0.1.0-beta.2 has started; done"
    exit 0
  fi
  sleep 1
done
echo "$(date '+%H:%M:%S') an hour passed without a run of 0.1.0-beta.2"
exit 1
