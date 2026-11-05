import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { settingsJson } from '../../src/main/testing/agy-fixture'
import { localDayOffset } from './dates'

/**
 * Build a fixture home with usage on both sides: Claude (→ the Anthropic segment) + Codex (→ the OpenAI
 * segment).
 * The trend chart segments by provider, so both are needed — otherwise "switching to the Claude side zeroes
 * the OpenAI segment"
 * would be **tautologically true** with no OpenAI data, testing nothing at all.
 */
export function mkUsageHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-usage-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))

  // Claude: a whole-tree scan of projects, with directory names unrelated to the registry (an unregistered
// directory counts toward the global total too)
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-') // The same rule as encodeClaudeProjectDir
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const usage = (model: string, at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at.toISOString(),
      message: {
        model,
        usage: {
          input_tokens: inTok,
          output_tokens: outTok,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0
        }
      }
    })
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(2).toISOString(), message: { role: 'user', content: 'Sample question' } }),
      // The real shape: an assistant line carries both content (the prose segments) and usage; ticket 05's
// expansion assertions use that prose.
      // Ticket 07: thinking/text/tool_use mixed on one line (the whole segment spectrum from the full
// enumeration), for the rich content assertions
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        message: {
          model: 'claude-fable-5',
          content: [
            { type: 'thinking', thinking: 'Take a look at the directory layout' },
            { type: 'text', text: 'This is the first turn reply body' },
            { type: 'tool_use', id: 'tu_e2e_1', name: 'Bash', input: { command: 'ls -la src' } }
          ],
          usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
        }
      }),
      // A tool return containing a tool-results/ sidecar path → the truncation label (spec C7, a
// mechanism-based criterion)
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(2).toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu_e2e_1', content: '12 files in total\noutput saved to: /x/tool-results/e2e.txt' }]
        }
      }),
      // A subagent dispatch → a sidechain step within the turn → a return carrying toolUseResult.agentId (the
// measured chain)
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu_e2e_ag', name: 'Agent', input: { description: 'check logs', prompt: 'Check today logs', subagent_type: 'debugger' } }]
        }
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: localDayOffset(2).toISOString(),
        isSidechain: true,
        agentId: 'ag_e2e',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'stu1', name: 'Bash', input: { command: 'tail -5 app.log' } }] }
      }),
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(2).toISOString(),
        toolUseResult: { agentId: 'ag_e2e', status: 'completed' },
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_e2e_ag', content: [{ type: 'text', text: 'Logs are clean, nothing unusual' }] }] }
      }),
      // An unknown type outside the display allow-list → a trace rather than a silent drop (spec C8)
      JSON.stringify({ type: 'agent_snapshot', timestamp: localDayOffset(2).toISOString(), payload: { blob: 'x' } }),
      usage('claude-fable-5', localDayOffset(2), 1200, 300),
      // A second real question — making the two sides' question counts differ, so the count assertion can
// distinguish "really read"
      // from "both happen to be 1". A tool result is fed back in between, which does not count as a question
// (spec B1).
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(1).toISOString(),
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'Tool return' }] }
      }),
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: 'Second question' } }),
      usage('claude-opus-5', localDayOffset(1), 800, 200),
      usage('claude-fable-5', localDayOffset(0), 500, 100)
    ].join('\n') + '\n'
  )

  // A warmup session: a single Warmup with tokens but nothing anyone asked (spec A3a → not listed)
  writeFileSync(
    join(cdir, 'warmup.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: 'Warmup' } }),
      usage('claude-fable-5', localDayOffset(1), 300, 60)
    ].join('\n') + '\n'
  )

  // Codex: a whole-tree scan of sessions, with the first line's session_meta cwd deciding attribution
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const turn = (at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      timestamp: at.toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: inTok,
            cached_input_tokens: 0,
            cache_write_input_tokens: 0,
            output_tokens: outTok,
            total_tokens: inTok + outTok
          }
        }
      }
    })
  writeFileSync(
    join(sdir, 'rollout-019fb0c0-1111-7af3-af7d-8505cedf1ec2.jsonl'),
    [
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'session_meta', payload: { cwd: proj } }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      // A real question: without it this session is not listed per spec A3a
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'user_message', message: 'Codex side question' } }),
      // Ticket 07: reasoning sub-headings / tool pairing / spawn_agent (unattributable) / traces of unknown
