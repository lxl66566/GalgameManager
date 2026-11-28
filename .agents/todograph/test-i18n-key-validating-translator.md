---
id: test-i18n-key-validating-translator
description: Store tests stub t as a key echo, so a mistyped i18n key passes tests and reaches users as a raw key; share a dictionary-validating translator
status: open
priority: 2
type: task
tags: [testing, i18n]
created_at: 2026-11-28T16:10:44.653756Z
updated_at: 2026-11-28T16:10:44.653756Z
---
## Context

`src/store/__tests__/syncActions.test.ts` stubs the translator as `(key) => String(key)`. Assertions compare keys, so the tests cannot tell whether a key exists in `src/i18n`. `tsc` does not catch it either: `@solid-primitives/i18n` keeps a permissive overload for dynamically built keys, and an unknown literal falls back to it and returns the union of every dictionary value. In the update-check work a `hint.updateCheckFailed` typo (the key is `hint.checkUpdateFailed`) went through five green tests and only surfaced because `@typescript-eslint/restrict-plus-operands` rejected `t(...) + ': '`.

## Work

- [ ] Move the validating translator from `src/store/__tests__/updateCheck.test.ts` (it resolves each dotted key against the `en-US` `dict`, throws on a miss, then echoes the key) into a shared helper under `src/test/`, and use it in `syncActions.test.ts`.
- [ ] Optional: fail when a name passed in the params object is absent from the `{{...}}` placeholders of the template.

## Notes

Only the update-check tests validate keys today; the older store tests still use the echo stub.