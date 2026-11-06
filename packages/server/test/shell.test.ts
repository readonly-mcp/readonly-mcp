import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ExpectStatic, describe, it, vi } from 'vitest';
import {
  connectTool, textOf } from '#test/helpers.js';

// --- Unit tests (mocked execShell) ---
vi.mock(import('#src/lib/exec.js'), async (importOriginal) => {
  const { withEchoExec } = await import('#test/helpers.js');
  return withEchoExec(importOriginal);
});

const { register } = await import('#src/tools/shell.js');

const callTool = await connectTool(register);

const callMocked = (command: string, args: readonly string[] = []) => callTool({ command, args });

const assertAllowed = (expect: ExpectStatic, result: CallToolResult) => {
  expect(result.isError, `expected allowed, got: ${textOf(result)}`).toBeFalsy();
};

describe.concurrent('shell tool (unit)', () => {
  describe('allowed commands', () => {
    it.for([
      'basename', 'date', 'dirname', 'eza', 'file', 'jq', 'ls', 'pwd',
      'readlink', 'realpath', 'stat', 'wc', 'which', 'whoami',
    ])('allows %s', async (cmd, { expect }) => {
      assertAllowed(expect, await callMocked(cmd));
    });
  });
});
