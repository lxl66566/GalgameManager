// Flat ESLint config.
//
// Layers (last wins):
//   1. eslint recommended + import-x             — generic bugs, import hygiene
//   2. typescript-eslint strict/stylistic (type-aware) — needs type info, catches
//      floating promises, unsafe `any` leakage, etc.
//   3. unicorn + perfectionist + regexp          — opinionated consistency
//   4. eslint-plugin-solid (flat/typescript)     — SolidJS reactivity pitfalls
//   5. eslint-plugin-oxlint                      — turn off rules already handled by oxlint
//   6. eslint-config-prettier                    — disable formatting conflicts
//
// Fast rule-only feedback also runs via oxlint (see .oxlintrc.json); ESLint is
// kept for the type-aware and Solid-specific rules oxlint can't do yet.
// eslint-plugin-oxlint reads .oxlintrc.json and disables all ESLint rules that
// oxlint already covers, avoiding duplicate work.
import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import { importX } from 'eslint-plugin-import-x'
import oxlint from 'eslint-plugin-oxlint'
import { configs as perfectionist } from 'eslint-plugin-perfectionist'
import { configs as regexpConfigs } from 'eslint-plugin-regexp'
import solidPlugin from 'eslint-plugin-solid'
import unicorn from 'eslint-plugin-unicorn'
import tseslint from 'typescript-eslint'

const solid = solidPlugin.default ?? solidPlugin

export default tseslint.config(
  {
    ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  importX.flatConfigs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs['flat/recommended'],
  perfectionist['recommended-natural'],
  regexpConfigs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // SolidJS/React JSX event handlers (onClick, onBlur, onChange,
      // onKeyDown, onInput, …) are typed as `() => void`, and passing async
      // functions is an extremely common, safe idiom — the event system
      // simply ignores the returned Promise. The type-aware rule fires on
      // every async JSX handler, producing noise without catching real bugs.
      // Only the JSX-attribute check is disabled; `arguments`, `properties`,
      // `checksConditionals` and `checksSpreads` (which catch genuine
      // mistakes like `if (someAsyncFn)` or `arr.sort(async …)`) stay on.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { solid },
    rules: {
      ...solid.configs['flat/typescript'].rules,
    },
  },
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}'],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      'solid/reactivity': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', '*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Config files at root are not included in the TS project service,
  // so disable type-aware rules for them.
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'uno.config.ts', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Disable ESLint rules that oxlint already handles (avoids duplicate work).
  // Our overrides below still take precedence for rules we want ESLint to
  // enforce with type-aware precision (e.g. @typescript-eslint/no-explicit-any).
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
  {
    rules: {
      // --- low-value typescript-eslint rules ---
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-for-in-array': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/require-await': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-unresolved': 'off',
      'no-unassigned-vars': 'off',
      'no-undef': 'off',
      'no-underscore-dangle': 'off',
      // --- rules from plugins not loaded in ESLint ---
      'oxc/no-map-spread': 'off',
      // Import ordering is owned by `@ianvs/prettier-plugin-sort-imports`
      // (run via `prettier --write`, which executes *after* `eslint --fix` in
      // lint-staged). Perfectionist's sort-imports rules use a different
      // grouping than the prettier plugin, so the two can never be satisfied
      // at the same time — every file would flip-flop. Disable the redundant
      // ESLint rules so `verify` (fmt:check && lint:full) is achievable; all
      // other Perfectionist rules (sort-objects, sort-object-types, …) stay.
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'prefer-const': 'error',
      'promise/always-return': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/filename-case': [
        'error',
        { cases: { camelCase: true, kebabCase: true, pascalCase: true } },
      ],
      'unicorn/max-nested-calls': 'off',
      'unicorn/name-replacements': 'off',
      // --- opinionated unicorn rules that generate noise ---
      'unicorn/no-anonymous-default-export': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-declarations-before-early-exit': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-top-level-assignment-in-function': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',
      'unicorn/no-unsafe-string-replacement': 'off',
      'unicorn/no-unused-array-method-return': 'off',
      'unicorn/no-useless-switch-case': 'off',
      'unicorn/prefer-minimal-ternary': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-simple-condition-first': 'off',
    },
  },
  // Standard test directory naming and locale hyphenated codes.
  {
    files: ['**/__tests__/**'],
    rules: { 'unicorn/filename-case': 'off' },
  },
  {
    files: ['**/en-US.*', '**/zh-CN.*'],
    rules: { 'unicorn/filename-case': 'off' },
  },
  prettier,
)
