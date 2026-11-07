import { describe, it } from 'vitest';
import { plan } from '#src/tools/shell.js';
import { runOf } from '#test/helpers.js';

describe.concurrent('shell tool', () => {
  describe('allowed commands', () => {
    it.for([
      'basename', 'date', 'dirname', 'eza', 'file', 'jq', 'ls', 'pwd',
      'readlink', 'realpath', 'stat', 'wc', 'which', 'whoami',
    ])('runs %s through the shell runner', (command, { expect }) => {
      const { cmd, runner } = runOf(plan(command, []));

      expect({ cmd, runner }).toStrictEqual({ cmd: command, runner: 'shell' });
    });
  });
});
