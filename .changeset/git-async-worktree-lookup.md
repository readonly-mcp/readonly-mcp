---
'@readonly-mcp/server': patch
---

git checks a `cwd` against `git worktree list` without blocking the server, so other tool calls keep running while it does, and the lookup now runs under the same timeout and output limit as every other command.
