import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import {
  connectTool, echoed, textOf } from '#test/helpers.js';

// --- Unit tests (mocked exec) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/git.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

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

      expect(args).toStrictEqual(['--no-pager', 'status']);
    });
  });

  describe('allowed subcommands', () => {
    it.for([
      'blame', 'branch', 'describe', 'diff', 'log', 'ls-files', 'ls-tree', 'merge-base',
      'rev-parse', 'shortlog', 'show', 'status',
    ])(
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
});
