import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import * as build from '#test/builders.js';
import {
  type Server, assertBlocked, useServer,
} from '#test/helpers.js';

const integration = it.extend<{ server: Server }>({
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('gh api (integration)', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('blocked api endpoints', () => {
    integration.for(([
      'repos/:owner/:repo/git/refs',
      'repos/:owner/:repo/pulls/:number/merge',
      'gists',
      'user/repos',
      'graphql',
    ] as const).map(template => ({ name: template, args: ['api', build.template(template)] })))(
      'blocks api $name', async ({ args }, { expect, server }) => {
        assertBlocked(expect, await server.callTool('gh', { args }));
      },
    );
  });

  describe('blocked api flags', () => {
    integration.for([
      { name: '--method POST', args: build.apiArgs('--method', 'POST') },
      { name: '--method=DELETE', args: build.apiArgs('--method=DELETE') },
      { name: '-X POST', args: build.apiArgs('-X', 'POST') },
      { name: '-XPOST (concatenated)', args: build.apiArgs('-XPOST') },
      { name: '-XDELETE (concatenated)', args: build.apiArgs('-XDELETE') },
      { name: '--input', args: build.apiArgs('--input', build.fileName('json')) },
      { name: '--input=file', args: build.apiArgs(`--input=${build.fileName('json')}`) },
      { name: '--meth (abbreviated)', args: build.apiArgs('--meth', 'POST') },
      { name: '--hostname (SSRF)', args: build.apiArgs('--hostname', faker.internet.domainName()) },
      {
        name: '--hostname=evil (SSRF)',
        args: build.apiArgs(`--hostname=${faker.internet.domainName()}`),
      },
      { name: '-f (body field)', args: build.apiArgs('-f', build.field()) },
      { name: '-fkey=val (concatenated)', args: build.apiArgs(`-f${build.field()}`) },
      { name: '-F (@file read)', args: build.apiArgs('-F', build.fileField()) },
      { name: '-Fx=@file (concatenated)', args: build.apiArgs('-Fx=@/etc/passwd') },
      { name: '--field', args: build.apiArgs('--field', build.field()) },
      { name: '--raw-field', args: build.apiArgs('--raw-field', build.field()) },
      { name: '--verbose (token leak)', args: build.apiArgs('--verbose') },
      { name: '-H (header injection)', args: build.apiArgs('-H', 'Accept: text/plain') },
      { name: '--header', args: build.apiArgs('--header', build.header()) },
      { name: '-HAccept:... (concatenated)', args: build.apiArgs('-HAccept:text/plain') },
    ])('blocks api $name', async ({ args }, { expect, server }) => {
      assertBlocked(expect, await server.callTool('gh', { args }));
    });
  });

  describe('blocked api full URLs', () => {
    integration('blocks https:// URL', async ({ expect, server }) => {
      assertBlocked(expect, await server.callTool('gh', {
        args: ['api', `https://api.github.com/${build.prCommentsPath()}`],
      }));
    });

    integration('blocks http:// URL', async ({ expect, server }) => {
      assertBlocked(expect, await server.callTool('gh', {
        /* eslint-disable-next-line unicorn/prefer-https --
           The plain http scheme is the input under test */
        args: ['api', `http://api.github.com/${build.prCommentsPath()}`],
      }));
    });
  });

  integration('blocks bare api', async ({ expect, server }) => {
    assertBlocked(expect, await server.callTool('gh', { args: ['api'] }));
  });
});
