import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ArgsSchema, isAllowlisted, rejectSubcommand } from '../lib/allowlist.ts';
import { execShell, fail } from '../lib/exec.ts';

const subcommands = new Set([
  // devops
  'devops invoke',
  'devops project list', 'devops project show',
  'devops team list', 'devops team list-member', 'devops team show',
  'devops extension list', 'devops extension search', 'devops extension show',
  'devops service-endpoint list', 'devops service-endpoint show',
  'devops wiki list', 'devops wiki show',
  'devops wiki page show',
  // pipelines
  'pipelines list', 'pipelines show',
  'pipelines agent list', 'pipelines agent show',
  'pipelines build list', 'pipelines build show',
  'pipelines build definition list', 'pipelines build definition show',
  'pipelines build tag list',
  'pipelines folder list',
  'pipelines pool list', 'pipelines pool show',
  'pipelines release list', 'pipelines release show',
  'pipelines release definition list', 'pipelines release definition show',
  'pipelines runs list', 'pipelines runs show',
  'pipelines runs artifact list',
  'pipelines runs tag list',
  'pipelines variable list',
  'pipelines variable-group list', 'pipelines variable-group show',
]);

// devops invoke: GET-only, no file I/O, restricted to build-debugging endpoints
// Uses an allowlist (not rejectBlockedFlags) so any unknown --flag is rejected,
// which is strictly safer than blocklisting and also blocks abbreviation bypass.
const invokeAllowedFlags = new Set([
  '--area', '--resource', '--route-parameters', '--query-parameters',
  '--api-version', '--org', '--organization', '--project', '--detect',
  '--output', '--query', '--verbose', '--debug', '--only-show-errors',
  '--help', '--subscription',
]);

const invokeAllowedEndpoints = new Set([
  'build/builds', 'build/timeline', 'build/logs',
  'build/changes', 'build/artifacts', 'build/leases',
  'test/runs',
]);

const flagValues = (args: readonly string[], flag: string): string[] => {
  const values: string[] = [];
  for (const arg of args) {
    if (arg.startsWith(flag + '=')) values.push(arg.slice(flag.length + 1));
  }
  for (let index = 0; index < args.length; index++) {
    // A following argument exists exactly when index + 1 is within the length.
    const next = args[index + 1];
    if (args[index] === flag && next !== undefined) values.push(next);
  }
  return values;
};

const rejectInvokeEndpoint = (args: readonly string[]): CallToolResult | undefined => {
  const areas = flagValues(args, '--area');
  const resources = flagValues(args, '--resource');
  if (areas.length === 0)
    return fail('Missing required flag: --area');
  if (resources.length === 0)
    return fail('Missing required flag: --resource');
  if (areas.length > 1)
    return fail('Flag not allowed: duplicate --area');
  if (resources.length > 1)
    return fail('Flag not allowed: duplicate --resource');
  const endpoint = `${areas[0]}/${resources[0]}`;
  return invokeAllowedEndpoints.has(endpoint)
    ? undefined
    : fail(`Endpoint not allowed for devops invoke: --area ${areas[0]} --resource ${resources[0]}. Allowed: ${[...invokeAllowedEndpoints].join(', ')}`);
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'az',
    {
      description: 'Run read-only Azure DevOps CLI commands (devops invoke for GET-only REST API limited to build-debugging endpoints, devops project/team/extension/service-endpoint/wiki, pipelines list/show/build/release/runs/pool/agent). Prefer dedicated subcommands when available; use devops invoke only for endpoints without a CLI equivalent (e.g., build logs/timeline).',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      if (!isAllowlisted(args, subcommands))
        return rejectSubcommand(args, subcommands);
      const [group, command, ...invokeArgs] = args;
      if (group === 'devops' && command === 'invoke') {
        // Reject any flag (single or double dash) not in the allowlist. This
        // blocks unknown short flags (e.g., `-X`) that could bypass the `--`-only
        // check. Flag values for known flags (e.g., `--area build`) are not
        // checked here because they don't start with `-` in normal usage.
        const unknownFlag = invokeArgs.find(arg => arg.startsWith('-') && !invokeAllowedFlags.has(arg.split('=', 1)[0] ?? arg));
        if (unknownFlag) return fail(`Flag not allowed: ${unknownFlag}`);
        const endpointRejection = rejectInvokeEndpoint(args);
        if (endpointRejection) return endpointRejection;
        // Explicitly force GET so we don't depend on az CLI's default
        return execShell('az', [...args, '--http-method', 'GET']);
      }
      return execShell('az', args);
    },
  );
