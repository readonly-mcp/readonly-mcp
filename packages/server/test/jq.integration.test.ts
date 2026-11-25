// @module-tag integration
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import { type Canary, useCanary } from '#test/canary.js';
import {
  type Call, type Server, textOf, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ call: Call; canary: Canary; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('shell', { command: 'jq', args })),
  canary: async ({}, use) => useCanary(use),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('jq file argument blocking', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('allowed (no file args)', () => {
    integration('allows -n empty', async ({ call, expect }) => {
      expect(await call(['-n', 'empty'])).not.toBeBlocked();
    });

    integration('allows --arg with filter only', async ({ call, expect }) => {
      expect(await call(['--arg', 'k', faker.lorem.word(), '-n', '.foo'])).not.toBeBlocked();
    });

    integration('allows --argjson with filter only', async ({ call, expect }) => {
      const value = String(faker.number.int());

      expect(await call(['--argjson', 'k', value, '-n', '$k'])).not.toBeBlocked();
    });

    integration('allows -r -n with filter only', async ({ call, expect }) => {
      expect(await call(['-r', '-n', '.foo'])).not.toBeBlocked();
    });
  });

  describe('--args and --jsonargs handling', () => {
    integration('allows --args flag before filter', async ({ call, expect }) => {
      expect(await call(['--args', '-n', '$ARGS.positional'])).not.toBeBlocked();
    });

    integration('allows --jsonargs flag before filter', async ({ call, expect }) => {
      expect(await call(['--jsonargs', '-n', '$ARGS.positional'])).not.toBeBlocked();
    });

    integration(
      'blocks positional args after filter even with --args (safe false positive)',
      async ({ call, expect }) => {
        expect(await call(['-n', '$ARGS.positional', '--args', ...build.words(2)])).toBeBlocked();
      },
    );
  });

  describe('blocked (file args)', () => {
    integration('blocks jq . /etc/passwd', async ({ call, expect }) => {
      expect(await call(['.', '/etc/passwd'])).toBeBlocked();
    });

    integration('blocks jq . <canary>', async ({ call, canary, expect }) => {
      expect(await call(['.', canary.file])).toBeBlocked();
    });

    integration('blocks --arg k v . <file>', async ({ call, canary, expect }) => {
      expect(await call(['--arg', 'k', faker.lorem.word(), '.', canary.file])).toBeBlocked();
    });

    /*
     * After --, jq reads a dash-led arg as a positional, not a flag. These
     * names are literal: one holding f or L would trip the file-flag check
     * instead.
     */
    integration('blocks a dash-led file after --', async ({ call, expect }) => {
      expect(await call(['.', '--', '-data.json'])).toBeBlocked();
    });

    integration('blocks a dash-led file after -- and a filter', async ({ call, expect }) => {
      expect(await call(['--', '.', '-data.json'])).toBeBlocked();
    });

    // jq reads a dash-led arg as an option only when a letter or dash follows.
    integration('blocks a file arg whose dash precedes a digit', async ({ call, expect }) => {
      expect(await call(['.', '-1.json'])).toBeBlocked();
    });

    integration('blocks a filter whose dash precedes a digit', async ({ call, expect }) => {
      expect(await call(['-n', '-1 as $x | $ENV'])).toBeBlocked();
    });

    integration('blocks a filter whose dash precedes a paren', async ({ call, expect }) => {
      expect(await call(['-n', '-(1) as $x | env'])).toBeBlocked();
    });

    // Without --, jq would reject -length as an unknown option.
    integration('allows a dash-led filter after --', async ({ call, expect }) => {
      expect(await call(['-n', '--', '-length'])).not.toBeBlocked();
    });
  });

  describe('blocked file-reading flags', () => {
    integration.for(['--slurpfile', '--rawfile', '--from-file', '-f', '--library-path'])(
      'blocks %s', async (flag, { call, canary, expect }) => {
        expect(await call([flag, faker.lorem.word(), canary.file])).toBeBlocked();
      },
    );

    integration('blocks -L (library path)', async ({ call, expect }) => {
      expect(await call(['-L', build.absolutePath(), '-n', 'empty'])).toBeBlocked();
    });

    integration('blocks --from-file=path (equals form)', async ({ call, expect }) => {
      expect(await call([`--from-file=${build.fileName('jq')}`])).toBeBlocked();
    });

    // Hidden options: --run-tests prints a file's lines as failing tests.
    integration.for(['--run-tests', '--debug-trace', '--debug-dump-disasm'])(
      'blocks %s, which jq --help does not list', async (flag, { call, canary, expect }) => {
        expect(await call([flag, canary.file])).toBeBlocked();
      },
    );
  });

  describe('allowed options', () => {
    integration.for([
      ['-nrc', 'empty'], ['--tab', '-n', '.'], ['--indent', '2', '-n', '.'],
      ['--seq', '-n', '.'], ['--null-input', '--compact-output', '.'],
    ])('allows %s', async (args, { call, expect }) => {
      expect(await call(args)).not.toBeBlocked();
    });
  });

  describe('blocked filters', () => {
    integration.for([
      'env', '.a | env', '$ENV', '$ENV.PATH', '{$ENV}', String.raw`"\(env)"`,
      'import "a" as a; .', 'include "a"; .', '"a" | modulemeta',
    ])('blocks %s', async (filter, { call, expect }) => {
      expect(await call(['-n', filter])).toBeBlocked();
    });

    // A deliberate false positive: the check cannot tell a string or key from a call.
    integration.for(['select(.type == "env")', '{env: .a}'])(
      'blocks %s, which only names env', async (filter, { call, expect }) => {
        expect(await call(['-n', filter])).toBeBlocked();
      },
    );

    // The check skips a name right after a dot, so jq must never read one as a call.
    integration.for(['..env', '1.env', '1 .env'])(
      'leaves %s to jq, which errors rather than calling env', async (filter, { call, expect }) => {
        const result = await call(['-n', filter]);

        expect(textOf(result)).toMatch(/^jq: error/v);
      },
    );

    integration.for(['.env', '.a.env', '.ENV', '.environment'])(
      'allows the field access %s', async (filter, { call, expect }) => {
        expect(await call(['-n', filter])).not.toBeBlocked();
      },
    );
  });

  describe('combined short flag bypass', () => {
    integration('blocks -rf (combined -r -f)', async ({ call, expect }) => {
      expect(await call(['-rf', '/etc/passwd'])).toBeBlocked();
    });

    integration('blocks -nf (combined -n -f)', async ({ call, expect }) => {
      expect(await call(['-nf', '/etc/passwd'])).toBeBlocked();
    });

    integration('blocks -Sf (combined -S -f)', async ({ call, expect }) => {
      expect(await call(['-Sf', '/etc/passwd'])).toBeBlocked();
    });

    integration('blocks -L/path (concatenated library path)', async ({ call, expect }) => {
      expect(await call([`-L${build.absolutePath()}`, '-n', 'empty'])).toBeBlocked();
    });

    integration('allows -rn (no file chars)', async ({ call, expect }) => {
      expect(await call(['-rn', 'empty'])).not.toBeBlocked();
    });
  });
});
