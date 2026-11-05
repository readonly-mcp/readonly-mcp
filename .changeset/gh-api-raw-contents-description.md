---
'@readonly-mcp/server': patch
---

The gh tool's description says that gh api returns a file's raw body from a contents endpoint and a directory's JSON listing, and that the endpoint comes before any flags. Agents no longer have to guess the response shape and decode base64 that isn't there.
