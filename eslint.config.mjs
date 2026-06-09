import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.svelte'],
    plugins: { svelte },
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: ts.parser },
      globals: { ...globals.browser },
    },
    rules: {
      ...svelte.configs.recommended.rules,
    },
  },
  {
    ignores: ['**/dist/**', '**/build/**', '**/.svelte-kit/**', '**/node_modules/**'],
  },
]
