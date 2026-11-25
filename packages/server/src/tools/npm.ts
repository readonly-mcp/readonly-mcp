/*
 * Security design:
 *
 * - --registry blocked: prevents SSRF / data exfiltration to attacker-controlled
 *   registries. Uses prefix matching because npm expands abbreviated flags
 *   internally (e.g., `--reg` resolves to `--registry`). Exact matching would be
 *   bypassable. The registry is also reachable by names `--registry` does not
 *   prefix, so those are blocked too: `--@scope:registry`, the .npmrc readers
 *   (`--userconfig`, `--globalconfig`), the flags that move the project root
 *   whose .npmrc is read (`--prefix`/`-C`), and the proxies a request can be
 *   routed through (`--proxy`, `--https-proxy`). npm expands a group of short
 *   flags, so `-lC` is matched as `-C`, and reads any other single-dash arg as a
 *   long name, so `-reg` is matched as `--reg`. `--global` passes, though it
 *   prefixes `--globalconfig`: it names a flag of its own.
 * - --ignore-scripts injected: defense-in-depth to prevent lifecycle scripts.
 *   `--no-ignore-scripts` is also blocked to prevent last-wins override.
 */
import {
  ArgsSchema, type BlockedFlagOptions, isAllowlisted, rejectBlockedFlags, rejectSubcommand,
} from '#src/lib/allowlist.js';
import { type Plan, run } from '#src/lib/plan.js';
import { defineTool } from '#src/lib/tool.js';

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

export const plan = (args: readonly string[]): Plan =>
  isAllowlisted(args, subcommands)
    ? rejectBlockedFlags(args, blockedFlags, blockedFlagOptions) ??
    run('npm', ['--ignore-scripts', ...args], { runner: 'shell' })
    : rejectSubcommand(args, subcommands);

export const tool = defineTool({
  description: 'Run read-only npm commands (audit, bin, explain, fund, ls, outdated, root, ' +
    'search, view)',
  inputSchema: ArgsSchema,
  name: 'npm',
  plan: ({ args }) => plan(args),
});
