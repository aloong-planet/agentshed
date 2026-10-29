// The project skills directories, as install landings and as project detail's groups: which sides load each one, and so
// which one is the shared skills directory (CONTEXT; skill-install::REQ-001, skills-view::REQ-002). Derived from
// PROJECT_SKILLS_DIR alone, so a side added there joins its directory's loaders by construction.
import { PROJECT_SKILLS_DIR, type AgentSide } from './domain'

const SIDES = Object.keys(PROJECT_SKILLS_DIR) as AgentSide[]

/** Every side that loads a project skills directory, in side order. More than one makes it the shared skills
 * directory: `.agents/skills`, loaded by Codex and Antigravity CLI alike */
export function skillsDirLoaders(dir: string): AgentSide[] {
  return SIDES.filter((s) => PROJECT_SKILLS_DIR[s] === dir)
}

/** One directory an install lands in */
export interface SkillLanding {
  /** The directory, relative to the project root */
  dir: string
  /** The install's sides that land here, in side order; the first one's global library is the copy installed */
  sides: AgentSide[]
  /** Every side that loads the directory, whatever the install's sides: the shared skills directory always names both
   * of its loaders (owner's ruling 2026-10-28, skill-install::REQ-001/AC-01) */
  loaders: AgentSide[]
}

/** Where an install for these sides lands: one landing per directory, in side order — sides sharing a directory land
 * there once, with one result (skill-install::REQ-001/AC-01, A9) */
export function skillLandings(sides: readonly AgentSide[]): SkillLanding[] {
  const out: SkillLanding[] = []
  for (const side of SIDES) {
    if (!sides.includes(side)) continue
    const dir = PROJECT_SKILLS_DIR[side]
    const landing = out.find((l) => l.dir === dir)
    if (landing) landing.sides.push(side)
    else out.push({ dir, sides: [side], loaders: skillsDirLoaders(dir) })
  }
  return out
}
