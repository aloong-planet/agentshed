// Skills 装卸(票06):安装=从全局库解引用深拷贝到项目级目录(先落临时目录再 rename,
// 失败清理不留半成品);卸载=删项目副本。全局库只读,永不写入。
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSide } from '@shared/domain'
import type { ScanRoots } from './types'

export interface InstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export type OpResult =
  | { ok: true }
  | { ok: false; reason: 'conflict' | 'stale-target' | 'missing-source' | 'bad-name' | 'copy-failed'; message: string }

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
  if (badName(skillName)) return { ok: false, reason: 'bad-name', message: '非法 skill 名' }
  if (!existsSync(targetProjectPath))
    return { ok: false, reason: 'stale-target', message: '目标是失效项目(目录不存在)' }
  const source = globalSkillDir(roots, side, skillName)
  if (!existsSync(join(source, 'SKILL.md')))
    return { ok: false, reason: 'missing-source', message: `全局库无此 skill:${skillName}` }
  const targetBase = projectSkillsDir(side, targetProjectPath)
  const target = join(targetBase, skillName)
  if (existsSync(target))
    return { ok: false, reason: 'conflict', message: `目标已有同名项目级 skill,已阻止不覆盖` }

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
    return { ok: false, reason: 'copy-failed', message: `复制失败已清理:${String(err)}` }
  }
}

export interface UninstallArgs {
  skillName: string
  side: AgentSide
  targetProjectPath: string
}

export function uninstallSkill(args: UninstallArgs): OpResult {
  const { skillName, side, targetProjectPath } = args
  if (badName(skillName)) return { ok: false, reason: 'bad-name', message: '非法 skill 名' }
  const target = join(projectSkillsDir(side, targetProjectPath), skillName)
  if (!existsSync(target))
    return { ok: false, reason: 'missing-source', message: '项目级副本不存在' }
  try {
    rmSync(target, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'copy-failed', message: `删除失败:${String(err)}` }
  }
}
