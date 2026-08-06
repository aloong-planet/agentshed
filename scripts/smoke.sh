#!/bin/bash
# dev 冒烟:启动 → 等它真正跑完一趟扫描 → 抓主进程错误 → 杀父进程验孤儿防护。
#
# **与已开着的实例共存**(2026-08-04 改,根因复盘见 docs/postmortems/2026-08-04-smoke-silent-lock-exit.md):
#   - userData 隔离:dev app 经 `pnpm dev -- --user-data-dir=<临时目录>` 启动(实测
#     electron-vite 透传该参且 Electron 认它——e2e 同机制,真实归档零污染已核实)。
#     single-instance lock 按 userData 界定作用域,隔离后与用户开着的 app 互不抢锁
#     ——此前锁被占时本脚本起的 app 会 app.exit(0) 静默假死,三次误红的根因。
#   - 进程组隔离:set -m 让后台任务自成进程组,所有探测/击杀只认自己这棵树
#     (pgrep/kill 按 pgid),永不误伤用户的实例。
#   - 扫描的数据仍是真实 ~/.claude(那是 HOME 的事,与 userData 无关);每次全新
#     userData = 每次都走确定性的全量扫(~6s)——门禁要确定性,不要热缓存的快。
#     「旧格式缓存迁移」场景归 e2e(预置缓存 fixture),本就不该指望冒烟撞上。
#
# 一律轮询到条件成立,不用固定 sleep(2026-08-03 改):
#   误红比慢更贵:门禁抖过几次,"重跑一下就好"就成了习惯,它也就不再是门禁。
# 超时按实测量级留足余量,并把实际耗时打出来——将来变慢看得见,不会悄悄逼近超时。
set -u
set -m   # 后台任务自成进程组:$! 即 pgid,探测与击杀都以此为界
cd "$(dirname "$0")/.."
LOG=/tmp/agentshed-smoke.log
# 组内 Electron 主进程特征(quiet 副本与官方 dist 路径都含此段)。
# **不要**把仓库绝对路径写进正则:worktree、/tmp→/private/tmp、pnpm 布局一变就假死
# (2026-08-06:写死 CascadeProjects/agentshed 时 /tmp worktree 下 60s 误红)。
# 组外实例靠 userData 隔离,不会进本组 pgid,故组内只认 Electron 二进制即可。
ELECTRON_BIN='Electron.app/Contents/MacOS/Electron'
SMOKE_UD=$(mktemp -d /tmp/agentshed-smoke-ud.XXXXXX)
CACHE="$SMOKE_UD/token-cache.json"
# 真实 userData 的缓存:仅作"重定向失效"的诊断对照,本脚本绝不写它
REAL_CACHE="$HOME/Library/Application Support/agentshed/token-cache.json"

START_TIMEOUT=60   # 全新 userData 首启,实测 ~1.1s 出进程;留足余量
READY_TIMEOUT=60   # 全量扫真实数据实测 ~6s(600MB+),十倍余量。
                   # 历史教训:超时曾三次误红,真因不是慢是**死**(锁被占静默退出)
                   # ——如今 userData 隔离后没有锁可抢,走到超时的都是真超时。
EXIT_TIMEOUT=15    # 实测 ~1.4s:主进程按 1s 轮询父存活(见 src/main/index.ts),加退出开销

now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
DEVPID=""
alive() { [ -n "$DEVPID" ] && pgrep -g "$DEVPID" -f "$ELECTRON_BIN" >/dev/null 2>&1; }
cleanup() {
  [ -n "$DEVPID" ] && kill -9 -- "-$DEVPID" 2>/dev/null
  rm -rf "$SMOKE_UD"
}
die() {
  echo "SMOKE_FAIL: $1"
  # 现场必须留档:三次排查全因调用方 grep 掉了这段输出而无证可查(2026-08-04 复盘)
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "完整日志已存:$KEEP"
  tail -25 "$LOG"
  cleanup
  exit 1
}

# 已有实例只提示不拦截——隔离后共存是特性。按 comm 过滤,pgrep -f 会被
# 别人 argv 里的路径字符串误报(如某个 pkill 命令行),路径匹配不等于进程本体。
# 提示范围:本产品 Agentshed.app,或 argv 含 agentshed 的 Electron(dev 实例)。
OTHERS=$(pgrep -f "Agentshed.app/Contents/MacOS/Agentshed|agentshed.*$ELECTRON_BIN|$ELECTRON_BIN.*agentshed" 2>/dev/null | while read -r p; do
  case "$(ps -o comm= -p "$p" 2>/dev/null)" in
    *Electron | *Agentshed) echo "$p" ;;
  esac
done | tr '\n' ' ')
[ -n "$OTHERS" ] && echo "(检测到已有实例 pid=$OTHERS —— userData 已隔离,互不影响,不会误杀)"

