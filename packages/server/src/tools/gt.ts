/*
 * Security design:
 *
 * - gt command position: gt reads global flags before the command as well as
 *   after it, so the command must come first, or flags ahead of it would hide
 *   it from the allowlist. An unknown first word is rejected rather than
 *   passed on, since gt runs any installed `gt-NAME` extension as `gt NAME`.
 *   Built-in commands win over user aliases, so a canonical name always
 *   means the built-in.
 * - gt flag allowlisting: each command's flags come from its `--help`, read
 *   as pflag reads them: names match exactly, since pflag reads no
 *   abbreviations, and each letter of a short group is checked until one
 *   that takes a value. A flag a later gt adds is refused until listed.
 * - gt hosts: a URL in `--repo` or a positional selects its instance, and
 *   gt refuses an instance it holds no account for, sending nothing; it
 *   sends `GITEA_TOKEN` only to the instance `GITEA_CLI_HOST` or
 *   `GITEA_INSTANCE_URL` names. So neither needs blocking, unlike gh's.
 * - gt --jq filters: held to the same names check as the jq tool, since gt's
 *   embedded jq reads the server's environment through `env` and `$ENV`.
 * - gt api path allowlisting: the same checks as gh api, with
 *   `--method GET` injected after the endpoint. Left out of its flags:
 *   `--method`/`-X`, the body flags `-f`/`--raw-field`, `-F`/`--field` and
 *   `--input` (which switch the method to POST, and `-F`/`--input` read a
 *   file or stdin), `-H`/`--header`, `--output-file` (writes the response to
 *   a file), `--verbose` (prints request headers; a token login's
 *   `Authorization` is not yet shown redacted) and `--dry-run` (prints the
 *   request unsent). `.` and `..` segments, plain or percent-encoded, are
 *   rejected: `contents/**` and `raw/**` take any depth, so a dot segment
 *   could climb out to an unlisted endpoint. Endpoints containing `#` are
 *   rejected: the URL parser cuts the path at the fragment, so
 *   `repos/admin#/x/contents/y` would request `repos/admin`. Query keys are
 *   allowlisted to those the allowed paths read: Gitea reads a `sudo` query
 *   parameter as the Sudo header, which would send an administrator token's
 *   request as another user.
 *
 * Accepted risks (auto-allow surface area):
 *
 * - gt on Forgejo: Forgejo echoes a rejected token in its error body
 *   (`access token does not exist [sha: …]`), so a call made with a revoked
 *   token prints the credential. No flag causes it, so no flag check can
 *   stop it.
 *
 * Excluded by design:
 *
 * - `gt auth token`: prints the active account's token.
 * - `gt auth git-credential`: a git credential helper, whose protocol answers
 *   with the token on stdout. `gt auth --help` does not list it.
 * - `gt notification`: not yet confirmed to leave read state untouched.
 * - Left out of gt's flag allowlist: `--cwd` (acts as a `cwd` parameter),
 *   `--sudo` (requests as another user), `--debug` (request log not yet
 *   shown to leave credentials out), `--interactive` (allows prompts),
 *   `--web`/`-w` (opens a browser), `--select` (an interactive picker that
 *   acts on its pick), `pr checks --watch` and `run logs --follow` (poll
 *   until CI finishes), and `run logs --output`/`--dir` (write a file).
 */
import {
  ArgsSchema, checkApiEndpoint, rejectApiEndpoint, rejectJqFilter, rejectSubcommand,
  rejectUnlistedFlags,
} from '#src/lib/allowlist.js';
import { giteaQueryKeys } from '#src/lib/gitea.js';
import { type Plan, run } from '#src/lib/plan.js';
import { defineTool } from '#src/lib/tool.js';

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

/*
 * --method / -X overrides the GET injected in planAllowedApi; --raw-field /
 * -f, --field / -F and --input send a request body, which switches the method
 * to POST, and -F @FILE and --input also read a file or stdin; --header / -H
 * injects a header; --output-file writes the response to a new file;
 * --verbose prints the request headers, a token login's Authorization
 * unconfirmed as redacted; --dry-run prints the request instead of sending it.
 */
const apiFlags = new Set([
  ...sharedFlags, '--include', '-i', '--jq=', '-q=', '--max-pages=', '--paginate', '--silent',
  '--slurp', ...repoFlags,
]);

// gt fills {owner}, {repo} and {branch} from the checkout; `*` matches them as literal segments.
const apiPaths = [
  /*
   * Forgejo answers gt run view's jobs request with a bare array that gt
   * cannot parse, so its runs are read here. runs maps the web UI's run
   * number (index_in_repo) to the API id.
   */
  'repos/*/*/actions/jobs/*/logs',
  'repos/*/*/actions/runs',
  'repos/*/*/actions/runs/*/jobs',
  'repos/*/*/commits/*/status',
  'repos/*/*/commits/*/statuses',
  /*
   * Bare = directory listing, ** = file or nested path. Files come back as
   * base64 in JSON; raw/** serves them as plain text.
   */
  'repos/*/*/contents',
  'repos/*/*/contents/**',
  'repos/*/*/pulls/*/reviews',
  'repos/*/*/pulls/*/reviews/*/comments',
  'repos/*/*/raw/**',
  // Authenticated viewer identity. Single segment, so user/repos stays blocked.
  'user',
];

/*
 * Inject --method GET immediately after the endpoint, before any
 * user-supplied flags, so a `--` in user args cannot turn it positional.
 */
const planEndpoint = (
  args: readonly string[], endpoint: string, rest: readonly string[],
): Plan =>
  checkApiEndpoint(endpoint, apiPaths, giteaQueryKeys) ??
  rejectUnlistedFlags(rest, apiFlags) ??
  rejectJqFilter(args, 'gt') ??
  run('gt', ['api', endpoint, '--method', 'GET', ...rest]);

// The endpoint must come first, so a flag cannot stand in its place.
const planApi = (args: readonly string[]): Plan => {
  const [, endpoint, ...rest] = args;
  return endpoint && !endpoint.startsWith('-')
    ? planEndpoint(args, endpoint, rest)
    : rejectApiEndpoint(endpoint, apiPaths);
};

export const plan = (args: readonly string[]): Plan => {
  const [only, ...rest] = args;
  const isStandalone = only !== undefined && rest.length === 0 && standaloneFlags.has(only);
  if (isStandalone) return run('gt', args);
  if (only === 'api') return planApi(args);
  /*
   * gt reads global flags before the command too, but the command must come
   * first: flags ahead of it would hide it from the allowlist.
   */
  const command = commandOf(args);
  return command === undefined
    ? rejectSubcommand(args, subcommands)
    : planCommand(args, command);
};

export const tool = defineTool({
  description: 'Run read-only Gitea/Forgejo CLI (gt) commands (--version, --help, auth ' +
    'status, branch list, commit compare/diff/list/pr/status/view, issue list/view, label ' +
    'list, milestone list, pr checks/diff/list/status/timeline/view, pr review ' +
    'comments/list/view, release list/view, repo list/view, run jobs/list/logs/view, ' +
    'schema, search issue/pr/repo, version, workflow list/view, api GET: actions ' +
    'runs+jobs+job logs, pulls/reviews, commits/status+statuses, contents, raw, user). ' +
    'The command, and the api endpoint, come before any flags. Flags are allowlisted ' +
    'per command from its --help. On Forgejo, where gt run view fails, read runs through ' +
    'api actions/runs.',
  inputSchema: ArgsSchema,
  name: 'gt',
  plan: ({ args }) => plan(args),
});