// events
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'reasoning', id: 'r1', summary: [{ type: 'summary_text', text: 'Compare both sides directory conventions' }, { type: 'summary_text', text: 'Confirm the field differences' }], encrypted_content: 'gAAA' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'custom_tool_call', id: 'ri1', call_id: 'c_e2e', name: 'exec', input: 'rg skills -l', status: 'completed' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', call_id: 'c_e2e', output: '7 files' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'function_call', id: 'ri2', call_id: 'c_sp', name: 'spawn_agent', namespace: 'collaboration', arguments: '{"task_name":"migration check"}' }
      }),
      JSON.stringify({
        timestamp: localDayOffset(2).toISOString(),
        type: 'response_item',
        payload: { type: 'function_call_output', call_id: 'c_sp', output: 'Sub-task created' }
      }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'exotic_event', data: 1 } }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'agent_message', message: 'The two sides use different directory conventions; see the comparison.' } }),
      turn(localDayOffset(2), 900, 150),
      // Stopping at yesterday: putting distance from the Claude side (today), so "newest first" has something to
// judge.
      // With identical timestamps on both sides, the sort assertion could only prove reverse works, not that it
// sorts by time.
      turn(localDayOffset(1), 400, 80)
    ].join('\n') + '\n'
  )
  return home
}

/** A registered project with no sessions at all — the sessions section's empty state */
export function mkEmptyProjectHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-noses-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  return home
}

/**
 * Ticket antigravity-side/#325: a fixture home holding Antigravity CLI's components in the shapes agy loaded in the
 * samples (research §10.9): its three global skills directories — one name in all three, one also Claude's, one the
 * shared directory of a project holds too — a built-in skill, the official `flutter` plugin (fresh install: no enabled
 * key) with a bundled skill, agent and server, a disabled plugin, the global MCP file with a disabled server, global
 * subagents in both forms (one not usable as a main agent, one Claude also defines), and two projects: `agy-demo`,
 * registered on Antigravity alone, with the shared skills directory, a project-level subagent and the project MCP file
 * agy does not load; `transfer`, registered on every side. A third registered folder is gone (stale).
 */
