# Reviewer notes: prototype-detail-stale-note.html

## Question

What the stale note page looks like — the page a project's detail opens as when the project's directory no
longer exists (project detail, stale state): the note card, which opens with the cause sentence, follows with
the effect sentence and ends with the line to send to the agents and its copy button; whether the side chips
in the cause sentence and the send sentence follow the sides that still record the project, from all four
sides down to one; and how the Chinese and English copy wraps at this width.

## Structure basis

- The window frame — the rail with Projects current and the project column with the same mock projects —
  follows the project list prototype; here the column shows stale projects and has this project selected, and
  a project that has its own prototype opens it on click.
- The header (back control, struck-through project name, stale tag, path) with the note card as the page's
  whole body, and no section tabs or data areas, follows a direction the owner confirmed for the stale note
  page.
- The stale tag takes the project column's stale tag colours.
- The side chips take the uppercase full-name side chip form of the side cards on the agents page prototype.
- The copy button's glyph is Lucide copy, from the prototypes' shared icon table.
- Colours come from the prototypes' shared theme; the page defines no app colour of its own.

## Demo scaffolding

- The floating demo bar at the bottom of the window (marked `data-demo-harness`) — not part of the design; do
  not implement. Its one group, 「记录侧」, sets which sides record the project: CC+CX+GK+AG (all four sides,
  the widest chip row), 仅 CC, 仅 GK. In the product the sides are those whose registries still record the
  project; the app has no such control, as the bar's note line says.
