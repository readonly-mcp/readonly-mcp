import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ArgsSchema, rejectBlockedFlags, rejectSubcommand } from '../lib/allowlist.ts';
import { exec, fail } from '../lib/exec.ts';

const subcommands = new Set([
  'blame', 'branch', 'describe', 'diff', 'log', 'ls-files', 'ls-tree',
  'merge-base', 'reflog', 'remote', 'rev-parse', 'shortlog', 'show',
  'stash', 'status', 'worktree',
]);

// --no-index: reads arbitrary files outside the repo
// --output / -o: writes command output to a file (checked via startsWith below)
const blockedFlags = new Set(['--no-index', '--output']);

const branchBlocked = new Set([
  '-D', '-d', '-m', '-M', '-c', '-C',
  '--delete', '--move', '--copy', '--edit-description',
  '--set-upstream-to', '--unset-upstream', '--force',
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

/** Return resolved paths for every worktree known to this repo. */
const getWorktreePaths = (): string[] => {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      timeout: 5000,
    }).toString();
    return out
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => resolve(line.slice('worktree '.length).trim()));
  } catch {
    return [];
  }
};

const isKnownWorktree = (dir: string): boolean => {
  const target = resolve(dir);
  return getWorktreePaths().some(wt =>
    isWindows ? wt.toLowerCase() === target.toLowerCase() : wt === target,
  );
};

const GitSchema = {
  ...ArgsSchema,
  cwd: z.string().min(1).optional()
    .describe('Working directory (must be a git worktree of this repo). Pass when operating from a linked worktree.'),
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'git',
    {
      description: 'Run read-only git commands (blame, branch, describe, diff, log, ls-files, ls-tree, merge-base, reflog, remote, rev-parse, shortlog, show, stash, status, worktree). Pass cwd when operating from a linked worktree.',
      inputSchema: GitSchema,
    },
    async ({ args, cwd }) => {
      const sub = args[0];
      if (sub === undefined || !subcommands.has(sub)) return rejectSubcommand(args, subcommands);
      // Block -o short flag on diff only: standalone (-o), concatenated (-ofile),
      // or combined with other short flags (-ao, -abo/tmp/evil.txt).
      // Only diff has --output; other commands use -o for unrelated flags
      // (e.g., ls-files -o = --others).
      if (sub === 'diff') {
        const shortO = args.slice(1).find(arg =>
          arg.startsWith('-') && !arg.startsWith('--') && arg !== '-' &&
          [...(arg.slice(1).split('=', 1)[0] ?? arg.slice(1))].includes('o'),
        );
        if (shortO) return fail(`Flag not allowed: ${shortO}`);
      }
      // Block --output and --no-index with prefix matching (defeats abbreviation)
      const globalRejected = rejectBlockedFlags(args, blockedFlags);
      if (globalRejected) return globalRejected;
      if (sub === 'branch') {
        const rejected = rejectBlockedFlags(args, branchBlocked);
        if (rejected) return rejected;
      }
      if (sub === 'stash') {
        let stashSub: string | undefined;
        for (const arg of args.slice(1)) {
          if (arg === '--') break;
          if (!arg.startsWith('-')) { stashSub = arg; break; }
        }
        if (!stashSub || !stashAllowedSubs.has(stashSub))
          return fail(`Subcommand not allowed for git stash: ${stashSub ?? '(none)'}. Allowed: ${[...stashAllowedSubs].join(', ')}`);
      }
      if (sub === 'worktree') {
        let wSub: string | undefined;
        for (const arg of args.slice(1)) {
          if (arg === '--') break;
          if (!arg.startsWith('-')) { wSub = arg; break; }
        }
        if (!wSub || !worktreeAllowedSubs.has(wSub))
          return fail(`Subcommand not allowed for git worktree: ${wSub ?? '(none)'}. Allowed: ${[...worktreeAllowedSubs].join(', ')}`);
      }
      if (sub === 'reflog') {
        let rSub: string | undefined;
        for (const arg of args.slice(1)) {
          if (arg === '--') break;
          if (!arg.startsWith('-')) { rSub = arg; break; }
        }
        // Bare `git reflog` is safe (equivalent to `git reflog show`)
        if (rSub && !reflogAllowedSubs.has(rSub))
          return fail(`Subcommand not allowed for git reflog: ${rSub}. Allowed: (none), ${[...reflogAllowedSubs].join(', ')}`);
      }
      if (sub === 'remote') {
        const remoteArgs = args.slice(1);
        const remoteSub = remoteArgs.find(arg => !arg.startsWith('-'));
        if (remoteSub && !remoteAllowedSubs.has(remoteSub))
          return fail(`Subcommand not allowed for git remote: ${remoteSub}. Allowed: (none), ${[...remoteAllowedSubs].join(', ')}`);
        // `remote show` requires `-n` to prevent network I/O (SSRF risk)
        if (remoteSub === 'show' && !remoteArgs.includes('-n'))
          return fail('git remote show requires -n (no network I/O)');
        const blockedFlag = remoteArgs.filter(arg => arg.startsWith('-')).find(arg => !remoteAllowedFlags.has(arg));
        if (blockedFlag) return fail(`Flag not allowed for git remote: ${blockedFlag}`);
      }
      // Inject --no-pager to prevent interactive pager from blocking the process.
      // If a valid worktree cwd was given, inject -C <dir> to target that worktree.
      const gitArgs = ['--no-pager'];
      if (cwd) {
        if (!isKnownWorktree(cwd)) return fail('cwd rejected: not a known git worktree');
        gitArgs.push('-C', cwd);
      }
      gitArgs.push(...args);
      return exec('git', gitArgs);
    },
  );
