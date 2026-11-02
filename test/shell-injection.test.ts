import { describe, it } from 'vitest';
import { type Canary, assertCanaryIntact, useCanary } from './canary.ts';
import { type Server, assertBlocked, useServer } from './helpers.ts';

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
      ].map(t => ({
        label: t.map(a => a.replace('{f}', 'CANARY')).join(' '),
        template: t,
      })),
    )('prevents: git $label', async ({ label, template }, { canary, expect, server }) => {
      const realArgs = template.map(a => a.replace('{f}', canary.file));
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
      ].map(t => ({
        label: `${t.command} ${t.args.map(a => JSON.stringify(a.replace('{f}', 'CANARY'))).join(' ')}`,
        template: t,
      })),
    )('prevents: $label', async ({ label, template }, { canary, expect, server }) => {
      const call = {
        command: template.command,
        args: template.args.map(a => a.replace('{f}', canary.file)),
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
