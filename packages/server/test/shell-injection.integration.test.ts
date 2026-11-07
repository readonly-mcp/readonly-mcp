// @module-tag integration
import { describe, it } from 'vitest';
import { type Canary, assertCanaryIntact, useCanary } from '#test/canary.js';
import { type Server, assertBlocked, useServer } from '#test/helpers.js';

const integration = it.extend<{ canary: Canary; server: Server }>({
  canary: async ({}, use) => useCanary(use),
  server: [async ({}, use) => useServer(use), { scope: 'file' }],
});

describe.concurrent('shell injection', () => {
  integration.beforeAll(({ server }) => server.initialize());

  describe('via git args', () => {
    integration.for(
      [
        ['status', ';', 'rm'],
        ['status', '&&', 'rm'],
        ['status', '||', 'rm'],
        ['status', '|', 'rm'],
        ['status', '$(rm {f})'],
        ['status', '`rm {f}`'],
      ].map(argv => ({
        label: argv.map(arg => arg.replace('{f}', 'CANARY')).join(' '),
        template: argv,
      })),
    )('prevents: git $label', async ({ label, template }, { canary, expect, server }) => {
      const realArgs = template.map(arg => arg.replace('{f}', () => canary.file));
      await server.callTool('git', { args: realArgs });
      await assertCanaryIntact(expect, canary, `git ${label}`);
    });
  });

  describe('via shell args', () => {
    integration.for(
      [
        { command: 'ls', args: ['; rm {f}'] },
        { command: 'ls', args: ['&& rm {f}'] },
        { command: 'ls', args: ['| rm {f}'] },
        { command: 'ls', args: ['$(rm {f})'] },
        { command: 'ls', args: ['`rm {f}`'] },
        { command: 'ls', args: [';', 'rm', '{f}'] },
        { command: 'ls', args: ['&&', 'rm', '{f}'] },
        { command: 'ls', args: ['||', 'rm', '{f}'] },
        { command: 'ls', args: ['|', 'rm', '{f}'] },
        { command: 'ls', args: ['" ; rm {f} #'] },
        { command: 'ls', args: ["' ; rm {f} #"] },
        { command: 'ls', args: ['\nrm {f}'] },
        { command: 'ls', args: ['\r\nrm {f}'] },
        { command: 'ls', args: ['\0rm {f}'] },
      ].map((attack) => {
        const shown = attack.args.map(arg => JSON.stringify(arg.replace('{f}', 'CANARY')));
        return { label: `${attack.command} ${shown.join(' ')}`, template: attack };
      }),
    )('prevents: $label', async ({ label, template }, { canary, expect, server }) => {
      const call = {
        command: template.command,
        args: template.args.map(arg => arg.replace('{f}', () => canary.file)),
      };
      await server.callTool('shell', call);
      await assertCanaryIntact(expect, canary, label);
    });
  });

  describe('blocked rm via shell tool', () => {
    integration('blocks rm and preserves canary', async ({ canary, expect, server }) => {
      const result = await server.callTool('shell', { command: 'rm', args: [canary.file] });
      assertBlocked(expect, result);
      await assertCanaryIntact(expect, canary, 'shell rm');
    });
  });
});
