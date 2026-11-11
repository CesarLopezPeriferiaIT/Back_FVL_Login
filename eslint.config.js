import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Configuracion de ESLint en formato plano (flat config) para el microservicio de login.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'odd/**', 'docs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*', 'scripts/**/*', 'vitest.config.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Los dobles en memoria resuelven de forma sincrona pero deben cumplir el contrato asincrono.
      '@typescript-eslint/require-await': 'off',
    },
  },
  prettier,
);
