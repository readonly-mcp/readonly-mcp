import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, afterAll, beforeAll, describe, it, vi } from 'vitest';
import * as build from './builders.ts';
import { type Server, assertBlocked, assertNotBlocked, connectTool, echoed, textOf, useServer } from './helpers.ts';

// --- Unit tests (mocked exec) ---
vi.mock(import('../lib/exec.ts'), async importOriginal =>
  (await import('./helpers.ts')).withEchoExec(importOriginal));

const { register } = await import('../tools/git.ts');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[], cwd?: string) => callTool({ args, cwd });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('git tool (unit)', () => {
  describe('--no-pager injection', () => {
    it('injects --no-pager as first arg', async ({ expect }) => {
      const result = await callMocked(['log', '--oneline', '-1']);
      const { args } = echoed(result);

      expect(args[0]).toBe('--no-pager');
    });

    it('preserves original args after --no-pager', async ({ expect }) => {
      const result = await callMocked(['status']);
      const { args } = echoed(result);

      expect(args).toEqual(['--no-pager', 'status']);
    });
  });

  describe('allowed subcommands', () => {
    it.for(['blame', 'branch', 'describe', 'diff', 'log', 'ls-files', 'ls-tree', 'merge-base', 'rev-parse', 'shortlog', 'show', 'status'])(
      'allows %s', async (sub, { expect }) => {
        assertAllowed(expect, await callMocked([sub]));
      },
    );

    it('allows remote (bare)', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['remote']));
    });

    it('allows stash list', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['stash', 'list']));
    });

    it('allows worktree list', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['worktree', 'list']));
    });

    it('allows reflog show', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['reflog', 'show']));
    });

    it('allows bare reflog (= reflog show)', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['reflog']));
    });
  });

  describe('cwd parameter', () => {
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      timeout: 5000,
    }).toString().trim();

    it('rejects cwd that is not a known worktree', async ({ expect }) => {
      const result = await callMocked(['status'], build.absolutePath());

      expect(result?.isError).toBe(true);
      expect(textOf(result)).toContain('cwd rejected');
    });

    it('prepends -C for valid worktree cwd', async ({ expect }) => {
      const result = await callMocked(['status'], toplevel);
      const { args } = echoed(result);

      expect(args[0]).toBe('--no-pager');
      expect(args[1]).toBe('-C');
      expect(args[2]).toBe(toplevel);
      expect(args[3]).toBe('status');
    });

    it('omits -C when cwd is not provided', async ({ expect }) => {
      const result = await callMocked(['status']);
      const { args } = echoed(result);

      expect(args).toEqual(['--no-pager', 'status']);
    });

    it('rejects path traversal from valid worktree', async ({ expect }) => {
      const result = await callMocked(['status'], toplevel + '/../../../tmp');

      expect(result?.isError).toBe(true);
      expect(textOf(result)).toContain('cwd rejected');
    });

    it('accepts trailing slash (resolve normalizes it)', async ({ expect }) => {
      const result = await callMocked(['status'], toplevel + '/');
      const { args } = echoed(result);

      expect(args[1]).toBe('-C');
    });

    it('rejects an empty cwd at the input schema', async ({ expect }) => {
      const result = await callMocked(['status'], '');

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Input validation error[\s\S]*"cwd"/);
    });

    it.runIf(process.platform === 'win32')(
      'accepts case-variant cwd on Windows',
      async ({ expect }) => {
        const first = toplevel.charAt(0);
        const swapped =
          (first === first.toUpperCase() ? first.toLowerCase() : first.toUpperCase()) +
          toplevel.slice(1);
        const result = await callMocked(['status'], swapped);
        const { args } = echoed(result);

        expect(args[1]).toBe('-C');
      },
    );

    it.runIf(process.platform === 'win32')(
      'accepts forward-slash cwd on Windows',
      async ({ expect }) => {
        const result = await callMocked(['status'], toplevel.replaceAll('\\', '/'));
        const { args } = echoed(result);

        expect(args[1]).toBe('-C');
      },
    );
  });
});

// --- Integration tests (real MCP server) ---
/**
 * A call to git that also passes the tool's `cwd`.
 */
type GitCall = (args: readonly string[], cwd?: string) => Promise<CallToolResult>;

const integration = it.extend<{ call: GitCall; server: Server }>({
  call: async ({ server }, use) => use((args, cwd) => server.callTool('git', { args, cwd })),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('git tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('blocked subcommands', () => {
    integration.for(['push', 'pull', 'fetch', 'checkout', 'reset', 'rebase', 'merge', 'commit', 'add', 'rm', 'clean'])(
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

      expect(result?.isError).not.toBe(true);
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
    integration.for(['-D', '-d', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '--force', '--set-upstream-to', '--unset-upstream', '--edit-description'])(
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

    integration('blocks diff -abo (combined short flags with -o at end)', async ({ call, expect }) => {
      assertBlocked(expect, await call(['diff', '-abo', build.absolutePath()]));
    });

    integration('blocks diff --no-index', async ({ call, expect }) => {
      assertBlocked(expect, await call(['diff', '--no-index', '/etc/passwd', '/dev/null']));
    });
  });

  describe('--no-pager injection', () => {
    integration('does not hang on pager', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['log', '--oneline', '-1']));
    });
  });

  describe('cwd parameter', () => {
    integration('rejects cwd that is not a known worktree', async ({ call, expect }) => {
      assertBlocked(expect, await call(['status'], build.absolutePath()));
    });

    integration('accepts cwd that is the main worktree', async ({ call, expect }) => {
      const topResult = await call(['rev-parse', '--show-toplevel']);
      const toplevel = textOf(topResult).trim();
      assertNotBlocked(expect, await call(['status'], toplevel));
    });

    integration('rejects empty string cwd', async ({ call, expect }) => {
      assertBlocked(expect, await call(['status'], ''));
    });

    integration('rejects path traversal from valid worktree', async ({ call, expect }) => {
      const topResult = await call(['rev-parse', '--show-toplevel']);
      const toplevel = textOf(topResult).trim();
      assertBlocked(expect, await call(['status'], toplevel + '/../../../tmp'));
    });

    integration('accepts cwd with trailing slash', async ({ call, expect }) => {
      const topResult = await call(['rev-parse', '--show-toplevel']);
      const toplevel = textOf(topResult).trim();
      assertNotBlocked(expect, await call(['status'], toplevel + '/'));
    });
  });

  describe('cwd with linked worktree', () => {
    const worktreePath = join(tmpdir(), `mcp-test-wt-${process.pid}`);
    const branchName = `test-cwd-wt-${process.pid}`;

    beforeAll(() => {
      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath], {
        timeout: 10_000,
      });
    });

    afterAll(() => {
      try { execFileSync('git', ['worktree', 'remove', '--force', worktreePath], { timeout: 10_000 }); } catch {}
      try { execFileSync('git', ['branch', '-D', branchName], { timeout: 5000 }); } catch {}
    });

    integration('accepts linked worktree as cwd', async ({ call, expect }) => {
      assertNotBlocked(expect, await call(['status'], worktreePath));
    });

    integration('resolves HEAD from linked worktree, not main', async ({ call, expect }) => {
      const result = await call(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
      const branch = textOf(result).trim();

      expect(branch).toBe(branchName);
    });
  });

  describe('edge cases', () => {
    integration('blocks empty args', async ({ call, expect }) => {
      assertBlocked(expect, await call([]));
    });
  });
});
