---
'@readonly-mcp/server': minor
---

`gt api` runs GET requests against an allowlist of paths: the `tea api` paths plus Forgejo's `actions/runs`, `actions/runs/*/jobs` and `actions/jobs/*/logs`, which read a run where `gt run view` fails on Forgejo. The endpoint must come first, and query keys such as `sudo` that the paths do not read are rejected, as for `tea api`. Its flags are allowlisted, leaving out `-X`, `-f`, `-F`, `--input`, `-H`, `--output-file`, `--verbose` and `--dry-run`.
