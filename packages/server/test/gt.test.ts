import { type ExpectStatic, describe, it } from 'vitest';
import { plan } from '#src/tools/gt.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

const assertRunsAsGiven = (expect: ExpectStatic, args: readonly string[]) => {
  const { args: argv, cmd } = runOf(plan(args));

  expect([cmd, ...argv]).toStrictEqual(['gt', ...args]);
};

const assertRejected = (expect: ExpectStatic, args: readonly string[]) => {
  expect(plan(args)).toMatchObject({ kind: 'reject' });
};

describe.concurrent('gt tool', () => {
  describe('allowed subcommands', () => {
    it.for(([
      ['auth', 'status'],
      ['branch', 'list'],
      ['commit', 'compare', ':branch...:sha'],
      ['commit', 'diff', ':sha'],
      ['commit', 'list'],
      ['commit', 'pr', ':sha'],
      ['commit', 'status', ':sha'],
      ['commit', 'view', ':sha'],
      ['issue', 'list'],
      ['issue', 'view', ':number'],
      ['label', 'list'],
      ['milestone', 'list'],
      ['pr', 'checks', ':number'],
      ['pr', 'diff', ':number'],
      ['pr', 'list'],
      ['pr', 'review', 'comments', ':number'],
      ['pr', 'review', 'list', ':number'],
      ['pr', 'review', 'view', ':number', ':number'],
      ['pr', 'status'],
      ['pr', 'timeline', ':number'],
      ['pr', 'view', ':number'],
      ['release', 'list'],
      ['release', 'view', ':version'],
      ['repo', 'list'],
      ['repo', 'view', ':owner/:repo'],
      ['run', 'jobs', ':number'],
      ['run', 'list'],
      ['run', 'logs', ':number'],
      ['run', 'view', ':number'],
      ['schema'],
      ['search', 'issue', ':word'],
      ['search', 'pr', ':word'],
      ['search', 'repo', ':word'],
      ['version'],
      ['workflow', 'list'],
      ['workflow', 'view', ':file'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'runs $name as given', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
      },
    );

    it.for(([
      ['pr', 'list', '--state', 'all', '--json', 'number,title'],
      ['pr', 'view', ':number', '-c', '-R', ':owner/:repo'],
      ['pr', 'view', 'https://:host/:owner/:repo/pulls/:number'],
      ['issue', 'list', '--repo', 'https://:host/:owner/:repo'],
      ['pr', 'diff', ':number', '--name-only', '--color', 'never'],
      ['pr', 'checks', ':number', '--required'],
      ['run', 'list', '-w', ':file'],
      ['run', 'logs', ':number', '--failed', '--tail', '50'],
      ['run', 'view', ':number', '--log-failed'],
      ['issue', 'list', '--template', '{{range .}}{{.number}}{{end}}'],
      ['issue', 'list', '--jq', '.[].title'],
      ['issue', 'list', '-q', '.[] | .env'],
      // A value attached to a short flag is not read as more flags.
      ['pr', 'list', '-lwontfix'],
      ['pr', 'list', '-Hwip'],
      ['issue', 'list', '-q.[].workflow'],
      ['run', 'logs', ':number', '-jformat'],
      // gt's global flags, which its help lists on one line.
      ['pr', 'list', '--host', 'https://:host', '--no-input'],
      // An empty positional is no flag.
      ['search', 'issue', ''],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'runs $name as given', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
      },
    );
  });

  describe('global flags', () => {
    it.for([['--version'], ['--help'], ['-h']].map(args => ({ name: args[0], args })))(
      'runs standalone $name', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
      },
    );

    it('blocks --help with extra args', ({ expect }) => {
      assertRejected(expect, ['--help', 'repo', 'delete']);
    });
  });

  describe('blocked subcommands', () => {
    it.for(([
      // Prints the active account's access token.
      ['auth', 'token'],
      /*
       * Git's credential helper protocol answers with the token on stdout.
       * Absent from `gt auth --help`, so only an allowlist catches it.
       */
      ['auth', 'git-credential', 'get'],
      ['auth', 'login'], ['auth', 'logout'], ['auth', 'refresh'],
      ['auth', 'setup-git'], ['auth', 'switch'],
      ['alias', 'set', ':word', 'pr merge'],
      ['api', 'user'],
      ['browse'],
      ['config', 'set', ':word', ':word'],
      ['extension', 'install', ':owner/:repo'],
      // An extension runs as `gt NAME`, so unknown first words are rejected.
      [':word'],
      ['issue', 'close', ':number'], ['issue', 'comment', ':number'],
      ['issue', 'create'], ['issue', 'edit', ':number'],
      ['notification', 'list'],
      ['pr', 'checkout', ':number'], ['pr', 'close', ':number'],
      ['pr', 'comment', ':number'], ['pr', 'create'], ['pr', 'merge', ':number'],
      ['pr', 'ready', ':number'], ['pr', 'update-branch', ':number'],
      // Bare `pr review` submits a review.
      ['pr', 'review', ':number'], ['pr', 'review', '--approve', ':number'],
      ['pr', 'review', 'reply', ':number'], ['pr', 'review', 'resolve', ':number'],
      ['pr', 'review', 'submit', ':number'],
      ['release', 'download', ':version'],
      ['repo', 'clone', ':owner/:repo'], ['repo', 'delete', ':owner/:repo'],
      ['run', 'cancel', ':number'], ['run', 'download', ':number'],
      ['run', 'rerun', ':number'], ['run', 'watch', ':number'],
      ['upgrade'],
      ['workflow', 'disable', ':file'], ['workflow', 'run', ':file'],
      /*
       * Global flags may precede the command, which would hide it from the
       * allowlist, so the command must come first.
       */
      ['--repo', ':owner/:repo', 'pr', 'merge', ':number'],
      ['-R', ':owner/:repo', 'pr', 'list'],
      // The command's words are separate args, not one arg holding a space.
      ['run list'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'blocks $name', ({ args }, { expect }) => {
        assertRejected(expect, args);
      },
    );

    it('blocks bare gt', ({ expect }) => {
      assertRejected(expect, []);
    });
  });

  describe('blocked flags', () => {
    it.for(([
      // Flags are allowlisted per command, so another command's flag is refused.
      ['pr', 'view', ':number', '--state', 'all'],
      /*
       * --json and --csv take no arg starting with `-` as their value, so gt
       * reads it as a flag; a second --json supplies the fields gt requires.
       */
      ['pr', 'list', '--json', '--sudo', ':word', '--json', 'number'],
      ['pr', 'list', '--csv', '--debug', '--csv', 'number'],
      ['issue', 'list', '--json', '--cwd', ':path', '--json', 'number'],
      ['repo', 'list', '--repo', ':owner/:repo'],
      // Repository discovery from a caller-chosen directory.
      ['pr', 'list', '--cwd', ':path'],
      ['pr', 'list', '--cwd=:path'],
      // Unverified whether it prints credentials.
      ['pr', 'list', '--debug'],
      // Requests as another user.
      ['pr', 'list', '--sudo', ':word'],
      // Opens a browser.
      ['pr', 'view', ':number', '--web'],
      ['pr', 'view', ':number', '-w'],
      ['pr', 'view', ':number', '-cw'],
      ['commit', 'diff', ':sha', '-w'],
      ['commit', 'view', ':sha', '-w'],
      ['issue', 'list', '-w'],
      ['issue', 'view', ':number', '-w'],
      ['label', 'list', '-w'],
      ['pr', 'checks', ':number', '-w'],
      ['pr', 'diff', ':number', '-w'],
      ['pr', 'list', '-w'],
      ['release', 'view', ':version', '-w'],
      ['repo', 'view', '-w'],
      ['run', 'view', ':number', '-w'],
      ['workflow', 'view', ':file', '-w'],
      // run list's -w is --workflow, but --web stays blocked there.
      ['run', 'list', '--web'],
      // An interactive picker that can act on the item it picks.
      ['pr', 'list', '--select'],
      ['repo', 'list', '--select'],
      // Polls until the checks finish.
      ['pr', 'checks', ':number', '--watch'],
      ['pr', 'checks', ':number', '--watch=true'],
      // Waits for jobs and prints until they complete.
      ['run', 'logs', ':number', '--follow'],
      ['run', 'logs', ':number', '-f'],
      // Downloads the logs to a file.
      ['run', 'logs', ':number', '--output', ':file'],
      ['run', 'logs', ':number', '-O', ':file'],
      ['run', 'logs', ':number', '-O:file'],
      ['run', 'logs', ':number', '--dir', ':path'],
      ['run', 'logs', ':number', '-D', ':path'],
      ['run', 'logs', ':number', '--clobber'],
      ['run', 'logs', ':number', '--skip-existing'],
    ] as const).map(args => ({ name: args.join(' '), args: args.map(build.template) })))(
      'blocks $name', ({ args }, { expect }) => {
        assertRejected(expect, args);
      },
    );
  });

  // gt evaluates --jq with an embedded jq whose env reads the server's environment.
  describe('jq filters', () => {
    it.for([
      ['--jq', 'env'],
      ['--jq=$ENV.GITEA_TOKEN'],
      ['-q', 'env.GITEA_TOKEN'],
      ['-qenv'],
    ].map(flags => ({ name: flags.join(' '), flags })))(
      'blocks $name', ({ flags }, { expect }) => {
        expect(rejectionOf(plan(['issue', 'list', ...flags]))).toMatch(/for gt --jq$/v);
      },
    );
  });
});
