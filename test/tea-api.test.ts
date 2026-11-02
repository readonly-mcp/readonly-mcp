import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from './builders.ts';
import { assertBlocked, connectTool, echoed, textOf } from './helpers.ts';

// --- Unit tests (mocked exec) ---
vi.mock(import('../lib/exec.ts'), async (importOriginal) => {
  const { withEchoExec } = await import('./helpers.ts');
  return withEchoExec(importOriginal);
});

const { register } = await import('../tools/tea.ts');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('tea api (unit)', () => {
  it.for(([
    ['api', 'repos/:owner/:repo/pulls/:number/reviews'],
    ['api', 'repos/:owner/:repo/pulls/:number/reviews/:number/comments'],
    ['api', 'repos/:owner/:repo/commits/:sha/status'],
    ['api', 'repos/:owner/:repo/commits/:sha/statuses'],
    ['api', 'repos/:owner/:repo/contents'],
    ['api', 'repos/:owner/:repo/contents/:file'],
    ['api', 'repos/:owner/:repo/contents/:path'],
    ['api', 'repos/:owner/:repo/raw/:file'],
    ['api', 'repos/:owner/:repo/raw/:path'],
    ['api', 'repos/{owner}/{repo}/pulls/1/reviews'],
    ['api', '/repos/:owner/:repo/contents/:file'],
    ['api', 'repos/:owner/:repo/contents/:file?ref=:branch'],
    ['api', 'repos/:owner/:repo/contents/my%20file.md'],
    ['api', 'user'],
  ] as const).map(args => ({ name: args[1], args: args.map(build.template) })))(
    'allows api $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    },
  );

  it('allows api endpoint with flags', async ({ expect }) => {
    assertAllowed(expect, await callMocked(([
      'api', 'repos/:owner/:repo/pulls/:number/reviews', '-i', '-l', ':word', '--repo', ':owner/:repo',
    ] as const).map(build.template)));
  });

  it('injects --method GET immediately after the endpoint', async ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/pulls/:number/reviews');
    const { args } = echoed(await callMocked(['api', endpoint, '--', '-i']));

    expect(args.slice(0, 4)).toStrictEqual(['api', endpoint, '--method', 'GET']);
  });

  it.for(([
    ['api'],
    ['api', '-i', 'user'],
    ['api', 'repos/:owner/:repo/pulls/:number/merge'],
    ['api', 'repos/:owner/:repo/raw'],
    ['api', 'user/repos'],
    ['api', 'admin/users'],
    ['api', '/api/v1/admin/users'],
    ['api', 'https://:host/api/v1/user'],
    ['api', 'http://:host/api/v1/user'],
    // contents/** and raw/** take any depth, so a dot segment could climb
    // out to an endpoint the allowlist never named.
    ['api', 'repos/:owner/:repo/contents/../../../../admin/users'],
    ['api', 'repos/:owner/:repo/raw/./../../../admin/users'],
    ['api', 'repos/:owner/:repo/contents/%2e%2e/%2E%2E/%2e%2e/%2e%2e/admin/users'],
    ['api', 'repos/:owner/:repo/contents/..%2f..%2f..%2f..%2fadmin/users'],
    ['api', 'repos/:owner/:repo/contents/..%5c..%5cadmin'],
    ['api', 'repos/:owner/:repo/contents/%zz'],
    // Double-encoded, so one decode leaves a dot or separator still
    // encoded for any later decode to resolve.
    ['api', 'repos/:owner/:repo/contents/%252e%252e/%252e%252e/%252e%252e/%252e%252e/admin/users'],
    ['api', 'repos/:owner/:repo/raw/..%252f..%252f..%252f..%252fadmin%252fusers'],
    ['api', 'repos/:owner/:repo/raw/..%255c..%255cadmin'],
    // The URL parser cuts the path at `#`, so a fragment hidden in a
    // wildcard segment would send the request to a truncated endpoint.
    ['api', 'repos/admin#/x/contents/y'],
    ['api', 'repos/:owner/:repo/contents/:file#L1'],
  ] as const).map(args => ({ name: args.slice(1).join(' ') || '(bare)', args: args.map(build.template) })))(
    'blocks api $name', async ({ args }, { expect }) => {
      assertBlocked(expect, await callMocked(args));
    },
  );

  it.for(([
    ['--method', 'POST'],
    ['--method=DELETE'],
    ['-method', 'POST'],
    ['--meth', 'POST'],
    ['-X', 'POST'],
    ['-XPOST'],
    ['-f', ':word=:word'],
    ['-f:word=:word'],
    ['--field', ':word=:word'],
    ['-field', ':word=:word'],
    ['-F', ':word=@:file'],
    ['--Field', ':word=@:file'],
    ['-Field=:word=@:file'],
    ['-H', 'Accept: text/plain'],
    ['--header', 'X-:word: :word'],
    ['-header', 'X-:word: :word'],
    ['-d', '@:file'],
    ['--data', '{}'],
    ['-data={}'],
    ['-o', ':file'],
    ['--output', ':file'],
    ['-output=:file'],
    ['--debug'],
    ['--repo', '../other/repo'],
  ] as const).map(flags => ({ name: flags.join(' '), flags: flags.map(build.template) })))(
    'blocks api flag $name', async ({ flags }, { expect }) => {
      assertBlocked(expect, await callMocked(['api', build.template('repos/:owner/:repo/pulls/:number/reviews'), ...flags]));
    },
  );
});
