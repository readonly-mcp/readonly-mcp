import type {
  McpServer, ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ShapeOutput, ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { runPlan } from '#src/lib/exec.js';
import type { Plan } from '#src/lib/plan.js';

/*
 * A tool as its author writes it: what a caller sees, and the plan a call
 * produces. The tool never runs a command itself; the server carries out
 * the plan through runPlan, so the plan is the whole of a tool's decision.
 */
export interface ToolDefinition<Shape extends ZodRawShapeCompat> {
  readonly description: string;
  readonly inputSchema: Shape;
  readonly name: string;
  readonly plan: (input: ShapeOutput<Shape>) => Plan | Promise<Plan>;
}

/*
 * A defined tool, ready to register on a server. Its input shape is closed
 * over rather than carried as a type parameter, so tools of different shapes
 * share one list.
 */
export interface Tool {
  readonly name: string;
  readonly register: (server: McpServer) => void;
}

export function defineTool<Shape extends ZodRawShapeCompat>(
  definition: ToolDefinition<Shape>,
): Tool;
/**
 * The SDK types a tool callback's input with a conditional on the shape,
 * which TypeScript leaves unresolved for a generic shape, so a generic body
 * cannot hand the SDK's input to `plan`. This body is typed for any shape
 * instead, and the generic signature above it keeps each author's `plan`
 * typed against their own schema. The SDK has parsed the input against that
 * schema before the callback runs.
 */
export function defineTool(
  { description, inputSchema, name, plan }: ToolDefinition<ZodRawShapeCompat>,
): Tool {
  const call: ToolCallback<ZodRawShapeCompat> = async input => runPlan(await plan(input));
  return {
    name,
    register: (server) => {
      server.registerTool<ZodRawShapeCompat, ZodRawShapeCompat>(
        name, { description, inputSchema }, call,
      );
    },
  };
}