REAL_BEFORE=$(stat -f %m "$REAL_CACHE" 2>/dev/null || echo 0)

# 测试静音两件套(见 src/main/index.ts 与 scripts/quiet-electron.sh):
#   AGENTSHED_NO_FOREGROUND —— 窗口不显示,不抢前台焦点;
#   ELECTRON_OVERRIDE_DIST_PATH —— 用 LSUIElement=true 的副本,Dock 图标连闪现都没有
#   (图标在原生引导期就按 plist 注册,JS 的 dock.hide() 追不上)。
bash scripts/quiet-electron.sh
export ELECTRON_OVERRIDE_DIST_PATH="$PWD/node_modules/.cache/electron-quiet/dist"
# electron-vite **不经过** electron/index.js(自读 path.txt 拼路径,实测 lib 源码),
# 上面那个变量对它无效;它认的是自家的 ELECTRON_EXEC_PATH,两个都给
export ELECTRON_EXEC_PATH="$PWD/node_modules/.cache/electron-quiet/dist/Electron.app/Contents/MacOS/Electron"
AGENTSHED_NO_FOREGROUND=1 pnpm dev -- --user-data-dir="$SMOKE_UD" > "$LOG" 2>&1 &
DEVPID=$!
T0=$(now_ms)
until alive; do
  (( $(now_ms) - T0 > START_TIMEOUT * 1000 )) && die "${START_TIMEOUT}s 内 electron 未启动(本组内)"
  sleep 0.2
done
UP_MS=$(( $(now_ms) - T0 ))

# 就绪判据取「扫描完成」:app 每趟扫描结束原子写 token-cache.json(隔离目录内,
# 全新目录首扫必写),mtime 出现即扫描真跑通;静默失败则超时报红。
T1=$(now_ms)
until [ "$(stat -f %m "$CACHE" 2>/dev/null || echo 0)" -gt 0 ]; do
  if ! alive; then
    die "electron 启动后又退出了(主进程崩溃?看下方日志)"
  fi
  if (( $(now_ms) - T1 > READY_TIMEOUT * 1000 )); then
    # 判别诊断:隔离缓存没动而真实缓存动了 = --user-data-dir 透传失效
    # (electron-vite 升级弃透传之类),app 跑去写真实 userData 了
    REAL_NOW=$(stat -f %m "$REAL_CACHE" 2>/dev/null || echo 0)
    if [ "$REAL_NOW" -gt "$REAL_BEFORE" ]; then
      die "userData 重定向失效:隔离缓存未更新,真实缓存却更新了——检查 pnpm dev 的 --user-data-dir 透传"
    fi
    die "${READY_TIMEOUT}s 内未完成首次扫描(隔离缓存未更新)"
  fi
  sleep 0.3
done
READY_MS=$(( $(now_ms) - T1 ))

ERRS=$(grep -iE "Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败|uncaught" "$LOG" | head -5)

EPID=$(pgrep -g "$DEVPID" -f "$ELECTRON_BIN" | head -1)
# 竞态守卫:app 可能写完就绪产物后立刻崩——EPID 取不到时,杀父与孤儿检查整段
# 空转,若日志又没有错误行就是假绿。就绪后进程必须还活着,不在即失败。
[ -z "$EPID" ] && die "就绪产物已写出,但 electron 进程已消失(写完即崩?)"
PARENT=$(ps -o ppid= -p "$EPID" | tr -d ' ')
T2=$(now_ms)
kill -9 "$PARENT" 2>/dev/null
LEFT=1
while (( $(now_ms) - T2 <= EXIT_TIMEOUT * 1000 )); do
  if ! alive; then LEFT=0; break; fi
  sleep 0.2
done
DOWN_MS=$(( $(now_ms) - T2 ))

# 失败一律带上下文再退:只 echo 命中的那几行,等于把现场丢了(2026-08-03 教训)
if [ -n "$ERRS" ]; then
  echo "SMOKE_FAIL 主进程有错误:"; echo "$ERRS"
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "完整日志已存:$KEEP"
  echo "--- $LOG 末 25 行 ---"; tail -25 "$LOG"
  cleanup
  exit 1
fi
if [ "$LEFT" != "0" ]; then
  echo "SMOKE_FAIL: 孤儿防护未生效(${EXIT_TIMEOUT}s 内 electron 未自退)"
  echo "--- 本组仍在的进程 ---"; pgrep -g "$DEVPID" -fl "$ELECTRON_BIN"
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "完整日志已存:$KEEP"
  echo "--- $LOG 末 25 行 ---"; tail -25 "$LOG"
  cleanup
  exit 1
fi
cleanup
echo "SMOKE_OK: 启动 ${UP_MS}ms · 首扫 ${READY_MS}ms · 杀父后自退 ${DOWN_MS}ms;无错误、无孤儿"
