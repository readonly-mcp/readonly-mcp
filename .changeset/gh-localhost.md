---
'@readonly-mcp/server': patch
---

gh rejects any arg naming `github.localhost`, such as `-R github.localhost/o/r` or a URL on that host. gh treats it as github.com and sent `GH_TOKEN` there over plain HTTP, to whatever local listener `*.localhost` resolved to.
