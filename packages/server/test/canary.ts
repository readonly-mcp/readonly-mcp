/**
 * A file for injection tests to aim at: if an attack's payload ever ran, the
 * file would be gone or rewritten, so a test proves the attack inert by
 * finding it unchanged.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { faker } from '@faker-js/faker';

export interface Canary extends AsyncDisposable {
  readonly content: string;
  readonly file: string;
}

/**
 * Writes generated content to a file in a directory of its own.
 */
export const createCanary = async (): Promise<Canary> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'readonly-mcp-canary-'));
  const canary: Canary = {
    content: faker.lorem.sentence(),
    file: path.join(dir, 'canary.txt').replaceAll('\\', '/'),
    [Symbol.asyncDispose]: () => rm(dir, { force: true, maxRetries: 3, recursive: true }),
  };
  try {
    await writeFile(canary.file, canary.content, 'utf8');
    return canary;
  } catch (error) {
    await canary[Symbol.asyncDispose]();
    throw error;
  }
};

/**
 * The body of a per-test `canary` fixture, removed once `use` settles.
 */
export const useCanary = async (use: (canary: Canary) => Promise<void>) => {
  await using canary = await createCanary();
  await use(canary);
};

/**
 * What a canary's file holds now, or why it cannot be read.
 */
export const readCanary = async (file: string) => {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    return `unreadable: ${String(error)}`;
  }
};
