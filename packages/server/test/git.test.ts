import { describe, it } from 'vitest';
import { plan } from '#src/tools/git.js';

describe.concurrent('git tool', () => {
  describe('allowed subcommands', () => {
    it.for([
      'blame', 'describe', 'diff', 'log', 'ls-files', 'ls-tree', 'merge-base',
      'rev-parse', 'shortlog', 'show', 'status',
    ])('runs %s after --no-pager', async (sub, { expect }) => {
      await expect(plan([sub])).resolves.toRun('git', ['--no-pager', sub]);
    });

    it.for([
      { args: ['log', '--oneline', '-1'], name: 'log with flags' },
      { args: ['remote'], name: 'remote (bare)' },
      { args: ['stash', 'list'], name: 'stash list' },
      { args: ['worktree', 'list'], name: 'worktree list' },
      { args: ['reflog', 'show'], name: 'reflog show' },
      { args: ['reflog'], name: 'bare reflog (= reflog show)' },
    ])('runs $name after --no-pager', async ({ args }, { expect }) => {
      expect(await plan(args)).toRun('git', ['--no-pager', ...args]);
    });

    it('runs branch in list mode', async ({ expect }) => {
      await expect(plan(['branch'])).resolves.toRun('git', ['--no-pager', 'branch', '--list']);
    });
  });
});
