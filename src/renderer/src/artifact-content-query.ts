// The query-layer wrapper around readArtifact (ADR-0028). A non-suspense query (see
// skill-files-query.ts's header comment): the reader overlay renders nothing until content arrives,
// matching the pre-migration behaviour exactly, while reopening an already-read file is now cached.
// The truncation marker and relative-link rewriting stay a render-time derivation over the cached raw
// text (in DetailPane.tsx), not baked into the cache — a language switch while the reader is open
// still picks up the marker's new wording.
import { useQuery } from '@tanstack/react-query'
import type { CappedText } from '@shared/domain'

export type ArtifactContentResult =
  | { ok: true; text: CappedText }
  | { ok: false; error: unknown }

export function artifactContentQueryKey(file: string | null): readonly [string, string | null] {
  return ['artifactContent', file] as const
}

export async function fetchArtifactContent(
  file: string,
  read: (f: string) => Promise<CappedText> = (f) => window.agentshed.readArtifact(f)
): Promise<ArtifactContentResult> {
  try {
    return { ok: true, text: await read(file) }
  } catch (error) {
    return { ok: false, error }
  }
}

/** `file === null` means no reader is open — the query is disabled. */
export function useArtifactContentQuery(file: string | null): {
  data: ArtifactContentResult | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: artifactContentQueryKey(file),
    queryFn: () => fetchArtifactContent(file as string),
    enabled: file !== null
  })
  return { data, isLoading }
}
