import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArgsSchema, matchesAllowlist, rejectSubcommand } from '../lib/allowlist.ts';
import { exec } from '../lib/exec.ts';

const subcommands = new Set([
  'jira board list',
  'jira filter list',
  'jira project list',
  'jira sprint list',
  'jira workitem comment list',
  'jira workitem list',
  'jira workitem search',
  'jira workitem view',
]);

export const register = (server: McpServer) =>
  server.registerTool(
    'acli',
    {
      description: 'Run read-only Atlassian CLI commands (jira board/filter/project/sprint/workitem list/search/view/comment list)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      if (!matchesAllowlist(args, subcommands))
        return rejectSubcommand(args, subcommands);
      return exec('acli', args);
    },
  );
