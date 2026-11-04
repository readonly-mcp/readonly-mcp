---
'@readonly-mcp/server': patch
---

npm and pnpm block the flags that redirect registry requests under a name `--registry` does not prefix, which let a caller send those requests to a host of their choosing:

- `--@scope:registry`, the registry for one scope.
- pnpm's `--config.<key>`, which sets any setting.
- `--userconfig`, `--globalconfig` and pnpm's `--npmrc-auth-file`, which read an `.npmrc` from a path the caller picks.
- npm's `--prefix` and pnpm's `--dir`, each also spelled `-C`, which move the project root whose `.npmrc` is read. `-C` is blocked inside a short-flag group too, since both expand `-lC` into `-l -C`.
- `--proxy` and `--https-proxy`, which route registry requests through a host the caller picks.
- The single-dash form of every blocked flag, `--registry` included: npm reads `-registry` and its abbreviation `-reg` as the long flags.
