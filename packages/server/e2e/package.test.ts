/**
 * Smoke tests of the packed package. Source tests cannot catch a manifest
 * the pack rewrote wrongly, an `imports` map pointing at a missing file, or a
 * `bin` that does not start.
 */

import { faker } from '@faker-js/faker';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { type CallToolResult, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, it } from 'vitest';
import { createPackageFixture } from './fixture.ts';

const e2e = it.extend<{ client: Client }>({
  client: [async ({}, use) => {
    await using fixture = await createPackageFixture();
    await use(fixture.client);
  }, { scope: 'file' }],
});

const callShell = async (
  client: Client, command: string, args: readonly string[],
): Promise<CallToolResult> => {
  const result = await client.callTool({ arguments: { args, command }, name: 'shell' });
  return CallToolResultSchema.parse(result);
};

const textOf = (result: CallToolResult): string =>
  result.content.map(part => (part.type === 'text' ? part.text : '')).join('');

describe.concurrent('packed package', () => {
  e2e.beforeAll(({ client }) => client.ping());

  e2e('lists every tool', async ({ client, expect }) => {
    const { tools } = await client.listTools();
    const names = tools.map(tool => tool.name).toSorted((left, right) => left.localeCompare(right));

    expect(names).toStrictEqual([
      'acli', 'az', 'chezmoi', 'gh', 'git', 'npm', 'pnpm', 'shell', 'tea',
    ]);
  });

  e2e('runs an allowed command', async ({ client, expect }) => {
    const name = faker.system.fileName();
    const result = await callShell(client, 'basename', [`/${name}`]);

    expect(textOf(result).trim()).toBe(name);
  });

  e2e('rejects a command outside the allowlist', async ({ client, expect }) => {
    const result = await callShell(client, 'rm', [faker.system.fileName()]);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Command not allowed: rm\./v);
  });
});
