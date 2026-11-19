import eslint from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  {ignores: ['**/dist/**', '**/node_modules/**', '**/playwright-report/**', '**/test-results/**', '**/coverage/**', '**/public/sw.js']},
  eslint.configs.recommended, ...ts.configs.recommended,
  {files: ['**/*.{js,mjs,ts,tsx}'], languageOptions: {globals: {process:'readonly', console:'readonly', Buffer:'readonly', URL:'readonly', TextEncoder:'readonly', TextDecoder:'readonly', setTimeout:'readonly', clearTimeout:'readonly', fetch:'readonly', crypto:'readonly', indexedDB:'readonly', window:'readonly', document:'readonly', navigator:'readonly', Blob:'readonly', Response:'readonly', Request:'readonly', AbortSignal:'readonly', AbortController:'readonly', Headers:'readonly', HTMLElement:'readonly', localStorage:'readonly', atob:'readonly', btoa:'readonly', File:'readonly', FileReader:'readonly', Event:'readonly', Uint8Array:'readonly'}}, rules: {'@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}}
);
