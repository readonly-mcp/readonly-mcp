import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArgsSchema, isAllowlisted, rejectSubcommand } from '../lib/allowlist.ts';
import { exec } from '../lib/exec.ts';

const subcommands = new Set([
  'diff', 'doctor', 'managed',
  'source-path', 'status', 'target-path', 'verify',
]);

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'chezmoi',
    {
      description: 'Run read-only chezmoi commands (diff, doctor, managed, source-path, status, target-path, verify)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      if (!isAllowlisted(args, subcommands))
        return rejectSubcommand(args, subcommands);
      return exec('chezmoi', args);
    },
  );
