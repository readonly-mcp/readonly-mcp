import { type ExpectStatic, describe, it } from 'vitest';
import { plan } from '#src/tools/tea.js';
import * as build from '#test/builders.js';
import { runOf } from '#test/helpers.js';

const assertRunsAsGiven = (expect: ExpectStatic, args: readonly string[]) => {
  const { args: argv, cmd } = runOf(plan(args));

  expect([cmd, ...argv]).toStrictEqual(['tea', ...args]);
};

const assertRejected = (expect: ExpectStatic, args: readonly string[]) => {
  expect(plan(args)).toMatchObject({ kind: 'reject' });
};

describe.concurrent('tea tool', () => {
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
      'runs $name as given', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
      },
    );

    it('runs a subcommand with flags as given', ({ expect }) => {
      assertRunsAsGiven(expect, ['pulls', 'list', '--state', 'all', '-o', 'json']);
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
      'runs $name under its canonical names', ({ args, expected }, { expect }) => {
        expect(runOf(plan(args)).args).toEqual(expected);
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
      'runs $name as given', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
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
      'blocks $name', ({ args }, { expect }) => {
        assertRejected(expect, args);
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
      'runs standalone $name', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
      },
    );

    it('blocks --help with extra args', ({ expect }) => {
      assertRejected(expect, ['--help', 'repos', 'delete']);
    });
  });

  describe('--repo', () => {
    it.for(([
      ['pulls', 'list', '--repo', ':owner/:repo'],
      ['pulls', 'list', '--repo=:owner/:repo'],
      ['pulls', 'list', '-r', ':owner/:repo'],
      ['pulls', 'list', '-repo', 'my.org/my-repo_2'],
    ] as const).map(args => ({ name: args.slice(2).join(' '), args: args.map(build.template) })))(
      'runs with repository slug $name', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
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
      'blocks local path $name', ({ args }, { expect }) => {
        assertRejected(expect, args);
      },
    );
  });
});
