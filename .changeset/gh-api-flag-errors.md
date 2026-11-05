---
'@readonly-mcp/server': patch
---

gh api reports a blocked flag as a blocked flag wherever it appears, including before the endpoint, where it used to be reported as a disallowed endpoint. A rejected `-H` or `--header` adds that contents endpoints already return raw file content. Any other flag placed before the endpoint is rejected with a message that the endpoint must come first.
