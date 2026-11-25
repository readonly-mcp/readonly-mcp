/**
 * Custom matchers for tool results, registered as a setup file so every test
 * file has them.
 */

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { type MatcherState, expect } from 'vitest';
import { describeRequest } from '#test/requests.js';

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars --
     Merging requires the same type parameters as vitest's declaration */
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /*
     * Passes when the result is an error. Every refusal is one, but so is a
     * command that ran and failed without output, timed out, or was not
     * installed, so a pass does not yet prove the server refused the call.
     */
    toBeBlocked: () => R;
  }
}

// What a failure message inserts before its verb when the assertion was negated.
const negation = (isNot: boolean): string => (isNot ? 'not ' : '');

expect.extend({
  toBeBlocked(this: MatcherState, received: unknown) {
    const { isNot, utils } = this;
    const parsed = CallToolResultSchema.safeParse(received);
    if (!parsed.success)
      throw new TypeError(`expected a tool result, got: ${utils.stringify(received)}`);
    const { content, isError } = parsed.data;
    const output = content.map(item => (item.type === 'text' ? item.text : `[${item.type}]`));
    return {
      message: () => [
        `expected the call ${negation(isNot)}to be blocked, ${describeRequest(received)}`,
        `received: ${output.join('\n')}`,
      ].join('\n'),
      pass: isError === true,
    };
  },
});
