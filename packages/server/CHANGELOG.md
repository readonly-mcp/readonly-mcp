# @readonly-mcp/server

## 2.0.0

### Major Changes

- 1ca1bb6: Remove the `tea` tool. Gitea replaced `tea` with `gt`, which the new `gt` tool covers: use `gt` for the same reads, and `gt api` for the API paths `tea api` allowed. `tea api` in earlier releases passed query keys unchecked, so with an administrator token `?sudo=` sent a request as another user, and an empty path segment (`repos/acme//raw/hooks`) reached a repository the allowlist never named; upgrading removes both.

### Minor Changes

- b04d042: `gh api` now allows GET on `repos/{owner}/{repo}/dependabot/alerts` and `repos/{owner}/{repo}/dependabot/alerts/{number}`. Secret scanning and code scanning alerts stay blocked.
- afff7e7: `gt api` runs GET requests against an allowlist of paths: pull request reviews, commit statuses, file contents, `user`, and Forgejo's `actions/runs`, `actions/runs/*/jobs` and `actions/jobs/*/logs`, which read a run where `gt run view` fails on Forgejo. The endpoint must come first. Dot segments, encoded separators, empty segments, `#` and query keys the paths do not read, such as `sudo`, are rejected, each with a message naming the check. Its flags are allowlisted, leaving out `-X`, `-f`, `-F`, `--input`, `-H`, `--output-file`, `--verbose` and `--dry-run`.
- 9d894f1: Add a `gt` tool for read-only Gitea and Forgejo access through `gt`, the CLI that replaces `tea`. It allows the listing and viewing commands of `pr`, `issue`, `run`, `workflow`, `repo`, `release`, `commit` and the like, plus `auth status`, `schema` and `version`. `auth token` and `auth git-credential`, which print the token, are rejected with every other command outside the allowlist. Flags are allowlisted per command from its `--help`, leaving out `--cwd`, `--sudo`, `--debug`, `--web`, `--select` and the polling and download flags.

### Patch Changes

- f9cfdb5: `gh api` rejects an endpoint with an empty segment. Servers collapse `//`, so `repos/acme//raw/hooks` matched `repos/*/*/raw/**` but requested `repos/acme/raw/hooks`, the webhooks of the repository `acme/raw`.
- 75fc662: `gh api` rejects `.` and `..` segments and encoded separators, whether plain, percent-encoded or double-encoded, and any `#`, as `gt api` does. `contents/**` takes any depth, so `repos/acme/app/contents/../../../../user/keys` matched it while naming a different endpoint, and the URL parser cuts a path at `#`. Each rejection names the check that refused it.
- e742779: A call the allowlist refuses now carries `_meta: { "io.github.readonly-mcp/rejected": true }` beside `isError`, so a client can tell a refusal from a command that ran and failed, which sets `isError` too.

## 1.0.1

### Patch Changes

- 0fee013: chezmoi accepts only allowlisted options, each by its full name: each allowed command's own options, under that command only, and the global ones that only shape output. `--source`/`-S` and `--config`/`-c` let a caller point `diff`, `status` and `verify` at templates and hooks they wrote, which run commands when rendered, and `--pager` ran one directly. Also rejected: `--init`, the path writers `--output`/`-o`, `--cache` and `--persistent-state`, `--override-data` and `--override-data-file`, `--destination`/`-D`, `--working-tree`/`-W`, `--refresh-externals`/`-R` and `--debug`.

  Calls that passed before and are now rejected: a short option with its value attached (`-fjson`, `-f=json`; pass `-f json`), a dash-led target after `--`, and any option outside the allowlist, such as `--progress`.
- 7f8113c: git blame accepts only allowlisted options, each by its full name: those `git blame -h` lists, except the file readers `--contents`, `-S` and `--ignore-revs-file`, and the rev-list options blame's manual documents (`--reverse`, `--first-parent`, `--date`, `--encoding`, `--since`, `--after`, `--until`, `--before`). It rejects every other option, so a file-reading flag git adds later is rejected until someone allows it.
- 4c724bc: npm and pnpm block the flags that redirect registry requests under a name `--registry` does not prefix, which let a caller send those requests to a host of their choosing:

  - `--@scope:registry`, the registry for one scope.
  - pnpm's `--config.<key>`, which sets any setting.
  - `--userconfig`, `--globalconfig` and pnpm's `--npmrc-auth-file`, which read an `.npmrc` from a path the caller picks.
  - npm's `--prefix` and pnpm's `--dir`, each also spelled `-C`, which move the project root whose `.npmrc` is read. `-C` is blocked inside a short-flag group too, since both expand `-lC` into `-l -C`.
  - `--proxy` and `--https-proxy`, which route registry requests through a host the caller picks.
  - The single-dash form of every blocked flag, `--registry` included: npm reads `-registry` and its abbreviation `-reg` as the long flags.
- 53e6ebb: Update `@modelcontextprotocol/sdk` to 1.32 and `zod` to 4.6. An input that fails validation now names the field as `at <field>` instead of in quotes.
- 13992d4: gh api reports a blocked flag as a blocked flag wherever it appears, including before the endpoint, where it used to be reported as a disallowed endpoint. A rejected `-H` or `--header` adds that contents endpoints already return raw file content. Any other flag placed before the endpoint is rejected with a message that the endpoint must come first.
- 2d65064: The gh tool's description says that gh api returns a file's raw body from a contents endpoint and a directory's JSON listing, and that the endpoint comes before any flags. Agents no longer have to guess the response shape and decode base64 that isn't there.
- ec2e2e4: `gh api` contents calls that pass `--jq` or `--template` now get GitHub's JSON object instead of the raw file body, which neither could parse. Decode a file with `--jq '.content | @base64d'`.
- 1eef36e: gh runs without `GH_ENTERPRISE_TOKEN` and `GITHUB_ENTERPRISE_TOKEN`, which gh sent to any host a caller named through `-R HOST/OWNER/REPO`, a URL positional or `attestation verify --hostname`. If you reach GitHub Enterprise Server through either variable, run `gh auth login --hostname <host>` once; gh sends that stored token to its own host only.
- 14b5a25: gh rejects `--jq`/`-q` filters that use `env` or `$ENV`, which printed the server's environment, `GH_TOKEN` included when it is set there. The check is the one the jq tool applies, so `import`, `include` and `modulemeta` are rejected too, as is any string spelling one of these words; `.env` is a field and passes.
- 1eef36e: gh rejects any arg naming `github.localhost`, such as `-R github.localhost/o/r` or a URL on that host. gh treats it as github.com and sent `GH_TOKEN` there over plain HTTP, to whatever local listener `*.localhost` resolved to.
- c25136d: git checks a `cwd` against `git worktree list` without blocking the server, so other tool calls keep running while it does, and the lookup now runs under the same timeout and output limit as every other command.
- 6538cba: Close read and write paths through jq and git.

  - jq accepts only the options `jq --help` lists, which leaves out the file readers and the hidden `--run-tests`.
  - jq rejects filters that read the environment (`env`, `$ENV`) or load modules (`import`, `include`, `modulemeta`).
  - jq checks args after `--`, and dash-led args it reads as positionals, as positionals, so they cannot name a file past the file-argument block.
  - git blame blocks `--contents`, `-S` and `--ignore-revs-file`, which read arbitrary paths.
  - git branch always runs in list mode, so no flag or bare name can create, delete or move a branch.
  - `engines.node` is now `>=24.0.0`, which the compiled bin already required.
