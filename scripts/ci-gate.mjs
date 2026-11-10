// A skipped job is acceptable only when classification explicitly says it is unnecessary.
// Keep this decision separate from the command adapter so failure branches need no runner to test.
import { fileURLToPath } from 'node:url'

export function gateFailures(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) return ['Missing job results']
  const errors = []
  for (const id of ['changes', 'repo-policy']) {
    if (needs[id]?.result !== 'success') errors.push(`${id}: ${needs[id]?.result ?? 'missing'}`)
  }
  for (const [scope, jobs] of Object.entries({ app: ['app-checks', 'e2e'], site: ['site-checks'] })) {
    const required = needs.changes?.outputs?.[scope]
    if (required !== 'true' && required !== 'false') {
      errors.push(`Invalid ${scope} classification`)
      continue
    }
    for (const id of jobs) {
      const result = needs[id]?.result
      if (result !== 'success' && !(required === 'false' && result === 'skipped')) {
        errors.push(`${id}: ${result ?? 'missing'} (required: ${required})`)
      }
    }
  }
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const errors = gateFailures(JSON.parse(process.env.NEEDS_JSON ?? 'null'))
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('All required CI jobs passed')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
