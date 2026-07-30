#!/bin/bash
# dev 冒烟:启动 → 抓主进程错误 → 杀父进程验孤儿防护。
# 注意:此脚本跑在**真实 userData** 上,缓存状态取决于上次运行——
# 「旧格式缓存」这类迁移场景由 e2e(独立 userData + 预置缓存)覆盖,不要指望本脚本能抓到。
set -u
cd "$(dirname "$0")/.."
LOG=/tmp/agentshed-smoke.log
pnpm dev > "$LOG" 2>&1 &
sleep 12
PAT="CascadeProjects/agentshed/node_modules.*Electron.app/Contents/MacOS/Electron"
EPID=$(pgrep -f "$PAT" | head -1)
if [ -z "$EPID" ]; then echo "SMOKE_FAIL: 未启动"; tail -25 "$LOG"; pkill -f "agentshed.*electron-vite"; exit 1; fi
ERRS=$(grep -iE "Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败|uncaught" "$LOG" | head -5)
PARENT=$(ps -o ppid= -p "$EPID" | tr -d ' ')
kill -9 "$PARENT" 2>/dev/null; sleep 4
LEFT=$(pgrep -f "$PAT" | wc -l | tr -d ' ')
[ "$LEFT" != "0" ] && pkill -9 -f "$PAT"
if [ -n "$ERRS" ]; then echo "SMOKE_FAIL 主进程有错误:"; echo "$ERRS"; exit 1; fi
if [ "$LEFT" != "0" ]; then echo "SMOKE_FAIL: 孤儿防护未生效"; exit 1; fi
echo "SMOKE_OK: 启动无错误;vite 死后 electron 自退,无孤儿"
