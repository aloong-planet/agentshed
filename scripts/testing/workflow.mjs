// Shared expression boundary for the CI and release workflow tests.
import { Evaluator, Lexer, Parser, data } from '@actions/expressions'

function toData(value) {
  if (value === undefined || value === null) return new data.Null()
  if (typeof value === 'string') return new data.StringData(value)
  if (typeof value === 'boolean') return new data.BooleanData(value)
  const dictionary = new data.Dictionary()
  for (const [key, item] of Object.entries(value)) dictionary.add(key, toData(item))
  return dictionary
}

const TEMPLATE = /^\$\{\{([\s\S]*)\}\}$/

/** One expression, as GitHub's evaluator reads it; a status function (success(), always()…) is not known here */
export function evaluate(expression, context) {
  const { tokens } = new Lexer(expression.trim().replace(TEMPLATE, '$1')).lex()
  return new Evaluator(new Parser(tokens, Object.keys(context), []).parse(), toData(context)).evaluate()
}