export function mkAgyComponentsHome(): { home: string; agOnly: string; all: string; stale: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agycomp-'))
  const agOnly = join(home, 'agy-demo')
  const all = join(home, 'transfer')
  const stale = join(home, 'gone-proj')
  mkdirSync(agOnly, { recursive: true })
  mkdirSync(all, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [all]: {}, [stale]: {} } }))
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${all}"]\ntrust_level = "trusted"\n`)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${all}"]\ntrusted = true\n`)
  const agy = join(home, '.gemini', 'antigravity-cli')
  const cfg = join(home, '.gemini', 'config')
  mkdirSync(join(agy, 'conversations'), { recursive: true })
  writeFileSync(join(agy, 'settings.json'), settingsJson([agOnly, all]))
  const file = (path: string, text: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  const skill = (base: string, name: string, description: string, body: string): void =>
    file(join(base, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`)
  // agy's three global directories, in the order it prefers a same-name copy
  skill(join(agy, 'skills'), 'release-notes', 'Draft release notes from git log', 'Release notes, the CLI copy')
  skill(join(cfg, 'skills'), 'release-notes', 'config copy', 'Release notes, the config copy')
  skill(join(home, '.gemini', 'skills'), 'release-notes', 'root copy', 'Release notes, the root copy')
  skill(join(cfg, 'skills'), 'commit-style', 'The global commit style', 'Commit style, agy global copy')
  skill(join(home, '.gemini', 'skills'), 'tdd', 'agy tdd', 'TDD, the Antigravity copy')
  skill(join(home, '.claude', 'skills'), 'tdd', 'Red before green', 'TDD, the Claude copy')
  skill(join(home, '.agents', 'skills'), 'decision-form', 'Codex form', 'Decision form, Codex global')
  skill(join(agy, 'builtin', 'skills'), 'agy-customizations', 'built in', 'Built-in body')
  // The official flutter plugin as agy installed it, and a second plugin agy disabled
  const flutter = join(cfg, 'plugins', 'flutter')
  file(join(flutter, 'plugin.json'), JSON.stringify({ name: 'flutter', displayName: 'Dart and Flutter', version: '1.0.6', license: 'BSD-3-Clause' }))
  skill(join(flutter, 'skills'), 'dart-add-unit-test', 'Write and organize unit tests', 'Dart unit tests, the plugin copy')
  file(join(flutter, 'agents', 'a11y_agent.md'), '---\nname: flutter_a11y_agent\ndescription: "Audits Flutter code for accessibility."\ntools:\n  - view_file\n  - grep_search\nmainAgent: true\nsubagent: true\n---\n\n# Persona\n')
  file(join(flutter, 'mcp_config.json'), JSON.stringify({ mcpServers: { 'dart-mcp-server': { command: 'dart', args: ['mcp-server'] } } }))
  file(join(flutter, 'rules', 'flutter-hot-reload.md'), '---\ntrigger: glob\n---\nrule\n')
  const gdocs = join(cfg, 'plugins', 'gdocs')
  file(join(gdocs, 'plugin.json'), JSON.stringify({ name: 'gdocs', version: '0.0.3' }))
  skill(join(gdocs, 'skills'), 'draft-doc', 'Draft a doc', 'Draft doc, readable while disabled')
  file(join(gdocs, 'mcp_config.json'), JSON.stringify({ mcpServers: { docs: { command: 'gdocs-mcp' } } }))
  const fromOfficial = (name: string, version: string): object => ({
    installedFrom: { id: `antigravity-plugins-official/plugin/${name}`, marketplace: 'antigravity-plugins-official', version }
  })
  file(join(cfg, 'config.json'), JSON.stringify({ plugins: { flutter: fromOfficial('flutter', '1.0.6'), gdocs: { ...fromOfficial('gdocs', '0.0.3'), enabled: false } } }))
  file(join(cfg, 'mcp_config.json'), JSON.stringify({ mcpServers: { 'sqlite-explorer': { command: 'node', args: ['/usr/local/bin/sqlite-mcp-server.js'] }, github: { serverUrl: 'https://api.githubcopilot.com/mcp/', disabled: true } } }))
  // Global subagents: both forms, one not usable as a main agent, one Claude defines too
  file(join(cfg, 'agents', 'sample-flat.md'), '---\nname: sample-flat\ndescription: Sample global subagent (flat file form).\n---\nYou answer in one sentence.\n')
  file(join(cfg, 'agents', 'sample-reviewer', 'agent.md'), '---\nname: sample-reviewer\ndescription: Sample global subagent (directory form).\nsubagent: true\nmainAgent: false\n---\nYou review diffs.\n')
  file(join(cfg, 'agents', 'code-reviewer', 'agent.md'), '---\nname: code-reviewer\ndescription: agy reviewer\ntools:\n  - view_file\n  - grep_search\n---\nAntigravity reviewer persona.\n')
  file(join(home, '.claude', 'agents', 'code-reviewer.md'), '---\ndescription: Review code\ntools: Read, Grep\n---\nClaude reviewer persona.\n')
  // agy-demo: the shared skills directory (one name agy's global library holds too), a project-level subagent, and the
  // project MCP file agy was not observed to load
  skill(join(agOnly, '.agents', 'skills'), 'commit-style', 'This repository\'s commit style', 'Commit style, the project copy')
  skill(join(agOnly, '.agents', 'skills'), 'demo-skill', 'Project-level sample skill', 'Explain calc.py briefly.')
  file(join(agOnly, '.agents', 'agents', 'demo-agent', 'agent.md'), '---\nname: demo-agent\ndescription: Project-level sample subagent.\nsubagent: true\n---\nYou explain calc.py.\n')
  file(join(agOnly, '.agents', 'mcp_config.json'), JSON.stringify({ mcpServers: { 'demo-stdio': { command: '/usr/bin/true', disabled: true } } }))
  // transfer: a Claude project-level skill, and in the shared directory one name of its own and one (tdd) Claude's and
  // agy's global libraries hold too
  skill(join(all, '.claude', 'skills'), 'ui-design', 'UI review rules', 'UI design, the project copy')
  skill(join(all, '.agents', 'skills'), 'changelog-entry', 'Add a changelog entry', 'Changelog entry, the shared copy')
  skill(join(all, '.agents', 'skills'), 'tdd', 'The project TDD', 'TDD, the shared project copy')
  // transfer's own Claude and Codex subagents, so project detail heads each side's project group by its directory
  file(join(all, '.claude', 'agents', 'proj-claude.md'), '---\ndescription: Project Claude helper\n---\nClaude project persona.\n')
  file(join(all, '.codex', 'agents', 'proj-codex.toml'), 'name = "proj-codex"\ndescription = "Project Codex helper"\ndeveloper_instructions = "You help."\n')
  return { home, agOnly, all, stale }
}

/** A user's question line, in the shape mkUsageHome writes */
export const questionLine = (text: string): string =>
  JSON.stringify({ type: 'user', timestamp: localDayOffset(0).toISOString(), message: { role: 'user', content: text } })
