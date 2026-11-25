---
'@readonly-mcp/server': major
---

Remove the `tea` tool. Gitea replaced `tea` with `gt`, which the new `gt` tool covers: use `gt` for the same reads, and `gt api` for the API paths `tea api` allowed. `tea api` in earlier releases passed query keys unchecked, so with an administrator token `?sudo=` sent a request as another user, and an empty path segment (`repos/acme//raw/hooks`) reached a repository the allowlist never named; upgrading removes both.
