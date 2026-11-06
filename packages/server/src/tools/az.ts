import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArgsSchema, isAllowlisted, rejectSubcommand } from '#src/lib/allowlist.js';
import { runPlan } from '#src/lib/exec.js';
import { type Plan, type Rejection, reject, run } from '#src/lib/plan.js';

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
    if (next !== undefined && args[index] === flag) values.push(next);
  }
  return values;
};

const rejectInvokeEndpoint = (args: readonly string[]): Rejection => {
  const [area, ...extraAreas] = flagValues(args, '--area');
  if (area === undefined)
    return reject('Missing required flag: --area');
  const [resource, ...extraResources] = flagValues(args, '--resource');
  if (resource === undefined)
    return reject('Missing required flag: --resource');
  if (extraAreas.length > 0)
    return reject('Flag not allowed: duplicate --area');
  if (extraResources.length > 0)
    return reject('Flag not allowed: duplicate --resource');
  const endpoint = `${area}/${resource}`;
  return invokeAllowedEndpoints.has(endpoint)
    ? undefined
    : reject(`Endpoint not allowed for devops invoke: --area ${area} --resource ${resource}. ` +
      `Allowed: ${[...invokeAllowedEndpoints].join(', ')}`);
};

export const plan = (args: readonly string[]): Plan => {
  if (!isAllowlisted(args, subcommands))
    return rejectSubcommand(args, subcommands);
  const [group, command, ...invokeArgs] = args;
  if (group !== 'devops' || command !== 'invoke') return run('az', args, { runner: 'shell' });
  // Reject any flag (single or double dash) not in the allowlist. This
  // blocks unknown short flags (e.g., `-X`) that could bypass the `--`-only
  // check. Flag values for known flags (e.g., `--area build`) are not
  // checked here because they don't start with `-` in normal usage.
  const unknownFlag = invokeArgs.find(arg =>
    arg.startsWith('-') && !invokeAllowedFlags.has(arg.split('=', 1)[0] ?? arg));
  // Explicitly force GET so we don't depend on az CLI's default
  return unknownFlag
    ? reject(`Flag not allowed: ${unknownFlag}`)
    : rejectInvokeEndpoint(args) ??
      run('az', [...args, '--http-method', 'GET'], { runner: 'shell' });
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'az',
    {
      description: 'Run read-only Azure DevOps CLI commands (devops invoke for GET-only REST API ' +
        'limited to build-debugging endpoints, devops ' +
        'project/team/extension/service-endpoint/wiki, pipelines ' +
        'list/show/build/release/runs/pool/agent). Prefer dedicated subcommands when available; ' +
        'use devops invoke only for endpoints without a CLI equivalent (e.g., build ' +
        'logs/timeline).',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => runPlan(plan(args)),
  );
