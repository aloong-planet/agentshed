# ADR-0029: Persist display data separately from accounting indexes

- Status: Accepted (2026-09-14)

## Context and problem

A restart currently starts with an empty snapshot and renderer query cache. The user requires the
previous run's data and previously viewed project/session content to be readable while the first
background scan runs, including after an accounting-cache invalidation. The question index shares
the accounting cache under ADR-0011; restoring statistics and read registrations alone cannot serve
session pages when that index is empty.

## Options

1. **Separate persisted display data, including successful viewed page payloads**: preserve the
   existing query layer and accounting index, and restore a display copy before revalidation.
2. Restore only the snapshot and main-process derived state — insufficient: an invalid accounting
   cache has no question index, and session opening rejects with sessionNotIndexed.
3. Derive everything from the accounting cache at startup — insufficient: the required upgrade
   case deliberately invalidates that cache.
4. Couple the saved display data to the accounting stamp — rejected in the requirements discussion:
   it removes the previous data exactly when a full rescan makes restoration most useful.

## Decision

Use option 1. The main process owns an independently versioned display store and records successful
scan/read outputs with their identity and observation information. The renderer restores the
existing query layer from validated data before presenting saved pages. No general renderer-provided
path or cache-blob write endpoint is introduced.

A saved display page can answer a read-only presentation request without the live index. Fetching
new source contents still goes through current registration and source validation. Saved exact-path
registrations may be restored, with the extra target checks the user selected; they are not an
alternative to the main process's admission rules. A current authoritative scan or enumeration
replaces its corresponding restored registrations.

Accounting cache and archive inputs remain separate: a display copy does not become a live scan
observation and never rewrites history. Source question identity ties a saved answer to its page;
a former ordinal alone cannot pair an old question with a rewritten source's new answer.

ADR-0028 continues to own the query mechanism, while the previous memory-only lifetime changes.
ADR-0011 continues to own the offset index and its no-question-text rule; saved page text is neither
that index nor a second searchable corpus. Navigation and expansion state remain outside persistence.

## Consequences

- Positive: a full restart can show previous data before scanning, and previously read content
  survives an accounting/index version bump.
- Positive: the source-read and accounting rules retain a single owner each.
- Negative: successful read content now occupies additional application-local disk space; atomic
  writes, schema validation and ordering are required, and cache size/startup costs need measurement
  under Electron before acceptance. No unapproved numeric retention limit is assumed.
- Negative: the display copy may be stale. Its startup status and subsequent successful replacement
  must remain visible and coherent; a failed refresh cannot erase the last successful page.
- Neutral: changes in actual source contents still govern the next successful scan/read. The saved
  copy does not recover content never read, or justify access to deleted/replaced targets.

## Sources

The startup-restoration requirements discussion of 2026-09-13, including the explicit choice to
persist previously viewed project details and session-page contents. The restoration
requirements in agents-overview, project-detail, session-view and token-stats define product behavior.
Current code confirms that the accounting cache loads an empty file map on a version mismatch and
that sessionQuestions rejects a file absent from that map. The real Electron restart scenario verifies saved details, read previews and answers before a held
first scan, with an invalid accounting cache. It also verifies source rewrite, symlink refusal,
and failure followed by automatic recovery. Store tests verify ordered atomic writes, retry after
write failure, incompatible formats and isolated malformed entries.
