---
'@readonly-mcp/server': patch
---

`gh api` contents calls that pass `--jq` or `--template` now get GitHub's JSON object instead of the raw file body, which neither could parse. Decode a file with `--jq '.content | @base64d'`.
