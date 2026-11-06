import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import * as build from '#test/builders.js';
import {
  connectTool, echoed, textOf } from '#test/helpers.js';

// --- Unit tests (mocked execShell) ---
// Allowed paths hit the real `az` CLI which is slow (~1-2s per call),
// so we mock execShell to keep these fast.

vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/az.js');

const callTool = await connectTool(register);

const callMocked = (args: readonly string[]) => callTool({ args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('az tool (unit)', () => {
  describe('allowed subcommands', () => {
    it('allows devops project list', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['devops', 'project', 'list']));
    });

    it('allows pipelines list', async ({ expect }) => {
      assertAllowed(expect, await callMocked(['pipelines', 'list']));
    });

    it('allows pipelines build show', async ({ expect }) => {
      const id = build.resourceId();
      assertAllowed(expect, await callMocked(['pipelines', 'build', 'show', '--id', id]));
    });
  });

  describe('allowed devops invoke endpoints', () => {
    it.for([
      { area: 'build', resource: 'builds' },
      { area: 'build', resource: 'timeline' },
      { area: 'build', resource: 'logs' },
      { area: 'build', resource: 'changes' },
      { area: 'build', resource: 'artifacts' },
      { area: 'build', resource: 'leases' },
      { area: 'test', resource: 'runs' },
    ])('allows --area $area --resource $resource', async ({ area, resource }, { expect }) => {
      assertAllowed(expect, await callMocked(
        ['devops', 'invoke', '--area', area, '--resource', resource],
      ));
    });

    it('allows with extra safe flags', async ({ expect }) => {
      assertAllowed(expect, await callMocked(
        ['devops', 'invoke', '--area', 'build', '--resource', 'builds',
          '--route-parameters', `buildId=${build.resourceId()}`,
          '--query-parameters', 'api-version=7.0',
          '--output', 'json'],
      ));
    });

    it('allows --area=value --resource=value form', async ({ expect }) => {
      assertAllowed(expect, await callMocked(
        ['devops', 'invoke', '--area=build', '--resource=builds'],
      ));
    });

    it('injects --http-method GET into execShell args', async ({ expect }) => {
      const result = await callMocked(
        ['devops', 'invoke', '--area', 'build', '--resource', 'builds'],
      );
      const { args } = echoed(result);
      const methodIdx = args.indexOf('--http-method');

      expect(methodIdx, 'should contain --http-method').not.toBe(-1);
      expect(args[methodIdx + 1]).toBe('GET');
    });
  });
});
