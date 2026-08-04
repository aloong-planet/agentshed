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
# 打包版走同一个真实 userData,同样持有 single-instance lock,一并算"已有实例"
PACKAGED_PAT="Agentshed.app/Contents/MacOS/Agentshed"
CACHE="$HOME/Library/Application Support/agentshed/token-cache.json"

START_TIMEOUT=30   # 实测 ~1.1s 出进程
READY_TIMEOUT=60   # 首扫读真实数据(本机 600MB+):热缓存 ~1s,升 CACHE_VERSION 后
                   # 整份重算实测 ~6s,60s 是十倍余量。
                   # 历史教训(2026-08-03/04 三次误红的真因):超时不是慢,是**死**——
                   # 已有实例持有 userData 的 single-instance lock,本脚本起的 app
                   # 拿不到锁 app.exit(0) 静默退出,缓存永不更新,超时调多大都没用。
                   # 曾据"升号后冷扫慢"的错误诊断把此值调到 180,该因果已被
                   # 180s 照样红的第三次失败证伪。现由下方 preflight 拦截实例冲突,
                   # 走到这里的超时都是真超时,按实测量级给十倍即可。
EXIT_TIMEOUT=15    # 实测 ~1.4s:主进程按 1s 轮询父存活(见 src/main/index.ts),加退出开销

now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
cleanup() { pkill -f "agentshed.*electron-vite" 2>/dev/null; pkill -9 -f "$PAT" 2>/dev/null; }
die() {
  echo "SMOKE_FAIL: $1"
  # 现场必须留档:三次排查全因调用方 grep 掉了这段输出而无证可查(2026-08-04 复盘)
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "完整日志已存:$KEEP"
  tail -25 "$LOG"
  cleanup
  exit 1
}

# ── preflight:已有实例在跑就直接失败,给出明确指令 ──
# 主进程有 single-instance lock(src/main/index.ts):锁被占时本脚本起的 app 会
# 静默 app.exit(0),日志零错误;而启动闸的 pgrep 会被【先前那个实例】满足,
# 于是表现为"就绪超时"——三次误诊为扫描慢,实为根本没有 app 在扫。
# 判据放在启动之前:事后从进程树反推"这个 electron 是不是我起的"又贵又脆。
# pgrep -f 匹配整条命令行,别人的 pkill/grep 只要 argv 里带这个路径就会误报
# (实测:验证本脚本的后台杀手进程就被当成了实例)——再按 comm(实际二进制)过滤。
EXISTING=$(pgrep -f "$PAT|$PACKAGED_PAT" 2>/dev/null | while read -r p; do
  case "$(ps -o comm= -p "$p" 2>/dev/null)" in
    *Electron | *Agentshed) echo "$p $(ps -o comm= -p "$p" 2>/dev/null)" ;;
  esac
done)
if [ -n "$EXISTING" ]; then
  echo "SMOKE_FAIL: 已有 agentshed 实例在运行,持有 userData 锁,smoke 起的 app 会静默退出。"
  echo "先关掉它再跑(dev 实例或打包版都算):"
  echo "$EXISTING" | head -3
  exit 1
fi

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
  # 中途死掉与中途冒出别的实例,都比干等到超时更早说清楚
  if ! pgrep -f "$PAT" >/dev/null 2>&1; then
    die "electron 启动后又退出了(常见原因:userData 锁被占的瞬时竞态,或主进程崩溃——看下方日志)"
  fi
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
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "完整日志已存:$KEEP"
  echo "--- $LOG 末 25 行 ---"; tail -25 "$LOG"
  exit 1
fi
if [ "$LEFT" != "0" ]; then
  echo "SMOKE_FAIL: 孤儿防护未生效(${EXIT_TIMEOUT}s 内 electron 未自退)"
  echo "--- 仍在的进程 ---"; pgrep -fl "$PAT"
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "完整日志已存:$KEEP"
  echo "--- $LOG 末 25 行 ---"; tail -25 "$LOG"
  exit 1
fi
echo "SMOKE_OK: 启动 ${UP_MS}ms · 首扫 ${READY_MS}ms · 杀父后自退 ${DOWN_MS}ms;无错误、无孤儿"
