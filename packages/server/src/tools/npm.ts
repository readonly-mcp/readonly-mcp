import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ArgsSchema, type BlockedFlagOptions, isAllowlisted, rejectBlockedFlags, rejectSubcommand,
} from '#src/lib/allowlist.js';
import { execShell } from '#src/lib/exec.js';

const subcommands = new Set([
  'audit', 'bin', 'explain', 'fund', 'ls', 'outdated', 'root', 'search', 'view',
]);

// --fix: npm audit fix attempts to update packages
// --registry: prevents SSRF / data exfiltration via attacker-controlled registries
// --no-ignore-scripts: overrides the injected --ignore-scripts (npm uses last-wins)
// --userconfig / --globalconfig: read the registry from a caller-chosen .npmrc
// --prefix / -C: move the project root, and with it the .npmrc npm reads
// --proxy / --https-proxy: route registry requests through a caller-chosen host
const blockedFlags = new Set([
  '--fix', '--registry', '--no-ignore-scripts', '--ignore-scripts',
  '--userconfig', '--globalconfig', '--prefix', '-C', '--proxy', '--https-proxy',
]);

const blockedFlagOptions = {
  // --global is a flag of its own, not an abbreviation of --globalconfig
  exempt: new Set(['--global']),
  expandsShortGroups: true,
  // --@scope:registry: sets the registry for one scope, which --registry does not prefix
  patterns: [/:registry$/v],
  readsSingleDashLong: true,
} satisfies BlockedFlagOptions;

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
      const rejected = rejectBlockedFlags(args, blockedFlags, blockedFlagOptions);
      return rejected ?? execShell('npm', ['--ignore-scripts', ...args]);
    },
  );
