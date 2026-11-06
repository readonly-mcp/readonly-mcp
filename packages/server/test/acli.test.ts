import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import { connectTool, textOf } from '#test/helpers.js';

// --- Unit tests (mocked exec) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/acli.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('acli tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for([
      ['jira', 'board', 'list'],
      ['jira', 'filter', 'list'],
      ['jira', 'project', 'list'],
      ['jira', 'sprint', 'list'],
      ['jira', 'workitem', 'comment', 'list'],
      ['jira', 'workitem', 'list'],
      ['jira', 'workitem', 'search'],
      ['jira', 'workitem', 'view'],
    ].map(args => ({ name: args.join(' '), args })))(
      'allows $name', async ({ args }, { expect }) => {
        assertAllowed(expect, await callMocked(args));
      },
    );

    it('allows subcommand with flags', async ({ expect }) => {
      const project = faker.string.alpha({ casing: 'upper', length: 3 });
      assertAllowed(expect, await callMocked(['jira', 'workitem', 'list', '--project', project]));
    });
  });
});
