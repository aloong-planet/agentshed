// The dictionaries' type contract: the type the other five languages must satisfy, derived from the source
// language's (zh) shape.
//
// It has to do two things that pull against each other:
//   1. **widen the values** — with `as const` on the source language, `languageName`'s type is the literal
//      `'简体中文'`,
//      so annotating the English dictionary with `typeof zh` directly would reject `'English'` for not
//      matching that literal.
//   2. **do not widen the structure** — the key set must match the source language exactly, going red on
//      both a missing key and an extra one.
//
// Dict rewrites property by property: functions keep their signature, nested objects recurse, and
// everything else widens to string.
// The function branch must come **before** the object branch — a function also satisfies `extends object`
// in the type system,
// so reversing the order would wrongly recurse into parameterised copy as if it were a nested dictionary.
//
// `-readonly` drops the readonly modifiers `as const` adds: each language module is an ordinary object
// declared independently,
// with no need to force readonly; keeping it would only force implementers to write as const too, adding
// noise for nothing.
export type Dict<T> = {
  -readonly [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends object
      ? Dict<T[K]>
      : string
}

/** The type for the other five languages: the structure is locked to the source language and the values
 * are widened. Both a missing key and an extra one fail typecheck */
export type Locale = Dict<typeof import('./zh').zh>
