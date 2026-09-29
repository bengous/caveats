import { defineConfig } from 'oxlint';

export const typescript = defineConfig({
    rules: {
        'typescript/no-non-null-assertion': 'error',
        'typescript/no-explicit-any': 'error',
        'typescript/no-floating-promises': 'error',
        'typescript/no-misused-promises': 'error',
        'typescript/no-redundant-type-constituents': 'error',
        'typescript/no-unsafe-type-assertion': 'error',
        'typescript/no-unnecessary-type-assertion': 'error',

        // --- modern typescript ---
        'typescript/return-await': 'error',
        'typescript/no-import-type-side-effects': 'error',
        'typescript/prefer-nullish-coalescing': 'error',
        'typescript/no-unnecessary-condition': 'error',
        'typescript/switch-exhaustiveness-check': 'error',
        'typescript/consistent-type-imports': 'error',
        'typescript/consistent-type-exports': 'error',

        // --- type safety ---
        'typescript/no-unsafe-assignment': 'error',
        'typescript/no-unsafe-call': 'error',
        'typescript/no-unsafe-member-access': 'error',
        'typescript/no-unsafe-return': 'error',
        'typescript/no-unsafe-argument': 'error',
        'typescript/only-throw-error': 'error',
        'typescript/restrict-plus-operands': 'error',
        'typescript/use-unknown-in-catch-callback-variable': 'error',
        // Off (2026-08-29): a fake runner or a pass-through returns a promise
        // without awaiting; `async` on it trips eslint/require-await and
        // `return await` trips typescript/return-await.
        'typescript/promise-function-async': 'off',
        'typescript/no-unnecessary-type-parameters': 'error',
        'typescript/no-deprecated': 'error',
        'typescript/prefer-promise-reject-errors': 'error',

        // --- nullish/boolean discipline ---
        'typescript/strict-boolean-expressions': 'error',
        'typescript/no-non-null-asserted-nullish-coalescing': 'error',
        'typescript/no-unnecessary-type-conversion': 'error',
        'typescript/no-useless-default-assignment': 'error',
        'typescript/dot-notation': 'error',
        'typescript/prefer-optional-chain': 'error',
        'typescript/no-unnecessary-qualifier': 'error',

        // --- type shape discipline ---
        // `interface DocumentEventMap extends X {}` is the declaration-merging idiom.
        'typescript/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
        'typescript/non-nullable-type-assertion-style': 'error',
        'typescript/prefer-literal-enum-member': 'error',
        'typescript/consistent-indexed-object-style': 'error',

        // --- ts-comment hygiene ---
        'typescript/ban-ts-comment': 'error',
        'typescript/prefer-ts-expect-error': 'error',

        // --- ESM enforcement ---
        'typescript/no-require-imports': 'error',
        'typescript/no-var-requires': 'error',

        // --- type style consistency ---
        'typescript/no-inferrable-types': 'error',
        'typescript/array-type': 'error',
        'typescript/consistent-type-definitions': 'error',
        'typescript/prefer-function-type': 'error',
    },
});
