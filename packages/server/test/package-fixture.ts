/**
 * A throwaway package project for integration tests that run a package
 * manager against the server's working directory.
 *
 * Commands like `npm ls` and `pnpm store status` walk the whole dependency
 * tree, so run against this repository they take as long as its dev toolchain
 * is large, and every added dev dependency pushes them closer to the test
 * timeout. A project holding one dependency keeps their cost flat.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { type Server, useServer } from '#test/helpers.js';

const run = promisify(execFile);

const require = createRequire(import.meta.url);

/*
 * The dependency the tests name (`npm explain zod`, `pnpm why zod`), pinned to
 * the version this repository resolved, so the install is reproducible and a
 * package manager whose cache already holds it skips the download.
 */
const dependency = 'zod';
const { version } = z.object({ version: z.string() }).parse(require(`${dependency}/package.json`));

/*
 * In CI pnpm defaults to --frozen-lockfile, which refuses a project with no
 * lockfile. The audit and funding requests fetch reports no test reads.
 */
const installArgs = {
  npm: ['install', '--no-audit', '--no-fund'],
  pnpm: ['install', '--no-frozen-lockfile'],
} satisfies Record<string, readonly string[]>;

/*
 * Both managers are .cmd shims on Windows, which execFile cannot launch.
 * Route through bash as lib/exec.ts's execShell does, rather than a shell
 * that would concatenate the arguments.
 */
const shimmed = (cmd: string, args: readonly string[]): [string, string[]] =>
  process.platform === 'win32'
    ? ['bash', ['-c', 'exec "$@"', '--', cmd, ...args]]
    : [cmd, [...args]];

export type PackageManager = keyof typeof installArgs;

export interface PackageFixture extends AsyncDisposable {
  readonly dir: string;
}

/**
 * Creates a project depending on zod and installs it with `manager`.
 */
export const createPackageFixture = async (manager: PackageManager): Promise<PackageFixture> => {
  const dir = await mkdtemp(path.join(tmpdir(), `readonly-mcp-${manager}-`));
  const fixture: PackageFixture = {
    dir,
    [Symbol.asyncDispose]: () => rm(dir, { force: true, maxRetries: 3, recursive: true }),
  };
  try {
    const manifest = { name: 'fixture', private: true, dependencies: { [dependency]: version } };
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest));
    await run(...shimmed(manager, installArgs[manager]), { cwd: dir });
    return fixture;
  } catch (error) {
    await fixture[Symbol.asyncDispose]();
    throw error;
  }
};

/**
 * The body of a `server` fixture running in a {@link PackageFixture}
 * installed by `manager`, as {@link useServer} is for the repository.
 */
export const usePackageServer = async (
  manager: PackageManager, use: (server: Server) => Promise<void>,
) => {
  await using project = await createPackageFixture(manager);
  await useServer(use, { cwd: project.dir });
};
