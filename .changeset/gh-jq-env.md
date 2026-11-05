---
'@readonly-mcp/server': patch
---

gh rejects `--jq`/`-q` filters that use `env` or `$ENV`, which printed the server's environment, `GH_TOKEN` included when it is set there. The check is the one the jq tool applies, so `import`, `include` and `modulemeta` are rejected too, as is any string spelling one of these words; `.env` is a field and passes.
