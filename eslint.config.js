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
import { configs as perfectionist } from 'eslint-plugin-perfectionist'
import { configs as regexpConfigs } from 'eslint-plugin-regexp'
import oxlint from 'eslint-plugin-oxlint'
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
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Disable ESLint rules that oxlint already handles (avoids duplicate work).
  // Our overrides below still take precedence for rules we want ESLint to
  // enforce with type-aware precision (e.g. @typescript-eslint/no-explicit-any).
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import-x/no-named-as-default': 'off',
      'import-x/no-unresolved': 'off',
      'no-undef': 'off',
      'no-unassigned-vars': 'off',
      'no-underscore-dangle': 'off',
      'prefer-const': 'error',
      'unicorn/filename-case': [
        'error',
        { cases: { kebabCase: true, pascalCase: true } },
      ],
      'unicorn/name-replacements': [
        'error',
        {
          allowList: {
            args: true, Args: true,
            env: true, Env: true,
            props: true, Props: true,
            ref: true, Ref: true,
          },
        },
      ],
    },
  },
  prettier,
)
