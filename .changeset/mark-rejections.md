---
'@readonly-mcp/server': patch
---

A call the allowlist refuses now carries `_meta: { "io.github.readonly-mcp/rejected": true }` beside `isError`, so a client can tell a refusal from a command that ran and failed, which sets `isError` too.
