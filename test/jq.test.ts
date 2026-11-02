import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import * as build from './builders.ts';
import { type Canary, useCanary } from './canary.ts';
import { type Call, type Server, assertBlocked, assertNotBlocked, useServer } from './helpers.ts';

const integration = it.extend<{ call: Call; canary: Canary; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('shell', { command: 'jq', args })),
  canary: async ({}, use) => useCanary(use),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('jq file argument blocking', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('allowed (no file args)', () => {
    integration('allows -n empty', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['-n', 'empty']));
    });

    integration('allows --arg with filter only', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['--arg', 'k', faker.lorem.word(), '-n', '.foo']));
    });

    integration('allows --argjson with filter only', async ({ call, expect }) => {
      const value = String(faker.number.int());
      assertNotBlocked(expect, await call(['--argjson', 'k', value, '-n', '$k']));
    });

    integration('allows -r -n with filter only', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['-r', '-n', '.foo']));
    });
  });

  describe('--args and --jsonargs handling', () => {
    integration('allows --args flag before filter', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['--args', '-n', '$ARGS.positional']));
    });

    integration('allows --jsonargs flag before filter', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['--jsonargs', '-n', '$ARGS.positional']));
    });

    integration(
      'blocks positional args after filter even with --args (safe false positive)',
      async ({ call, expect }) => {
        assertBlocked(expect, await call(['-n', '$ARGS.positional', '--args', ...build.words(2)]));
      },
    );
  });

  describe('blocked (file args)', () => {
    integration('blocks jq . /etc/passwd', async ({ call, expect }) => {
      assertBlocked(expect, await call(['.', '/etc/passwd']));
    });

    integration('blocks jq . <canary>', async ({ call, canary, expect }) => {
      assertBlocked(expect, await call(['.', canary.file]));
    });

    integration('blocks --arg k v . <file>', async ({ call, canary, expect }) => {
      assertBlocked(expect, await call(['--arg', 'k', faker.lorem.word(), '.', canary.file]));
    });
  });

  describe('blocked file-reading flags', () => {
    integration.for(['--slurpfile', '--rawfile', '--from-file', '-f', '--library-path'])(
      'blocks %s', async (flag, { call, canary, expect }) => {
        assertBlocked(expect, await call([flag, faker.lorem.word(), canary.file]));
      },
    );

    integration('blocks -L (library path)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['-L', build.absolutePath(), '-n', 'empty']));
    });

    integration('blocks --from-file=path (equals form)', async ({ call, expect }) => {
      assertBlocked(expect, await call([`--from-file=${build.fileName('jq')}`]));
    });
  });

  describe('combined short flag bypass', () => {
    integration('blocks -rf (combined -r -f)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['-rf', '/etc/passwd']));
    });

    integration('blocks -nf (combined -n -f)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['-nf', '/etc/passwd']));
    });

    integration('blocks -Sf (combined -S -f)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['-Sf', '/etc/passwd']));
    });

    integration('blocks -L/path (concatenated library path)', async ({ call, expect }) => {
      assertBlocked(expect, await call([`-L${build.absolutePath()}`, '-n', 'empty']));
    });

    integration('allows -rn (no file chars)', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['-rn', 'empty']));
    });
  });
});
