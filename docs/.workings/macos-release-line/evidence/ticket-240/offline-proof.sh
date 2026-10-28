#!/bin/zsh
# Run in Terminal with the network off, after downloading the DMG in Chrome and before opening it.
# It records, with times, that the DMG carries the quarantine attribute and that Apple cannot be reached.
OUT=~/Desktop/agentshed-offline-check/offline-proof.txt
{
  print -r -- "# offline proof, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  print -r -- "\$ ls -l ~/Downloads/Agentshed-0.1.0-beta.2-mac-arm64*.dmg"
  ls -l ~/Downloads/Agentshed-0.1.0-beta.2-mac-arm64*.dmg
  for f in ~/Downloads/Agentshed-0.1.0-beta.2-mac-arm64*.dmg; do
    print -r -- "\$ xattr -p com.apple.quarantine \"$f\""; xattr -p com.apple.quarantine "$f"; print -r -- "(exit $?)"
  done
  print -r -- "\$ networksetup -getairportpower en0"; networksetup -getairportpower en0
  print -r -- "\$ curl -sS -m 8 -o /dev/null https://api.apple-cloudkit.com/"; curl -sS -m 8 -o /dev/null https://api.apple-cloudkit.com/; print -r -- "(exit $?: non-zero means Apple's ticket service was not reached)"
  print -r -- "\$ curl -sS -m 8 -o /dev/null https://www.apple.com/"; curl -sS -m 8 -o /dev/null https://www.apple.com/; print -r -- "(exit $?)"
  print -r -- "# done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT" 2>&1
cat "$OUT"
