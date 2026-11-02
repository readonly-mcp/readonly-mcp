import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import { type Call, type Server, assertNotBlocked, textOf, useServer } from '#test/helpers.js';

const run = promisify(execFile);

interface Repo extends AsyncDisposable {
  readonly git: (...args: string[]) => Promise<string>;
  readonly path: string;
  readonly side: string;
}

// An identity, and no signing, so commits don't depend on the developer's config.
const commitConfig = [
  '-c', 'user.name=readonly-mcp', '-c', 'user.email=readonly-mcp@example.com',
  '-c', 'commit.gpgsign=false',
];

/**
 * A throwaway repository with two commits on `main`, a `side` branch at the
 * first, and an `origin/main` remote-tracking ref, removed on disposal.
 */
const createRepo = async (): Promise<Repo> => {
  const repoPath = await mkdtemp(path.join(tmpdir(), 'readonly-mcp-branch-'));
  const git = async (...args: string[]) => {
    const { stdout } = await run('git', ['-C', repoPath, ...commitConfig, ...args]);
    return stdout;
  };
  const side = build.branchName();
  await git('init', '--quiet', '--initial-branch=main');
  await git('commit', '--quiet', '--no-verify', '--allow-empty', '--message=first');
  await git('commit', '--quiet', '--no-verify', '--allow-empty', '--message=second');
  await git('branch', side, 'HEAD~1');
  await git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return {
    git,
    path: repoPath,
    side,
    // Windows holds the directory briefly after the server, whose cwd it is, exits.
    [Symbol.asyncDispose]: () => rm(repoPath, { force: true, maxRetries: 5, recursive: true }),
  };
};

// Every ref with its target, then the repository's own config.
const stateOf = async (repo: Repo): Promise<string> =>
  await repo.git('for-each-ref', '--format=%(refname) %(objectname)') +
  await repo.git('config', '--local', '--list');

const integration = it.extend<{ call: Call; repo: Repo; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('git', { args })),
  repo: [async ({}, use) => {
    await using repo = await createRepo();
    await use(repo);
  }, { scope: 'file' }],
  server: [async ({ repo }, use) => useServer(use, { cwd: repo.path }), { scope: 'file' }],
});

/*
 * The hook builds the repository and starts the server in it, which can
 * outlast the default hook timeout when the whole suite runs at once.
 */
const setupTimeout = 30_000;

// Sequential: each test compares the shared repository before and after.
describe('git branch list mode (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize(), setupTimeout);

  integration.for<{ attack: (side: string) => string[]; name: string }>([
    { attack: () => [build.branchName()], name: 'a bare name creates a branch' },
    { attack: side => ['-f', side, 'main'], name: '-f force-moves a branch' },
    { attack: side => ['-t', build.branchName(), side], name: '-t creates a tracking branch' },
    { attack: side => ['-u', 'main', side], name: '-u sets an upstream' },
    { attack: () => ['-rd', 'origin/main'], name: '-rd deletes a remote-tracking ref' },
    { attack: side => ['-vD', side], name: '-vD deletes a branch' },
    { attack: () => ['--no-list', build.branchName()], name: '--no-list leaves list mode' },
    { attack: () => ['--no-l', build.branchName()], name: '--no-l abbreviates --no-list' },
  ])('leaves refs and config unchanged: $name', async ({ attack }, { call, expect, repo }) => {
    const before = await stateOf(repo);
    await call(['branch', ...attack(repo.side)]);

    expect(await stateOf(repo)).toBe(before);
  });

  integration('lists branches matching a positional pattern', async ({ call, expect, repo }) => {
    const result = await call(['branch', repo.side]);

    assertNotBlocked(expect, result);

    expect(textOf(result)).toContain(repo.side);
  });

  integration('shows the current branch', async ({ call, expect }) => {
    const result = await call(['branch', '--show-current']);

    expect(textOf(result).trim()).toBe('main');
  });
});
