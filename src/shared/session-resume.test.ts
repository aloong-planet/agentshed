// session-view::US-001/AC-04, CON-001, CON-002: the resume command. Every expected line is spelled out from the
// spec's rule — the directory always in single quotes with a quote inside written '\'' , the ID bare only when it is
// letters, digits, '-', '_' and '.', and each side's own tool named by its bare command.
import { describe, expect, it } from 'vitest'
import { resumeCommand } from './session-resume'

const DIR = '/Users/x/work/p'

describe('the resume command', () => {
  it('changes into the project directory, then resumes in the session\'s own side\'s tool', () => {
    expect(resumeCommand('claude', '6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b', DIR))
      .toBe("cd '/Users/x/work/p' && claude --resume 6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b")
    expect(resumeCommand('codex', '01a1250a-7662-7e30-a170-62f43cb935cc', DIR))
      .toBe("cd '/Users/x/work/p' && codex resume 01a1250a-7662-7e30-a170-62f43cb935cc")
    expect(resumeCommand('grok', '019fd1e2-1042-7c12-94e9-15b9d0ad23ec', DIR))
      .toBe("cd '/Users/x/work/p' && grok --resume 019fd1e2-1042-7c12-94e9-15b9d0ad23ec")
  })

  it('quotes any directory, a space, a single quote and non-ASCII letters included', () => {
    expect(resumeCommand('claude', 'abc', "/Users/x/it's demo")).toBe("cd '/Users/x/it'\\''s demo' && claude --resume abc")
    expect(resumeCommand('claude', 'abc', '/Users/x/Café über')).toBe("cd '/Users/x/Café über' && claude --resume abc")
    expect(resumeCommand('claude', 'abc', '/Users/x/$HOME`id`')).toBe("cd '/Users/x/$HOME`id`' && claude --resume abc")
  })

  it('writes an ID bare only when it needs no quoting, and quotes any other so a malformed record cannot add a command', () => {
    expect(resumeCommand('codex', 'thread_1.v2-a', DIR)).toBe("cd '/Users/x/work/p' && codex resume thread_1.v2-a")
    expect(resumeCommand('codex', 'a;rm -rf ~', DIR)).toBe("cd '/Users/x/work/p' && codex resume 'a;rm -rf ~'")
    expect(resumeCommand('codex', '$(touch x)', DIR)).toBe("cd '/Users/x/work/p' && codex resume '$(touch x)'")
    expect(resumeCommand('codex', "it's", DIR)).toBe("cd '/Users/x/work/p' && codex resume 'it'\\''s'")
  })
})
