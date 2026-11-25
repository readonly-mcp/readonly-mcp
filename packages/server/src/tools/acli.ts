import { ArgsSchema, isAllowlisted, rejectSubcommand } from '#src/lib/allowlist.js';
import { type Plan, run } from '#src/lib/plan.js';
import { defineTool } from '#src/lib/tool.js';

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

export const plan = (args: readonly string[]): Plan =>
  isAllowlisted(args, subcommands) ? run('acli', args) : rejectSubcommand(args, subcommands);

export const tool = defineTool({
  description: 'Run read-only Atlassian CLI commands (jira ' +
    'board/filter/project/sprint/workitem list/search/view/comment list)',
  inputSchema: ArgsSchema,
  name: 'acli',
  plan: ({ args }) => plan(args),
});
