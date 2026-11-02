import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import { type Server, assertBlocked, connectTool, textOf, useServer } from './helpers.ts';

// --- Unit tests (mocked exec) ---
vi.mock(import('../lib/exec.ts'), async (importOriginal) => {
  const { withEchoExec } = await import('./helpers.ts');
  return withEchoExec(importOriginal);
});

const { register } = await import('../tools/gh.ts');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('gh tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for([
      ['attestation', 'verify'],
      ['cache', 'list'],
      ['gist', 'list'],
      ['gist', 'view'],
      ['issue', 'list'],
      ['issue', 'status'],
      ['issue', 'view'],
      ['label', 'list'],
      ['pr', 'checks'],
      ['pr', 'diff'],
      ['pr', 'list'],
      ['pr', 'status'],
      ['pr', 'view'],
      ['project', 'field-list'],
      ['project', 'item-list'],
      ['project', 'list'],
      ['project', 'view'],
      ['release', 'list'],
      ['release', 'view'],
      ['repo', 'list'],
      ['repo', 'view'],
      ['ruleset', 'check'],
      ['ruleset', 'list'],
      ['ruleset', 'view'],
      ['run', 'list'],
      ['run', 'view'],
      ['search', 'code'],
      ['search', 'commits'],
      ['search', 'issues'],
      ['search', 'prs'],
      ['search', 'repos'],
      ['secret', 'list'],
      ['status'],
      ['variable', 'list'],
      ['workflow', 'list'],
      ['workflow', 'view'],
    ].map(args => ({ name: args.join(' '), args })))(
      'allows $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('allows subcommand with flags', async ({ expect }) => {
      const args = ['pr', 'list', '--state', 'open', '--json', 'number'];
      assertAllowed(expect, await callMocked(args));
    });
  });

  describe('global flags', () => {
    it.for([
      ['--version'],
      ['--help'],
      ['-h'],
    ].map(args => ({ name: args[0], args })))(
      'allows standalone $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('blocks --help with extra args', async ({ expect }) => {
      const result = await callMocked(['--help', 'repo', 'delete']);
      assertBlocked(expect, result);
    });

    it('blocks --version with extra args', async ({ expect }) => {
      const result = await callMocked(['--version', 'repo', 'delete']);
      assertBlocked(expect, result);
    });
  });
});

// --- Integration tests (real MCP server) ---
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
