---
'@readonly-mcp/server': patch
---

`gh api` rejects `.` and `..` segments and encoded separators, whether plain, percent-encoded or double-encoded, and any `#`, as `gt api` does. `contents/**` takes any depth, so `repos/acme/app/contents/../../../../user/keys` matched it while naming a different endpoint, and the URL parser cuts a path at `#`. Each rejection names the check that refused it.
