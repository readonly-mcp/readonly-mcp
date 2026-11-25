---
'@readonly-mcp/server': minor
---

Add a `gt` tool for read-only Gitea and Forgejo access through `gt`, the CLI that replaces `tea`. It allows the listing and viewing commands of `pr`, `issue`, `run`, `workflow`, `repo`, `release`, `commit` and the like, plus `auth status`, `schema` and `version`. `auth token` and `auth git-credential`, which print the token, are rejected with every other command outside the allowlist. Flags are allowlisted per command from its `--help`, leaving out `--cwd`, `--sudo`, `--debug`, `--web`, `--select` and the polling and download flags.
