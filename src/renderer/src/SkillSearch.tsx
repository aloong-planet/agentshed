// The box above a skills list. Shared by the global Agents · Skills section and project detail · Skills.
//
// What is shared here is the **control**, not the filtering: each list keeps its own keyword state and
// applies the rule to its own shape (one flat list; five groups with counts). Copying three lines of JSX
// into both sites instead would let the placeholder, the class and the input attributes drift apart —
// which is the kind of difference nobody notices until the two boxes look subtly unlike each other.
//
// It reuses `.sbar` from the sessions search rather than introducing a second "box you type into", and
// renders only the input — that section's scope toggle has no counterpart here. The `sk-search` modifier
// carries the fixed width: `.sbar input` is `flex: 1` because the sessions box shares its row with the
// scope toggle, so widening it directly there would resize a box in another section.
import type { JSX } from 'react'
import { useDict } from './language'

export function SkillSearch({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  const t = useDict()
  return (
    <div className="sbar sk-search">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.skills.searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}
