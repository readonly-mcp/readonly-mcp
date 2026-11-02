import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ArgsSchema, isAllowlisted, rejectBlockedFlags, rejectSubcommand,
} from '../lib/allowlist.ts';
import { execShell } from '../lib/exec.ts';

const subcommands = new Set([
  'audit', 'bin', 'explain', 'fund', 'ls', 'outdated', 'root', 'search', 'view',
]);

// --fix: npm audit fix attempts to update packages
// --registry: prevents SSRF / data exfiltration via attacker-controlled registries
// --no-ignore-scripts: overrides the injected --ignore-scripts (npm uses last-wins)
const blockedFlags = new Set(['--fix', '--registry', '--no-ignore-scripts', '--ignore-scripts']);

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'npm',
    {
      description: 'Run read-only npm commands (audit, bin, explain, fund, ls, outdated, root, ' +
        'search, view)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      if (!isAllowlisted(args, subcommands))
        return rejectSubcommand(args, subcommands);
      const rejected = rejectBlockedFlags(args, blockedFlags);
      if (rejected) return rejected;
      return execShell('npm', ['--ignore-scripts', ...args]);
    },
  );
