import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ArgsSchema, type Rejection, rejectBlockedFlags, rejectSubcommand, shortFlags,
} from '#src/lib/allowlist.js';
import { exec, fail } from '#src/lib/exec.js';

const subcommands = new Set([
  'blame', 'branch', 'describe', 'diff', 'log', 'ls-files', 'ls-tree',
  'merge-base', 'reflog', 'remote', 'rev-parse', 'shortlog', 'show',
  'stash', 'status', 'worktree',
]);

// --no-index: reads arbitrary files outside the repo
// --output / -o: writes command output to a file (checked via startsWith below)
const blockedFlags = new Set(['--no-index', '--output']);

/*
 * A second layer: withListMode is what keeps branch from writing, since git
 * refuses these modes alongside --list. --no-list is the entry it relies on,
 * because it would undo the injected --list.
 */
const branchBlocked = new Set([
  '-D', '-d', '-m', '-M', '-c', '-C',
  '--delete', '--move', '--copy', '--edit-description',
  '--set-upstream-to', '--unset-upstream', '--force', '--no-list',
]);

/*
 * The blame options allowed: those `git blame -h` lists (git 2.54), and the
 * rev-list options blame's manual documents, which only shape the read
 * (--reverse, --first-parent, --date, --encoding and the date limits).
 * Every other option is rejected, among them the file readers --contents,
 * --ignore-revs-file and -S, and rev-list's --stdin. Each long option maps
 * to whether it takes a value, given after `=` or as the next arg;
 * `optional` takes one only after `=`. Long names must match exactly, since
 * git expands an abbreviation it can resolve.
 */
type BlameValue = 'none' | 'optional' | 'required';
const blameLongOptions = new Map<string, BlameValue>([
  ['--abbrev', 'optional'], ['--after', 'required'], ['--before', 'required'],
  ['--color-by-age', 'none'], ['--color-lines', 'none'], ['--date', 'required'],
  ['--diff-algorithm', 'required'], ['--encoding', 'required'], ['--first-parent', 'none'],
  ['--ignore-rev', 'required'], ['--incremental', 'none'], ['--line-porcelain', 'none'],
  ['--no-abbrev', 'none'],
  ['--no-color-by-age', 'none'], ['--no-color-lines', 'none'], ['--no-ignore-rev', 'none'],
  ['--no-incremental', 'none'], ['--no-line-porcelain', 'none'], ['--no-porcelain', 'none'],
  ['--no-progress', 'none'], ['--no-root', 'none'], ['--no-score-debug', 'none'],
  ['--no-show-email', 'none'], ['--no-show-name', 'none'], ['--no-show-number', 'none'],
  ['--no-show-stats', 'none'], ['--porcelain', 'none'], ['--progress', 'none'],
  ['--reverse', 'none'], ['--root', 'none'], ['--score-debug', 'none'],
  ['--show-email', 'none'], ['--show-name', 'none'], ['--show-number', 'none'],
  ['--show-stats', 'none'], ['--since', 'required'], ['--until', 'required'],
]);

// blame's short flags; -L, -C and -M take the rest of their group as a value.
const blameShortFlags = new Set([
  'C', 'L', 'M', 'b', 'c', 'e', 'f', 'h', 'l', 'n', 'p', 's', 't', 'w',
]);
const blameShortValueFlags = new Set(['C', 'L', 'M']);

// How many args an allowed option spans: itself, or itself and its value.
const optionOnly = 1;
const optionAndValue = 2;

const blameLongOptionSpan = (arg: string): number | undefined => {
  const equals = arg.indexOf('=');
  const hasValue = equals !== -1;
  const takes = blameLongOptions.get(hasValue ? arg.slice(0, equals) : arg);
  if (takes === undefined || (hasValue && takes === 'none')) return undefined;
  return takes === 'required' && !hasValue ? optionAndValue : optionOnly;
};

