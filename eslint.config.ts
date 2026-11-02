import { configure } from '@gtbuchanan/eslint-config';

// Lints the workspace root's own files; each package lints itself.
export default configure({ tsconfigRootDir: import.meta.dirname });
