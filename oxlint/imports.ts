import { defineConfig } from 'oxlint';

export const imports = defineConfig({
    rules: {
        'import/no-default-export': 'error',
        'import/first': 'error',
        'import/no-duplicates': 'error',
        'import/consistent-type-specifier-style': 'error',
        'import/no-mutable-exports': 'error',

        // --- import hygiene ---
        'import/extensions': 'error',
        'import/no-commonjs': 'error',
        'import/no-dynamic-require': 'error',
        'import/no-cycle': 'error',
        'import/no-webpack-loader-syntax': 'error',
        'import/no-unassigned-import': 'error',
        'import/unambiguous': 'error',
    },
    overrides: [
        {
            // Tool contract: oxlint loads its config as the default export.
            files: ['**/*.config.ts'],
            rules: { 'import/no-default-export': 'off' },
        },
    ],
});
