import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  assertBlocked, connectTool, echoed, textOf,
} from '#test/helpers.js';

// --- Unit tests (mocked execShell) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/npm.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('npm tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for(['audit', 'bin', 'explain', 'fund', 'ls', 'outdated', 'root', 'search', 'view'])(
      'allows %s', async (sub, { expect }) => {
        assertAllowed(expect, await callMocked([sub]));
      },
    );
  });

  describe('--ignore-scripts injection', () => {
    it('injects --ignore-scripts as first arg', async ({ expect }) => {
      const result = await callMocked(['ls']);
      const { args } = echoed(result);

      expect(args[0]).toBe('--ignore-scripts');
    });

    it('prepends --ignore-scripts before subcommand', async ({ expect }) => {
      const result = await callMocked(['view', 'zod']);
      const { args } = echoed(result);

      expect(args).toStrictEqual(['--ignore-scripts', 'view', 'zod']);
    });
  });

  // Each redirects registry requests by a name --registry does not prefix.
  describe('blocked registry overrides', () => {
    const scopedRegistry = `--@${faker.internet.domainWord()}:registry`;
    const configFile = build.relativeFilePath();
    const directory = build.absolutePath();
    const name = faker.internet.domainWord();
    const url = build.httpsUrl();

    it.for([
      { name: '--@scope:registry <url>', args: ['view', name, scopedRegistry, url] },
      { name: '--@scope:registry=<url>', args: ['view', name, `${scopedRegistry}=${url}`] },
      { name: '--userconfig <file>', args: ['view', name, '--userconfig', configFile] },
      { name: '--userconfig=<file>', args: ['view', name, `--userconfig=${configFile}`] },
      { name: '--globalconfig <file>', args: ['view', name, '--globalconfig', configFile] },
      // The prefix is where npm reads the project .npmrc from.
      { name: '--prefix <dir>', args: ['ls', '--prefix', directory] },
      { name: '-C <dir>', args: ['ls', '-C', directory] },
      // npm expands a group of short flags into each of them.
      { name: '-lC <dir>', args: ['ls', '-lC', directory] },
      { name: '--proxy <url>', args: ['view', name, '--proxy', url] },
      { name: '--https-proxy <url>', args: ['view', name, '--https-proxy', url] },
      // npm reads a single-dash arg as a long name unless it spells out shorthands.
      { name: '-registry=<url>', args: ['view', name, `-registry=${url}`] },
      { name: '-reg=<url>', args: ['view', name, `-reg=${url}`] },
      { name: '-userconfig <file>', args: ['view', name, '-userconfig', configFile] },
      { name: '-prefix <dir>', args: ['ls', '-prefix', directory] },
      { name: '-proxy <url>', args: ['view', name, '-proxy', url] },
    ])('blocks $name', async ({ args }, { expect }) => {
      assertBlocked(expect, await callMocked(args));
    });

    // A whole flag name is not an abbreviation of the blocked flag it prefixes.
    it.for([
      { name: 'ls --global (prefixes --globalconfig)', args: ['ls', '--global'] },
      { name: 'root --global (prefixes --globalconfig)', args: ['root', '--global'] },
      { name: 'ls -global (prefixes --globalconfig)', args: ['ls', '-global'] },
      { name: 'ls -g (a shorthand, not a long name)', args: ['ls', '-g'] },
    ])('allows $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    });
  });
});
