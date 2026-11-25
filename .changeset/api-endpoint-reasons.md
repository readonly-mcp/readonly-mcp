---
'@readonly-mcp/server': patch
---

`tea api` and `gt api` say which check refused an endpoint: a `#`, an empty segment, a dot segment or encoded separator, or an unlisted query key. Before, each got the generic "API endpoint not allowed" message, which showed the path without its query next to patterns the path matched.
