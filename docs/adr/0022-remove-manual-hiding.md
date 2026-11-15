# ADR-0022: Manual project hiding is removed

- Status: Accepted (2026-08-16)

## Context

The project list is the union of each side's registry, which this app cannot add to or remove from, so directories the
user does not care about accumulate in it. A hide control in each row gets them out of view, but it takes the hover
slot at the row's end, over information that is always on screen such as the per-row side count. Search, side filtering
and the stale fold already keep the list navigable, and the clutter has not appeared at the scale that would call for
more.

## Options

1. **Remove manual hiding entirely: the hide control, its store and the panel that restores hidden projects**
2. Keep hiding but move it out of the row, into a context menu or a slot further right — rejected: it keeps a
   capability whose demand has not shown up and adds an interaction pattern the product has nowhere else; the
   collision would be solved, the maintenance surface would not shrink.
3. Keep it as it is and live with the collision — rejected: the row-end reservation binds every row, and every future
   row-end element would have to be designed around a control used at most once per project.

## Decision

We adopt **option 1**. Manual hiding is removed and no replacement entry point is added: a capability with no
demonstrated demand should not survive as a smaller version of itself.

## Consequences

- Positive: the row-end hover slot is free, so per-row information is not placed around a control that appears on
  hover, and project and memory entries carry no hiding state.
- Negative: "the directory still exists and I do not want to see it" has no outlet at all, while the constraint that
  creates the need, registries read-only to this app, is unchanged. If such lists grow on someone's machine, the answer
  has to be found again.
- Neutral: a project whose directory is gone can still be filtered out of view by the stale filter, so what has no
  outlet is only a directory that still exists.

## Sources

`docs/specs/projects-list.md`: the note under its user stories, and sequence C (C2, no browsing preference is written to
any agent configuration). Measured on 2026-08-15 while adding the per-row side count: the count had to sit 37px clear
of the hide button, and with the activity text reduced to a relative time alone, removing the 62px reservation puts the
hide button 4px over the count badge. The user's ruling of 2026-08-16 that neither the demand nor the interaction slot
justifies the control.
