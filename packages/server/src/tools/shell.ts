/*
 * Accepted risks (auto-allow surface area):
 *
 * - Shell metadata commands (`ls`, `stat`, `readlink`, `realpath`, `wc`, `file`,
 *   `eza`): accept arbitrary path arguments and can enumerate filesystem metadata
 *   (directory listings, permissions, symlink targets, line/byte counts) outside
 *   the working directory. They cannot read file contents — `cat`/`head`/`tail`
 *   are excluded for that reason. The host's `Read` tool with its own permission
 *   prompts is the content-read boundary.
 * - `jq --jsonargs` / `--args`: not handled by the file-path validator, which
 *   may false-positive on legitimate uses. The error direction is safe (blocks
 *   rather than allows). These flags are uncommon in MCP agent usage.
 *
 * Excluded by design:
 *
 * - `printenv` / `env`: leaks environment variables (API keys, tokens).
 * - `rg`: redundant with host `Grep` tool; allows searching arbitrary paths.
 * - `cat`, `head`, `tail`, `bat`, `diff`, `delta`: redundant with host `Read`
 *   tool; accepting path args would duplicate file-read surface area.
 */
import { z } from 'zod';
import { ArgsSchema, findBlockedJqName } from '#src/lib/allowlist.js';
import { type Plan, type Rejection, reject, run } from '#src/lib/plan.js';
import { defineTool } from '#src/lib/tool.js';

const commands = new Set([
  'basename', 'date', 'dirname', 'eza', 'file', 'jq', 'ls', 'pwd',
  'readlink', 'realpath', 'stat', 'wc', 'which', 'whoami',
]);

/*
 * The jq options allowed, from `jq --help` (jq 1.8), each with the number of
 * args it spans: the flag plus its values. Every other option is rejected,
 * among them the file readers (-f, -L, --slurpfile, --rawfile), hidden ones
 * such as --run-tests, which prints a file's lines as failing tests, and the
 * `--name=value` form, which jq does not parse. jq matches long names
 * exactly, so no abbreviation can reach an option outside this list.
 */
const flagOnly = 1;
const flagAndValue = 2;
const flagAndPair = 3;
const jqLongOptions = new Map([
  ['--arg', flagAndPair], ['--argjson', flagAndPair], ['--args', flagOnly],
  ['--ascii-output', flagOnly], ['--binary', flagOnly], ['--color-output', flagOnly],
  ['--compact-output', flagOnly], ['--exit-status', flagOnly], ['--help', flagOnly],
  ['--indent', flagAndValue], ['--join-output', flagOnly], ['--jsonargs', flagOnly],
  ['--monochrome-output', flagOnly], ['--null-input', flagOnly], ['--raw-input', flagOnly],
  ['--raw-output', flagOnly], ['--raw-output0', flagOnly], ['--seq', flagOnly],
  ['--slurp', flagOnly], ['--sort-keys', flagOnly], ['--stream', flagOnly],
  ['--stream-errors', flagOnly], ['--tab', flagOnly], ['--unbuffered', flagOnly],
  ['--version', flagOnly],
]);

// One or more of jq's short options, none of which takes a value (-n, -nrc)
const jqShortOptions = /^-[CMRSVabcehjnrs]+$/v;

/*
 * jq reads an arg as an option only when a letter, a second dash, or nothing
 * follows its dash (its isoptish check). Anything else dash-led, such as -1
 * or -(1), is a filter or file, so it must be checked as one.
 */
const isJqOption = (arg: string): boolean => /^-(?:[a-zA-Z\-]|$)/v.test(arg);

/*
 * The first positional is the filter; any after it is a file path. The
 * filter's module names are checked because jq still loads from its
 * default search path when -L is blocked.
 */
const rejectPositional = (arg: string, hasFilter: boolean): Rejection => {
  if (hasFilter)
    return reject(`File arguments not allowed for jq (use stdin via piping). Got: ${arg}`);
  const name = findBlockedJqName(arg);
  return name ? reject(`Filter may not use ${name} for jq`) : undefined;
};

/*
 * Walks the args, stepping over each option's values (like --arg k v). The
 * first positional is the filter expression; any positional after it is a
 * file path. After `--`, jq reads every arg as a positional, dash-led or not.
 */
const validateJqArgs = (args: readonly string[]): Rejection => {
  const step = (index: number, hasFilter: boolean, isPastOptions: boolean): Rejection => {
    // Past the end, whether by one or by a skipped option value.
    const arg = args[index];
    if (arg === undefined) return undefined;
    if (isPastOptions || !isJqOption(arg))
      return rejectPositional(arg, hasFilter) ?? step(index + 1, true, isPastOptions);
    if (arg === '--') return step(index + 1, hasFilter, true);
    const span = jqShortOptions.test(arg) ? flagOnly : jqLongOptions.get(arg);
    return span === undefined
      ? reject(`Flag not allowed for jq: ${arg}`)
      : step(index + span, hasFilter, false);
  };
  return step(0, false, false);
};

export const plan = (command: string, args: readonly string[]): Plan => {
  if (!commands.has(command))
    return reject(`Command not allowed: ${command}. Allowed: ${[...commands].join(', ')}`);
  return (command === 'jq' ? validateJqArgs(args) : undefined) ??
    run(command, args, { runner: 'shell' });
};

export const tool = defineTool({
  description: 'Run read-only shell utilities (basename, date, dirname, eza, file, jq, ls, ' +
    'pwd, readlink, realpath, stat, wc, which, whoami)',
  inputSchema: {
    command: z.string().describe('Command name from the allowlist'),
    ...ArgsSchema,
  },
  name: 'shell',
  plan: ({ command, args }) => plan(command, args),
});
