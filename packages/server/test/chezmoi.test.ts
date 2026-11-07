import { faker } from '@faker-js/faker';
import { type ExpectStatic, describe, it } from 'vitest';
import { plan } from '#src/tools/chezmoi.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

// chezmoi runs an allowed call exactly as given.
const assertRunsAsGiven = (expect: ExpectStatic, args: readonly string[]) => {
  const { args: argv, cmd } = runOf(plan(args));

  expect([cmd, ...argv]).toStrictEqual(['chezmoi', ...args]);
};

describe.concurrent('chezmoi tool', () => {
  describe('allowed subcommands', () => {
    it.for(['diff', 'doctor', 'managed', 'source-path', 'status', 'target-path', 'verify'])(
      'runs %s', (sub, { expect }) => {
        assertRunsAsGiven(expect, [sub]);
      },
    );

    it('runs a subcommand with flags', ({ expect }) => {
      assertRunsAsGiven(expect, ['status', '--include', 'files']);
    });
  });

  /*
   * Each asserts the allowlist's own message: chezmoi rejects some of these
   * itself, and its error would pass for a block.
   */
  describe('option allowlist', () => {
    const directory = build.absolutePath();
    const file = build.absolutePath();

    it.for([
      // A source or config the caller picks runs its templates and hooks.
      { args: ['diff', '--source', directory], flag: '--source', name: '--source <dir>' },
      {
        args: ['diff', `--source=${directory}`], flag: `--source=${directory}`,
        name: '--source=<dir>',
      },
      { args: ['diff', '-S', directory], flag: '-S', name: '-S <dir>' },
      { args: ['diff', `-S${directory}`], flag: `-S${directory}`, name: '-S<dir>' },
      { args: ['diff', '-rS', directory], flag: '-rS', name: '-rS (grouped)' },
      { args: ['status', '--config', file], flag: '--config', name: '--config <file>' },
      { args: ['status', '-c', file], flag: '-c', name: '-c <file>' },
      { args: ['diff', '--pager', file], flag: '--pager', name: '--pager <cmd>' },
      { args: ['status', '--init'], flag: '--init', name: '--init (rewrites config)' },
      { args: ['diff', '--output', file], flag: '--output', name: '--output <path>' },
      { args: ['diff', '-o', file], flag: '-o', name: '-o <path>' },
      {
        args: ['status', '--persistent-state', file], flag: '--persistent-state',
        name: '--persistent-state <path>',
      },
      { args: ['status', '--cache', directory], flag: '--cache', name: '--cache <dir>' },
      {
        args: ['status', '--override-data-file', file], flag: '--override-data-file',
        name: '--override-data-file <path>',
      },
      // Data a template passes to `output` would choose the command it runs.
      {
        args: ['status', '--override-data', '{}'], flag: '--override-data',
        name: '--override-data <json>',
      },
      {
        args: ['status', '--config-format', 'json'], flag: '--config-format',
        name: '--config-format <format>',
      },
      {
        args: ['diff', '--age-recipient', faker.string.alphanumeric(16)],
        flag: '--age-recipient', name: '--age-recipient <recipient>',
      },
      {
        args: ['diff', '--age-recipient-file', file], flag: '--age-recipient-file',
        name: '--age-recipient-file <path>',
      },
      {
        args: ['diff', '--use-builtin-git', 'true'], flag: '--use-builtin-git',
        name: '--use-builtin-git <bool>',
      },
      { args: ['diff', '--mode', 'symlink'], flag: '--mode', name: '--mode <mode>' },
      { args: ['diff', '--force'], flag: '--force', name: '--force' },
      { args: ['diff', '--interactive'], flag: '--interactive', name: '--interactive' },
      { args: ['diff', '-D', directory], flag: '-D', name: '-D <dir>' },
      { args: ['diff', '-W', directory], flag: '-W', name: '-W <dir>' },
      { args: ['diff', '-R'], flag: '-R', name: '-R (refreshes externals)' },
      { args: ['diff', '--debug'], flag: '--debug', name: '--debug' },
      { args: ['managed', '--incl', 'files'], flag: '--incl', name: 'an abbreviation' },
      /*
       * pflag takes `--` as the value of an option that needs one and goes on
       * reading options, so `--` ends nothing the server can rely on.
       */
      {
        args: ['diff', '--include', '--', '--source', directory], flag: '--source',
        name: '--source after -- given as a long value',
      },
      {
        args: ['status', '-i', '--', '-S', directory], flag: '-S',
        name: '-S after -- given as a short value',
      },
      {
        args: ['diff', '--', `--source=${directory}`], flag: `--source=${directory}`,
        name: 'an option after --',
      },
      /*
       * Short letters are defined per command, so a value inside a group is
       * not read: each letter must be an allowed option of its own. Under
       * status, -p takes `S<dir>` as its value; a command or release where
       * -p is a switch would read -S, which this row guards against.
       */
      { args: ['managed', '-tfjson'], flag: '-tfjson', name: 'a value attached in a group' },
      {
        args: ['status', `-pS${directory}`], flag: `-pS${directory}`,
        name: '-S after a letter a command could read as a switch',
      },
      /*
       * Options are allowed per command: a letter or name another command
       * owns may mean something else, or nothing, under this one.
       */
      { args: ['diff', '-p', 'absolute'], flag: '-p', name: '-p under diff' },
      { args: ['diff', '--tree'], flag: '--tree', name: '--tree under diff' },
      { args: ['status', '-t'], flag: '-t', name: '-t under status' },
      { args: ['status', '-f', 'json'], flag: '-f', name: '-f under status' },
      {
        args: ['verify', '--path-style', 'absolute'], flag: '--path-style',
        name: '--path-style under verify',
      },
      { args: ['doctor', '--recursive'], flag: '--recursive', name: '--recursive under doctor' },
      { args: ['source-path', '-x', 'scripts'], flag: '-x', name: '-x under source-path' },
      {
        args: ['target-path', '--reverse'], flag: '--reverse',
        name: '--reverse under target-path',
      },
    ])('rejects $name', ({ args, flag }, { expect }) => {
      expect(rejectionOf(plan(args))).toBe(`Flag not allowed for chezmoi: ${flag}`);
    });

    it.for([
      { args: ['diff', '--reverse', '--no-pager'], name: 'diff booleans' },
      { args: ['diff', '--recursive=false'], name: 'a boolean given a value' },
      { args: ['status', '-i', 'files'], name: 'a short value as the next arg' },
      { args: ['status', '--include=files'], name: 'a long value after =' },
      { args: ['managed', '-t', '-f', 'json'], name: 'a short value as its own arg' },
      { args: ['managed', '--path-style', 'absolute', '-0'], name: 'managed options' },
      { args: ['verify', '-rP', '--color=false'], name: 'verify options' },
      { args: ['doctor', '--no-network'], name: 'doctor --no-network' },
      { args: ['diff', '-'], name: 'a bare - (a target, not an option)' },
      { args: ['diff', '--', build.relativeFilePath()], name: 'a target after --' },
    ])('runs $name', ({ args }, { expect }) => {
      assertRunsAsGiven(expect, args);
    });

    /*
     * One row per allowed option under each command that owns it, from
     * `chezmoi <command> --help` (chezmoi 2.70), so dropping one from the
     * allowlist fails here. The global options run under every command.
     */
    const exclude = [['--exclude', 'scripts'], ['-x', 'scripts']];
    const include = [['--include', 'files'], ['-i', 'files']];
    const parentDirs = [['--parent-dirs'], ['-P']];
    const pathStyle = [['--path-style', 'absolute'], ['-p', 'absolute']];
    const recursive = [['--recursive'], ['-r']];
    const ownOptions: Record<string, readonly (readonly string[])[]> = {
      'diff': [
        ...exclude, ...include, ...parentDirs, ...recursive, ['--reverse'], ['--script-contents'],
      ],
      'doctor': [['--no-network']],
      'managed': [
        ...exclude, ...include, ...pathStyle, ['--format', 'json'], ['-f', 'json'],
        ['--nul-path-separator'], ['-0'], ['--tree'], ['-t'],
      ],
      'source-path': [],
      'status': [...exclude, ...include, ...parentDirs, ...pathStyle, ...recursive],
      'target-path': [],
      'verify': [...exclude, ...include, ...parentDirs, ...recursive],
    };
    const globalOptions = [
      ['--color', 'false'], ['--dry-run'], ['-n'], ['--help'], ['-h'], ['--keep-going'], ['-k'],
      ['--no-pager'], ['--no-tty'], ['--source-path'], ['--use-builtin-diff'], ['--verbose'],
      ['-v'],
    ];

    it.for(Object.entries(ownOptions).flatMap(([command, options]) =>
      [...options, ...globalOptions].map(option => ({
        args: [command, ...option], name: `${command} ${option.join(' ')}`,
      }))))(
      'runs $name', ({ args }, { expect }) => {
        assertRunsAsGiven(expect, args);
      },
    );
  });
});
