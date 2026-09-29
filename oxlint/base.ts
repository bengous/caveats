import { defineConfig } from 'oxlint';

export const base = defineConfig({
    rules: {
        'eslint/no-unused-vars': 'error',
        'eslint/no-var': 'error',
        'eslint/no-else-return': 'error',
        'eslint/no-param-reassign': 'error',
        'eslint/no-await-in-loop': 'error',
        'eslint/no-underscore-dangle': 'error',

        // --- quality at scale ---
        'oxc/only-used-in-recursion': 'error',
        'oxc/no-accumulating-spread': 'error',
        'eslint/no-unmodified-loop-condition': 'error',
        'eslint/no-unused-expressions': 'error',
        'unicorn/error-message': 'error',
        'unicorn/no-useless-spread': 'error',
        'unicorn/no-useless-promise-resolve-reject': 'error',
    },
});
