import { configure, defaultEntryPoints } from '@gtbuchanan/eslint-config';

// A beforeAll called on an it.extend test function rather than imported bare.
const fixtureHook = "CallExpression[callee.property.name='beforeAll']";

export default [
  ...await configure({
    // The server entry point sits at the root, outside the default bin directories.
    entryPoints: [...defaultEntryPoints, 'src/index.ts'],
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['test/**/*.ts'],
    rules: {
      // The assert* helpers in test/ wrap expect, so a test that calls one asserts.
      'vitest/expect-expect': ['warn', { assertFunctionNames: ['expect', 'assert*'] }],
      /*
       * The suites write it throughout. Vitest requires a file-scoped
       * fixture's it.extend at the top level, where the default wants test.
       */
      'vitest/consistent-test-it': ['warn', { fn: 'it', withinDescribe: 'it' }],
      /*
       * A suite-level hook on an it.extend test function that asks for a
       * file-scoped fixture sets it up against the hook's timeout rather than
       * the first tests'. no-restricted-syntax confines beforeAll to that use.
       */
      'vitest/no-hooks': ['warn', { allow: ['beforeAll'] }],
      'no-restricted-syntax': [
        'warn',
        {
          message: 'Call beforeAll on an it.extend test function.',
          selector: "CallExpression[callee.name='beforeAll']",
        },
        {
          message: 'A beforeAll hook must take the fixtures it sets up.',
          selector: `${fixtureHook} > :function:not([params.0.type='ObjectPattern'])`,
        },
        {
          message: 'Share state through a fixture, not a beforeAll assignment.',
          selector: `${fixtureHook} AssignmentExpression`,
        },
      ],
    },
  },
];
