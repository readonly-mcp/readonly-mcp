# @readonly-mcp/server — Agent Guide

Security-hardened MCP server providing read-only CLI access for AI agents.
See `packages/server/README.md` for the full security model and tool reference.

## Architecture

The repository is a pnpm workspace. The server is its one package, in
`packages/server`, and the paths below are relative to it.

```text
src/
  index.ts          Server entry point (security rationale in header comment)
  lib/
    allowlist.ts    Allowlist matching, flag blocking, JSON array coercion
    exec.ts         Sandboxed command execution (execFile, no shell); runPlan
    plan.ts         What a tool decides: run a command, or reject the call
  tools/
    index.ts        Tool registry (barrel export)
    <tool>.ts       One file per CLI tool (git, gh, az, npm, pnpm, chezmoi, acli, shell, tea)
test/
  <tool>.test.ts    Per-tool security + functionality tests of the pure plan()
  <tool>.integration.test.ts  The same tool through a server, against real binaries
  shell-injection.integration.test.ts  Cross-tool injection attack tests
  builders.ts       Arbitrary test-data builders (faker)
  canary.ts         Per-test file that injection tests prove untouched
  helpers.ts        Shared test utilities
  package-fixture.ts  Throwaway npm/pnpm project for package-manager integration tests
e2e/
  package.test.ts   Smoke tests of the packed tarball, installed as a consumer would
  fixture.ts        Installs the tarball into a throwaway project and starts its bin
```

## Security Principles

These are non-negotiable. Every change must preserve them:

- **Allowlists, not denylists** — commands/subcommands must be explicitly permitted
- **`execFile`, no shell** — prevents metacharacter injection
- **Prefix flag matching** — defeats CLI flag abbreviation bypass
- **No `cwd` parameter** — except when validated against an enumerable trusted source
  (see `cwd` exception criteria in `src/index.ts` header)

## Adding a New Tool

1. Create `src/tools/<name>.ts` — export a function that takes a `McpServer` and
   registers the tool via `server.registerTool()`
1. Define a `subcommands` set of allowed subcommands
1. Define `blockedFlags` for any flags that could mutate state, leak secrets,
   or enable SSRF
1. Use `rejectSubcommand()` and `rejectBlockedFlags()` from `src/lib/allowlist.ts`
1. Export a pure `plan(args)` that returns `run()` or `reject()` from
   `src/lib/plan.ts`, and have the handler return `runPlan(plan(args))` from
   `src/lib/exec.ts` — never `child_process` directly
1. Re-export from `src/tools/index.ts`
1. Add tests in `test/<name>.test.ts` covering allowed commands, blocked
   subcommands, blocked flags, and injection attempts.

## Adding Subcommands to an Existing Tool

1. Add the subcommand to the tool's `subcommands` set
1. If the subcommand has sub-subcommands (e.g., `git stash list`), add an
   allowed-subs set and validate in the handler
1. Add tests for the new subcommand — both positive and negative cases

## Testing

Run the full build from the repository root before every commit. It
typechecks, lints, runs the fast and slow tests, packs the package, and runs
the e2e tests against the packed tarball:

```bash
pnpm run build
```

Tests in `test/` run against source, and they are where the security boundary
is tested. `e2e/` only checks that the published package installs and starts,
so put a new restriction's tests in `test/`.

A test file that calls tools through a server is named
`*.integration.test.ts` and opens with `// @module-tag integration`, which
gives its tests the longer timeout `vitest.config.ts` sets for that tag. Add
`// @module-tag slow` as well for a suite that belongs in the slow run rather
than the fast one.

Tests validate the security boundary, not just functionality. Every blocked
flag, blocked subcommand, and injection vector has a corresponding test.
If you add a new restriction, add a test that proves it blocks the attack.
If you relax a restriction, justify it in the commit message.

Generate incidental values (owners, ids, file names, output text) from
`test/builders.ts` (`import * as build from "./builders.ts"`) or from
`@faker-js/faker` for raw primitives, and capture each in a local the
assertion references. Write a value literally when the code under test
branches on it: an allowlisted subcommand, a blocked flag, the prefix
relation between two flags, the shape of an attack. Give `it.for` rows that
carry generated values an explicit `name` rather than deriving it from their
args, so test names stay the same across runs.

## Changesets for the Published Server

A change to `packages/server` carries a changeset: run `pnpm exec changeset`
and commit the file it writes under `.changeset/`. The Changeset check fails a
pull request that changes the package without one. Changesets collects them
into a release pull request, and merging that publishes the new version.

## Formatting

See `.editorconfig`. TypeScript, ESM only. Import a package's own modules
through its `#src/` and `#test/` aliases, with a `.js` extension
(`#src/lib/exec.js`). The package's `imports` map points them at the `.ts`
sources, which Node runs directly, and `publishConfig.imports` at the compiled
`.js`. A `.ts` alias would break once compiled, since `tsc` rewrites only
relative specifiers.
