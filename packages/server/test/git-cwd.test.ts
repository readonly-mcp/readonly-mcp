import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';
import { plan } from '#src/tools/git.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

const rejected = 'cwd rejected: not a known git worktree';

describe.concurrent('git tool cwd (unit)', () => {
  const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    timeout: 5000,
  }).toString().trim();

  it('rejects cwd that is not a known worktree', async ({ expect }) => {
    const cwd = build.absolutePath();

    expect(rejectionOf(await plan(['status'], cwd))).toBe(rejected);
  });

  it('prepends -C for valid worktree cwd', async ({ expect }) => {
    const { args } = runOf(await plan(['status'], toplevel));

    expect(args).toStrictEqual(['--no-pager', '-C', toplevel, 'status']);
  });

  it('omits -C when cwd is not provided', async ({ expect }) => {
    expect(runOf(await plan(['status'])).args).toStrictEqual(['--no-pager', 'status']);
  });

  it('rejects path traversal from valid worktree', async ({ expect }) => {
    expect(rejectionOf(await plan(['status'], toplevel + '/../../../tmp'))).toBe(rejected);
  });

  it('accepts trailing slash (resolve normalizes it)', async ({ expect }) => {
    const cwd = toplevel + '/';

    expect(runOf(await plan(['status'], cwd)).args).toStrictEqual(
      ['--no-pager', '-C', cwd, 'status'],
    );
  });

  it.runIf(process.platform === 'win32')(
    'accepts case-variant cwd on Windows',
    async ({ expect }) => {
      const first = toplevel.charAt(0);
      const swapped =
        (first === first.toUpperCase() ? first.toLowerCase() : first.toUpperCase()) +
        toplevel.slice(1);

      expect(runOf(await plan(['status'], swapped)).args).toStrictEqual(
        ['--no-pager', '-C', swapped, 'status'],
      );
    },
  );

  it.runIf(process.platform === 'win32')(
    'accepts forward-slash cwd on Windows',
    async ({ expect }) => {
      const cwd = toplevel.replaceAll('\\', '/');

      expect(runOf(await plan(['status'], cwd)).args).toStrictEqual(
        ['--no-pager', '-C', cwd, 'status'],
      );
    },
  );
});
