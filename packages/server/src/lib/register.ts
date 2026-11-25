import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { runPlan } from '#src/lib/exec.js';
import type { Tool } from '#src/lib/tool.js';

/*
 * Registers `tool` on `server`, which parses each call's input against the
 * tool's schema, asks the tool for a plan, and carries the plan out with
 * this module's runPlan: the one place a tool's call becomes a command.
 */
export const registerTool = (
  server: McpServer, { description, inputSchema, name, plan }: Tool,
): void => {
  server.registerTool<ZodRawShapeCompat, ZodRawShapeCompat>(
    name, { description, inputSchema }, async input => runPlan(await plan(input)),
  );
};
