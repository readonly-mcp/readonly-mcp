import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Uses execShell instead of exec for Windows compatibility: pnpm installed via
// npm or corepack ships as a .cmd wrapper that execFile cannot invoke directly.
// execShell is a no-op on non-Windows and wraps with bash on Windows.
import { ArgsSchema, matchesAllowlist, rejectBlockedFlags, rejectSubcommand } from '../lib/allowlist.ts';
import { execShell } from '../lib/exec.ts';

const globalFlags = new Set(['--version', '--help', '-h']);

const subcommands = new Set([
  'audit', 'bin', 'licenses list', 'list', 'outdated', 'root', 'search', 'store status', 'why',
]);

// --fix: pnpm audit --fix attempts to update packages
// --registry: prevents SSRF / data exfiltration via attacker-controlled registries
const blockedFlags = new Set(['--fix', '--registry']);

export const register = (server: McpServer) =>
  server.registerTool(
    'pnpm',
    {
      description: 'Run read-only pnpm commands (--version, --help, audit, bin, licenses list, list, outdated, root, search, store status, why)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      const [only, ...rest] = args;
      const isGlobal = only !== undefined && rest.length === 0 && globalFlags.has(only);
      if (!isGlobal && !matchesAllowlist(args, subcommands))
        return rejectSubcommand(args, subcommands);
      const rejected = rejectBlockedFlags(args, blockedFlags);
      if (rejected) return rejected;
      return execShell('pnpm', args);
    },
  );
