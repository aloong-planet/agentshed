import { useQuery, useQueryClient } from '@tanstack/react-query'
import { displayQuery } from './display-queries'
import type { FileContentResult } from './memory-content-query'

export function useSkillContentQuery(file: string): FileContentResult | undefined {
  const client = useQueryClient()
  return useQuery({
    ...displayQuery<FileContentResult>(client, ['skillContent', file], async () => {
      try { return { ok: true, text: await window.agentshed.readSkillFile({ absPath: file }) } }
      catch (error) { return { ok: false, error } }
    })
  }).data
}
