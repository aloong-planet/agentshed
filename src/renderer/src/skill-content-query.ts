import { useQuery, useQueryClient } from '@tanstack/react-query'
import { displayQuery } from './display-queries'
import type { ArtifactContentResult } from './artifact-content-query'

export function useSkillContentQuery(file: string): ArtifactContentResult | undefined {
  const client = useQueryClient()
  return useQuery({
    ...displayQuery<ArtifactContentResult>(client, ['skillContent', file], async () => {
      try { return { ok: true, text: await window.agentshed.readSkillFile({ absPath: file }) } }
      catch (error) { return { ok: false, error } }
    })
  }).data
}
