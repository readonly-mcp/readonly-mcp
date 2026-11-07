import { faker } from '@faker-js/faker';
import { type ExpectStatic, describe, it } from 'vitest';
import type { Plan } from '#src/lib/plan.js';
import { plan } from '#src/tools/gh.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

const assertRuns = (expect: ExpectStatic, args: readonly string[]) => {
  expect(plan(args)).toMatchObject({ cmd: 'gh', kind: 'run' });
};

const assertRejected = (expect: ExpectStatic, result: Plan) => {
  expect(result).toMatchObject({ kind: 'reject' });
};

describe.concurrent('gh api', () => {
  it.for(([
    'repos/:owner/:repo/pulls/:number/comments',
    'repos/:owner/:repo/pulls/:number/comments/:number',
    'repos/:owner/:repo/pulls/:number/reviews',
    'repos/:owner/:repo/pulls/:number/reviews/:number/comments',
    'repos/:owner/:repo/deployments',
    'repos/:owner/:repo/deployments/:number/statuses',
    'repos/:owner/:repo/check-runs/:number/annotations',
    'repos/:owner/:repo/commits',
    'repos/:owner/:repo/commits/:sha',
    'repos/:owner/:repo/commits/:sha/status',
    'repos/:owner/:repo/commits/:sha/statuses',
    'repos/:owner/:repo/commits/:sha/check-runs',
    'repos/:owner/:repo/commits/:sha/check-suites',
    'repos/:owner/:repo/compare/:branch...:branch',
    'repos/:owner/:repo/pulls/:number/requested_reviewers',
    'repos/:owner/:repo/environments',
    'repos/:owner/:repo/contents',
    'repos/:owner/:repo/contents/:file',
    'repos/:owner/:repo/contents/:path',
    'user',
  ] as const).map(template => ({ name: template, args: ['api', build.template(template)] })))(
    'allows api $name', ({ args }, { expect }) => {
      assertRuns(expect, args);
    },
  );

  it('allows api endpoint with flags', ({ expect }) => {
    assertRuns(expect, [
      'api', build.prCommentsPath(), '--jq', '.[].id',
    ]);
  });

  it('strips leading slash from endpoint', ({ expect }) => {
    assertRuns(expect, [
      'api', `/${build.prCommentsPath()}`,
    ]);
  });

  it('strips query string from endpoint', ({ expect }) => {
    assertRuns(expect, [
      'api', `${build.prCommentsPath()}${build.queryString()}`,
    ]);
  });

  it('injects --method GET before user flags', ({ expect }) => {
    const result = plan([
      'api', build.prCommentsPath(), '--jq', '.[].id',
    ]);
    const { args } = runOf(result);
    const methodIdx = args.indexOf('--method');
    const jqIdx = args.indexOf('--jq');

    expect(methodIdx).toBeGreaterThan(-1);
    expect(args[methodIdx + 1]).toBe('GET');
    expect(methodIdx).toBeLessThan(jqIdx);
  });

  it('--method GET is not defeated by -- end-of-options', ({ expect }) => {
    const result = plan([
      'api', build.prCommentsPath(), '--',
    ]);
    const { args } = runOf(result);
    const methodIdx = args.indexOf('--method');
    const dashDashIdx = args.indexOf('--');

    expect(methodIdx).toBeGreaterThan(-1);
    expect(methodIdx).toBeLessThan(dashDashIdx);
  });

  it('blocks disallowed endpoint', ({ expect }) => {
    const result = plan(['api', build.template('repos/:owner/:repo/git/refs')]);
    assertRejected(expect, result);
  });

  it('reports a disallowed endpoint before a blocked filter', ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/git/refs');
    const result = plan(['api', endpoint, '--jq', 'env']);

    expect(rejectionOf(result)).toContain(`API endpoint not allowed: ${endpoint}`);
  });

  it('blocks bare api (no endpoint)', ({ expect }) => {
    const result = plan(['api']);
    assertRejected(expect, result);
  });

  it('blocks api with flag-like endpoint', ({ expect }) => {
    const result = plan(['api', '--jq', '.[].id']);
    assertRejected(expect, result);
  });

  it('asks for the endpoint first when a flag precedes it', ({ expect }) => {
    const result = plan(['api', '--jq', '.[].id', build.prCommentsPath()]);
    assertRejected(expect, result);

    expect(rejectionOf(result)).toContain('endpoint must come first');
  });

  it('reports a blocked flag before the endpoint as a blocked flag', ({ expect }) => {
    const result = plan([
      'api', '-H', 'Accept: text/plain', build.template('repos/:owner/:repo/contents/:file'),
    ]);

    expect(rejectionOf(result)).toContain('Flag not allowed: -H');
  });

  it.for([
    { name: '-H', args: build.apiArgs('-H', build.header()) },
    { name: '--header', args: build.apiArgs('--header', build.header()) },
    { name: '-HAccept:... (concatenated)', args: build.apiArgs('-HAccept:text/plain') },
  ])('says contents are already raw when $name is blocked', ({ args }, { expect }) => {
    expect(rejectionOf(plan(args))).toContain('contents endpoints already return raw');
  });

  it('blocks --method flag', ({ expect }) => {
    const result = plan(build.apiArgs('--method', 'POST'));
    assertRejected(expect, result);
  });

  it('blocks -X flag', ({ expect }) => {
    const result = plan(build.apiArgs('-X', 'POST'));
    assertRejected(expect, result);
  });

  it('blocks -XPOST (concatenated short flag)', ({ expect }) => {
    const result = plan(build.apiArgs('-XPOST'));
    assertRejected(expect, result);
  });

  it('blocks --input flag', ({ expect }) => {
    const result = plan(build.apiArgs('--input', build.fileName('json')));
    assertRejected(expect, result);
  });

  it('blocks --hostname flag (SSRF)', ({ expect }) => {
    const result = plan(build.apiArgs('--hostname', faker.internet.domainName()));
    assertRejected(expect, result);
  });

  it('blocks -f flag (body field)', ({ expect }) => {
    const result = plan(build.apiArgs('-f', build.field()));
    assertRejected(expect, result);
  });

  it('blocks -F flag (@file read)', ({ expect }) => {
    const result = plan(build.apiArgs('-F', build.fileField()));
    assertRejected(expect, result);
  });

  it('blocks -Fbody=@file (concatenated -F)', ({ expect }) => {
    const result = plan(build.apiArgs('-Fbody=@/etc/passwd'));
    assertRejected(expect, result);
  });

  it('blocks --field flag', ({ expect }) => {
    const result = plan(build.apiArgs('--field', build.field()));
    assertRejected(expect, result);
  });

  it('blocks --raw-field flag', ({ expect }) => {
    const result = plan(build.apiArgs('--raw-field', build.field()));
    assertRejected(expect, result);
  });

  it('blocks --verbose flag (token leak)', ({ expect }) => {
    const result = plan(build.apiArgs('--verbose'));
    assertRejected(expect, result);
  });

  it('blocks -H flag (header injection)', ({ expect }) => {
    const result = plan(build.apiArgs('-H', 'Accept: text/plain'));
    assertRejected(expect, result);
  });

  it('blocks --header flag', ({ expect }) => {
    const result = plan(build.apiArgs('--header', build.header()));
    assertRejected(expect, result);
  });

  it('blocks -HAccept:text/plain (concatenated -H)', ({ expect }) => {
    const result = plan(build.apiArgs('-HAccept:text/plain'));
    assertRejected(expect, result);
  });

  it('blocks full URL', ({ expect }) => {
    const result = plan(['api', `https://api.github.com/${build.prCommentsPath()}`]);
    assertRejected(expect, result);
  });

  it('allows contents without path (directory listing)', ({ expect }) => {
    assertRuns(expect, ['api', build.template('repos/:owner/:repo/contents')]);
  });

  it('allows contents with trailing slash (directory listing)', ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/contents/');
    assertRuns(expect, ['api', endpoint]);
  });

  it('injects raw Accept header for contents endpoint', ({ expect }) => {
    const result = plan(['api', build.template('repos/:owner/:repo/contents/:file')]);
    const { args } = runOf(result);
    const hIdx = args.indexOf('-H');

    expect(hIdx).toBeGreaterThan(-1);
    expect(args[hIdx + 1]).toBe('Accept: application/vnd.github.raw+json');
  });

  it('injects raw Accept header for bare contents endpoint', ({ expect }) => {
    const result = plan(['api', build.template('repos/:owner/:repo/contents')]);
    const { args } = runOf(result);
    const hIdx = args.indexOf('-H');

    expect(hIdx).toBeGreaterThan(-1);
    expect(args[hIdx + 1]).toBe('Accept: application/vnd.github.raw+json');
  });

  it('does not inject Accept header for non-contents endpoint', ({ expect }) => {
    const result = plan(build.apiArgs());
    const { args } = runOf(result);

    expect(args.indexOf('-H')).toBe(-1);
  });
});
