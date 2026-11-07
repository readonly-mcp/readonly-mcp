// @module-tag integration
import { describe, it } from 'vitest';
import { type Server, assertBlocked, useServer } from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('acli tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for(
    [
      ['jira', 'workitem', 'create'],
      ['jira', 'workitem', 'edit'],
      ['jira', 'workitem', 'delete'],
      ['jira', 'workitem', 'assign'],
      ['jira', 'workitem', 'transition'],
      ['jira', 'workitem', 'comment', 'create'],
    ].map(args => ({ name: args.join(' '), args })),
  )('blocks $name', async ({ args }, { expect, server }) => {
    assertBlocked(expect, await server.callTool('acli', { args }));
  });
});
