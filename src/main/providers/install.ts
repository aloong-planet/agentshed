// Skills 装卸(票06):安装=从全局库解引用深拷贝到项目级目录(先落临时目录再 rename,
// 失败清理不留半成品);卸载=删项目副本。全局库只读,永不写入。
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'
import { ERR, type ErrorCode, type ErrorParams } from '@shared/errors'

export interface InstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export type OpResult =
  | { ok: true }
  // 失败只带**码 + 参数**,不带成句 message:措辞由渲染层按当前语言生成(ADR-0015)。
  // reason 早先就是语言无关的枚举,本次去掉与它并列的中文 message。
  | { ok: false; reason: ErrorCode; params?: ErrorParams }

/** skill 名只允许单段目录名(堵路径穿越) */
function badName(name: string): boolean {
  return name === '' || name.includes('/') || name.includes('\\') || name.includes('..')
}

function projectSkillsDir(side: AgentSide, projectPath: string): string {
  return side === 'claude' ? join(projectPath, '.claude', 'skills') : join(projectPath, '.agents', 'skills')
}

function globalSkillDir(roots: ScanRoots, side: AgentSide, name: string): string {
  return side === 'claude' ? join(roots.claudeHome, 'skills', name) : join(roots.agentsSkillsDir, name)
}

export function installSkill(roots: ScanRoots, args: InstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: ERR.skillBadName }
  if (!existsSync(targetProjectPath))
    return { ok: false, reason: ERR.skillStaleTarget }
  const source = globalSkillDir(roots, side, skillName)
  if (!existsSync(join(source, 'SKILL.md')))
    return { ok: false, reason: ERR.skillMissingSource, params: { name: skillName } }
  const targetBase = projectSkillsDir(side, targetProjectPath)
  const target = join(targetBase, skillName)
  if (existsSync(target))
    return { ok: false, reason: ERR.skillConflict }

  const tmp = join(targetBase, `.${skillName}.installing-${process.pid}`)
  try {
    mkdirSync(targetBase, { recursive: true })
    // dereference:源含软链时落地为真文件(项目自持,不依赖全局库存续)
    cpSync(source, tmp, { recursive: true, dereference: true })
    renameSync(tmp, target)
    return { ok: true }
  } catch (err) {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      // 清理失败不再连锁
    }
    return { ok: false, reason: ERR.skillCopyFailed, params: { detail: String(err) } }
  }
}

export interface UninstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export function uninstallSkill(args: UninstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: ERR.skillBadName }
  const target = join(projectSkillsDir(side, targetProjectPath), skillName)
  if (!existsSync(target))
    return { ok: false, reason: ERR.skillCopyMissing }
  try {
    rmSync(target, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: ERR.skillDeleteFailed, params: { detail: String(err) } }
  }
}
