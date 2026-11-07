import { type ExpectStatic, describe, it } from 'vitest';
import { plan } from '#src/tools/tea.js';
import * as build from '#test/builders.js';
import { runOf } from '#test/helpers.js';

// tea runs an allowed api call with GET injected right after the endpoint.
const assertRunsAsGet = (expect: ExpectStatic, args: readonly string[]) => {
  const [api, endpoint, ...rest] = args;

  expect(runOf(plan(args)).args).toStrictEqual([api, endpoint, '--method', 'GET', ...rest]);
};

const assertRejected = (expect: ExpectStatic, args: readonly string[]) => {
  expect(plan(args)).toMatchObject({ kind: 'reject' });
};

describe.concurrent('tea api', () => {
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
    'runs api $name as GET', ({ args }, { expect }) => {
      assertRunsAsGet(expect, args);
    },
  );

  it('runs an api endpoint with flags as GET', ({ expect }) => {
    assertRunsAsGet(expect, ([
      'api', 'repos/:owner/:repo/pulls/:number/reviews',
      '-i', '-l', ':word', '--repo', ':owner/:repo',
    ] as const).map(build.template));
  });

  it('injects --method GET immediately after the endpoint', ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/pulls/:number/reviews');
    const { args } = runOf(plan(['api', endpoint, '--', '-i']));

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
  ] as const).map(args => ({
    name: args.slice(1).join(' ') || '(bare)',
    args: args.map(build.template),
  })))(
    'blocks api $name', ({ args }, { expect }) => {
      assertRejected(expect, args);
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
    'blocks api flag $name', ({ flags }, { expect }) => {
      const endpoint = build.template('repos/:owner/:repo/pulls/:number/reviews');
      assertRejected(expect, ['api', endpoint, ...flags]);
    },
  );
});
