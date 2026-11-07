// @module-tag integration
import { describe, it } from 'vitest';
import { type Server, assertBlocked, useServer } from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('chezmoi tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for(
    [
      ['apply'], ['add'], ['data'], ['edit'], ['forget'], ['init'],
      ['remove'], ['re-add'], ['update'], ['destroy'], ['state', 'dump'],
      ['cat-config'],
    ].map(args => ({ name: args.join(' '), args })),
  )('blocks $name', async ({ args }, { expect, server }) => {
    assertBlocked(expect, await server.callTool('chezmoi', { args }));
  });
});
