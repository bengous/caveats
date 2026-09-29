import { defineConfig } from 'oxlint';

export const correctness = defineConfig({
    rules: {
        // --- silent bug catchers (error) ---
        'oxc/missing-throw': 'error',
        'oxc/bad-comparison-sequence': 'error',
        'oxc/bad-bitwise-operator': 'error',
        'oxc/bad-char-at-comparison': 'error',
        'oxc/bad-min-max-func': 'error',
        'oxc/bad-object-literal-comparison': 'error',
        'oxc/bad-replace-all-arg': 'error',
        'oxc/const-comparisons': 'error',
        'oxc/double-comparisons': 'error',
        'oxc/erasing-op': 'error',
        'oxc/misrefactored-assign-op': 'error',
        'oxc/number-arg-out-of-range': 'error',
        'oxc/uninvoked-array-callback': 'error',
        'eslint/no-constant-binary-expression': 'error',
        'eslint/no-template-curly-in-string': 'error',
        'eslint/no-self-compare': 'error',
        'eslint/no-loss-of-precision': 'error',
        'eslint/no-promise-executor-return': 'error',
        'unicorn/no-negation-in-equality-check': 'error',
        'eslint/no-new-wrappers': 'error',

        // --- control flow correctness ---
        'eslint/eqeqeq': 'error',
        'eslint/array-callback-return': 'error',
        'eslint/no-fallthrough': 'error',
        'eslint/no-case-declarations': 'error',
        'eslint/no-constructor-return': 'error',
        'eslint/no-loop-func': 'error',
        'eslint/no-unreachable': 'error',
        'eslint/getter-return': 'error',
        'eslint/no-redeclare': 'error',
        'eslint/radix': 'error',
        'eslint/no-object-constructor': 'error',
        'eslint/no-prototype-builtins': 'error',

        // --- error discipline ---
        'eslint/no-throw-literal': 'error',
        'unicorn/throw-new-error': 'error',
        'unicorn/catch-error-name': 'error',

        // --- dead code / cleanup ---
        'eslint/no-empty': 'error',
        'eslint/no-useless-return': 'error',
        'eslint/require-await': 'error',
    },
});
