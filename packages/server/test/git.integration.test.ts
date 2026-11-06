import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Call, type Server, assertBlocked, assertNotBlocked, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('git', { args })),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('git tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('blocked subcommands', () => {
    integration.for([
      'push', 'pull', 'fetch', 'checkout', 'reset', 'rebase',
      'merge', 'commit', 'add', 'rm', 'clean',
    ])(
      'blocks %s', async (sub, { call, expect }) => {
        assertBlocked(expect, await call([sub]));
      },
    );
  });

  describe('allowed subcommands', () => {
    integration('allows status', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['status']));
    });

    integration('allows log', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['log', '--oneline', '-5']));
    });

    integration('allows log with flags', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['log', '--all', '--oneline', '-1']));
    });

    integration('allows branch -a', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['branch', '-a']));
    });

    integration('allows diff', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['diff']));
    });

    integration('allows diff with flags', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['diff', '--stat']));
    });

    integration('allows show HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['show', 'HEAD', '--stat']));
    });

    integration('allows rev-parse HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['rev-parse', 'HEAD']));
    });

    integration('allows rev-parse --git-dir', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['rev-parse', '--git-dir']));
    });

    integration('allows blame HEAD -- README.md', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['blame', 'HEAD', '--', 'README.md']));
    });

    integration('allows describe', async ({ call, expect }) => {
      // May fail if no tags exist, but should not be blocked
      const result = await call(['describe', '--tags']);

      expect(result.isError).not.toBe(true);
    });

    integration('allows merge-base HEAD HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['merge-base', 'HEAD', 'HEAD']));
    });

    integration('allows shortlog -1 HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['shortlog', '-1', 'HEAD']));
    });

    integration('allows ls-files', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['ls-files']));
    });

    integration('allows ls-files -o (--others)', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['ls-files', '-o']));
    });

    integration('allows ls-tree HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['ls-tree', 'HEAD']));
    });

    integration('allows worktree list', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['worktree', 'list']));
    });

    integration('allows reflog show', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['reflog', 'show']));
    });

    integration('allows bare reflog', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['reflog']));
    });

    integration('allows reflog exists HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['reflog', 'exists', 'HEAD']));
    });
  });

  describe('blocked branch mutation flags', () => {
    integration.for([
      '-D', '-d', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '--force',
      '--set-upstream-to', '--unset-upstream', '--edit-description',
    ])(
      'blocks branch %s', async (flag, { call, expect }) => {
        assertBlocked(expect, await call(['branch', flag, 'test']));
      },
    );

    integration('blocks --set-upstream-to=value (equals form)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['branch', '--set-upstream-to=origin/main', 'test']));
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
      assertBlocked(expect, await call([sub, flag, 'test']));
    });
  });

  describe('remote subcommand filtering', () => {
    integration('allows bare remote (list)', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote']));
    });

    integration('allows remote -v', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote', '-v']));
    });

    integration('allows remote --verbose', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote', '--verbose']));
    });

    integration('allows remote get-url origin', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote', 'get-url', 'origin']));
    });

    integration('allows remote get-url --push origin', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote', 'get-url', '--push', 'origin']));
    });

    integration('allows remote get-url --all origin', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote', 'get-url', '--all', 'origin']));
    });

    integration('allows remote show -n origin', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['remote', 'show', '-n', 'origin']));
    });

    integration('blocks remote show without -n (SSRF risk)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['remote', 'show', 'origin']));
    });

    integration.for(['add', 'remove', 'rename', 'set-url', 'set-head', 'prune', 'update'])(
      'blocks remote %s', async (sub, { call, expect }) => {
        assertBlocked(expect, await call(['remote', sub, 'origin']));
      },
    );

    integration('blocks unknown flags on remote', async ({ call, expect }) => {
      assertBlocked(expect, await call(['remote', '--unknown-flag']));
    });
  });

  describe('stash subcommand filtering', () => {
    integration('allows stash list', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['stash', 'list']));
    });

    integration('allows stash show', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['stash', 'show']));
    });

    integration('blocks bare stash (implicit push)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['stash']));
    });

    integration('blocks stash -- list (implicit push with pathspec)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['stash', '--', 'list']));
    });

    integration.for(['push', 'pop', 'apply', 'drop', 'clear', 'save', 'create', 'store'])(
      'blocks stash %s', async (sub, { call, expect }) => {
        assertBlocked(expect, await call(['stash', sub]));
      },
    );
  });

  describe('worktree subcommand filtering', () => {
    integration('allows worktree list', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['worktree', 'list']));
    });

    integration('blocks bare worktree', async ({ call, expect }) => {
      assertBlocked(expect, await call(['worktree']));
    });

    integration.for(['add', 'remove', 'move', 'prune', 'lock', 'unlock', 'repair'])(
      'blocks worktree %s', async (sub, { call, expect }) => {
        assertBlocked(expect, await call(['worktree', sub]));
      },
    );
  });

  describe('reflog subcommand filtering', () => {
    integration('allows bare reflog (= reflog show)', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['reflog']));
    });

    integration('allows reflog show', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['reflog', 'show']));
    });

    integration('allows reflog exists HEAD', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['reflog', 'exists', 'HEAD']));
    });

    integration.for(['delete', 'expire'])(
      'blocks reflog %s', async (sub, { call, expect }) => {
        assertBlocked(expect, await call(['reflog', sub]));
      },
    );
  });

  describe('write-flag blocking', () => {
    integration.for(['log', 'diff', 'show'])(
      'blocks %s --output=<path>', async (sub, { call, expect }) => {
        assertBlocked(expect, await call([sub, `--output=${build.absolutePath()}`]));
      },
    );

    integration('blocks log --output <path>', async ({ call, expect }) => {
      assertBlocked(expect, await call(['log', '--output', build.absolutePath()]));
    });

    integration('blocks diff -o', async ({ call, expect }) => {
      assertBlocked(expect, await call(['diff', '-o', build.absolutePath()]));
    });

    integration('blocks diff -ofile.txt (no space)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['diff', `-o${build.fileName('txt')}`]));
    });

    integration('blocks diff -ao (combined short flags with -o)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['diff', '-ao', build.absolutePath()]));
    });

    integration(
      'blocks diff -abo (combined short flags with -o at end)',
      async ({ call, expect }) => {
        assertBlocked(expect, await call(['diff', '-abo', build.absolutePath()]));
      },
    );

    integration('blocks diff --no-index', async ({ call, expect }) => {
      assertBlocked(expect, await call(['diff', '--no-index', '/etc/passwd', '/dev/null']));
    });
  });

  describe('--no-pager injection', () => {
    integration('does not hang on pager', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['log', '--oneline', '-1']));
    });
  });

  describe('edge cases', () => {
    integration('blocks empty args', async ({ call, expect }) => {
      assertBlocked(expect, await call([]));
    });
  });
});
