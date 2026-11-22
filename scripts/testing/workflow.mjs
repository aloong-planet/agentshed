// Shared expression boundary and readers for the workflow tests (CI, release, download count, action pins).
import { Evaluator, Lexer, Parser, data } from '@actions/expressions'
import { truthy } from '@actions/expressions/result'

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

/** Whether a job's or a step's `if` holds; no `if` always holds */
export const holds = (condition, context) => condition === undefined || truthy(evaluate(condition, context))

/** A job's env as the runner sets it: each `${{ }}` value evaluated and turned into a string, the rest literal */
export function jobEnv(job, context) {
  return Object.fromEntries(
    Object.entries(job.env ?? {}).map(([key, value]) => [key, TEMPLATE.test(value.trim()) ? evaluate(value, context).coerceString() : String(value)])
  )
}

/** Every string in the parsed workflow, with the path that leads to it */
export function* strings(value, path = []) {
  if (typeof value === 'string') yield { path: path.join('.'), value }
  else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) yield* strings(item, [...path, key])
}
