import { defineConfig } from 'oxlint';

export const modernization = defineConfig({
    rules: {
        'unicorn/no-array-for-each': 'error',
        'unicorn/prefer-string-starts-ends-with': 'error',

        // --- unicorn modernization ---
        'unicorn/prefer-array-some': 'error',
        'unicorn/prefer-regexp-test': 'error',
        'unicorn/prefer-string-replace-all': 'error',
        'unicorn/prefer-array-flat': 'error',
        'unicorn/prefer-at': 'error',
        'unicorn/prefer-type-error': 'error',
        'unicorn/no-useless-undefined': ['error', { checkArguments: false }],
        'unicorn/no-useless-switch-case': 'error',
        'unicorn/no-instanceof-array': 'error',
        'unicorn/prefer-modern-math-apis': 'error',
        'unicorn/prefer-number-properties': 'error',
        'unicorn/prefer-optional-catch-binding': 'error',

        // --- readability ---
        'typescript/consistent-return': 'error',
        'typescript/adjacent-overload-signatures': 'error',
        'typescript/unified-signatures': 'error',
        'typescript/prefer-find': 'error',
        'typescript/prefer-for-of': 'error',
        'typescript/prefer-includes': 'error',
        'eslint/default-param-last': 'error',
        'eslint/prefer-const': 'error',
        'eslint/prefer-object-has-own': 'error',
        'eslint/prefer-object-spread': 'error',
        'eslint/prefer-template': 'error',
        'eslint/default-case-last': 'error',
        'eslint/no-lonely-if': 'error',
        'eslint/curly': 'error',

        // --- modern APIs ---
        'unicorn/prefer-node-protocol': 'error',
        'unicorn/no-length-as-slice-end': 'error',
        'unicorn/prefer-string-slice': 'error',
        'unicorn/prefer-code-point': 'error',
        'unicorn/prefer-date-now': 'error',
        'unicorn/prefer-keyboard-event-key': 'error',
        'unicorn/prefer-modern-dom-apis': 'error',
        'unicorn/prefer-dom-node-text-content': 'error',
        'unicorn/prefer-structured-clone': 'error',
        'unicorn/prefer-dom-node-append': 'error',
        'unicorn/prefer-query-selector': 'error',
        'unicorn/prefer-global-this': 'error',
        'unicorn/escape-case': 'error',

        // --- builtins / literals ---
        'unicorn/new-for-builtins': 'error',
        // Off: its autofix uppercases hex digits while prettier (pre-commit)
        // lowercases them, so oxlint --fix and prettier --write fight over the
        // same literal and re-dirty committed files. Prettier owns formatting.
        'unicorn/number-literal-case': 'off',
        'unicorn/no-useless-collection-argument': 'error',
    },
});
