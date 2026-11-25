import { describe, it } from 'vitest';
import { plan } from '#src/tools/gt.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

// gt runs an allowed api call with GET injected right after the endpoint.
const asGet = ([api = '', endpoint = '', ...rest]: readonly string[]): string[] =>
  [api, endpoint, '--method', 'GET', ...rest];

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
      expect(plan(args)).toRun('gt', asGet(args));
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
      const args = ['api', build.template('repos/:owner/:repo/actions/runs'), ...flags];

      expect(plan(args)).toRun('gt', asGet(args));
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
  ] as const).map(args => ({
    name: args.slice(1).join(' ') || '(bare)',
    args: args.map(build.template),
  })))(
    'blocks api $name as an unlisted endpoint', ({ args }, { expect }) => {
      expect(rejectionOf(plan(args))).toContain('API endpoint not allowed: ');
    },
  );

  it.for(([
    // contents/** and raw/** take any depth, so a dot segment could climb out.
    ['repos/:owner/:repo/contents/../../../../admin/users', 'endpoint segment not allowed: ..'],
    ['repos/:owner/:repo/raw/%2e%2e/%2e%2e/%2e%2e/admin/users', 'endpoint segment not allowed: '],
    ['repos/:owner/:repo/contents/%252e%252e/%252e%252e/admin', 'endpoint segment not allowed: '],
    // The URL parser cuts the path at `#`.
    ['repos/admin#/x/contents/y', 'endpoint may not contain #'],
    // Servers collapse `//`, shifting every segment after it.
    ['repos/:owner//raw/hooks', 'endpoint may not contain an empty segment'],
    // Gitea reads a sudo query parameter as the Sudo header.
    ['repos/:owner/:repo/raw/:file?sudo=:word', 'query key not allowed: sudo'],
    ['repos/:owner/:repo/actions/runs?limit=:number&sudo=:word', 'query key not allowed: sudo'],
  ] as const).map(([endpoint, reason]) => ({
    name: endpoint, endpoint: build.template(endpoint), reason,
  })))(
    'blocks api $name for its own reason', ({ endpoint, reason }, { expect }) => {
      expect(rejectionOf(plan(['api', endpoint]))).toContain(`API ${reason}`);
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
      const args = ['api', build.template('repos/:owner/:repo/actions/runs'), ...flags];

      expect(rejectionOf(plan(args))).toContain('Flag not allowed: ');
    },
  );

  it('blocks a jq filter reading the environment', ({ expect }) => {
    const args = ['api', 'user', '--jq', '$ENV.GITEA_TOKEN'];

    expect(rejectionOf(plan(args))).toMatch(/for gt --jq$/v);
  });
});
