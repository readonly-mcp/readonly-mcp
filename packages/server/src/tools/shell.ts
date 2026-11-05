import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ArgsSchema, type Rejection, findBlockedJqName } from '#src/lib/allowlist.js';
import { execShell, fail } from '#src/lib/exec.js';

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
    return fail(`File arguments not allowed for jq (use stdin via piping). Got: ${arg}`);
  const name = findBlockedJqName(arg);
  return name ? fail(`Filter may not use ${name} for jq`) : undefined;
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
      ? fail(`Flag not allowed for jq: ${arg}`)
      : step(index + span, hasFilter, false);
  };
  return step(0, false, false);
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'shell',
    {
      description: 'Run read-only shell utilities (basename, date, dirname, eza, file, jq, ls, ' +
        'pwd, readlink, realpath, stat, wc, which, whoami)',
      inputSchema: {
        command: z.string().describe('Command name from the allowlist'),
        ...ArgsSchema,
      },
    },
    async ({ command, args }) => {
      if (!commands.has(command))
        return fail(`Command not allowed: ${command}. Allowed: ${[...commands].join(', ')}`);
      if (command === 'jq') {
        const rejection = validateJqArgs(args);
        if (rejection) return rejection;
      }
      return execShell(command, args);
    },
  );
