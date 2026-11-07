// @module-tag integration
import { describe, it } from 'vitest';
import {
  type Server, assertBlocked, assertNotBlocked, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('shell tool', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('blocked commands', () => {
    integration.for([
      'rm', 'mv', 'cp', 'chmod', 'chown', 'mkdir', 'rmdir', 'touch', 'dd',
      'tee', 'sed', 'awk', 'bash', 'sh', 'cmd', 'powershell', 'node',
      'python', 'py', 'printenv', 'rg', 'bat', 'cat', 'delta', 'diff',
      'head', 'tail',
    ])('blocks %s', async (cmd, { expect, server }) => {
      assertBlocked(expect, await server.callTool('shell', { command: cmd, args: [] }));
    });
  });

  describe('path traversal in command name', () => {
    integration('blocks /bin/rm', async ({ expect, server }) => {
      assertBlocked(expect, await server.callTool('shell', { command: '/bin/rm', args: [] }));
    });

    integration('blocks ../../bin/rm', async ({ expect, server }) => {
      assertBlocked(expect, await server.callTool('shell', { command: '../../bin/rm', args: [] }));
    });
  });

  describe('empty command', () => {
    integration('blocks empty command', async ({ expect, server }) => {
      assertBlocked(expect, await server.callTool('shell', { command: '', args: [] }));
    });
  });

  describe('allowed commands', () => {
    integration('allows ls', async ({ expect, server }) => {
      assertNotBlocked(expect, await server.callTool('shell', { command: 'ls', args: ['.'] }));
    });
  });
});
