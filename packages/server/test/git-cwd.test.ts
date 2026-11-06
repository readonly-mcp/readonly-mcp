import { execFileSync } from 'node:child_process';
import { describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  connectTool, echoed, textOf } from '#test/helpers.js';

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
    expect(textOf(result)).toMatch(/Input validation error[\s\S]+\bcwd\b/v);
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