const blameShortOptionSpan = (arg: string): number | undefined => {
  const { flags, value } = shortFlags(arg, blameShortValueFlags);
  if (flags.some(flag => !blameShortFlags.has(flag))) return undefined;
  // A group that ends on -L, with no range left after it, takes the next arg.
  const isRangeNext = flags.at(-1) === 'L' && value === '';
  return isRangeNext ? optionAndValue : optionOnly;
};

/*
 * How many args an allowed blame option spans: two when its value is the
 * next arg (-L 1,5, --ignore-rev HEAD), or undefined when it is not allowed.
 */
const blameOptionSpan = (arg: string): number | undefined =>
  arg.startsWith('--') ? blameLongOptionSpan(arg) : blameShortOptionSpan(arg);

// Only these sub-subcommands (or none) are allowed for `git stash`
const stashAllowedSubs = new Set(['list', 'show']);

// Only `list` is allowed for `git worktree` (mutating: add, remove, move, etc.)
const worktreeAllowedSubs = new Set(['list']);

// `show` and `exists` are allowed for `git reflog`; bare is also safe (= show)
const reflogAllowedSubs = new Set(['show', 'exists']);

// Only these sub-subcommands (or none) are allowed for `git remote`
const remoteAllowedSubs = new Set(['get-url', 'show']);

// Only these flags are allowed for `git remote` (bare listing and get-url/show)
// `-n` is required for `show` to prevent network I/O (SSRF via malicious remotes)
const remoteAllowedFlags = new Set(['-v', '--verbose', '--push', '--all', '-n']);

const isWindows = process.platform === 'win32';

/**
 * Return resolved paths for every worktree known to this repo.
 */
const getWorktreePaths = (): string[] => {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      timeout: 5000,
    }).toString();
    return out
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => path.resolve(line.slice('worktree '.length).trim()));
  } catch {
    return [];
  }
};

const isKnownWorktree = (dir: string): boolean => {
  const target = path.resolve(dir);
  return getWorktreePaths().some(wt =>
    isWindows ? wt.toLowerCase() === target.toLowerCase() : wt === target,
  );
};

/**
 * The first arg that is not a flag, or undefined when none comes before the
 * end of options (`--`).
 */
const firstPositional = (args: readonly string[]): string | undefined => {
  const end = args.indexOf('--');
  return args.slice(0, end === -1 ? undefined : end).find(arg => !arg.startsWith('-'));
};

const rejectCwd = (cwd: string | undefined): Rejection =>
  cwd === undefined || isKnownWorktree(cwd)
    ? undefined
    : fail('cwd rejected: not a known git worktree');

/*
 * Block -o short flag on diff only: standalone (-o), concatenated (-ofile),
 * or combined with other short flags (-ao, -abo/tmp/evil.txt). No flag ends
 * the group early, so an o anywhere before `=` is rejected, value or not.
 * Only diff has --output; other commands use -o for unrelated flags
 * (e.g., ls-files -o = --others).
 */
const noValueFlags: ReadonlySet<string> = new Set();
const rejectShortOutput = (args: readonly string[]): Rejection => {
  const shortO = args.slice(1).find(arg =>
    shortFlags(arg.split('=', 1)[0] ?? arg, noValueFlags).flags.includes('o'),
  );
  return shortO ? fail(`Flag not allowed: ${shortO}`) : undefined;
};

/*
 * Walks blame's args, stepping over each option's value. Positionals (the
 * revision and the file) pass, and so does everything after `--`.
 */
const rejectBlameArgs = (args: readonly string[]): Rejection => {
  const step = (index: number): Rejection => {
    const arg = args[index];
    if (arg === undefined || arg === '--') return undefined;
    if (arg === '-' || !arg.startsWith('-')) return step(index + 1);
    const span = blameOptionSpan(arg);
    return span === undefined
      ? fail(`Flag not allowed for git blame: ${arg}`)
      : step(index + span);
  };
  return step(1);
};

/**
 * Allows only the listed subcommands under `git <sub>`, and a bare call only
 * when `isBareAllowed`.
 */
