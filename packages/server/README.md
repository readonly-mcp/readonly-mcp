# @readonly-mcp/server

A security-hardened [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents read-only access to CLI tools. Designed for auto-allow environments where the allowlist is the sole security boundary against prompt injection.

## Why this exists

Most agent frameworks restrict tool access through prompt instructions or by curating which tools the model sees. These are soft boundaries — a prompt injection that convinces the agent to "use bash instead" or "call this unlisted function" bypasses them entirely. The restriction lives in the model's interpretation, not in code the model cannot influence.

This server moves the boundary to the execution layer. The allowlist is enforced at runtime by the MCP server process: if a command isn't explicitly permitted, the server rejects it before any process is spawned. No amount of creative prompting changes what `execFile` will execute. The agent can request anything — the server decides what actually runs.

The goal is to make auto-allow safe for read-only tools. Without enforcement at the server, auto-allowing an MCP tool is equivalent to giving the agent unrestricted shell access, because the tool's "read-only" contract is only as strong as the model's compliance.

## Security model

- **Allowlists, not denylists** — every command and subcommand must be explicitly permitted
- **No `cwd` parameter** — commands run in the server's working directory only, preventing agents from reading files in arbitrary directories
- **`execFile`, no shell** — prevents shell metacharacter injection (`;`, `&&`, `|`, `$()`, `` ` ``) even when args contain untrusted input
- **Prefix flag matching** — `rejectBlockedFlags` uses prefix matching to defeat CLI flag abbreviation (e.g., npm expands `--reg` to `--registry`). Exact matching would be bypassable.
- **`--registry` blocked** — prevents SSRF / data exfiltration to attacker-controlled registries. The flags that reach the registry by another name are blocked with it: `--@scope:registry`, pnpm's `--config.<key>`, the flags that read an `.npmrc`, the flags that move the project root whose `.npmrc` is read, and the proxy flags. Each is also matched in its single-dash form (`-registry`), which npm reads as the long flag.
- **`--ignore-scripts` injected** — defense-in-depth for npm to block lifecycle scripts. `--no-ignore-scripts` and `--ignore-scripts` are also blocked from user-provided args to prevent last-wins override.
- **`az devops invoke` flag allowlist** — unknown flags are rejected (allowlist, not blocklist), blocking abbreviation bypass
- **Resource limits** — 10 s timeout, 2 MB maxBuffer to prevent runaway commands
- **Windows support** — `bash -c 'exec "$@"'` wrapper preserves `execFile` guarantees for shell utilities

### Excluded by design

| Command / flag                                | Reason                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `chezmoi cat-config`                          | May leak encryption keys, GPG recipient IDs, or other sensitive configuration                        |
| `chezmoi data`                                | Leaks template variables that may contain secrets                                                    |
| `printenv` / `env`                            | Leaks environment variables (API keys, tokens)                                                       |
| `rg`                                          | Redundant with host `Grep` tool; allows searching arbitrary paths                                    |
| `cat`, `head`, `tail`, `bat`, `diff`, `delta` | Redundant with host `Read` tool; path args duplicate file-read surface area                          |
| `git diff --no-index`                         | Reads arbitrary files outside the repo                                                               |
| `git --output` / `diff -o`                    | Writes command output to a file                                                                      |
| `gh variable get`                             | Returns plaintext values that may contain internal URLs, hostnames, or quasi-sensitive configuration |
| `gt auth token`                               | Prints the active account's access token                                                             |
| `gt auth git-credential`                      | Git credential helper protocol answers with the token on stdout; absent from `gt auth --help`        |
| `gt notification`                             | Not yet confirmed that listing or viewing leaves read state untouched                                |

## Rejected calls

A call the allowlist refuses answers with `isError` set and `_meta: { "io.github.readonly-mcp/rejected": true }`. A command that ran and failed sets `isError` too, so the marker is how a client tells that the server refused the call rather than ran it. Arguments that fail a tool's input schema are refused by the MCP SDK before the server sees them, and that result carries no marker.

## Tools

### `shell`

Read-only shell utilities: `basename`, `date`, `dirname`, `eza`, `file`, `jq`, `ls`, `pwd`, `readlink`, `realpath`, `stat`, `wc`, `which`, `whoami`

`jq` accepts only the options `jq --help` lists, minus the file readers (`--slurpfile`, `--rawfile`, `-f`, `-L`), so hidden options such as `--run-tests`, short groups holding a file reader (`-rf`), and `--flag=val` forms are rejected. It blocks file-path arguments too — use stdin piping instead. Every arg after `--` counts as a positional, and so does any dash-led arg jq does not read as an option, such as `-1`. Filters may not use `env`, `$ENV`, `import`, `include` or `modulemeta` (field access such as `.env` is fine). The check matches the word, so a string or object key spelling one, as in `"env"` or `{env: …}`, is rejected too.

**Schema:** `{ command: string, args?: string[] }`

### `git`

Read-only git commands: `blame`, `branch`, `describe`, `diff`, `log`, `ls-files`, `ls-tree`, `merge-base`, `reflog`, `remote`, `rev-parse`, `shortlog`, `show`, `stash`, `status`, `worktree`

Additional restrictions:

- `--output` blocked globally (prefix matching defeats abbreviation)
- `-o` short flag blocked on `diff` only (other commands use `-o` for unrelated flags, e.g., `ls-files -o` = `--others`)
- `--no-index` blocked globally (prefix matching)
- `blame`: only allowlisted options, by their full names: those `git blame -h` lists except the file readers (`--contents`, `-S` and `--ignore-revs-file`), plus the rev-list options blame's manual documents (`--reverse`, `--first-parent`, `--date`, `--encoding`, `--since`, `--after`, `--until`, `--before`)
- `branch`: always runs with `--list` injected, so git rejects every writing mode and reads positionals as patterns; `--no-list` and destructive flags (`-D`, `-d`, `-m`, `--delete`, `--force`, etc.) are also blocked. A lone `--show-current` runs as given.
- `stash`: only `list` and `show` sub-subcommands (`--` treated as terminator)
- `worktree`: only `list` (mutating: `add`, `remove`, `move`, `prune`, etc.)
- `reflog`: only `show`, `exists`, and bare invocation (destructive: `delete`, `expire`)
- `remote`: only bare listing, `get-url`, and `show -n` (no network I/O)

**Schema:** `{ args: string[] }`

### `gh`

Read-only GitHub CLI commands: `attestation verify`, `cache list`, `gist list/view`, `issue list/status/view`, `label list`, `pr checks/diff/list/status/view`, `project field-list/item-list/list/view`, `release list/view`, `repo list/view`, `ruleset check/list/view`, `run list/view`, `search code/commits/issues/prs/repos`, `secret list`, `status`, `variable list`, `workflow list/view`

Also supports `--version`, `--help`, `-h` as standalone flags.

`--jq`/`-q` filters may not use `env`, `$ENV`, `import`, `include` or `modulemeta`, on `api` too: gh's embedded jq reads the server's environment through `env` and `$ENV`. As with `jq`, the check matches the word, so a string spelling one is rejected too; `.env` is a field and passes.

gh runs without `GH_ENTERPRISE_TOKEN` and `GITHUB_ENTERPRISE_TOKEN`: gh sends either to any host outside github.com that `-R HOST/OWNER/REPO`, a URL positional or `attestation verify --hostname` names. To reach GitHub Enterprise Server through this tool, store a token for it with `gh auth login --hostname <host>`, which gh sends to that host only.

Args naming `github.localhost` are rejected, in any case, at any position, and in spellings gh's lowercasing folds into it (`gİthub`): gh treats that host and its subdomains as github.com, so it sends `GH_TOKEN` there over plain HTTP, to wherever `*.localhost` resolves.

**Schema:** `{ args: string[] }`

### `gt`

Read-only Gitea and Forgejo commands through `gt`, Gitea's CLI: `auth status`, `branch list`, `commit compare/diff/list/pr/status/view`, `issue list/view`, `label list`, `milestone list`, `pr checks/diff/list/status/timeline/view`, `pr review comments/list/view`, `release list/view`, `repo list/view`, `run jobs/list/logs/view`, `schema`, `search issue/pr/repo`, `version`, `workflow list/view`

Also supports `--version`, `--help`, `-h` as standalone flags. Only canonical command names are accepted, not aliases such as `ls`.

Additional restrictions:

- The command must come first. gt reads global flags ahead of it too, but there they would hide the command from the allowlist, and an unknown first word could name a user-installed extension.
- Flags are allowlisted per command, taken from its `--help`. gt reads no abbreviations, so names match exactly, and a flag a later gt adds is refused until it is listed. Left out:
  - `--cwd`: it points repository discovery at a directory the caller picks
  - `--sudo`: it sends requests as another user
  - `--debug`, until shown to leave credentials out of its request log
  - `--interactive`: it allows prompts
  - `--web`/`-w`: they open a browser. On `run list`, `-w` is `--workflow` and allowed.
  - `--select`: the interactive picker can act on the item it picks
  - `pr checks --watch` and `run logs --follow`, with the `--interval` and `--timeout` that pace them: they poll until CI finishes
  - `run logs --output`/`-O` and `--dir`/`-D`, with `--clobber` and `--skip-existing`: they download the logs to a file
- `--jq`/`-q` filters may not use `env`, `$ENV`, `import`, `include` or `modulemeta`, as for `gh`: gt's embedded jq reads the server's environment

A URL in `--repo` or as a positional selects its instance, which gt refuses unless it holds an account for it, and gt sends `GITEA_TOKEN` only to the instance `GITEA_CLI_HOST` or `GITEA_INSTANCE_URL` names. Neither reaches a host the caller picks, so both are allowed.

`api` is restricted to GET requests against `repos/*/*/actions/runs`, `repos/*/*/actions/runs/*/jobs`, `repos/*/*/actions/jobs/*/logs`, `repos/*/*/pulls/*/reviews`, `repos/*/*/pulls/*/reviews/*/comments`, `repos/*/*/commits/*/status`, `repos/*/*/commits/*/statuses`, `repos/*/*/contents[/**]`, `repos/*/*/raw/**` and `user`, with the endpoint first. `{owner}` and `{repo}` placeholders are accepted. `--method GET` is injected after the endpoint. Its flags are allowlisted too, leaving out `-X`, the request-body flags `-f`, `-F` and `--input` (which switch the method to POST and read a file or stdin), `-H`, `--output-file` (writes the response to a new file), `--verbose` (prints request headers, not yet shown to redact a token login's `Authorization`) and `--dry-run` (prints the request instead of sending it). `.`/`..` segments and encoded separators are rejected, whether plain, percent-encoded or double-encoded, as are empty segments (servers collapse `//`) and any `#` (the URL parser would cut the path there). Query keys are limited to those the allowed paths read (`ref`, `page`, `limit` and the like), since Gitea reads a `sudo` query parameter as the Sudo header and would send an administrator token's request as another user. Use `raw/**` for file contents: `contents/**` returns them base64-encoded in JSON.

On Forgejo, `gt run view` fails, since Forgejo returns a run's jobs as a bare array that gt cannot parse. Read the run through `api` instead: `actions/runs` maps the web UI's run number (`index_in_repo`) to the API id, `actions/runs/*/jobs` lists its jobs, and `actions/jobs/*/logs` returns a job's log as plain text.

**Token exposure the tool cannot block:** Forgejo echoes a rejected token in its error body (`access token does not exist [sha: …]`), so any `gt` call made with a revoked token prints the credential. No flag causes it.

**Schema:** `{ args: string[] }`

### `az`

Read-only Azure DevOps CLI commands: `devops project/team/extension/service-endpoint/wiki`, `pipelines list/show/build/release/runs/pool/agent`

`devops invoke` is restricted to GET-only requests against build-debugging endpoints (`build/builds`, `build/timeline`, `build/logs`, `build/changes`, `build/artifacts`, `build/leases`, `test/runs`). Unknown flags are rejected (allowlist, not blocklist).

**Schema:** `{ args: string[] }`

### `npm`

Read-only npm commands: `audit`, `bin`, `explain`, `fund`, `ls`, `outdated`, `root`, `search`, `view`

Blocked flags: `--fix`, `--registry`, `--@scope:registry`, `--userconfig`, `--globalconfig`, `--prefix`, `-C` (also inside a short-flag group such as `-lC`), `--proxy`, `--https-proxy`, `--no-ignore-scripts`, `--ignore-scripts`. The server always re-injects `--ignore-scripts`.

**Schema:** `{ args: string[] }`

### `pnpm`

Read-only pnpm commands: `audit`, `bin`, `licenses list`, `list`, `outdated`, `root`, `search`, `store status`, `why`

Also supports `--version`, `--help`, `-h` as standalone flags.

Blocked flags: `--fix`, `--registry`, `--@scope:registry`, `--config.<key>`, `--userconfig`, `--globalconfig`, `--npmrc-auth-file`, `--dir`, `-C` (also inside a short-flag group such as `-rC`), `--proxy`, `--https-proxy`

**Schema:** `{ args: string[] }`

### `chezmoi`

Read-only chezmoi commands: `diff`, `doctor`, `managed`, `source-path`, `status`, `target-path`, `verify`

Only allowlisted options pass, each by its full name: each allowed command's own options, under that command only, and the global ones that only shape output. Rejected among the rest: `--source`/`-S` and `--config`/`-c`, whose templates and hooks run commands; `--pager`, which runs one; `--init`; the path writers `--output`/`-o`, `--cache` and `--persistent-state`; `--override-data` and `--override-data-file`; `--destination`/`-D`; `--working-tree`/`-W`; `--refresh-externals`/`-R`; and `--debug`. Every dash-led arg is checked, after `--` too, since chezmoi can read `--` as an option's value. A short option's value goes in its own arg (`-f json`, not `-fjson`).

**Schema:** `{ args: string[] }`

### `acli`

Read-only Atlassian CLI commands: `jira board list`, `jira filter list`, `jira project list`, `jira sprint list`, `jira workitem comment list`, `jira workitem list/search/view`

**Schema:** `{ args: string[] }`

## Installation

```bash
pnpm add -g @readonly-mcp/server
```

### Claude Code

```bash
claude mcp add -s user readonly -- readonly-mcp
```

To auto-approve all readonly tools, add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__readonly__*"]
  }
}
```

### VS Code / Copilot

Add to your `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "readonly": {
        "command": "readonly-mcp"
      }
    }
  }
}
```

## Development

From the repository root:

```bash
mise install     # first time only: node and pnpm
pnpm install     # first time only
pnpm run check   # typecheck, lint and fast tests
pnpm run build   # also slow tests and the npm package
```

## Project structure

```text
src/
  index.ts          Server entry point (server-wide security rationale in header comment)
  lib/
    allowlist.ts    Allowlist matching and validation
    exec.ts         Sandboxed command execution
    plan.ts         What a tool decides: run a command, or reject the call
    tool.ts         defineTool: a tool's name, schema and plan, registered by the server
  tools/            One file per tool, its security rationale in its header comment
    index.ts        Tool registry
    acli.ts         Atlassian CLI tool
    az.ts           Azure DevOps CLI tool
    chezmoi.ts      Chezmoi tool
    gh.ts           GitHub CLI tool
    git.ts          Git tool
    gt.ts           Gitea/Forgejo CLI tool
    npm.ts          npm tool
    pnpm.ts         pnpm tool
    shell.ts        Shell utilities tool
test/               Unit and integration tests (vitest)
```
