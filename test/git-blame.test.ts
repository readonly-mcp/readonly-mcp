import { describe, it } from 'vitest';
import * as build from './builders.ts';
import { type Call, type Server, assertBlocked, assertNotBlocked, useServer } from './helpers.ts';

const integration = it.extend<{ call: Call; server: Server }>({
  call: async ({ server }, use) => use(args => server.callTool('git', { args })),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('git blame file-read blocking (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  integration.for([
    { args: ['--contents', build.absolutePath()], name: '--contents <path>' },
    { args: [`--contents=${build.absolutePath()}`], name: '--contents=<path>' },
    { args: ['--cont', build.absolutePath()], name: '--cont (abbreviation)' },
    { args: ['-S', build.absolutePath()], name: '-S <path>' },
    { args: [`-S${build.absolutePath()}`], name: '-S<path>' },
    { args: ['-wS', build.absolutePath()], name: '-wS (grouped)' },
    { args: ['--ignore-revs-file', build.absolutePath()], name: '--ignore-revs-file <path>' },
    { args: [`--ignore-revs-file=${build.absolutePath()}`], name: '--ignore-revs-file=<path>' },
  ])('blocks blame $name', async ({ args }, { call, expect }) => {
    assertBlocked(expect, await call(['blame', ...args, 'README.md']));
  });

  integration('allows blame -L whose range holds an S', async ({ call, expect }) => {
    assertNotBlocked(expect, await call(['blame', '-L/S/,+1', 'README.md']));
  });

  integration.for([['--ignore-rev', 'HEAD'], ['--ignore-rev=HEAD']])(
    'allows blame %s, a prefix of --ignore-revs-file', async (args, { call, expect }) => {
      assertNotBlocked(expect, await call(['blame', ...args, 'README.md']));
    },
  );
});
