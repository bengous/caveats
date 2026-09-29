// Severity policy: a rule is at `error` or `off`, never `warn`. A rule the
// code will not follow is turned off here with a one-line reason, never
// disabled inline.
import { defineConfig } from 'oxlint';
import { antiSlop } from './oxlint/anti-slop.ts';
import { base } from './oxlint/base.ts';
import { correctness } from './oxlint/correctness.ts';
import { imports } from './oxlint/imports.ts';
import { modernization } from './oxlint/modernization.ts';
import { typescript } from './oxlint/typescript.ts';

export default defineConfig({
    categories: {
        correctness: 'error',
        suspicious: 'error',
        perf: 'error',
    },

    plugins: ['typescript', 'unicorn', 'oxc', 'import'],

    jsPlugins: [{ name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' }],

    extends: [base, correctness, imports, typescript, modernization, antiSlop],

    rules: {
        'eslint/max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
        'eslint/complexity': ['error', { max: 20 }],
        'eslint/max-depth': ['error', { max: 4 }],
        'eslint/max-params': ['error', { max: 4 }],
        'eslint/max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },

    overrides: [
        {
            // An ambient `declare module '*.wasm'` must live in a script file:
            // inside a module it becomes an augmentation, where wildcards fail.
            files: ['**/*.d.ts'],
            rules: { 'import/unambiguous': 'off' },
        },
    ],

    ignorePatterns: ['tools/oxlint/anti-slop/**', 'spike/**'],
});
