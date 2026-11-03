---
'@readonly-mcp/server': patch
---

Close read and write paths through jq and git.

- jq accepts only the options `jq --help` lists, which leaves out the file readers and the hidden `--run-tests`.
- jq rejects filters that read the environment (`env`, `$ENV`) or load modules (`import`, `include`, `modulemeta`).
- jq checks args after `--`, and dash-led args it reads as positionals, as positionals, so they cannot name a file past the file-argument block.
- git blame blocks `--contents`, `-S` and `--ignore-revs-file`, which read arbitrary paths.
- git branch always runs in list mode, so no flag or bare name can create, delete or move a branch.
- `engines.node` is now `>=24.0.0`, which the compiled bin already required.
