import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ArgsSchema } from '../lib/allowlist.ts';
import { execShell, fail } from '../lib/exec.ts';

const commands = new Set([
  'basename', 'date', 'dirname', 'eza', 'file', 'jq', 'ls', 'pwd',
  'readlink', 'realpath', 'stat', 'wc', 'which', 'whoami',
]);

// jq: block file-path arguments to prevent reading arbitrary files.
// Allow only flags (-r, -e, -S, --arg, etc.) and filter expressions.
// Flags that read files — block entirely (data exfiltration via --slurpfile/--rawfile,
// arbitrary filter loading via --from-file/-f, library path probing via -L)
const jqFileFlags = new Set([
  '--slurpfile', '--rawfile', '--from-file', '-f', '-L', '--library-path',
]);
// Flags that take two following arguments (name + value)
const jqPairFlags = new Set(['--arg', '--argjson']);
// Flags that take one following argument
const jqValueFlags = new Set(['--indent']);

// Single characters corresponding to file-reading short flags (-f, -L)
const jqFileChars = 'fL';

const rejectFileFlag = (arg: string): CallToolResult | null => {
  const base = arg.split('=', 1)[0] ?? arg;
  if (jqFileFlags.has(base)) return fail(`Flag not allowed for jq: ${base}`);
  if (arg.startsWith('-') && !arg.startsWith('--')) {
    const ch = [...arg.slice(1)].find(c => jqFileChars.includes(c));
    if (ch) return fail(`Flag not allowed for jq: -${ch}`);
  }
  return null;
};

// Two-phase scan: walks flags before the filter expression (skipping flag-value
// pairs like --arg k v), then blocks any non-flag positional after the filter
// as a file path.
const validateJqArgs = (args: readonly string[]): CallToolResult | null => {
  // The index skips flag values, so these stay counted loops. Each binds its
  // element once; the undefined check never fires within the length bound.
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) break;
    const blocked = rejectFileFlag(arg);
    if (blocked) return blocked;
    if (jqPairFlags.has(arg)) { i += 2; continue; }
    if (jqValueFlags.has(arg)) { i++; continue; }
    if (arg.startsWith('-')) continue;
    // First non-flag arg is the filter expression; rest are file paths
    for (let j = i + 1; j < args.length; j++) {
      const rest = args[j];
      if (rest === undefined) break;
      const jblocked = rejectFileFlag(rest);
      if (jblocked) return jblocked;
      if (jqPairFlags.has(rest)) { j += 2; continue; }
      if (jqValueFlags.has(rest)) { j++; continue; }
      if (rest.startsWith('-')) continue;
      return fail(`File arguments not allowed for jq (use stdin via piping). Got: ${rest}`);
    }
    break;
  }
  return null;
};

export const register = (server: McpServer) =>
  server.registerTool(
    'shell',
    {
      description: 'Run read-only shell utilities (basename, date, dirname, eza, file, jq, ls, pwd, readlink, realpath, stat, wc, which, whoami)',
      inputSchema: {
        command: z.string().describe('Command name from the allowlist'),
        ...ArgsSchema,
      },
    },
    async ({ command, args }) => {
      if (!commands.has(command))
        return fail(`Command not allowed: ${command}. Allowed: ${[...commands].join(', ')}`);
      if (command === 'jq') {
        const rejection = validateJqArgs(args);
        if (rejection) return rejection;
      }
      return execShell(command, args);
    },
  );
