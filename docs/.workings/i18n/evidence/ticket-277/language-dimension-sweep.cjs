// Stage 3 sweep for #277: the language dimension went from six members to two, so every sentence that lists the
// members or counts them is re-read. One pattern per language the scope actually uses (Latin, Han, Cyrillic, Kana).
const { execSync } = require('child_process'), fs = require('fs')
const files = execSync('git ls-files docs README.md README.en.md CONTEXT.md AGENTS.md src site/src site/README.md site/test scripts e2e', { encoding: 'utf8' })
  .split('\n').filter((f) => f && !f.startsWith('docs/.workings/') && !f.includes('/vendor/') && !/\.(png|ico|icns|jpg|webp|woff2?)$/.test(f))
const PATTERNS = {
  'en: member names': /\b(French|Spanish|Russian|Japanese|Français|Español)\b/,
  'en: counts': /\b(six|five|seven)\b|six-language|seven-item|\b6 languages\b/i,
  'zh: member names and counts': /\u516d\u79cd|\u516d\u8bed|\u516d\u95e8|\u5176\u4f59\u4e94|\u53e6\u5916\u4e94|\u4e94\u79cd\u8bed\u8a00|\u4e03\u9879|\u4e03\u4e2a\u9009\u9879|\u6cd5\u8bed|\u6cd5\u6587|\u897f\u73ed\u7259\u8bed|\u897f\u8bed|\u4fc4\u8bed|\u4fc4\u6587|\u65e5\u8bed|\u65e5\u6587|\u65e5\u672c\u8a9e/,
  'ru: any Cyrillic': /[Ѐ-ӿ]/,
  'ja: any Kana': /[\u3040-\u30ff]/
}
const out = [`# ${files.length} files in scope`]
for (const [name, re] of Object.entries(PATTERNS)) {
  out.push(`## ${name}  ${re}`)
  let n = 0
  for (const f of files) {
    let t; try { t = fs.readFileSync(f, 'utf8') } catch { continue }
    t.split('\n').forEach((line, i) => { if (re.test(line)) { n++; out.push(`${f}:${i + 1}: ${line.trim().slice(0, 150)}`) } })
  }
  out.push(`(${n} lines)`)
}
fs.writeFileSync(process.argv[2], out.join('\n')); console.log(out.filter((l) => l.startsWith('#') || l.startsWith('(')).join('\n'))
