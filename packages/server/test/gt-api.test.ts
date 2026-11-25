import { type ExpectStatic, describe, it } from 'vitest';
import { plan } from '#src/tools/gt.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

// gt runs an allowed api call with GET injected right after the endpoint.
const assertRunsAsGet = (expect: ExpectStatic, args: readonly string[]) => {
  const [api, endpoint, ...rest] = args;

  expect(runOf(plan(args)).args).toStrictEqual([api, endpoint, '--method', 'GET', ...rest]);
};

const assertRejected = (expect: ExpectStatic, args: readonly string[]) => {
  expect(plan(args)).toMatchObject({ kind: 'reject' });
};

describe.concurrent('gt api', () => {
  it.for(([
    ['api', 'repos/:owner/:repo/actions/runs'],
    ['api', 'repos/:owner/:repo/actions/runs?limit=:number'],
    // Gitea's run filters, which Forgejo lacks.
    ['api', 'repos/:owner/:repo/actions/runs?branch=:branch&actor=:word'],
    ['api', 'repos/:owner/:repo/actions/runs/:number/jobs'],
    ['api', 'repos/:owner/:repo/actions/jobs/:number/logs'],
    ['api', 'repos/:owner/:repo/pulls/:number/reviews'],
    ['api', 'repos/:owner/:repo/pulls/:number/reviews/:number/comments'],
    ['api', 'repos/:owner/:repo/commits/:sha/status'],
    ['api', 'repos/:owner/:repo/commits/:sha/statuses'],
    ['api', 'repos/:owner/:repo/contents'],
    ['api', 'repos/:owner/:repo/contents/:path'],
    ['api', 'repos/:owner/:repo/raw/:path'],
    ['api', 'repos/{owner}/{repo}/actions/runs'],
    ['api', '/repos/:owner/:repo/contents/:file'],
    ['api', 'user'],
  ] as const).map(args => ({ name: args[1], args: args.map(build.template) })))(
    'runs api $name as GET', ({ args }, { expect }) => {
      assertRunsAsGet(expect, args);
    },
  );

  it.for(([
    ['--jq', '.login'],
    ['-q', '.[].id'],
    ['-q.full_name'],
    ['--paginate', '--slurp'],
    ['--paginate', '--max-pages', ':number'],
    ['-i'],
    ['--include', '--silent'],
    ['-R', ':owner/:repo'],
  ] as const).map(flags => ({ name: flags.join(' '), flags: flags.map(build.template) })))(
    'runs api with $name as GET', ({ flags }, { expect }) => {
      assertRunsAsGet(expect, ['api', build.template('repos/:owner/:repo/actions/runs'), ...flags]);
    },
  );

  it('injects --method GET immediately after the endpoint', ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/actions/runs');
    const { args } = runOf(plan(['api', endpoint, '--', '-i']));

    expect(args.slice(0, 4)).toStrictEqual(['api', endpoint, '--method', 'GET']);
  });

  it.for(([
    ['api'],
    ['api', '-i', 'user'],
    ['api', 'repos/:owner/:repo/actions/runs/:number'],
    ['api', 'repos/:owner/:repo/actions/runs/:number/rerun'],
    ['api', 'repos/:owner/:repo/actions/secrets'],
    ['api', 'repos/:owner/:repo/pulls/:number/merge'],
    ['api', 'repos/:owner/:repo/raw'],
    ['api', 'user/repos'],
    ['api', 'admin/users'],
    ['api', 'https://:host/api/v1/user'],
    ['api', 'repos/:owner/:repo/contents/../../../../admin/users'],
    ['api', 'repos/:owner/:repo/raw/%2e%2e/%2e%2e/%2e%2e/%2e%2e/admin/users'],
    ['api', 'repos/:owner/:repo/contents/%252e%252e/%252e%252e/admin/users'],
    ['api', 'repos/admin#/x/contents/y'],
    ['api', 'repos/:owner//raw/hooks'],
    // Gitea reads a sudo query parameter as the Sudo header.
    ['api', 'repos/:owner/:repo/raw/:file?sudo=:word'],
    ['api', 'repos/:owner/:repo/actions/runs?limit=:number&sudo=:word'],
  ] as const).map(args => ({
    name: args.slice(1).join(' ') || '(bare)',
    args: args.map(build.template),
  })))(
    'blocks api $name', ({ args }, { expect }) => {
      assertRejected(expect, args);
    },
  );

  it.for(([
    // Override the injected GET.
    ['--method', 'POST'],
    ['--method=DELETE'],
    ['-X', 'POST'],
    ['-XPOST'],
    ['-iXPOST'],
    /*
     * A request body, which switches the method to POST on its own; -F
     * and --input also read a file or stdin.
     */
    ['-f', ':word=:word'],
    ['--raw-field', ':word=:word'],
    ['-F', ':word=@:file'],
    ['--field', ':word=@:file'],
    ['-iF', ':word=@:file'],
    ['--input', ':file'],
    ['--input=-'],
    // Arbitrary header injection.
    ['-H', 'Accept: text/plain'],
    ['--header', 'X-:word: :word'],
    // Writes the response to a new file.
    ['--output-file', ':file'],
    // Prints the request headers, unconfirmed to redact a token login's.
    ['--verbose'],
    // Prints the request it would send instead of sending it.
    ['--dry-run'],
    ['--debug'],
    ['--cwd', ':path'],
  ] as const).map(flags => ({ name: flags.join(' '), flags: flags.map(build.template) })))(
    'blocks api flag $name', ({ flags }, { expect }) => {
      assertRejected(expect, ['api', build.template('repos/:owner/:repo/actions/runs'), ...flags]);
    },
  );

  it('blocks a jq filter reading the environment', ({ expect }) => {
    const args = ['api', 'user', '--jq', '$ENV.GITEA_TOKEN'];

    expect(rejectionOf(plan(args))).toMatch(/for gt --jq$/v);
  });
});
