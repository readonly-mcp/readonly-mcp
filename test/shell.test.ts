import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import {
  type Server, assertBlocked, assertNotBlocked, connectTool, textOf, useServer,
} from './helpers.ts';

// --- Unit tests (mocked execShell) ---
vi.mock(import('../lib/exec.ts'), async (importOriginal) => {
  const { withEchoExec } = await import('./helpers.ts');
  return withEchoExec(importOriginal);
});

const { register } = await import('../tools/shell.ts');

const callTool = await connectTool(register);

const callMocked = (command: string, args: readonly string[] = []) => callTool({ command, args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('shell tool (unit)', () => {
  describe('allowed commands', () => {
    it.for([
      'basename', 'date', 'dirname', 'eza', 'file', 'jq', 'ls', 'pwd',
      'readlink', 'realpath', 'stat', 'wc', 'which', 'whoami',
    ])('allows %s', async (cmd, { expect }) => {
      assertAllowed(expect, await callMocked(cmd));
    });
  });
});

// --- Integration tests (real MCP server) ---
const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('shell tool (integration)', () => {
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
