---
'@readonly-mcp/server': minor
---

`gt api` runs GET requests against an allowlist of paths: pull request reviews, commit statuses, file contents, `user`, and Forgejo's `actions/runs`, `actions/runs/*/jobs` and `actions/jobs/*/logs`, which read a run where `gt run view` fails on Forgejo. The endpoint must come first. Dot segments, encoded separators, empty segments, `#` and query keys the paths do not read, such as `sudo`, are rejected, each with a message naming the check. Its flags are allowlisted, leaving out `-X`, `-f`, `-F`, `--input`, `-H`, `--output-file`, `--verbose` and `--dry-run`.
