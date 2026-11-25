// @module-tag integration
import { describe, it } from 'vitest';
import {
  type Server, useServer,
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
      await expect(server.callTool('shell', { command: cmd, args: [] })).resolves.toBeBlocked();
    });
  });

  describe('path traversal in command name', () => {
    integration('blocks /bin/rm', async ({ expect, server }) => {
      await expect(server.callTool('shell', { command: '/bin/rm', args: [] }))
        .resolves.toBeBlocked();
    });

    integration('blocks ../../bin/rm', async ({ expect, server }) => {
      await expect(server.callTool('shell', { command: '../../bin/rm', args: [] }))
        .resolves.toBeBlocked();
    });
  });

  describe('empty command', () => {
    integration('blocks empty command', async ({ expect, server }) => {
      await expect(server.callTool('shell', { command: '', args: [] })).resolves.toBeBlocked();
    });
  });

  describe('allowed commands', () => {
    integration('allows ls', async ({ expect, server }) => {
      await expect(server.callTool('shell', { command: 'ls', args: ['.'] }))
        .resolves.not.toBeBlocked();
    });
  });
});
