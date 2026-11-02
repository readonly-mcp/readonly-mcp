import { execFile, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Server, assertBlocked, assertNotBlocked, connectTool, echoed, textOf, useServer,
} from '#test/helpers.js';

// --- Unit tests (mocked exec) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/git.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[], cwd?: string) => callTool({ args, cwd });

describe.concurrent('git tool cwd (unit)', () => {
  const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    timeout: 5000,
  }).toString().trim();

  it('rejects cwd that is not a known worktree', async ({ expect }) => {
    const result = await callMocked(['status'], build.absolutePath());

    expect(result.isError).toBe(true);
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

    expect(args).toStrictEqual(['--no-pager', 'status']);
  });

  it('rejects path traversal from valid worktree', async ({ expect }) => {
    const result = await callMocked(['status'], toplevel + '/../../../tmp');

    expect(result.isError).toBe(true);
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
    expect(textOf(result)).toMatch(/Input validation error[\s\S]*"cwd"/v);
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

// --- Integration tests (real MCP server) ---
const run = promisify(execFile);

interface LinkedWorktree extends AsyncDisposable {
  readonly branch: string;
  readonly path: string;
}

/**
 * Adds a linked worktree of this repository on a new branch, both removed on
 * disposal.
 */
const addLinkedWorktree = async (): Promise<LinkedWorktree> => {
  const branch = `readonly-mcp-test-${faker.string.alphanumeric({ casing: 'lower', length: 8 })}`;
  const worktreePath = path.join(tmpdir(), branch);
  await run('git', ['worktree', 'add', '-b', branch, worktreePath]);
  return {
    branch,
    path: worktreePath,
    [Symbol.asyncDispose]: async () => {
      await run('git', ['worktree', 'remove', '--force', worktreePath]);
      await run('git', ['branch', '-D', branch]);
    },
  };
};

/**
 * A call to git that also passes the tool's `cwd`.
 */
type GitCall = (args: readonly string[], cwd?: string) => Promise<CallToolResult>;

const integration = it.extend<{ call: GitCall; server: Server; worktree: LinkedWorktree }>({
  call: async ({ server }, use) => use((args, cwd) => server.callTool('git', { args, cwd })),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
  worktree: [async ({}, use) => {
    await using worktree = await addLinkedWorktree();
    await use(worktree);
  }, { scope: 'file' }],
});

describe.concurrent('git tool cwd (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

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
    integration('accepts linked worktree as cwd', async ({ call, expect, worktree }) => {
      assertNotBlocked(expect, await call(['status'], worktree.path));
    });

    integration(
      'resolves HEAD from linked worktree, not main',
      async ({ call, expect, worktree }) => {
        const result = await call(['rev-parse', '--abbrev-ref', 'HEAD'], worktree.path);
        const branch = textOf(result).trim();

        expect(branch).toBe(worktree.branch);
      },
    );
  });
});
