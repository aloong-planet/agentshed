# landing-page::REQ-007's built-site check can fail: README.en.md's opening summary extended by one sentence, the check run, the file restored byte for byte
# HEAD 7af1220c43d1262d27d1c7f2af57699a6b699887; site/test/built-site.test.ts at 89548cf6a26a5ef56f94c529b74fadfec508c0de (uncommitted at this point)
# Script:
#   // Extend README.en.md's opening summary by a sentence, run the built-site check, restore byte for byte
#   import { readFileSync, writeFileSync } from 'node:fs'
#   import { execSync } from 'node:child_process'
#   const f = 'README.en.md'
#   const orig = readFileSync(f)
#   const s = orig.toString('utf8')
#   const anchor = 'skills from your global library into any project.'
#   if (s.split(anchor).length !== 2) throw new Error('anchor not unique')
#   let code = 0
#   try {
#     writeFileSync(f, s.replace(anchor, anchor + ' It is free.'))
#     console.log('planted:', readFileSync(f, 'utf8').includes('any project. It is free.'))
#     try { execSync('pnpm -s --dir site exec vitest run test/built-site.test.ts -t "opening paragraph"', { stdio: 'pipe' }) } catch (e) { code = e.status; console.log(e.stdout.toString().split('\n').filter((l) => /×|✓|Tests|Expected|Received|AssertionError/.test(l)).join('\n')) }
#   } finally {
#     writeFileSync(f, orig)
#   }
#   console.log('exit with the plant:', code, '· restored byte for byte:', Buffer.compare(readFileSync(f), orig) === 0)
# Output:
planted: true
     × en: the README’s opening paragraph is the heading in bold, the macOS sentence and the hero’s paragraph, word for word 4ms
      Tests  1 failed | 1 passed | 30 skipped (32)
exit with the plant: 1 · restored byte for byte: true
