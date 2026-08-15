# ADR-0022: Manual project hiding is removed

- Status: Accepted (2026-08-16)

## Context

Hiding shipped with the very first feature (the project list, #2). Its user story reasoned from a
constraint that still holds: the list is the union of each side's registry, this app **cannot add to
or remove from those registries**, and so directories the user does not care about necessarily
accumulate in it. Hiding was the only way to get them out of view, and it was deliberately confined
to a browsing preference — stored in the app's own `hidden.json`, never written to any agent
configuration, and explicitly excluded from affecting statistics (ADR-0003 option 2).

Two things have since come out differently from what that reasoning assumed. The clutter it was built
for has not materialised at the scale imagined — search, side filtering and the stale fold already
keep the list navigable. And the control costs a hover slot at the end of every row, where it
competes with information that is always on screen: adding a per-row side count required pushing that
count 37px clear of the hide button, because the button floats in on hover exactly where the count
sits, and intercepts the pointer before it reaches it.

## Options

1. **Remove hiding entirely** — the control, its store, its IPC command, and the "N hidden" panel
2. Keep the capability but move it out of the row (a context menu, or a slot further right) —
   rejected: it preserves a capability whose demand has not shown up, and buys that by adding an
   interaction pattern the product does not otherwise have anywhere. The row-end collision would be
   solved, the maintenance surface would not shrink
3. Keep it as is and live with the collision — rejected: the 37px reservation is load-bearing for
   every row, and every future row-end element has to be designed around a control used at most once
   per project

## Decision

We adopt **option 1**. Manual hiding is removed: the hide control, the "N hidden" entry point and its
restore panel, `HiddenStore`, the `setHidden` IPC command, and the `hidden` field on both project and
memory entries. No replacement entry point is added — a capability with no demonstrated demand should
not survive as a smaller version of itself.

## Consequences

- Positive: the row-end hover slot is free, and per-row information no longer has to be positioned
  around a control that appears on hover. The project entry and memory entry contracts each lose a
  field, and the scan no longer takes a hiding lookup.
- Negative, and the honest cost: **"the directory still exists and I do not want to see it" now has
  no outlet at all**, while the constraint that created that need — registries are read-only to this
  app — is unchanged. If such lists do grow on someone's machine, the answer will have to be found
  again.
- Negative: users who had hidden projects will see them reappear on the next launch, because the
  preference that filtered them is gone. `hidden.json` becomes an orphan file.
- Neutral: ADR-0003 rejected "have the totals follow the list filters" on the grounds that hiding a
  project must not change total consumption. **That option's premise no longer exists.** ADR-0003 is
  not rewritten — its conclusion (totals cover every project) stands on its own and is unaffected;
  only the specific argument about hiding is now moot.
- Neutral: the `project-list/visibility` logic prototype models stale-filtering and manual hiding as
  orthogonal axes. One axis goes away, so the prototype no longer describes the system.
- Neutral: interaction coverage for this feature was claimed but absent — the spec said the hidden
  entry point relies on e2e, and no such e2e case existed. Only the storage layer was tested, so the
  removal carries less regression risk than the file count suggests.

## Sources

`docs/specs/projects-list.md` user story 5 and sequence C (the original reasoning and the
never-pollute-agent-config constraint); ADR-0003 option 2; `027166b` (the feature's introduction).
Measured 2026-08-15 while adding the per-row side count: with the activity text reduced to a relative
time alone, removing the 62px reservation puts the hide button 4px over the count badge. The user's
ruling of 2026-08-16 that both the demand and the interaction slot fail to justify it.
