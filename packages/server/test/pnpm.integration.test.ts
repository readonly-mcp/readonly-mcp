// @module-tag integration
// @module-tag slow
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import type { Call, Server } from '#test/helpers.js';
import { usePackageServer } from '#test/package-fixture.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('pnpm', { args })),
  server: [async ({}, use) => usePackageServer('pnpm', use), { scope: 'file' }],
});

describe.concurrent('pnpm tool', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('allowed global flags', () => {
    integration.for([
      { name: '--version', args: ['--version'] },
      { name: '--help', args: ['--help'] },
      { name: '-h', args: ['-h'] },
    ])('allows $name', async ({ args }, { call, expect }) => {
      expect(await call(args)).toSucceed();
    });

    integration('blocks --help with trailing args', async ({ call, expect }) => {
      expect(await call(['--help', 'install'])).toBeBlocked();
    });

    integration('blocks -v (not in global flags)', async ({ call, expect }) => {
      expect(await call(['-v'])).toBeBlocked();
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
      expect(await call(args)).toBeBlocked();
    });
  });

  describe('blocked flags', () => {
    integration('blocks audit --fix', async ({ call, expect }) => {
      expect(await call(['audit', '--fix'])).toBeBlocked();
    });

    integration('blocks --registry', async ({ call, expect }) => {
      expect(await call(['list', '--registry', build.httpsUrl()])).toBeBlocked();
    });

    integration('blocks --registry=<url>', async ({ call, expect }) => {
      expect(await call(['list', `--registry=${build.httpsUrl()}`])).toBeBlocked();
    });

    integration('blocks abbreviated --reg (expands to --registry)', async ({ call, expect }) => {
      expect(await call(['list', '--reg', build.httpsUrl()])).toBeBlocked();
    });

    integration('blocks abbreviated --reg=<url>', async ({ call, expect }) => {
      expect(await call(['list', `--reg=${build.httpsUrl()}`])).toBeBlocked();
    });
  });

  describe('allowed subcommands', () => {
    integration('allows list', async ({ call, expect }) => {
      expect(await call(['list'])).toSucceed();
    });

    integration('allows why', async ({ call, expect }) => {
      expect(await call(['why', 'zod'])).toSucceed();
    });

    integration('allows licenses list', async ({ call, expect }) => {
      expect(await call(['licenses', 'list'])).toSucceed();
    });

    integration('allows store status', async ({ call, expect }) => {
      expect(await call(['store', 'status'])).toSucceed();
    });
  });
});
