import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArgsSchema, isAllowlisted, rejectSubcommand } from '#src/lib/allowlist.js';
import { exec } from '#src/lib/exec.js';

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

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'acli',
    {
      description: 'Run read-only Atlassian CLI commands (jira ' +
        'board/filter/project/sprint/workitem list/search/view/comment list)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      return isAllowlisted(args, subcommands)
        ? exec('acli', args)
        : rejectSubcommand(args, subcommands);
    },
  );
