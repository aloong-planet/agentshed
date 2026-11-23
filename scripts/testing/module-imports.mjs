// A module's imports, for the cases that prove a module runs where neither Node's modules nor the files beside it are
// (the download count's core and its Worker). A module's static imports are its import declarations and export-from
// declarations (ECMAScript's module requests), every one of which the walk of TypeScript's syntax tree takes; at run
// time it loads one through `import()`, `import.source()`, `import.defer()` or CommonJS's `require()`, which the walk
// takes too, as the sample's forms in module-imports.test.mjs show. (TypeScript's preProcessFile lists neither
// `export * as` nor `import defer`.)
import ts from 'typescript'

/** Every module a source imports, in source order: the specifier's text, or the expression's for a computed one */
export function imports(source) {
  const found = []
  const named = (node) => (ts.isStringLiteralLike(node) ? node.text : node.getText())
  const loads = (callee) => callee.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isMetaProperty(callee) && callee.keywordToken === ts.SyntaxKind.ImportKeyword)
    || (ts.isIdentifier(callee) && callee.text === 'require')
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) found.push(named(node.moduleSpecifier))
    if (ts.isCallExpression(node) && loads(node.expression)) found.push(node.arguments.map(named).join(', '))
    ts.forEachChild(node, visit)
  }
  visit(ts.createSourceFile('module.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS))
  return found
}
