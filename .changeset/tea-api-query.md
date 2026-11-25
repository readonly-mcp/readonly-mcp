---
'@readonly-mcp/server': patch
---

`tea api` rejects query keys its allowed paths do not read. Gitea reads a `sudo` query parameter as the Sudo header, so `repos/acme/app/raw/x?sudo=victim` sent an administrator token's request as another user.
