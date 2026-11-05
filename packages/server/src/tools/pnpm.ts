import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
// Uses execShell instead of exec for Windows compatibility: pnpm installed via
// npm or corepack ships as a .cmd wrapper that execFile cannot invoke directly.
// execShell is a no-op on non-Windows and wraps with bash on Windows.
import {
  ArgsSchema, type BlockedFlagOptions, isAllowlisted, rejectBlockedFlags, rejectSubcommand,
} from '#src/lib/allowlist.js';
import { execShell } from '#src/lib/exec.js';

const globalFlags = new Set(['--version', '--help', '-h']);

const subcommands = new Set([
  'audit', 'bin', 'licenses list', 'list', 'outdated', 'root', 'search', 'store status', 'why',
]);

// --fix: pnpm audit --fix attempts to update packages
// --registry: prevents SSRF / data exfiltration via attacker-controlled registries
// --userconfig / --globalconfig / --npmrc-auth-file: read a caller-chosen .npmrc
// --dir / -C: move the project root, and with it the .npmrc pnpm reads
// --proxy / --https-proxy: route registry requests through a caller-chosen host
const blockedFlags = new Set([
  '--fix', '--registry',
  '--userconfig', '--globalconfig', '--npmrc-auth-file', '--dir', '-C',
  '--proxy', '--https-proxy',
]);

const blockedFlagOptions = {
  // --global is a flag of its own, not an abbreviation of --globalconfig
  exempt: new Set(['--global']),
  expandsShortGroups: true,
  patterns: [
    // --config.<key>: sets any setting, the registry among them
    /^--config\./v,
    // --@scope:registry: sets the registry for one scope, which --registry does not prefix
    /:registry$/v,
  ],
  readsSingleDashLong: true,
} satisfies BlockedFlagOptions;

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'pnpm',
    {
      description: 'Run read-only pnpm commands (--version, --help, audit, bin, licenses list, ' +
        'list, outdated, root, search, store status, why)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      const [only, ...rest] = args;
      const isGlobal = only !== undefined && rest.length === 0 && globalFlags.has(only);
      if (!isGlobal && !isAllowlisted(args, subcommands))
        return rejectSubcommand(args, subcommands);
      const rejected = rejectBlockedFlags(args, blockedFlags, blockedFlagOptions);
      return rejected ?? execShell('pnpm', args);
    },
  );
