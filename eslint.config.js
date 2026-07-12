import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules', 'out', 'release', 'coverage', '.electron-builder-cache', 'secret', 'serdtseglaz-pet']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', '*.config.{js,ts}', 'scripts/**/*.{js,mjs,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['*.cjs'],
    languageOptions: { globals: globals.commonjs }
  }
);
