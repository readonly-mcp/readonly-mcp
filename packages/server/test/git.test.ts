import { describe, it } from 'vitest';
import { plan } from '#src/tools/git.js';
import { runOf } from '#test/helpers.js';

describe.concurrent('git tool', () => {
  describe('allowed subcommands', () => {
    it.for([
      'blame', 'describe', 'diff', 'log', 'ls-files', 'ls-tree', 'merge-base',
      'rev-parse', 'shortlog', 'show', 'status',
    ])('runs %s after --no-pager', async (sub, { expect }) => {
      const { args, cmd } = runOf(await plan([sub]));

      expect([cmd, ...args]).toStrictEqual(['git', '--no-pager', sub]);
    });

    it.for([
      { args: ['log', '--oneline', '-1'], name: 'log with flags' },
      { args: ['remote'], name: 'remote (bare)' },
      { args: ['stash', 'list'], name: 'stash list' },
      { args: ['worktree', 'list'], name: 'worktree list' },
      { args: ['reflog', 'show'], name: 'reflog show' },
      { args: ['reflog'], name: 'bare reflog (= reflog show)' },
    ])('runs $name after --no-pager', async ({ args }, { expect }) => {
      expect(runOf(await plan(args)).args).toStrictEqual(['--no-pager', ...args]);
    });

    it('runs branch in list mode', async ({ expect }) => {
      expect(runOf(await plan(['branch'])).args).toStrictEqual(['--no-pager', 'branch', '--list']);
    });
  });
});
