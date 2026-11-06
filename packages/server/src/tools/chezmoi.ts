import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArgsSchema, rejectSubcommand, shortFlags } from '#src/lib/allowlist.js';
import { runPlan } from '#src/lib/exec.js';
import { type Plan, type Rejection, reject, run } from '#src/lib/plan.js';

interface Options {
  readonly long: ReadonlySet<string>;
  // Short options by letter, without the dash.
  readonly short: ReadonlySet<string>;
}

const optionsOf = (long: readonly string[], short: readonly string[]): Options =>
  ({ long: new Set(long), short: new Set(short) });

/*
 * The options allowed: those `chezmoi <command> --help` lists for each
 * allowed command (chezmoi 2.70), and the global options that only shape
 * output. Every other option is rejected, among them --source/-S and
 * --config/-c, whose templates and hooks run commands; --pager, which runs
 * one; --init, which rewrites the config; the path writers --output/-o,
 * --cache and --persistent-state; --override-data and --override-data-file,
 * whose data a template may pass to a command; --destination/-D and
 * --working-tree/-W; --refresh-externals/-R, which fetches; and --debug.
 * chezmoi matches long names exactly, so no abbreviation reaches an option
 * outside these lists. Short letters and names are defined per command, so
 * each command allows only its own.
 */
const globalOptions = optionsOf(
  [
    '--color', '--dry-run', '--help', '--keep-going', '--no-pager', '--no-tty', '--source-path',
    '--use-builtin-diff', '--verbose',
  ],
  ['h', 'k', 'n', 'v'],
);

const commandOptions = new Map([
  ['diff', optionsOf(
    [
      '--exclude', '--include', '--parent-dirs', '--recursive', '--reverse', '--script-contents',
    ],
    ['P', 'i', 'r', 'x'],
  )],
  ['doctor', optionsOf(['--no-network'], [])],
  ['managed', optionsOf(
    ['--exclude', '--format', '--include', '--nul-path-separator', '--path-style', '--tree'],
    ['0', 'f', 'i', 'p', 't', 'x'],
  )],
  ['source-path', optionsOf([], [])],
  ['status', optionsOf(
    ['--exclude', '--include', '--parent-dirs', '--path-style', '--recursive'],
    ['P', 'i', 'p', 'r', 'x'],
  )],
  ['target-path', optionsOf([], [])],
  ['verify', optionsOf(
    ['--exclude', '--include', '--parent-dirs', '--recursive'],
    ['P', 'i', 'r', 'x'],
  )],
]);

const subcommands = new Set(commandOptions.keys());

/*
 * chezmoi defines short letters per command, so whether a letter takes the
 * rest of its group as a value cannot be known here. Every letter of a group
 * must be an allowed option of its own; a short value goes in its own arg.
 */
const isAllowedOption = (arg: string, own: Options): boolean => {
  if (arg.startsWith('--')) {
    const name = arg.split('=', 1)[0] ?? arg;
    return globalOptions.long.has(name) || own.long.has(name);
  }
  return shortFlags(arg).flags.every(flag => globalOptions.short.has(flag) || own.short.has(flag));
};

/*
 * A bare `-` names a target. `--` passes as itself, but it ends nothing:
 * pflag takes it as the value of an option that needs one and goes on
 * reading options.
 */
const isOption = (arg: string): boolean => arg.startsWith('-') && arg !== '-' && arg !== '--';

/*
 * Checks every dash-led arg, those after `--` included. Values are not
 * stepped over either, so a value that starts with a dash is checked as an
 * option, which rejects rather than allows.
 */
const rejectOptions = (args: readonly string[], own: Options): Rejection => {
  const option = args.slice(1).find(arg => isOption(arg) && !isAllowedOption(arg, own));
  return option === undefined ? undefined : reject(`Flag not allowed for chezmoi: ${option}`);
};

export const plan = (args: readonly string[]): Plan => {
  const own = commandOptions.get(args[0] ?? '');
  return own
    ? rejectOptions(args, own) ?? run('chezmoi', args)
    : rejectSubcommand(args, subcommands);
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'chezmoi',
    {
      description: 'Run read-only chezmoi commands (diff, doctor, managed, source-path, status, ' +
        'target-path, verify)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => runPlan(plan(args)),
  );
