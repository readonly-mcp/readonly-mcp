// @module-tag integration
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Server, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('gt tool', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for(
    ([
      ['auth', 'token'],
      ['auth', 'git-credential', 'get'],
      [':word'],
      ['pr', 'merge', ':number'],
      ['pr', 'review', ':number', '--approve'],
      ['--repo', ':owner/:repo', 'pr', 'merge', ':number'],
      ['pr', 'list', '--cwd', ':path'],
      ['pr', 'view', ':number', '--web'],
      ['run', 'logs', ':number', '-O', ':file'],
      ['issue', 'list', '--jq', 'env'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })),
  )('blocks $name', async ({ args }, { expect, server }) => {
    expect(await server.callTool('gt', { args })).toBeBlocked();
  });

  integration('blocks bare gt', async ({ expect, server }) => {
    await expect(server.callTool('gt', { args: [] })).resolves.toBeBlocked();
  });
});
