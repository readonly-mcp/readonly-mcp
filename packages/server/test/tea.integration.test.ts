// @module-tag integration
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Server, assertBlocked, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('tea tool', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for(
    ([
      ['actions', 'secrets', 'list'],
      ['admin', 'users'],
      ['branches', 'protect', ':branch'], ['branches', 'P', ':branch'],
      ['branches', 'rename', ':branch', ':branch'], ['branches', 'rn', ':branch', ':branch'],
      ['branches', 'unprotect', ':branch'], ['branches', 'U', ':branch'],
      ['clone', ':owner/:repo'], ['C', ':owner/:repo'],
      ['comments', ':number', ':word'],
      ['comments', 'add', ':number', ':word'], ['comments', 'a', ':number', ':word'],
      ['comments', 'delete', ':number'], ['comments', 'rm', ':number'],
      ['comments', 'edit', ':number'], ['comments', 'e', ':number'],
      ['issues', 'close', ':number'],
      ['issues', 'create'], ['issues', 'c'],
      ['issues', 'edit', ':number'], ['issues', 'e', ':number'],
      ['issues', 'reopen', ':number'], ['issues', 'open', ':number'],
      ['labels', 'create'], ['labels', 'c'],
      ['labels', 'delete'], ['labels', 'rm'],
      ['labels', 'update'],
      ['logins', 'add'],
      ['logins', 'default', ':word'],
      ['logins', 'delete', ':word'], ['logins', 'rm', ':word'],
      ['logins', 'edit'], ['logins', 'e'],
      ['logins', 'helper', 'get'], ['logins', 'git-credential', 'get'],
      ['login', 'helper', 'get'], ['login', 'git-credential', 'get'],
      ['logins', 'oauth-refresh'],
      ['logins', 'status'],
      ['logout'],
      ['milestones', 'close', ':version'],
      ['milestones', 'create'], ['ms', 'c'],
      ['milestones', 'delete', ':version'], ['ms', 'rm', ':version'],
      ['milestones', 'reopen', ':version'], ['ms', 'open', ':version'],
      ['notifications', 'list'], ['notifications', 'read'], ['n', 'ls'],
      ['open'], ['o'],
      ['organizations', 'list'],
      ['pulls', 'approve', ':number'], ['pr', 'lgtm', ':number'], ['pr', 'a', ':number'],
      ['pulls', 'checkout', ':number'], ['pr', 'co', ':number'],
      ['pulls', 'clean', ':number'],
      ['pulls', 'close', ':number'],
      ['pulls', 'create'], ['pr', 'c'],
      ['pulls', 'edit', ':number'], ['pr', 'e', ':number'],
      ['pulls', 'merge', ':number'], ['pr', 'm', ':number'],
      ['pulls', 'reject', ':number'],
      ['pulls', 'reopen', ':number'], ['pr', 'open', ':number'],
      ['pulls', 'reply', ':number'],
      ['pulls', 'resolve', ':number'],
      ['pulls', 'review', ':number'],
      ['pulls', 'unresolve', ':number'],
      ['releases', 'assets', 'list'], ['r', 'a', 'list'],
      ['releases', 'create'], ['r', 'c'],
      ['releases', 'delete', ':version'], ['r', 'rm', ':version'],
      ['releases', 'edit', ':version'], ['r', 'e', ':version'],
      ['repos', 'create'], ['repo', 'c'],
      ['repos', 'create-from-template'], ['repo', 'ct'],
      ['repos', 'delete', ':owner/:repo'], ['repo', 'rm', ':owner/:repo'],
      ['repos', 'edit'], ['repo', 'e'],
      ['repos', 'fork', ':owner/:repo'], ['repo', 'f', ':owner/:repo'],
      ['repos', 'migrate'], ['repo', 'm'],
      ['ssh-keys', 'list'],
      ['times', 'list'],
      ['webhooks', 'list'],
      ['wiki', 'list'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })),
  )('blocks $name', async ({ args }, { expect, server }) => {
    assertBlocked(expect, await server.callTool('tea', { args }));
  });

  // --debug may print the Authorization header; blocked until shown not to.
  describe('blocked debug flags', () => {
    integration.for(([
      ['--debug', 'pulls', 'list'],
      ['pulls', 'list', '--debug'],
      ['pulls', 'list', '-debug'],
      ['pulls', 'list', '--vvv'],
      ['pulls', 'list', '-vvv'],
      ['pulls', ':number', '--debug'],
      ['whoami', '--debug'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'blocks $name', async ({ args }, { expect, server }) => {
        assertBlocked(expect, await server.callTool('tea', { args }));
      },
    );
  });

  // --save writes the label set to a file.
  describe('blocked labels --save', () => {
    integration.for(([
      ['labels', 'list', '--save'],
      ['labels', 'list', '--save=true'],
      ['labels', 'list', '-save'],
      ['labels', 'list', '-s'],
      ['label', 'ls', '-s'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'blocks $name', async ({ args }, { expect, server }) => {
        assertBlocked(expect, await server.callTool('tea', { args }));
      },
    );
  });

  integration('blocks bare tea', async ({ expect, server }) => {
    assertBlocked(expect, await server.callTool('tea', { args: [] }));
  });
});
