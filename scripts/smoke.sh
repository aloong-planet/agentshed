#!/bin/bash
# dev 冒烟:启动 → 等它真正跑完一趟扫描 → 抓主进程错误 → 杀父进程验孤儿防护。
# 注意:此脚本跑在**真实 userData** 上,缓存状态取决于上次运行——
# 「旧格式缓存」这类迁移场景由 e2e(独立 userData + 预置缓存)覆盖,不要指望本脚本能抓到。
#
# 一律轮询到条件成立,不用固定 sleep(2026-08-03 改):
#   固定值两头不讨好——启动实测约 1.1s 却睡满 12s(浪费十倍),
#   杀父后自退实测约 1.4s 却只等 4s(余量不到三倍,机器负载高时误红,已踩过一次)。
#   误红比慢更贵:门禁抖过几次,"重跑一下就好"就成了习惯,它也就不再是门禁。
# 超时按实测量级留足余量,并把实际耗时打出来——将来变慢看得见,不会悄悄逼近超时。
set -u
cd "$(dirname "$0")/.."
LOG=/tmp/agentshed-smoke.log
PAT="CascadeProjects/agentshed/node_modules.*Electron.app/Contents/MacOS/Electron"
CACHE="$HOME/Library/Application Support/agentshed/token-cache.json"

START_TIMEOUT=30   # 实测 ~1.1s 出进程
READY_TIMEOUT=180  # 首扫要读真实数据(本机 600MB+);**升 CACHE_VERSION 后的首次**
                   # 要整份重算,且 verify 里它紧跟 e2e(刚跑完 18 次 Electron 启动
                   # + 一次 build,页缓存被冲掉),实测这一次远慢于单跑时的 ~6s。
                   # 2026-08-03 与 08-04 各红过一次,两次都恰在升号后的首个 verify。
                   # ⚠️ 这是相关性,不是已证实的因果:两次的失败日志都被调用方的 grep
                   # 过滤掉了,没抓到当时的实际耗时。下次再红,**直接看原始输出**
                   # (die() 会打印日志末 25 行),据实测量再调这个值。
EXIT_TIMEOUT=15    # 实测 ~1.4s:主进程按 1s 轮询父存活(见 src/main/index.ts),加退出开销

now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
cleanup() { pkill -f "agentshed.*electron-vite" 2>/dev/null; pkill -9 -f "$PAT" 2>/dev/null; }
die() { echo "SMOKE_FAIL: $1"; tail -25 "$LOG"; cleanup; exit 1; }

# 就绪判据取「扫描完成」而非「进程出现」:进程刚出现时渲染进程还没加载完
# (此刻日志里只有 vite 的输出),那时去 grep 等于什么都没看。
# app 每趟扫描结束会原子写 token-cache.json,用它的 mtime 变化当信号——
# 顺带还断言了扫描真的跑通:扫描若静默失败,缓存不更新,这里会超时报红。
CACHE_BEFORE=$(stat -f %m "$CACHE" 2>/dev/null || echo 0)

pnpm dev > "$LOG" 2>&1 &
T0=$(now_ms)
until pgrep -f "$PAT" >/dev/null 2>&1; do
  (( $(now_ms) - T0 > START_TIMEOUT * 1000 )) && die "${START_TIMEOUT}s 内 electron 未启动"
  sleep 0.2
done
UP_MS=$(( $(now_ms) - T0 ))

T1=$(now_ms)
until [ "$(stat -f %m "$CACHE" 2>/dev/null || echo 0)" -gt "$CACHE_BEFORE" ]; do
  (( $(now_ms) - T1 > READY_TIMEOUT * 1000 )) && die "${READY_TIMEOUT}s 内未完成首次扫描(缓存未更新)"
  sleep 0.3
done
READY_MS=$(( $(now_ms) - T1 ))

ERRS=$(grep -iE "Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败|uncaught" "$LOG" | head -5)

EPID=$(pgrep -f "$PAT" | head -1)
PARENT=$(ps -o ppid= -p "$EPID" | tr -d ' ')
T2=$(now_ms)
kill -9 "$PARENT" 2>/dev/null
LEFT=1
while (( $(now_ms) - T2 <= EXIT_TIMEOUT * 1000 )); do
  if [ "$(pgrep -f "$PAT" | wc -l | tr -d ' ')" = "0" ]; then LEFT=0; break; fi
  sleep 0.2
done
DOWN_MS=$(( $(now_ms) - T2 ))
[ "$LEFT" != "0" ] && pkill -9 -f "$PAT" 2>/dev/null

# 失败一律带上下文再退:只 echo 命中的那几行,等于把现场丢了——
# 2026-08-03 抖过一次,复现三次都没复现出来,而那次的输出已无从查起。
if [ -n "$ERRS" ]; then
  echo "SMOKE_FAIL 主进程有错误:"; echo "$ERRS"
  echo "--- $LOG 末 25 行 ---"; tail -25 "$LOG"
  exit 1
fi
if [ "$LEFT" != "0" ]; then
  echo "SMOKE_FAIL: 孤儿防护未生效(${EXIT_TIMEOUT}s 内 electron 未自退)"
  echo "--- 仍在的进程 ---"; pgrep -fl "$PAT"
  echo "--- $LOG 末 25 行 ---"; tail -25 "$LOG"
  exit 1
fi
echo "SMOKE_OK: 启动 ${UP_MS}ms · 首扫 ${READY_MS}ms · 杀父后自退 ${DOWN_MS}ms;无错误、无孤儿"
