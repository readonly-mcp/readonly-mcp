#!/usr/bin/env node
/**
 * Read-only MCP server for AI agents.
 *
 * Each tool's own checks, accepted risks and exclusions are documented in
 * the header of its file under src/tools. What follows holds for every tool.
 *
 * Security design:
 *
 * - Allowlists, not denylists: every command/subcommand must be explicitly permitted.
 * - No generic `cwd` parameter: most commands run in the server's working
 *   directory only. Allowing callers to set `cwd` would let an agent (or
 *   prompt injection) read files in arbitrary directories. Exception: the git
 *   tool accepts an optional `cwd` validated against `git worktree list`, so
 *   agents in linked worktrees can resolve HEAD correctly without opening
 *   arbitrary directory access.
 * - cwd exception criteria: a tool may accept `cwd` only when (1) the set of
 *   valid targets is enumerable at runtime from a trusted source (e.g.,
 *   `git worktree list`), (2) the caller-supplied path is resolved and
 *   compared exactly against that set (no prefix/substring matching), and
 *   (3) the tool's existing allowlist/blocklist checks still apply to the
 *   args. Generic user-supplied directory access is never permitted.
 * - execFile (no shell): prevents shell metacharacter injection (;, &&, |, $(), ``)
 *   even when args contain untrusted input. On Windows, a `bash -c 'exec "$@"'`
 *   wrapper preserves this guarantee for shell utilities.
 * - Resource limits (timeout, maxBuffer): prevent runaway commands from consuming
 *   excessive CPU/memory on expensive operations (e.g., recursive ls).
 * - Non-zero exit codes with output: returned as successful results (no isError)
 *   because many read-only commands use non-zero exits for informational purposes
 *   (e.g., git diff exits 1 when differences exist, npm audit exits 1 when
 *   vulnerabilities are found). The output content itself conveys the meaning.
 *
 * Auto-allow implications:
 *
 * - These tools are auto-allowed in Claude settings (no user confirmation prompt).
 *   The allowlist/blocklist logic is the sole security boundary against prompt
 *   injection. Any command reachable through the allowlists can be invoked by
 *   an attacker who compromises the agent's context.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTool } from '#src/lib/register.js';
import * as tools from '#src/tools/index.js';
import packageJson from '../package.json' with { type: 'json' };

const { version } = packageJson;

const server = new McpServer({ name: 'readonly', version });

for (const tool of Object.values(tools)) registerTool(server, tool);

const transport = new StdioServerTransport();
await server.connect(transport);
