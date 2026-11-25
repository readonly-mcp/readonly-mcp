// @module-tag integration
// @module-tag slow
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import type { Call, Server } from '#test/helpers.js';
import { usePackageServer } from '#test/package-fixture.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('npm', { args })),
  server: [async ({}, use) => usePackageServer('npm', use), { scope: 'file' }],
});

describe.concurrent('npm tool', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('blocked subcommands', () => {
    integration.for(
      [
        ['install'], ['ci'], ['update'], ['uninstall', 'lodash'],
        ['run', 'build'], ['exec', 'tsc'], ['publish'], ['init'],
        ['link'], ['pack'], ['prune'], ['rebuild'], ['dedupe'],
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
      const name = faker.internet.domainWord();

      expect(await call(['view', name, '--registry', build.httpsUrl()])).toBeBlocked();
    });

    integration('blocks --registry=<url>', async ({ call, expect }) => {
      const name = faker.internet.domainWord();

      expect(await call(['view', name, `--registry=${build.httpsUrl()}`])).toBeBlocked();
    });

    integration(
      'blocks --no-ignore-scripts (overrides injected --ignore-scripts)',
      async ({ call, expect }) => {
        expect(await call(['audit', '--no-ignore-scripts'])).toBeBlocked();
      },
    );

    integration(
      'blocks abbreviated --reg (npm expands to --registry)',
      async ({ call, expect }) => {
        const name = faker.internet.domainWord();

        expect(await call(['view', name, '--reg', build.httpsUrl()])).toBeBlocked();
      },
    );

    integration('blocks abbreviated --reg=<url>', async ({ call, expect }) => {
      const name = faker.internet.domainWord();

      expect(await call(['view', name, `--reg=${build.httpsUrl()}`])).toBeBlocked();
    });

    integration('blocks abbreviated --fi (matches --fix)', async ({ call, expect }) => {
      expect(await call(['audit', '--fi'])).toBeBlocked();
    });

    integration(
      'blocks --ignore-scripts=false (overrides injected --ignore-scripts)',
      async ({ call, expect }) => {
        expect(await call(['audit', '--ignore-scripts=false'])).toBeBlocked();
      },
    );
  });

  describe('allowed subcommands', () => {
    integration('allows ls', async ({ call, expect }) => {
      expect(await call(['ls'])).not.toBeBlocked();
    });

    integration('allows explain', async ({ call, expect }) => {
      expect(await call(['explain', 'zod'])).not.toBeBlocked();
    });

    integration('allows view', async ({ call, expect }) => {
      expect(await call(['view', 'zod'])).not.toBeBlocked();
    });
  });
});
