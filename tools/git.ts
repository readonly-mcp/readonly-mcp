import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ArgsSchema, type Rejection, rejectBlockedFlags, rejectSubcommand,
} from '../lib/allowlist.ts';
import { exec, fail } from '../lib/exec.ts';

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

// Block -o short flag on diff only: standalone (-o), concatenated (-ofile),
// or combined with other short flags (-ao, -abo/tmp/evil.txt).
// Only diff has --output; other commands use -o for unrelated flags
// (e.g., ls-files -o = --others).
const rejectShortOutput = (args: readonly string[]): Rejection => {
  const shortO = args.slice(1).find(arg =>
    arg.startsWith('-') && !arg.startsWith('--') && arg !== '-' &&
    (arg.slice(1).split('=', 1)[0] ?? arg.slice(1)).includes('o'),
  );
  return shortO ? fail(`Flag not allowed: ${shortO}`) : undefined;
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
