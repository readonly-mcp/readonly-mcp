import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ArgsSchema, findBlockedFlag, isAllowedApiPath, isAllowlisted,
  rejectApiEndpoint, rejectBlockedFlags, rejectSubcommand,
} from '#src/lib/allowlist.js';
import { exec, fail } from '#src/lib/exec.js';

const globalFlags = new Set(['--version', '--help', '-h']);

const subcommands = new Set([
  'attestation verify',
  'cache list',
  'gist list', 'gist view',
  'issue list', 'issue status', 'issue view',
  'label list',
  'pr checks', 'pr diff', 'pr list', 'pr status', 'pr view',
  'project field-list', 'project item-list', 'project list', 'project view',
  'release list', 'release view',
  'repo list', 'repo view',
  'ruleset check', 'ruleset list', 'ruleset view',
  'run list', 'run view',
  'search code', 'search commits', 'search issues', 'search prs', 'search repos',
  'secret list',
  'status',
  // variable get: excluded because it returns plaintext values, which may
  // contain internal URLs, hostnames, or other quasi-sensitive configuration
  // that should not be exposed to an LLM. variable list only shows names.
  'variable list',
  'workflow list', 'workflow view',
]);

// Endpoints that serve file content, with or without a path below the repo.
const contentsPaths = ['repos/*/*/contents', 'repos/*/*/contents/**'];

const apiPaths = [
  // PR review comments (primary motivator — gh pr view --json comments misses
  // inline review comments; only returns issue/conversation comments)
  'repos/*/*/pulls/*/comments',
  'repos/*/*/pulls/*/comments/*',
  'repos/*/*/pulls/*/reviews',
  'repos/*/*/pulls/*/reviews/*/comments',
  // Deployments (no gh subcommand)
  'repos/*/*/deployments',
  'repos/*/*/deployments/*/statuses',
  // Check annotations (no gh subcommand for annotations specifically)
  'repos/*/*/check-runs/*/annotations',
  // Commits list, statuses, checks, and individual commit details (files changed)
  'repos/*/*/commits',
  'repos/*/*/commits/*',
  'repos/*/*/commits/*/status',
  'repos/*/*/commits/*/statuses',
  'repos/*/*/commits/*/check-runs',
  'repos/*/*/commits/*/check-suites',
  // Compare refs (base...head is a single segment)
  'repos/*/*/compare/*',
  // PR requested reviewers
  'repos/*/*/pulls/*/requested_reviewers',
  // Deployment environments
  'repos/*/*/environments',
  // Repository contents (bare = directory listing, ** = file/nested path)
  'repos/*/*/contents',
  'repos/*/*/contents/**',
  // Authenticated viewer identity (`gh api user` — who am I). Single segment,
  // so it does not match multi-segment paths like user/repos or user/orgs,
  // which stay blocked.
  'user',
];

// --method / -X: override HTTP verb to POST/PUT/DELETE/PATCH
// --input: reads arbitrary files and sends as request body
// -f / --field / -F / --raw-field: sends body fields; -F reads @file paths; imply POST
// --hostname: SSRF — redirects request (with auth token) to arbitrary host
// --verbose: dumps full request/response including Authorization header (token leak)
// -H / --header: arbitrary HTTP header injection (Accept override, API versioning, etc.)
const apiBlockedFlags = new Set([
  '--method', '-X', '--input',
  '-f', '--field', '-F', '--raw-field',
  '--hostname', '--verbose',
  '-H', '--header',
]);

const headerFlags = new Set(['-H', '--header']);

/*
 * Agents usually reach for a header to get a file's raw body, which contents
 * endpoints already return, so the rejection tells them so.
 */
const rawContentsHint = 'contents endpoints already return raw file content, ' +
  'so no Accept header is needed';

const runApi = (args: readonly string[]): Promise<CallToolResult> | CallToolResult => {
  const [, endpoint, ...apiArgs] = args;
  if (!endpoint) return rejectApiEndpoint(endpoint, apiPaths);
  const header = findBlockedFlag(args, headerFlags);
  if (header) return fail(`Flag not allowed: ${header}. ${rawContentsHint}`);
  const rejected = rejectBlockedFlags(args, apiBlockedFlags);
  if (rejected) return rejected;
  if (endpoint.startsWith('-'))
    return fail(`gh api endpoint must come first, before any flags: got ${endpoint}`);
  if (!isAllowedApiPath(endpoint, apiPaths))
    return rejectApiEndpoint(endpoint, apiPaths);
  // Auto-inject raw Accept header for contents endpoints so file
  // responses return plain text instead of base64-encoded JSON.
  // Directory listings are unaffected — GitHub ignores the media type
  // for directory responses and still returns JSON.
  const rawAccept = isAllowedApiPath(endpoint, contentsPaths)
    ? ['-H', 'Accept: application/vnd.github.raw+json']
    : [];
  // Inject --method GET immediately after the endpoint, before any
  // user-supplied flags. Appending it at the end would be defeated by
  // a `--` (end-of-options marker) in user args, since everything after
  // `--` is treated as positional, making the injected flag a no-op.
  return exec('gh', ['api', endpoint, '--method', 'GET', ...rawAccept, ...apiArgs]);
};

export const register = (server: McpServer): RegisteredTool =>
  server.registerTool(
    'gh',
    {
      description: 'Run read-only GitHub CLI commands (--version, --help, attestation verify, ' +
        'cache list, gist list/view, issue list/status/view, label list, pr ' +
        'checks/diff/list/status/view, project field-list/item-list/list/view, release ' +
        'list/view, repo list/view, ruleset check/list/view, run list/view, search ' +
        'code/commits/issues/prs/repos, secret list, status, variable list, workflow list/view, ' +
        'api GET: pulls/reviews+reviewers, deployments+environments, check-runs+suites, ' +
        'commits+statuses, compare, contents, user)',
      inputSchema: ArgsSchema,
    },
    async ({ args }) => {
      const [only, ...rest] = args;
      const isGlobal = only !== undefined && rest.length === 0 && globalFlags.has(only);
      if (isGlobal) return exec('gh', args);

      if (args[0] === 'api') return runApi(args);

      if (!isAllowlisted(args, subcommands))
        return rejectSubcommand(args, subcommands);
      return exec('gh', args);
    },
  );
