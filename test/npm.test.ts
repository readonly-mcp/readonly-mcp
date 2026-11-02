import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from './builders.ts';
import { type Call, type Server, assertBlocked, assertNotBlocked, connectTool, echoed, textOf } from './helpers.ts';
import { packageCommandTimeout, packageServerTimeout, usePackageServer } from './package-fixture.ts';

// --- Unit tests (mocked execShell) ---
vi.mock(import('../lib/exec.ts'), async (importOriginal) => {
  const { withEchoExec } = await import('./helpers.ts');
  return withEchoExec(importOriginal);
});

const { register } = await import('../tools/npm.ts');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('npm tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for(['audit', 'bin', 'explain', 'fund', 'ls', 'outdated', 'root', 'search', 'view'])(
      'allows %s', async (sub, { expect }) => {
        assertAllowed(expect, await callMocked([sub]));
      },
    );
  });

  describe('--ignore-scripts injection', () => {
    it('injects --ignore-scripts as first arg', async ({ expect }) => {
      const result = await callMocked(['ls']);
      const { args } = echoed(result);

      expect(args[0]).toBe('--ignore-scripts');
    });

    it('prepends --ignore-scripts before subcommand', async ({ expect }) => {
      const result = await callMocked(['view', 'zod']);
      const { args } = echoed(result);

      expect(args).toEqual(['--ignore-scripts', 'view', 'zod']);
    });
  });
});

// --- Integration tests (real MCP server) ---
const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('npm', { args })),
  server: [async ({}, use) => usePackageServer('npm', use), { scope: 'file' }],
});

describe.concurrent('npm tool (integration)', { timeout: packageCommandTimeout }, () => {
  integration.beforeAll(({ server }) => server.initialize(), packageServerTimeout);

  describe('blocked subcommands', () => {
    integration.for(
      [
        ['install'], ['ci'], ['update'], ['uninstall', 'lodash'],
        ['run', 'build'], ['exec', 'tsc'], ['publish'], ['init'],
        ['link'], ['pack'], ['prune'], ['rebuild'], ['dedupe'],
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
      assertBlocked(expect, await call(['view', faker.internet.domainWord(), '--registry', build.httpsUrl()]));
    });

    integration('blocks --registry=<url>', async ({ call, expect }) => {
      assertBlocked(expect, await call(['view', faker.internet.domainWord(), `--registry=${build.httpsUrl()}`]));
    });

    integration('blocks --no-ignore-scripts (overrides injected --ignore-scripts)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['audit', '--no-ignore-scripts']));
    });

    integration('blocks abbreviated --reg (npm expands to --registry)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['view', faker.internet.domainWord(), '--reg', build.httpsUrl()]));
    });

    integration('blocks abbreviated --reg=<url>', async ({ call, expect }) => {
      assertBlocked(expect, await call(['view', faker.internet.domainWord(), `--reg=${build.httpsUrl()}`]));
    });

    integration('blocks abbreviated --fi (matches --fix)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['audit', '--fi']));
    });

    integration('blocks --ignore-scripts=false (overrides injected --ignore-scripts)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['audit', '--ignore-scripts=false']));
    });
  });

  describe('allowed subcommands', () => {
    integration('allows ls', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['ls']));
    });

    integration('allows explain', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['explain', 'zod']));
    });

    integration('allows view', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['view', 'zod']));
    });
  });
});
