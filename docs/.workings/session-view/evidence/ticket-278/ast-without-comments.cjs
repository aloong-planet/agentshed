// Compares two TypeScript files with every comment removed, by the TypeScript compiler's own parser and printer
const ts = require(process.argv[2])
const fs = require('fs')
const strip = (p) => {
  const src = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  return ts.createPrinter({ removeComments: true }).printFile(src)
}
const a = strip(process.argv[3])
const b = strip(process.argv[4])
console.log(a === b ? 'AST without comments: identical' : 'AST without comments: DIFFERENT')
process.exit(a === b ? 0 : 1)
