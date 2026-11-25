import type {
  ShapeOutput, ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Plan } from '#src/lib/plan.js';

/*
 * A tool as its author writes it: what a caller sees, and the plan a call
 * produces. A tool is data and runs nothing: whatever serves it registers
 * it and carries out its plans, so how a command runs is decided in one
 * place rather than in every tool.
 */
export interface ToolDefinition<Shape extends ZodRawShapeCompat> {
  readonly description: string;
  readonly inputSchema: Shape;
  readonly name: string;
  readonly plan: (input: ShapeOutput<Shape>) => Plan | Promise<Plan>;
}

// A defined tool, its shape erased so that tools of different shapes share one list.
export type Tool = ToolDefinition<ZodRawShapeCompat>;

/**
 * Defines a tool, typing `plan`'s input by `inputSchema`.
 * @remarks
 * Returns the definition as a {@link Tool}, its shape erased, and is the one
 * place a shape is erased. A `plan` typed for one schema is not assignable
 * to `Tool`'s, which takes any shape's input, so without this function every
 * tool collected into a list would need an assertion. `Shape` is the only
 * check on the erasure; the server parses every call's input against
 * `inputSchema` before `plan` runs.
 */
export function defineTool<Shape extends ZodRawShapeCompat>(
  definition: ToolDefinition<Shape>,
): Tool;
export function defineTool(definition: Tool): Tool {
  return definition;
}
