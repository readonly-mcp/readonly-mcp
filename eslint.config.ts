import { configure, defaultEntryPoints } from '@gtbuchanan/eslint-config';

export default [
  ...await configure({
    // The server entry point sits at the root, outside the default bin directories.
    entryPoints: [...defaultEntryPoints, 'index.ts'],
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['test/**/*.ts'],
    rules: {
      // The assert* helpers in test/ wrap expect, so a test that calls one asserts.
      'vitest/expect-expect': ['warn', { assertFunctionNames: ['expect', 'assert*'] }],
    },
  },
];
