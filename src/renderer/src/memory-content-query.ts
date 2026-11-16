import { displayQuery } from './display-queries'
// The query-layer wrapper around readMemoryFile (ADR-0028), for the memory file drawer. A non-suspense query (see
// skill-files-query.ts's header comment): the drawer renders its own loading and error state, while reopening an
// already-read file is cached. The truncation marker stays a render-time derivation over the cached raw text (in
// MemoryView.tsx), not baked into the cache — a language switch while the drawer is open still picks up the
// marker's new wording.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CappedText } from '@shared/domain'

/** A whole file's read, as the memory drawer and the skill file preview hold it */
export type FileContentResult =
  | { ok: true; text: CappedText }
  | { ok: false; error: unknown }

export function memoryContentQueryKey(file: string): readonly [string, string] {
  return ['memoryContent', file] as const
}

export async function fetchMemoryContent(
  file: string,
  read: (f: string) => Promise<CappedText> = (f) => window.agentshed.readMemoryFile(f)
): Promise<FileContentResult> {
  try {
    return { ok: true, text: await read(file) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function useMemoryContentQuery(file: string): {
  data: FileContentResult | undefined
  isLoading: boolean
} {
  const client = useQueryClient()
  const { data, isLoading } = useQuery(displayQuery(client, memoryContentQueryKey(file), () => fetchMemoryContent(file)))
  return { data, isLoading }
}
