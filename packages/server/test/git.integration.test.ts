// @module-tag integration
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Call, type Server, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('git', { args })),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('git tool', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('blocked subcommands', () => {
    integration.for([
      'push', 'pull', 'fetch', 'checkout', 'reset', 'rebase',
      'merge', 'commit', 'add', 'rm', 'clean',
    ])(
      'blocks %s', async (sub, { call, expect }) => {
        expect(await call([sub])).toBeBlocked();
      },
    );
  });

  describe('allowed subcommands', () => {
    integration('allows status', async ({ call, expect }) => {
      expect(await call(['status'])).not.toBeBlocked();
    });

    integration('allows log', async ({ call, expect }) => {
      expect(await call(['log', '--oneline', '-5'])).not.toBeBlocked();
    });

    integration('allows log with flags', async ({ call, expect }) => {
      expect(await call(['log', '--all', '--oneline', '-1'])).not.toBeBlocked();
    });

    integration('allows branch -a', async ({ call, expect }) => {
      expect(await call(['branch', '-a'])).not.toBeBlocked();
    });

    integration('allows diff', async ({ call, expect }) => {
      expect(await call(['diff'])).not.toBeBlocked();
    });

    integration('allows diff with flags', async ({ call, expect }) => {
      expect(await call(['diff', '--stat'])).not.toBeBlocked();
    });

    integration('allows show HEAD', async ({ call, expect }) => {
      expect(await call(['show', 'HEAD', '--stat'])).not.toBeBlocked();
    });

    integration('allows rev-parse HEAD', async ({ call, expect }) => {
      expect(await call(['rev-parse', 'HEAD'])).not.toBeBlocked();
    });

    integration('allows rev-parse --git-dir', async ({ call, expect }) => {
      expect(await call(['rev-parse', '--git-dir'])).not.toBeBlocked();
    });

    integration('allows blame HEAD -- README.md', async ({ call, expect }) => {
      expect(await call(['blame', 'HEAD', '--', 'README.md'])).not.toBeBlocked();
    });

    integration('allows describe', async ({ call, expect }) => {
      // May fail if no tags exist, but should not be blocked
      const result = await call(['describe', '--tags']);

      expect(result.isError).not.toBe(true);
    });

    integration('allows merge-base HEAD HEAD', async ({ call, expect }) => {
      expect(await call(['merge-base', 'HEAD', 'HEAD'])).not.toBeBlocked();
    });

    integration('allows shortlog -1 HEAD', async ({ call, expect }) => {
      expect(await call(['shortlog', '-1', 'HEAD'])).not.toBeBlocked();
    });

    integration('allows ls-files', async ({ call, expect }) => {
      expect(await call(['ls-files'])).not.toBeBlocked();
    });

    integration('allows ls-files -o (--others)', async ({ call, expect }) => {
      expect(await call(['ls-files', '-o'])).not.toBeBlocked();
    });

    integration('allows ls-tree HEAD', async ({ call, expect }) => {
      expect(await call(['ls-tree', 'HEAD'])).not.toBeBlocked();
    });

    integration('allows worktree list', async ({ call, expect }) => {
      expect(await call(['worktree', 'list'])).not.toBeBlocked();
    });

    integration('allows reflog show', async ({ call, expect }) => {
      expect(await call(['reflog', 'show'])).not.toBeBlocked();
    });

    integration('allows bare reflog', async ({ call, expect }) => {
      expect(await call(['reflog'])).not.toBeBlocked();
    });

    integration('allows reflog exists HEAD', async ({ call, expect }) => {
      expect(await call(['reflog', 'exists', 'HEAD'])).not.toBeBlocked();
    });
  });

  describe('blocked branch mutation flags', () => {
    integration.for([
      '-D', '-d', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '--force',
      '--set-upstream-to', '--unset-upstream', '--edit-description',
    ])(
      'blocks branch %s', async (flag, { call, expect }) => {
        expect(await call(['branch', flag, 'test'])).toBeBlocked();
      },
    );

    integration('blocks --set-upstream-to=value (equals form)', async ({ call, expect }) => {
      expect(await call(['branch', '--set-upstream-to=origin/main', 'test'])).toBeBlocked();
    });
  });

  describe('blocked flag abbreviations', () => {
    integration.for([
      { flag: '--outp', sub: 'show', desc: '--output abbreviation' },
      { flag: '--del', sub: 'branch', desc: '--delete abbreviation' },
      { flag: '--mov', sub: 'branch', desc: '--move abbreviation' },
      { flag: '--cop', sub: 'branch', desc: '--copy abbreviation' },
      { flag: '--forc', sub: 'branch', desc: '--force abbreviation' },
      { flag: '--edit', sub: 'branch', desc: '--edit-description abbreviation' },
    ])('blocks $desc ($flag) on $sub', async ({ flag, sub }, { call, expect }) => {
      expect(await call([sub, flag, 'test'])).toBeBlocked();
    });
  });

  describe('remote subcommand filtering', () => {
    integration('allows bare remote (list)', async ({ call, expect }) => {
      expect(await call(['remote'])).not.toBeBlocked();
    });

    integration('allows remote -v', async ({ call, expect }) => {
      expect(await call(['remote', '-v'])).not.toBeBlocked();
    });

    integration('allows remote --verbose', async ({ call, expect }) => {
      expect(await call(['remote', '--verbose'])).not.toBeBlocked();
    });

    integration('allows remote get-url origin', async ({ call, expect }) => {
      expect(await call(['remote', 'get-url', 'origin'])).not.toBeBlocked();
    });

    integration('allows remote get-url --push origin', async ({ call, expect }) => {
      expect(await call(['remote', 'get-url', '--push', 'origin'])).not.toBeBlocked();
    });

    integration('allows remote get-url --all origin', async ({ call, expect }) => {
      expect(await call(['remote', 'get-url', '--all', 'origin'])).not.toBeBlocked();
    });

    integration('allows remote show -n origin', async ({ call, expect }) => {
      expect(await call(['remote', 'show', '-n', 'origin'])).not.toBeBlocked();
    });

    integration('blocks remote show without -n (SSRF risk)', async ({ call, expect }) => {
      expect(await call(['remote', 'show', 'origin'])).toBeBlocked();
    });

    integration.for(['add', 'remove', 'rename', 'set-url', 'set-head', 'prune', 'update'])(
      'blocks remote %s', async (sub, { call, expect }) => {
        expect(await call(['remote', sub, 'origin'])).toBeBlocked();
      },
    );

    integration('blocks unknown flags on remote', async ({ call, expect }) => {
      expect(await call(['remote', '--unknown-flag'])).toBeBlocked();
    });
  });

  describe('stash subcommand filtering', () => {
    integration('allows stash list', async ({ call, expect }) => {
      expect(await call(['stash', 'list'])).not.toBeBlocked();
    });

    integration('allows stash show', async ({ call, expect }) => {
      expect(await call(['stash', 'show'])).not.toBeBlocked();
    });

    integration('blocks bare stash (implicit push)', async ({ call, expect }) => {
      expect(await call(['stash'])).toBeBlocked();
    });

    integration('blocks stash -- list (implicit push with pathspec)', async ({ call, expect }) => {
      expect(await call(['stash', '--', 'list'])).toBeBlocked();
    });

    integration.for(['push', 'pop', 'apply', 'drop', 'clear', 'save', 'create', 'store'])(
      'blocks stash %s', async (sub, { call, expect }) => {
        expect(await call(['stash', sub])).toBeBlocked();
      },
    );
  });

  describe('worktree subcommand filtering', () => {
    integration('allows worktree list', async ({ call, expect }) => {
      expect(await call(['worktree', 'list'])).not.toBeBlocked();
    });

    integration('blocks bare worktree', async ({ call, expect }) => {
      expect(await call(['worktree'])).toBeBlocked();
    });

    integration.for(['add', 'remove', 'move', 'prune', 'lock', 'unlock', 'repair'])(
      'blocks worktree %s', async (sub, { call, expect }) => {
        expect(await call(['worktree', sub])).toBeBlocked();
      },
    );
  });

  describe('reflog subcommand filtering', () => {
    integration('allows bare reflog (= reflog show)', async ({ call, expect }) => {
      expect(await call(['reflog'])).not.toBeBlocked();
    });

    integration('allows reflog show', async ({ call, expect }) => {
      expect(await call(['reflog', 'show'])).not.toBeBlocked();
    });

    integration('allows reflog exists HEAD', async ({ call, expect }) => {
      expect(await call(['reflog', 'exists', 'HEAD'])).not.toBeBlocked();
    });

    integration.for(['delete', 'expire'])(
      'blocks reflog %s', async (sub, { call, expect }) => {
        expect(await call(['reflog', sub])).toBeBlocked();
      },
    );
  });

  describe('write-flag blocking', () => {
    integration.for(['log', 'diff', 'show'])(
      'blocks %s --output=<path>', async (sub, { call, expect }) => {
        expect(await call([sub, `--output=${build.absolutePath()}`])).toBeBlocked();
      },
    );

    integration('blocks log --output <path>', async ({ call, expect }) => {
      expect(await call(['log', '--output', build.absolutePath()])).toBeBlocked();
    });

    integration('blocks diff -o', async ({ call, expect }) => {
      expect(await call(['diff', '-o', build.absolutePath()])).toBeBlocked();
    });

    integration('blocks diff -ofile.txt (no space)', async ({ call, expect }) => {
      expect(await call(['diff', `-o${build.fileName('txt')}`])).toBeBlocked();
    });

    integration('blocks diff -ao (combined short flags with -o)', async ({ call, expect }) => {
      expect(await call(['diff', '-ao', build.absolutePath()])).toBeBlocked();
    });

    integration(
      'blocks diff -abo (combined short flags with -o at end)',
      async ({ call, expect }) => {
        expect(await call(['diff', '-abo', build.absolutePath()])).toBeBlocked();
      },
    );

    integration('blocks diff --no-index', async ({ call, expect }) => {
      expect(await call(['diff', '--no-index', '/etc/passwd', '/dev/null'])).toBeBlocked();
    });
  });

  describe('--no-pager injection', () => {
    integration('does not hang on pager', async ({ call, expect }) => {
      expect(await call(['log', '--oneline', '-1'])).not.toBeBlocked();
    });
  });

  describe('edge cases', () => {
    integration('blocks empty args', async ({ call, expect }) => {
      expect(await call([])).toBeBlocked();
    });
  });
});
