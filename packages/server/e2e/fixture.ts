/**
 * The packed package as a consumer installs it: the tarball `pack:npm`
 * writes, installed into a throwaway project with its dependencies pinned,
 * and started through the `bin` shim npm links for it. The install follows
 * gtbuchanan/tooling's e2e fixtures.
 */

import type { SpawnSyncOptions } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import spawn from 'cross-spawn';
import { z } from 'zod';

const packageDir = path.resolve(import.meta.dirname, '..');
const tarballDir = path.join(packageDir, 'dist', 'packages', 'npm');

// The package's runtime dependencies, installed at the versions this workspace resolved.
const externalPackages = ['@modelcontextprotocol/sdk', 'zod'];

const locateTarball = (): string => {
  const tarballs = readdirSync(tarballDir).filter(entry => entry.endsWith('.tgz'));
  const [only] = tarballs;
  if (only === undefined || tarballs.length !== 1) {
    throw new Error(
      `Expected exactly one tarball in ${tarballDir}, found ${String(tarballs.length)}. ` +
      'Run `pnpm run pack` first.',
    );
  }
  return path.join(tarballDir, only);
};

/*
 * `name@version` as this workspace resolved it. Read from the install rather
 * than the manifest, whose specifier is a catalog reference; the package's own
 * `node_modules` holds it because this workspace sets `hoist: false`.
 */
const pinned = (name: string): string => {
  const manifestPath = path.join(packageDir, 'node_modules', name, 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { version } = z.object({ version: z.string() }).parse(parsed);
  return `${name}@${version}`;
};

const maxOutputBytes = 10_000_000;
const maxOutputLines = 40;

const tail = (output: string): string =>
  output.trimEnd().split('\n').slice(-maxOutputLines).join('\n');

const exec = (command: string, args: readonly string[], options: SpawnSyncOptions): void => {
  const result = spawn.sync(command, [...args], {
    ...options,
    encoding: 'utf8',
    maxBuffer: maxOutputBytes,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status === 0) return;
  throw new Error([
    `${command} ${args.join(' ')} exited with ${String(result.status)}`,
    tail(result.stdout),
    tail(result.stderr),
  ].join('\n'));
};

/*
 * Offline first: registry round-trips dominate the install. A stale cached
 * packument can report a version that exists as missing, so that one failure
 * retries against the registry.
 */
const offlineFirst = ['--prefer-offline', '--no-audit', '--no-fund'];
const revalidate = ['--prefer-online', '--no-audit', '--no-fund'];
const staleMetadataPattern = /^npm (?:error|ERR!) (?:code ETARGET\b|notarget\b)/mv;

const npmInstall = (cwd: string, specs: readonly string[]): void => {
  try {
    exec('npm', ['install', ...specs, ...offlineFirst], { cwd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (staleMetadataPattern.exec(message) === null) throw error;
    exec('npm', ['install', ...specs, ...revalidate], { cwd });
  }
};

export interface PackageFixture extends AsyncDisposable {
  readonly client: Client;
}

/**
 * Installs the packed package into a throwaway project and connects a client
 * to the server its `readonly-mcp` bin starts. Disposal closes the client and
 * removes the project.
 */
export const createPackageFixture = async (): Promise<PackageFixture> => {
  const projectDir = mkdtempSync(path.join(tmpdir(), 'readonly-mcp-e2e-'));
  const remove = (): void => {
    rmSync(projectDir, { force: true, maxRetries: 3, recursive: true });
  };
  try {
    exec('npm', ['init', '--yes', '--init-type', 'module'], { cwd: projectDir });
    npmInstall(projectDir, [locateTarball(), ...externalPackages.map(pinned)]);
    const client = new Client({ name: 'e2e', version: '1.0.0' });
    // The SDK spawns through cross-spawn, which resolves the shim's .cmd on Windows.
    await client.connect(new StdioClientTransport({
      command: path.join(projectDir, 'node_modules', '.bin', 'readonly-mcp'),
      cwd: projectDir,
    }));
    return {
      [Symbol.asyncDispose]: async () => {
        await client.close();
        remove();
      },
      client,
    };
  } catch (error) {
    remove();
    throw error;
  }
};
