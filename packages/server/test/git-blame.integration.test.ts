// @module-tag integration
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Call, type Server, assertNotBlocked, textOf, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('git', { args })),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('git blame option allowlist', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration('rejects a file reader before git runs', async ({ call, expect }) => {
    const result = await call(['blame', '--contents', build.absolutePath(), 'README.md']);

    expect(textOf(result)).toBe('Flag not allowed for git blame: --contents');
  });

  integration('runs an allowed option with its value', async ({ call, expect }) => {
    assertNotBlocked(expect, await call(['blame', '-L', '1,2', 'README.md']));
  });
});
