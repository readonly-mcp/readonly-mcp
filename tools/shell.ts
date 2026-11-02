import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
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
const pairFlagValues = 2;
// Flags that take one following argument
const jqValueFlags = new Set(['--indent']);

// A character of a file-reading short flag (-f, -L) within a short-flag group
const jqFileChar = /[fL]/v;

const rejectFileFlag = (arg: string): CallToolResult | undefined => {
  const base = arg.split('=', 1)[0] ?? arg;
  if (jqFileFlags.has(base)) return fail(`Flag not allowed for jq: ${base}`);
  if (arg.startsWith('-') && !arg.startsWith('--')) {
    const fileChar = jqFileChar.exec(arg.slice(1))?.[0];
    if (fileChar) return fail(`Flag not allowed for jq: -${fileChar}`);
  }
  return undefined;
};

// Walks the args, skipping flag values (like --arg k v). The first positional
// is the filter expression; any positional after it is a file path.
const validateJqArgs = (args: readonly string[]): CallToolResult | undefined => {
  let hasFilter = false;
  // The index skips flag values, so this stays a counted loop. It binds each
  // element once; the undefined check never fires within the length bound.
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    const blocked = rejectFileFlag(arg);
    if (blocked) return blocked;
    if (jqPairFlags.has(arg)) index += pairFlagValues;
    else if (jqValueFlags.has(arg)) index++;
    else if (!arg.startsWith('-')) {
      if (hasFilter)
        return fail(`File arguments not allowed for jq (use stdin via piping). Got: ${arg}`);
      hasFilter = true;
    }
  }
  return undefined;
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'shell',
    {
      description: 'Run read-only shell utilities (basename, date, dirname, eza, file, jq, ls, ' +
        'pwd, readlink, realpath, stat, wc, which, whoami)',
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
