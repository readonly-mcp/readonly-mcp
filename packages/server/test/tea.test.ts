import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  assertBlocked, connectTool, echoed, textOf } from '#test/helpers.js';

// --- Unit tests (mocked exec) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/tea.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('tea tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for(([
      ['branches', 'list'],
      ['comments', 'list', ':number'],
      ['issues'],
      ['issues', ':number'],
      ['issues', 'list'],
      ['labels', 'list'],
      ['logins', 'list'],
      ['milestones', 'issues', ':version'],
      ['milestones', 'list'],
      ['pulls'],
      ['pulls', ':number'],
      ['pulls', 'list'],
      ['pulls', 'review-comments', ':number'],
      ['releases', 'list'],
      ['repos', 'list'],
      ['repos', 'search', ':word'],
      ['whoami'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'allows $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('allows subcommand with flags', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['pulls', 'list', '--state', 'all', '-o', 'json']));
    });
  });

  describe('aliases', () => {
    it.for(([
      { args: ['b', 'ls'], expected: ['branches', 'list'] },
      { args: ['branch', 'ls'], expected: ['branches', 'list'] },
      { args: ['c', 'ls', ':number'], expected: ['comments', 'list', ':number'] },
      { args: ['comment', 'list', ':number'], expected: ['comments', 'list', ':number'] },
      { args: ['i', 'ls'], expected: ['issues', 'list'] },
      { args: ['issue', ':number'], expected: ['issues', ':number'] },
      { args: ['label', 'ls'], expected: ['labels', 'list'] },
      { args: ['login', 'ls'], expected: ['logins', 'list'] },
      { args: ['milestone', 'ls'], expected: ['milestones', 'list'] },
      { args: ['ms', 'i', ':version'], expected: ['milestones', 'issues', ':version'] },
      { args: ['pr', 'rc', ':number'], expected: ['pulls', 'review-comments', ':number'] },
      { args: ['pr', ':number'], expected: ['pulls', ':number'] },
      { args: ['pull', 'ls'], expected: ['pulls', 'list'] },
      { args: ['r', 'ls'], expected: ['releases', 'list'] },
      { args: ['release', 'ls'], expected: ['releases', 'list'] },
      { args: ['repo', 's', ':word'], expected: ['repos', 'search', ':word'] },
    ] as const).map(({ args, expected }) => {
      // One filler per row, so the alias and its canonical form share values.
      const fill = build.templateFiller();
      return { args: args.map(fill), expected: expected.map(fill), name: args.join(' ') };
    }))(
      'runs $name under its canonical names', async ({ args, expected }, { expect }) => {
        expect(echoed(await callMocked(args)).args).toEqual(expected);
      },
    );
  });

  describe('view by bare index', () => {
    it.for(([
      ['pulls', ':number', '--comments'],
      ['pulls', ':number', '--comments=false'],
      ['pulls', '-o', 'json', ':number'],
      ['pulls', '--state', 'open'],
      ['pulls', '--state=open', ':number'],
      ['pulls', '-f', 'index,diff', ':number'],
      ['pulls', '--', ':number'],
      ['issues', '--state', 'closed', '-l', ':word', ':number'],
      ['milestones', 'issues', '--kind', 'pull', ':version'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'allows $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    // A noun with children dispatches to the first positional that names one,
    // even after flags, so every positional is checked, not just the first.
    it.for(([
      ['pulls', '--state', 'all', 'merge', ':number'],
      ['pulls', '-o', 'json', 'm', ':number'],
      ['pulls', '--comments', 'merge', ':number'],
      ['pulls', '--', 'merge', ':number'],
      ['pulls', ':number', ':number'],
      ['pulls', ':word'],
      ['pulls', '--unknown', ':number'],
      ['issues', '--state', 'open', 'close', ':number'],
      ['issues', '-o', 'json', 'e', ':number'],
      ['milestones', 'issues', 'add', ':version', ':number'],
      ['milestones', 'issues', '--state', 'all', 'remove', ':version', ':number'],
      ['milestones', 'issues', '-o', 'json', 'a', ':version', ':number'],
      ['milestones', 'issues', '--kind', 'pull', 'r', ':version', ':number'],
      ['milestones', 'issues', ':version', ':word'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'blocks $name', async ({ args }, { expect }) => {
        assertBlocked(expect, await callMocked(args));
      },
    );
  });

  describe('global flags', () => {
    it.for([
      ['--version'],
      ['-v'],
      ['--help'],
      ['-h'],
    ].map(args => ({ name: args[0], args })))(
      'allows standalone $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('blocks --help with extra args', async ({ expect }) => {
      assertBlocked(expect, await callMocked(['--help', 'repos', 'delete']));
    });
  });

  describe('--repo', () => {
    it.for(([
      ['pulls', 'list', '--repo', ':owner/:repo'],
      ['pulls', 'list', '--repo=:owner/:repo'],
      ['pulls', 'list', '-r', ':owner/:repo'],
      ['pulls', 'list', '-repo', 'my.org/my-repo_2'],
    ] as const).map(args => ({ name: args.slice(2).join(' '), args: args.map(build.template) })))(
      'allows repository slug $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    // --repo also accepts a local repository path, which would point tea at a
    // directory outside the server's working directory.
    it.for(([
      ['pulls', 'list', '--repo', 'C:/Users/someone/repo'],
      ['pulls', 'list', '--repo', '/etc/repo'],
      ['pulls', 'list', '--repo', '../other'],
      ['pulls', 'list', '--repo', '..\\other'],
      ['pulls', 'list', '--repo', '../other/repo'],
      ['pulls', 'list', '--repo', ':owner/:repo/:word'],
      ['pulls', 'list', '--repo=../other/repo'],
      ['pulls', 'list', '-r', './x'],
      ['pulls', 'list', '-repo=../other/repo'],
      ['pulls', ':number', '-r', '../other/repo'],
    ] as const).map(args => ({ name: args.slice(2).join(' '), args: args.map(build.template) })))(
      'blocks local path $name', async ({ args }, { expect }) => {
        assertBlocked(expect, await callMocked(args));
      },
    );
  });
});
