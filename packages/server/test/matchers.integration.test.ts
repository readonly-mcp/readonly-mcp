// @module-tag integration
import { describe, it } from 'vitest';
import { type Server, useServer } from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('toBeBlocked on a server call', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration('names the call arguments in its failure', async ({ expect, server }) => {
    const args = { args: ['.'], command: 'ls' };
    const result = await server.callTool('shell', args);

    expect(() => {
      expect(result).toBeBlocked();
    }).toThrow(`arguments: ${JSON.stringify(args)}`);
  });
});
