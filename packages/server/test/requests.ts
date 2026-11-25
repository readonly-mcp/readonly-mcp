/**
 * The arguments each server call answered with, so a failed assertion on its
 * result can name the generated values it ran with. Apart from helpers.ts so
 * the matchers setup file, which every test file loads, loads no MCP client.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Keyed weakly by the result object, so nothing outlives the test that made the call.
const requests = new WeakMap<object, unknown>();

/**
 * Records `args` as the request `result` answered, and returns `result`.
 */
export const remember = (args: unknown, result: CallToolResult): CallToolResult => {
  requests.set(result, args);
  return result;
};

/**
 * The arguments a server call answered with `result`, for a failure message.
 * A result built by hand answered no call.
 */
export const describeRequest = (result: unknown): string =>
  (typeof result === 'object' && result !== null && requests.has(result)
    ? `arguments: ${JSON.stringify(requests.get(result))}`
    : 'no request recorded');
