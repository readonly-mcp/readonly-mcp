// @module-tag integration
// @module-tag slow
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import { type Call, type Server, assertBlocked, assertNotBlocked } from '#test/helpers.js';
import { usePackageServer } from '#test/package-fixture.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('npm', { args })),
  server: [async ({}, use) => usePackageServer('npm', use), { scope: 'file' }],
});

describe.concurrent('npm tool (integration)', () => {
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
