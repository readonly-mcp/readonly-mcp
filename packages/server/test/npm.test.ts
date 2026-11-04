import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Call, type Server, assertBlocked, assertNotBlocked, connectTool, echoed, textOf,
} from '#test/helpers.js';
import { usePackageServer } from '#test/package-fixture.js';

// --- Unit tests (mocked execShell) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/npm.js');

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

      expect(args).toStrictEqual(['--ignore-scripts', 'view', 'zod']);
    });
  });

  // Each redirects registry requests by a name --registry does not prefix.
  describe('blocked registry overrides', () => {
    const scopedRegistry = `--@${faker.internet.domainWord()}:registry`;
    const configFile = build.relativeFilePath();
    const directory = build.absolutePath();
    const name = faker.internet.domainWord();
    const url = build.httpsUrl();

    it.for([
      { name: '--@scope:registry <url>', args: ['view', name, scopedRegistry, url] },
      { name: '--@scope:registry=<url>', args: ['view', name, `${scopedRegistry}=${url}`] },
      { name: '--userconfig <file>', args: ['view', name, '--userconfig', configFile] },
      { name: '--userconfig=<file>', args: ['view', name, `--userconfig=${configFile}`] },
      { name: '--globalconfig <file>', args: ['view', name, '--globalconfig', configFile] },
      // The prefix is where npm reads the project .npmrc from.
      { name: '--prefix <dir>', args: ['ls', '--prefix', directory] },
      { name: '-C <dir>', args: ['ls', '-C', directory] },
      // npm expands a group of short flags into each of them.
      { name: '-lC <dir>', args: ['ls', '-lC', directory] },
      { name: '--proxy <url>', args: ['view', name, '--proxy', url] },
      { name: '--https-proxy <url>', args: ['view', name, '--https-proxy', url] },
      // npm reads a single-dash arg as a long name unless it spells out shorthands.
      { name: '-registry=<url>', args: ['view', name, `-registry=${url}`] },
      { name: '-reg=<url>', args: ['view', name, `-reg=${url}`] },
      { name: '-userconfig <file>', args: ['view', name, '-userconfig', configFile] },
      { name: '-prefix <dir>', args: ['ls', '-prefix', directory] },
      { name: '-proxy <url>', args: ['view', name, '-proxy', url] },
    ])('blocks $name', async ({ args }, { expect }) => {
      assertBlocked(expect, await callMocked(args));
    });

    // A whole flag name is not an abbreviation of the blocked flag it prefixes.
    it.for([
      { name: 'ls --global (prefixes --globalconfig)', args: ['ls', '--global'] },
      { name: 'root --global (prefixes --globalconfig)', args: ['root', '--global'] },
      { name: 'ls -global (prefixes --globalconfig)', args: ['ls', '-global'] },
      { name: 'ls -g (a shorthand, not a long name)', args: ['ls', '-g'] },
    ])('allows $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    });
  });
});

// --- Integration tests (real MCP server) ---
const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('npm', { args })),
  server: [async ({}, use) => usePackageServer('npm', use), { scope: 'file' }],
});

describe.concurrent('npm tool (integration)', { tags: ['slow'] }, () => {
  integration.beforeAll(({ server }) => server.initialize());

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
      const name = faker.internet.domainWord();
      assertBlocked(expect, await call(['view', name, '--registry', build.httpsUrl()]));
    });

    integration('blocks --registry=<url>', async ({ call, expect }) => {
      const name = faker.internet.domainWord();
      assertBlocked(expect, await call(['view', name, `--registry=${build.httpsUrl()}`]));
    });

    integration(
      'blocks --no-ignore-scripts (overrides injected --ignore-scripts)',
      async ({ call, expect }) => {
        assertBlocked(expect, await call(['audit', '--no-ignore-scripts']));
      },
    );

    integration(
      'blocks abbreviated --reg (npm expands to --registry)',
      async ({ call, expect }) => {
        const name = faker.internet.domainWord();
        assertBlocked(expect, await call(['view', name, '--reg', build.httpsUrl()]));
      },
    );

    integration('blocks abbreviated --reg=<url>', async ({ call, expect }) => {
      const name = faker.internet.domainWord();
      assertBlocked(expect, await call(['view', name, `--reg=${build.httpsUrl()}`]));
    });

    integration('blocks abbreviated --fi (matches --fix)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['audit', '--fi']));
    });

    integration(
      'blocks --ignore-scripts=false (overrides injected --ignore-scripts)',
      async ({ call, expect }) => {
        assertBlocked(expect, await call(['audit', '--ignore-scripts=false']));
      },
    );
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
