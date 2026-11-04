---
'@readonly-mcp/server': patch
---

chezmoi accepts only allowlisted options, each by its full name: each allowed command's own options, under that command only, and the global ones that only shape output. `--source`/`-S` and `--config`/`-c` let a caller point `diff`, `status` and `verify` at templates and hooks they wrote, which run commands when rendered, and `--pager` ran one directly. Also rejected: `--init`, the path writers `--output`/`-o`, `--cache` and `--persistent-state`, `--override-data` and `--override-data-file`, `--destination`/`-D`, `--working-tree`/`-W`, `--refresh-externals`/`-R` and `--debug`.

Calls that passed before and are now rejected: a short option with its value attached (`-fjson`, `-f=json`; pass `-f json`), a dash-led target after `--`, and any option outside the allowlist, such as `--progress`.
