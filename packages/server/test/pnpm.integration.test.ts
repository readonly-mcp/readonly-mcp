// @module-tag integration
// @module-tag slow
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import { type Call, type Server, assertBlocked, assertNotBlocked } from '#test/helpers.js';
import { usePackageServer } from '#test/package-fixture.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('pnpm', { args })),
  server: [async ({}, use) => usePackageServer('pnpm', use), { scope: 'file' }],
});

describe.concurrent('pnpm tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

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
