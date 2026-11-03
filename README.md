# readonly-mcp

Security-hardened MCP server providing read-only CLI access for AI agents.

| Package                                   | Description                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| [`@readonly-mcp/server`](packages/server) | The MCP server, its security model and tool reference |

## Development

```bash
mise install     # first time only: node and pnpm
pnpm install     # first time only
pnpm run check   # typecheck, lint and fast tests
pnpm run build   # also slow tests and the npm package
```
