import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  assertBlocked, connectTool, echoed, textOf } from '#test/helpers.js';

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

describe.concurrent('gh api (unit)', () => {
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
    'allows api $name', async ({ args }, { expect }) => {
      assertAllowed(expect, await callMocked(args));
    },
  );

  it('allows api endpoint with flags', async ({ expect }) => {
    assertAllowed(expect, await callMocked([
      'api', build.prCommentsPath(), '--jq', '.[].id',
    ]));
  });

  it('strips leading slash from endpoint', async ({ expect }) => {
    assertAllowed(expect, await callMocked([
      'api', `/${build.prCommentsPath()}`,
    ]));
  });

  it('strips query string from endpoint', async ({ expect }) => {
    assertAllowed(expect, await callMocked([
      'api', `${build.prCommentsPath()}${build.queryString()}`,
    ]));
  });

  it('injects --method GET before user flags', async ({ expect }) => {
    const result = await callMocked([
      'api', build.prCommentsPath(), '--jq', '.[].id',
    ]);
    const { args } = echoed(result);
    const methodIdx = args.indexOf('--method');
    const jqIdx = args.indexOf('--jq');

    expect(methodIdx).toBeGreaterThan(-1);
    expect(args[methodIdx + 1]).toBe('GET');
    expect(methodIdx).toBeLessThan(jqIdx);
  });

  it('--method GET is not defeated by -- end-of-options', async ({ expect }) => {
    const result = await callMocked([
      'api', build.prCommentsPath(), '--',
    ]);
    const { args } = echoed(result);
    const methodIdx = args.indexOf('--method');
    const dashDashIdx = args.indexOf('--');

    expect(methodIdx).toBeGreaterThan(-1);
    expect(methodIdx).toBeLessThan(dashDashIdx);
  });

  it('blocks disallowed endpoint', async ({ expect }) => {
    const result = await callMocked(['api', build.template('repos/:owner/:repo/git/refs')]);
    assertBlocked(expect, result);
  });

  it('reports a disallowed endpoint before a blocked filter', async ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/git/refs');
    const result = await callMocked(['api', endpoint, '--jq', 'env']);

    expect(textOf(result)).toContain(`API endpoint not allowed: ${endpoint}`);
  });

  it('blocks bare api (no endpoint)', async ({ expect }) => {
    const result = await callMocked(['api']);
    assertBlocked(expect, result);
  });

  it('blocks api with flag-like endpoint', async ({ expect }) => {
    const result = await callMocked(['api', '--jq', '.[].id']);
    assertBlocked(expect, result);
  });

  it('asks for the endpoint first when a flag precedes it', async ({ expect }) => {
    const result = await callMocked(['api', '--jq', '.[].id', build.prCommentsPath()]);
    assertBlocked(expect, result);

    expect(textOf(result)).toContain('endpoint must come first');
  });

  it('reports a blocked flag before the endpoint as a blocked flag', async ({ expect }) => {
    const result = await callMocked([
      'api', '-H', 'Accept: text/plain', build.template('repos/:owner/:repo/contents/:file'),
    ]);

    expect(textOf(result)).toContain('Flag not allowed: -H');
  });

  it.for([
    { name: '-H', args: build.apiArgs('-H', build.header()) },
    { name: '--header', args: build.apiArgs('--header', build.header()) },
    { name: '-HAccept:... (concatenated)', args: build.apiArgs('-HAccept:text/plain') },
  ])('says contents are already raw when $name is blocked', async ({ args }, { expect }) => {
    expect(textOf(await callMocked(args))).toContain('contents endpoints already return raw');
  });

  it('blocks --method flag', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--method', 'POST'));
    assertBlocked(expect, result);
  });

  it('blocks -X flag', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-X', 'POST'));
    assertBlocked(expect, result);
  });

  it('blocks -XPOST (concatenated short flag)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-XPOST'));
    assertBlocked(expect, result);
  });

  it('blocks --input flag', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--input', build.fileName('json')));
    assertBlocked(expect, result);
  });

  it('blocks --hostname flag (SSRF)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--hostname', faker.internet.domainName()));
    assertBlocked(expect, result);
  });

  it('blocks -f flag (body field)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-f', build.field()));
    assertBlocked(expect, result);
  });

  it('blocks -F flag (@file read)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-F', build.fileField()));
    assertBlocked(expect, result);
  });

  it('blocks -Fbody=@file (concatenated -F)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-Fbody=@/etc/passwd'));
    assertBlocked(expect, result);
  });

  it('blocks --field flag', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--field', build.field()));
    assertBlocked(expect, result);
  });

  it('blocks --raw-field flag', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--raw-field', build.field()));
    assertBlocked(expect, result);
  });

  it('blocks --verbose flag (token leak)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--verbose'));
    assertBlocked(expect, result);
  });

  it('blocks -H flag (header injection)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-H', 'Accept: text/plain'));
    assertBlocked(expect, result);
  });

  it('blocks --header flag', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('--header', build.header()));
    assertBlocked(expect, result);
  });

  it('blocks -HAccept:text/plain (concatenated -H)', async ({ expect }) => {
    const result = await callMocked(build.apiArgs('-HAccept:text/plain'));
    assertBlocked(expect, result);
  });

  it('blocks full URL', async ({ expect }) => {
    const result = await callMocked(['api', `https://api.github.com/${build.prCommentsPath()}`]);
    assertBlocked(expect, result);
  });

  it('allows contents without path (directory listing)', async ({ expect }) => {
    assertAllowed(expect, await callMocked(['api', build.template('repos/:owner/:repo/contents')]));
  });

  it('allows contents with trailing slash (directory listing)', async ({ expect }) => {
    const endpoint = build.template('repos/:owner/:repo/contents/');
    assertAllowed(expect, await callMocked(['api', endpoint]));
  });

  it('injects raw Accept header for contents endpoint', async ({ expect }) => {
    const result = await callMocked(['api', build.template('repos/:owner/:repo/contents/:file')]);
    const { args } = echoed(result);
    const hIdx = args.indexOf('-H');

    expect(hIdx).toBeGreaterThan(-1);
    expect(args[hIdx + 1]).toBe('Accept: application/vnd.github.raw+json');
  });

  it('injects raw Accept header for bare contents endpoint', async ({ expect }) => {
    const result = await callMocked(['api', build.template('repos/:owner/:repo/contents')]);
    const { args } = echoed(result);
    const hIdx = args.indexOf('-H');

    expect(hIdx).toBeGreaterThan(-1);
    expect(args[hIdx + 1]).toBe('Accept: application/vnd.github.raw+json');
  });

  it('does not inject Accept header for non-contents endpoint', async ({ expect }) => {
    const result = await callMocked(build.apiArgs());
    const { args } = echoed(result);

    expect(args.indexOf('-H')).toBe(-1);
  });
});
