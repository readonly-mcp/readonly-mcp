---
'@readonly-mcp/server': patch
---

`gh api` rejects an endpoint with an empty segment. Servers collapse `//`, so `repos/acme//raw/hooks` matched `repos/*/*/raw/**` but requested `repos/acme/raw/hooks`, the webhooks of the repository `acme/raw`.
