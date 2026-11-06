import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Server, assertBlocked, connectTool, echoed, textOf, useServer,
} from '#test/helpers.js';

// --- Unit tests (mocked exec) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/gh.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('gh tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for([
      ['attestation', 'verify'],
      ['cache', 'list'],
      ['gist', 'list'],
      ['gist', 'view'],
      ['issue', 'list'],
      ['issue', 'status'],
      ['issue', 'view'],
      ['label', 'list'],
      ['pr', 'checks'],
      ['pr', 'diff'],
      ['pr', 'list'],
      ['pr', 'status'],
      ['pr', 'view'],
      ['project', 'field-list'],
      ['project', 'item-list'],
      ['project', 'list'],
      ['project', 'view'],
      ['release', 'list'],
      ['release', 'view'],
      ['repo', 'list'],
      ['repo', 'view'],
      ['ruleset', 'check'],
      ['ruleset', 'list'],
      ['ruleset', 'view'],
      ['run', 'list'],
      ['run', 'view'],
      ['search', 'code'],
      ['search', 'commits'],
      ['search', 'issues'],
      ['search', 'prs'],
      ['search', 'repos'],
      ['secret', 'list'],
      ['status'],
      ['variable', 'list'],
      ['workflow', 'list'],
      ['workflow', 'view'],
    ].map(args => ({ name: args.join(' '), args })))(
      'allows $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('allows subcommand with flags', async ({ expect }) => {
      const args = ['pr', 'list', '--state', 'open', '--json', 'number'];
      assertAllowed(expect, await callMocked(args));
    });
  });

  describe('--jq filters', () => {
    const json = () => ['--json', faker.lorem.word()];

    it.for([
      { args: ['pr', 'list', ...json(), '--jq', '$ENV'], name: '--jq $ENV', used: 'ENV' },
      { args: ['pr', 'list', ...json(), '--jq', 'env'], name: '--jq env', used: 'env' },
      { args: ['repo', 'view', ...json(), '-q', '$ENV.GH_TOKEN'], name: '-q', used: 'ENV' },
      { args: ['repo', 'view', ...json(), '-q$ENV'], name: 'attached -q', used: 'ENV' },
      { args: ['repo', 'view', ...json(), '-q=$ENV'], name: '-q=', used: 'ENV' },
      { args: ['repo', 'view', ...json(), '--jq=env'], name: '--jq=', used: 'env' },
      { args: ['pr', 'view', ...json(), '-wq', 'env'], name: 'q ending a group', used: 'env' },
      { args: ['pr', 'view', ...json(), '-wqenv'], name: 'q inside a group', used: 'env' },
      { args: ['api', 'user', '--jq', '$ENV'], name: 'api --jq', used: 'ENV' },
      {
        args: ['pr', 'list', ...json(), '--jq', 'import "m" as m; .'],
        name: '--jq import', used: 'import',
      },
      { args: ['pr', 'list', ...json(), '--jq', '"env"'], name: 'a string', used: 'env' },
    ])('blocks a filter using $name', async ({ args, used }, { expect }) => {
      const result = await callMocked(args);
      assertBlocked(expect, result);

      expect(textOf(result)).toBe(`Filter may not use ${used} for gh --jq`);
    });

    it.for([
      {
        args: ['pr', 'list', ...json(), '--jq', `.[].${faker.lorem.word()}`],
        name: 'a plain filter',
      },
      { args: ['repo', 'view', ...json(), '-q', '.env'], name: 'an .env field' },
      { args: ['api', 'user', '--jq', `.${faker.lorem.word()}`], name: 'api --jq' },
      { args: ['search', 'issues', 'env', ...json()], name: 'env as a search term' },
      // gh reads the next arg as the filter only when nothing follows q.
      { args: ['repo', 'view', ...json(), '-q.', 'env'], name: 'env after an attached filter' },
      { args: ['search', 'issues', '-Rorg/aqua', 'env'], name: 'env after a value holding q' },
      { args: ['pr', 'list', '-Squery', 'env'], name: 'env after a search holding q' },
    ])('allows $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    });
  });

  describe('environment', () => {
    /*
     * gh sends either one to any host outside github.com that a caller names
     * through -R or a URL positional.
     */
    it.for([
      { args: ['--version'], name: 'a global flag' },
      { args: ['pr', 'list'], name: 'a subcommand' },
      { args: ['api', 'user'], name: 'api' },
    ])('runs $name without the enterprise tokens', async ({ args }, { expect }) => {
      const { excludedEnv } = echoed(await callMocked(args));

      expect(excludedEnv).toStrictEqual(['GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']);
    });
  });

  describe('github.localhost', () => {
    it.for([
      { args: () => ['pr', 'list', '-R', `github.localhost/${build.repoSlug()}`], name: '-R' },
      {
        args: () => ['pr', 'list', `--repo=api.github.localhost/${build.repoSlug()}`],
        name: 'a subdomain',
      },
      { args: () => ['pr', 'view', `http://github.localhost/${build.repoSlug()}/pull/1`], name: 'a URL' },
      { args: () => ['repo', 'view', `GitHub.LocalHost/${build.repoSlug()}`], name: 'any case' },
    ])('blocks $name naming it', async ({ args }, { expect }) => {
      const sent = args();
      const result = await callMocked(sent);
      assertBlocked(expect, result);

      expect(textOf(result)).toBe(`gh may not reach github.localhost: ${sent.at(-1) ?? ''}`);
    });

    it('blocks api naming it', async ({ expect }) => {
      const filter = '"github.localhost"';
      const result = await callMocked(['api', build.prCommentsPath(), '--jq', filter]);
      assertBlocked(expect, result);

      expect(textOf(result)).toBe(`gh may not reach github.localhost: ${filter}`);
    });

    it('reports a disallowed subcommand first', async ({ expect }) => {
      const result = await callMocked(['auth', 'status', '--hostname', 'github.localhost']);
      assertBlocked(expect, result);

      expect(textOf(result)).toMatch(/^Subcommand not allowed: auth status\./v);
    });
  });

  describe('global flags', () => {
    it.for([
      ['--version'],
      ['--help'],
      ['-h'],
    ].map(args => ({ name: args[0], args })))(
      'allows standalone $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('blocks --help with extra args', async ({ expect }) => {
      const result = await callMocked(['--help', 'repo', 'delete']);
      assertBlocked(expect, result);
    });

    it('blocks --version with extra args', async ({ expect }) => {
      const result = await callMocked(['--version', 'repo', 'delete']);
      assertBlocked(expect, result);
    });
  });
});

// --- Integration tests (real MCP server) ---
const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('gh tool (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for(
    [
      ['issue', 'create'], ['issue', 'close'], ['issue', 'delete'], ['issue', 'edit'],
      ['pr', 'create'], ['pr', 'close'], ['pr', 'merge'], ['pr', 'edit'],
      ['repo', 'create'], ['repo', 'delete'],
      ['auth', 'login'],
      ['gist', 'create'], ['gist', 'delete'], ['gist', 'edit'],
      ['label', 'create'], ['label', 'delete'], ['label', 'edit'],
      ['release', 'create'], ['release', 'delete'], ['release', 'edit'],
      ['workflow', 'run'], ['workflow', 'enable'], ['workflow', 'disable'],
      ['secret', 'set'], ['secret', 'delete'],
      ['variable', 'get'], ['variable', 'set'], ['variable', 'delete'],
      ['project', 'create'], ['project', 'delete'], ['project', 'edit'],
      ['cache', 'delete'],
      ['ruleset', 'create'],
    ].map(args => ({ name: args.join(' '), args })),
  )('blocks $name', async ({ args }, { expect, server }) => {
    assertBlocked(expect, await server.callTool('gh', { args }));
  });
});
