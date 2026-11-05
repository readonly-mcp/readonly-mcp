import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { fail } from '#src/lib/exec.js';

// What a reject helper returns: the failure, or undefined when nothing is rejected.
export type Rejection = CallToolResult | undefined;

// LLMs frequently serialize array parameters as JSON strings instead of native
// arrays (e.g., '["status", "-sb"]' instead of ["status", "-sb"]). The MCP
// Python SDK calls this out explicitly; the TypeScript SDK does not handle it.
// Coerce stringified JSON arrays before Zod validation so callers recover
// gracefully. Only arrays are accepted — stringified objects/primitives still
// fail validation.
const coerceArgs = (val: unknown): unknown => {
  if (typeof val !== 'string') return val;
  try {
    const parsed: unknown = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return val;
};

export const ArgsSchema = {
  args: z.preprocess(coerceArgs, z.array(z.string()).default([]))
    .describe('Command arguments'),
};

const maxDepthOf = (allowlist: ReadonlySet<string>): number => {
  const entries = [...allowlist];
  return entries.length === 0 ? 1 : Math.max(...entries.map(entry => entry.split(' ').length));
};

export const isAllowlisted = (args: readonly string[], allowlist: ReadonlySet<string>): boolean =>
  args
    .slice(0, maxDepthOf(allowlist))
    .some((_arg, index) => allowlist.has(args.slice(0, index + 1).join(' ')));

export const rejectSubcommand = (
  args: readonly string[], allowlist: ReadonlySet<string>,
): CallToolResult => {
  const depth = maxDepthOf(allowlist);
  const sub = args.slice(0, depth).join(' ') || '(none)';
  return fail(`Subcommand not allowed: ${sub}. Allowed: ${[...allowlist].join(', ')}`);
};

export const normalizeApiPath = (endpoint: string | undefined): string =>
  endpoint?.replace(/^\//v, '').split('?', 1)[0]?.replace(/\/$/v, '') || '';

// Matches a GitHub API endpoint path against a list of segment patterns.
// `*` matches exactly one segment; trailing `**` matches one or more remaining
// segments (for variable-depth paths like repos/*/*/contents/**).
// Rejects full URLs (http:// / https://) to prevent targeting arbitrary hosts.
export const isAllowedApiPath = (
  endpoint: string | undefined, patterns: readonly string[],
): boolean => {
  if (/^https?:\/\//v.test(endpoint ?? '')) return false;
  const normalized = normalizeApiPath(endpoint);
  if (!normalized) return false;
  const segments = normalized.split('/');
  return patterns.some((pattern) => {
    const pSegments = pattern.split('/');
    const last = pSegments.at(-1);
    if (last === '**') {
      const prefix = pSegments.slice(0, -1);
      return segments.length > prefix.length &&
        prefix.every((part, index) => part === '*' || part === segments[index]);
    }
    return pSegments.length === segments.length &&
      pSegments.every((part, index) => part === '*' || part === segments[index]);
  });
};

export const rejectApiEndpoint = (
  endpoint: string | undefined, patterns: readonly string[],
): CallToolResult => {
  const normalized = normalizeApiPath(endpoint) || '(none)';
  return fail(`API endpoint not allowed: ${normalized}. Allowed patterns: ${patterns.join(', ')}`);
};

interface ShortFlagGroup {
  readonly flags: readonly string[];
  // What follows the flag that ended the group, or '' when nothing does.
  readonly value: string;
}

/**
 * The flags of a short-flag group (`-wC5` holds w and C) and the value after
 * them, or no flags when the arg is not a group. The first flag in
 * `takesValue` ends the group, since it takes the rest of it as its value
 * (`-L1,5`, `-C5`). Without it, every character is read as a flag.
 */
const noValueFlags: ReadonlySet<string> = new Set();

export const shortFlags = (
  arg: string, takesValue: ReadonlySet<string> = noValueFlags,
): ShortFlagGroup => {
  if (!/^-[^\-]/v.test(arg)) return { flags: [], value: '' };
  const group = arg.slice(1).match(/./gsv) ?? [];
  const end = group.findIndex(flag => takesValue.has(flag));
  return end === -1
    ? { flags: group, value: '' }
    : { flags: group.slice(0, end + 1), value: group.slice(end + 1).join('') };
};

export interface BlockedFlagOptions {
  /*
   * Whole flag names of the CLI that prefix a blocked flag, such as npm's
   * `--global` before `--globalconfig`. The CLI reads each as itself rather
   * than as an abbreviation, so the prefix match passes them.
   */
  readonly exempt?: ReadonlySet<string>;
  /*
   * Whether the CLI expands a group of short flags into each of them, as
   * npm reads `-lC` as `-l -C`. A blocked short flag is then matched anywhere
   * in the group, not only at its start.
   */
  readonly expandsShortGroups?: boolean;
  /*
   * Blocked names no fixed list can hold, such as npm's `--@scope:registry`,
   * where the caller picks the scope. Each is tested against the flag's name,
   * the part before any `=`.
   */
  readonly patterns?: readonly RegExp[];
  /*
   * Whether the CLI reads `-name` as `--name`, as npm does for any
   * single-dash arg that does not spell out its shorthands. A single-dash arg
   * of more than one character is then also matched in its long form, so
   * `-reg` is caught as `--reg`. A shorthand group that happens to prefix a
   * blocked name (`-gl` before `--globalconfig`) is rejected with it.
   */
  readonly readsSingleDashLong?: boolean;
}

const isShortFlag = (flag: string): boolean => /^-[^\-]$/v.test(flag);

// A single dash followed by at least two name characters.
const isSingleDashLong = (arg: string): boolean => /^-[^\-][^=]/v.test(arg);

// Uses prefix matching to defeat CLI flag abbreviation. Many CLIs (notably npm
// and pnpm) expand unique prefixes internally, so `--reg` resolves to
// `--registry`. Exact matching would be bypassable via abbreviation. The
// trade-off is that a blocked flag like `--fix` also blocks any flag starting
// with `--fix` (e.g., a hypothetical `--fixup`). This errs on the side of
// safety: false positives (blocking a legitimate flag) are preferable to false
// negatives (allowing a dangerous abbreviated flag through).
export const rejectBlockedFlags = (
  args: readonly string[], blockedFlags: ReadonlySet<string>,
  {
    exempt = new Set(), expandsShortGroups = false, patterns = [], readsSingleDashLong = false,
  }: BlockedFlagOptions = {},
): Rejection => {
  const isBlocked = (arg: string): boolean => {
    const name = arg.split('=', 1)[0] ?? arg;
    const group = expandsShortGroups ? shortFlags(name).flags : [];
    return (arg.startsWith('-') && patterns.some(pattern => pattern.test(name))) ||
      [...blockedFlags].some(blocked =>
        arg === blocked || arg.startsWith(blocked + '=') ||
        (blocked.startsWith(name) && !exempt.has(name)) ||
        // Short flags (-X) accept concatenated values (-XPOST) in most CLIs
        // (pflag/cobra, getopt). Match any arg starting with a 2-char short flag.
        (isShortFlag(blocked) &&
          (arg.startsWith(blocked) || group.includes(blocked.slice(1)))),
      );
  };
  const flag = args.slice(1).find(arg =>
    arg !== '--' && arg !== '-' &&
    (isBlocked(arg) || (readsSingleDashLong && isSingleDashLong(arg) && isBlocked('-' + arg))),
  );
  return flag ? fail(`Flag not allowed: ${flag}`) : undefined;
};
