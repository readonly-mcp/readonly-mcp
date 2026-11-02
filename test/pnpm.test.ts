import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from './builders.ts';
import {
  type Call, type Server, assertBlocked, assertNotBlocked, connectTool, textOf,
} from './helpers.ts';
import {
  packageCommandTimeout, packageServerTimeout, usePackageServer,
} from './package-fixture.ts';

// --- Unit tests (mocked execShell) ---
vi.mock(import('../lib/exec.ts'), async (importOriginal) => {
  const { withEchoExec } = await import('./helpers.ts');
  return withEchoExec(importOriginal);
});

const { register } = await import('../tools/pnpm.ts');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('pnpm tool (unit)', () => {
  describe('allowed global flags', () => {
    it.for([
      { name: '--version', args: ['--version'] },
      { name: '--help', args: ['--help'] },
      { name: '-h', args: ['-h'] },
    ])('allows $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    });
  });

  describe('allowed subcommands', () => {
    it.for([
      { name: 'audit', args: ['audit'] },
      { name: 'bin', args: ['bin'] },
      { name: 'licenses list', args: ['licenses', 'list'] },
      { name: 'list', args: ['list'] },
      { name: 'outdated', args: ['outdated'] },
      { name: 'root', args: ['root'] },
      { name: 'search', args: ['search', 'zod'] },
      { name: 'store status', args: ['store', 'status'] },
      { name: 'why', args: ['why', 'zod'] },
    ])('allows $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    });
  });
});

// --- Integration tests (real MCP server) ---
const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('pnpm', { args })),
  server: [async ({}, use) => usePackageServer('pnpm', use), { scope: 'file' }],
});

describe.concurrent('pnpm tool (integration)', { timeout: packageCommandTimeout }, () => {
  integration.beforeAll(({ server }) => server.initialize(), packageServerTimeout);

  describe('allowed global flags', () => {
    integration.for([
      { name: '--version', args: ['--version'] },
      { name: '--help', args: ['--help'] },
      { name: '-h', args: ['-h'] },
    ])('allows $name', async ({ args }, { call, expect }) => {
      assertNotBlocked(expect, await call(args));
    });

    integration('blocks --help with trailing args', async ({ call, expect }) => {
      assertBlocked(expect, await call(['--help', 'install']));
    });

    integration('blocks -v (not in global flags)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['-v']));
    });
  });

  describe('blocked subcommands', () => {
    integration.for(
      [
        ['add', 'lodash'], ['remove', 'lodash'], ['install'],
        ['update'], ['run', 'build'], ['exec', 'tsc'],
        ['publish'], ['init'], ['link'], ['unlink'],
        ['store', 'prune'], ['patch', 'lodash'],
      ].map(args => ({ name: args.join(' '), args })),
    )('blocks $name', async ({ args }, { call, expect }) => {
      assertBlocked(expect, await call(args));
    });
  });

  describe('blocked flags', () => {
    integration('blocks audit --fix', async ({ call, expect }) => {
      assertBlocked(expect, await call(['audit', '--fix']));
    });

    integration('blocks --registry', async ({ call, expect }) => {
      assertBlocked(expect, await call(['list', '--registry', build.httpsUrl()]));
    });

    integration('blocks --registry=<url>', async ({ call, expect }) => {
      assertBlocked(expect, await call(['list', `--registry=${build.httpsUrl()}`]));
    });

    integration('blocks abbreviated --reg (expands to --registry)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['list', '--reg', build.httpsUrl()]));
    });

    integration('blocks abbreviated --reg=<url>', async ({ call, expect }) => {
      assertBlocked(expect, await call(['list', `--reg=${build.httpsUrl()}`]));
    });
  });

  describe('allowed subcommands', () => {
    integration('allows list', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['list']));
    });

    integration('allows why', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['why', 'zod']));
    });

    integration('allows licenses list', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['licenses', 'list']));
    });

    integration('allows store status', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['store', 'status']));
    });
  });
});
