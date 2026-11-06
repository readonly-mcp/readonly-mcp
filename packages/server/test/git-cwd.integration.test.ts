import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Server, assertBlocked, assertNotBlocked, textOf, useServer,
} from '#test/helpers.js';

const run = promisify(execFile);

interface LinkedWorktree extends AsyncDisposable {
  readonly branch: string;
  readonly path: string;
  /**
   * Adds the worktree and its branch, which disposal removes.
   */
  readonly add: () => Promise<void>;
}

/**
 * A linked worktree of this repository on a new branch, added by `add`. The
 * suite adds it in a `beforeAll` on the extended test function, as with
 * `useServer`, so the checkout runs once against the hook timeout rather than
 * inside each concurrent test that asks for it.
 */
const linkedWorktree = (): LinkedWorktree => {
  const branch = `readonly-mcp-test-${faker.string.alphanumeric({ casing: 'lower', length: 8 })}`;
  const worktreePath = path.join(tmpdir(), branch);
  let isAdded = false;
  return {
    add: async () => {
      await run('git', ['worktree', 'add', '-b', branch, worktreePath]);
      isAdded = true;
    },
    branch,
    path: worktreePath,
    [Symbol.asyncDispose]: async () => {
      if (!isAdded) {
        return;
      }

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
    await using worktree = linkedWorktree();
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
    integration.beforeAll(({ worktree }) => worktree.add());

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
