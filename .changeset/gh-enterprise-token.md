---
'@readonly-mcp/server': patch
---

gh runs without `GH_ENTERPRISE_TOKEN` and `GITHUB_ENTERPRISE_TOKEN`, which gh sent to any host a caller named through `-R HOST/OWNER/REPO` or a URL positional. If you reach GitHub Enterprise Server through either variable, run `gh auth login --hostname <host>` once; gh sends that stored token to its own host only.
