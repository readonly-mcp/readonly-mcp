// @module-tag integration
import { describe, it } from 'vitest';
import {
  type Server, assertBlocked, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('gh tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for(
    [
      ['issue', 'create'], ['issue', 'close'], ['issue', 'delete'], ['issue', 'edit'],
      ['pr', 'create'], ['pr', 'close'], ['pr', 'merge'], ['pr', 'edit'],
      ['repo', 'create'], ['repo', 'delete'],
      ['auth', 'login'],
      ['gist', 'create'], ['gist', 'delete'], ['gist', 'edit'],
      ['label', 'create'], ['label', 'delete'], ['label', 'edit'],
      ['release', 'create'], ['release', 'delete'], ['release', 'edit'],
      ['workflow', 'run'], ['workflow', 'enable'], ['workflow', 'disable'],
      ['secret', 'set'], ['secret', 'delete'],
      ['variable', 'get'], ['variable', 'set'], ['variable', 'delete'],
      ['project', 'create'], ['project', 'delete'], ['project', 'edit'],
      ['cache', 'delete'],
      ['ruleset', 'create'],
    ].map(args => ({ name: args.join(' '), args })),
  )('blocks $name', async ({ args }, { expect, server }) => {
    assertBlocked(expect, await server.callTool('gh', { args }));
  });
});
