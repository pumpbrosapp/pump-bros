// @ts-check
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  eslintConfigPrettier,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // The codebase leans on inline comments to explain *why*, not just
      // *what* — keep that, just flag genuinely unused code.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