const allowSubcommands = (
  sub: string, allowedSubs: ReadonlySet<string>, { isBareAllowed = false } = {},
) => (args: readonly string[]): Rejection => {
  const subSub = firstPositional(args.slice(1));
  if (subSub ? allowedSubs.has(subSub) : isBareAllowed) return undefined;
  const allowed = [...isBareAllowed ? ['(none)'] : [], ...allowedSubs].join(', ');
  return fail(`Subcommand not allowed for git ${sub}: ${subSub ?? '(none)'}. ` +
    `Allowed: ${allowed}`);
};

const rejectRemoteFlags = (args: readonly string[]): Rejection => {
  const remoteArgs = args.slice(1);
  // `remote show` requires `-n` to prevent network I/O (SSRF risk)
  if (firstPositional(remoteArgs) === 'show' && !remoteArgs.includes('-n'))
    return fail('git remote show requires -n (no network I/O)');
  const blockedFlag = remoteArgs
    .filter(arg => arg.startsWith('-'))
    .find(arg => !remoteAllowedFlags.has(arg));
  return blockedFlag ? fail(`Flag not allowed for git remote: ${blockedFlag}`) : undefined;
};

const allowRemoteSubcommands =
  allowSubcommands('remote', remoteAllowedSubs, { isBareAllowed: true });

// Checks a subcommand runs after the global flags pass.
const subcommandChecks: Record<string, (args: readonly string[]) => Rejection> = {
  blame: rejectBlameArgs,
  branch: args => rejectBlockedFlags(args, branchBlocked),
  diff: rejectShortOutput,
  // Bare `git reflog` is safe (equivalent to `git reflog show`)
  reflog: allowSubcommands('reflog', reflogAllowedSubs, { isBareAllowed: true }),
  remote: args => allowRemoteSubcommands(args) ?? rejectRemoteFlags(args),
  stash: allowSubcommands('stash', stashAllowedSubs),
  worktree: allowSubcommands('worktree', worktreeAllowedSubs),
};

/**
 * Puts `git branch` in list mode, injected before the caller's args. git
 * then refuses every mode that writes (delete, move, copy, set-upstream)
 * and reads positionals as patterns, not names to create, so a short-flag
 * group or flag the denylist misses still cannot change a ref. Only a lone
 * --show-current, a read-only mode git will not combine with --list, runs
 * as given.
 */
const withListMode = (args: readonly string[]): readonly string[] => {
  const [sub, ...rest] = args;
  const isShowCurrent = rest.length === 1 && rest[0] === '--show-current';
  return sub === 'branch' && !isShowCurrent ? [sub, '--list', ...rest] : args;
};

const GitSchema = {
  ...ArgsSchema,
  cwd: z.string().min(1).optional()
    .describe('Working directory (must be a git worktree of this repo). Pass when operating from ' +
      'a linked worktree.'),
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'git',
    {
      description: 'Run read-only git commands (blame, branch, describe, diff, log, ls-files, ' +
        'ls-tree, merge-base, reflog, remote, rev-parse, shortlog, show, stash, status, ' +
        'worktree). Pass cwd when operating from a linked worktree.',
      inputSchema: GitSchema,
    },
    async ({ args, cwd }) => {
      const sub = args[0];
      if (sub === undefined || !subcommands.has(sub)) return rejectSubcommand(args, subcommands);
      const rejected =
        // Block --output and --no-index with prefix matching (defeats abbreviation)
        rejectBlockedFlags(args, blockedFlags) ??
        subcommandChecks[sub]?.(args) ??
        rejectCwd(cwd);
      if (rejected) return rejected;
      // Inject --no-pager to prevent interactive pager from blocking the process.
      // If a valid worktree cwd was given, inject -C <dir> to target that worktree.
      const target = cwd ? ['-C', cwd] : [];
      return exec('git', ['--no-pager', ...target, ...withListMode(args)]);
    },
  );
