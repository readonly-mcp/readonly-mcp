import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ArgsSchema, rejectJqFilter, rejectSubcommand, rejectUnlistedFlags,
} from '#src/lib/allowlist.js';
import { runPlan } from '#src/lib/exec.js';
import { type Plan, run } from '#src/lib/plan.js';

const standaloneFlags = new Set(['--help', '--version', '-h']);

/*
 * Flags are allowlisted per command, taken from each command's --help. A
 * trailing `=` marks a flag that takes a value, and `?` one whose value is
 * optional (probed: `--flag --help` prints help). gt reads no abbreviations,
 * and a flag gt adds later is refused until it is listed here.
 *
 * Left out of every command:
 * --cwd: repository discovery from a directory the caller picks
 * --debug: logs each request; left out until shown to omit credentials
 * --interactive: allows prompts with machine output
 * --select: an interactive picker that can act on the item it picks
 * --sudo: sends requests as another user, given an administrator account
 * --web / -w: opens a browser (on run list, -w is --workflow)
 */

// gt's global flags, which its help names on one line.
const sharedFlags = ['--help', '-h', '--host=', '--no-input', '--user='];
const repoFlags = ['--remote=', '--repo=', '-R='];
/*
 * --json and --csv take an optional value: gt takes the next arg as their
 * fields unless it starts with `-`, which it reads as a flag instead.
 */
const outputFlags = ['--csv?', '--jq=', '-q=', '--json?', '--template='];
const listFlags = ['--limit=', '-L=', '--page='];
const diffFlags = [
  '--color=', '--exclude=', '-e=', '--name-only', '--name-status', '--path=', '--stat',
];
const searchFlags = [
  '--assignee=', '--author=', '-A=', '--label=', '-l=', ...listFlags, '--mentions=',
  '--milestone=', '-m=', '--owner=', '--since=', '--state=', '-s=', '--team=', '--until=',
  ...repoFlags, ...outputFlags,
];
const viewFlags = [...repoFlags, ...outputFlags];

const commandFlags: Record<string, readonly string[]> = {
  'auth status': ['--verify', ...outputFlags],
  'branch list': [...listFlags, ...viewFlags],
  'commit compare': viewFlags,
  'commit diff': [...diffFlags, '--patch', ...repoFlags],
  'commit list': [...listFlags, '--not=', '--path=', ...viewFlags],
  'commit pr': viewFlags,
  'commit status': viewFlags,
  'commit view': viewFlags,
  'issue list': [
    '--assignee=', '-a=', '--author=', '-A=', '--kind=', '--label=', '-l=', ...listFlags,
    '--mentions=', '--milestone=', '-m=', '--no-assignee', '--search=', '-S=', '--since=',
    '--state=', '-s=', '--until=', ...viewFlags,
  ],
  'issue view': ['--comments', '-c', ...viewFlags],
  'label list': [...listFlags, '--order=', '--org=', '--search=', '-S=', '--sort=', ...viewFlags],
  'milestone list': [...listFlags, '--state=', '-s=', ...viewFlags],
  // --watch polls until the checks finish; --interval and --timeout pace it.
  'pr checks': ['--required', ...viewFlags],
  'pr diff': [...diffFlags, ...repoFlags],
  'pr list': [
    '--assignee=', '-a=', '--author=', '-A=', '--base=', '-B=', '--draft', '-d', '--head=',
    '-H=', '--label=', '-l=', ...listFlags, '--local', '--milestone=', '-m=', '--no-assignee',
    '--search=', '-S=', '--sort=', '--state=', '-s=', ...viewFlags,
  ],
  'pr review comments': [...listFlags, '--review=', ...viewFlags],
  'pr review list': [...listFlags, ...viewFlags],
  'pr review view': viewFlags,
  'pr status': ['--limit=', ...viewFlags],
  'pr timeline': [...listFlags, ...viewFlags],
  'pr view': ['--comments', '-c', ...viewFlags],
  'release list': [
    '--exclude-drafts', '--exclude-pre-releases', ...listFlags, '--order=', ...viewFlags,
  ],
  'release view': viewFlags,
  'repo list': [
    '--archived', '--language=', '-l=', ...listFlags, '--no-archived', '--starred', '--topic=',
    '--type=', '--visibility=', '--watched', ...outputFlags,
  ],
  'repo view': ['--branch=', '-b=', ...viewFlags],
  'run jobs': [...listFlags, ...viewFlags],
  'run list': [
    '--actor=', '-u=', '--branch=', '-b=', '--commit=', '-c=', '--event=', '-e=', ...listFlags,
    '--since=', '--status=', '-s=', '--until=', '--workflow=', '-w=', ...viewFlags,
  ],
  /*
   * --follow polls until the jobs complete, paced by --interval and
   * --timeout; --output and --dir download the logs as a ZIP archive, and
   * --clobber and --skip-existing only govern that download.
   */
  'run logs': ['--failed', '--job=', '-j=', '--tail=', '--timestamps', ...repoFlags],
  'run view': ['--job=', '-j=', '--log', '--log-failed', '--no-jobs', ...viewFlags],
  'schema': ['--jq=', '-q='],
  'search issue': searchFlags,
  'search pr': [...searchFlags, '--review-requested', '--reviewed'],
  'search repo': [
    '--archived', ...listFlags, '--order=', '--owner=', '--private', '--sort=', '--topic',
    '--type=', ...outputFlags,
  ],
  'version': [],
  'workflow list': viewFlags,
  'workflow view': ['--ref=', '-r=', '--yaml', ...viewFlags],
};

const subcommands = new Set(Object.keys(commandFlags));

const flagsOf = (command: string): ReadonlySet<string> =>
  new Set([...sharedFlags, ...commandFlags[command] ?? []]);

// The allowlisted command that args open with, longest first, since `pr review` has children.
const commandOf = (args: readonly string[]): string | undefined =>
  [...subcommands]
    .filter(command => command.split(' ').every((word, index) => args[index] === word))
    .toSorted((left, right) => right.length - left.length)[0];

const planCommand = (args: readonly string[], command: string): Plan =>
  rejectUnlistedFlags(args.slice(command.split(' ').length), flagsOf(command)) ??
  rejectJqFilter(args, 'gt') ??
  run('gt', args);

export const plan = (args: readonly string[]): Plan => {
  const [only, ...rest] = args;
  const isStandalone = only !== undefined && rest.length === 0 && standaloneFlags.has(only);
  if (isStandalone) return run('gt', args);
  /*
   * gt reads global flags before the command too, but the command must come
   * first: flags ahead of it would hide it from the allowlist.
   */
  const command = commandOf(args);
  return command === undefined
    ? rejectSubcommand(args, subcommands)
    : planCommand(args, command);
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'gt',
    {
      description: 'Run read-only Gitea/Forgejo CLI (gt) commands (--version, --help, auth ' +
        'status, branch list, commit compare/diff/list/pr/status/view, issue list/view, label ' +
        'list, milestone list, pr checks/diff/list/status/timeline/view, pr review ' +
        'comments/list/view, release list/view, repo list/view, run jobs/list/logs/view, ' +
        'schema, search issue/pr/repo, version, workflow list/view). The command comes ' +
        'before any flags. Flags are allowlisted per command from its --help.',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => runPlan(plan(args)),
  );
