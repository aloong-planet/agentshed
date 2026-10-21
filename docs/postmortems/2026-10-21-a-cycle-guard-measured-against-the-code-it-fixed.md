# A cycle guard measured against the code it fixed

**Date**: 2026-10-21 · **Surface**: the i18n layer's plural module and its test

## What happened

`plural()` once lived in the i18n layer's index module, which imports every dictionary, and read each
dictionary's `htmlLang` for its locale tag. A dictionary that called it was therefore circular: loaded on its
own, it re-entered the index before it had initialised. The fix of 2026-08-10 moved `plural()` into a leaf module
that takes the bare language code, and added a test that loads a dictionary as the module graph's first import.
Its header said the guard was "measured, not assumed".

Removing French, Spanish, Russian and Japanese (ADR-0035) meant moving that test from the Russian dictionary to the
English one, and the header's claim had to be re-established before it was copied. With the cycle planted again (the
English dictionary importing `plural` from the index), the test stayed **green**. The same plant at the commit that
added the guard also stays green. The guard had never caught a reintroduced cycle.

## Why nothing caught it

The red the guard was written against came from `plural()` reading a dictionary, which surfaced the undefined
entry the cycle leaves. The same commit removed that read. After it, a cycle still leaves the index holding an
undefined dictionary under vitest, but nothing the test touches reads it, so the test cannot fail. A guard whose
only failure path is gone is green in exactly the way a working guard is green; nothing re-measures a guard once it
is committed, and the project runs no mutation testing.

This is the class the 2026-08-18 postmortem names — a red earned under conditions that do not survive to the
committed form — in a test written eight days before that rule was.

## What was done

- The test now asks the layer for the dictionary after loading it on its own (a dynamic import of the index inside
  the test, so the module cache cannot hide the cycle) and asserts it is the same object. With the cycle planted it
  goes red ("expected undefined"); restored, green.
- The header's causal claims were re-measured; one that the plant disproved (that the cycle bites when a plural is
  evaluated) was removed.

## The rule to carry forward

The 2026-08-18 rule, applied to a guard being moved rather than written: **a guard copied into a new form is
re-measured in that form before its claims are copied with it.** Carrying the header over verbatim would have
renewed a promise the code had stopped keeping two months earlier.
