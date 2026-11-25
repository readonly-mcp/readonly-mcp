/**
 * Custom matchers for tool results, registered as a setup file so every test
 * file has them.
 */

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { type MatcherState, expect } from 'vitest';
import { z } from 'zod';
import { readCanary } from '#test/canary.js';
import { describeRequest } from '#test/requests.js';

const CanarySchema = z.object({ content: z.string(), file: z.string() });

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
    // Passes when a canary file still holds the content it was created with.
    toBeIntact: () => Promise<void>;
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
  async toBeIntact(received: unknown) {
    const parsed = CanarySchema.safeParse(received);
    if (!parsed.success) throw new TypeError(`expected a canary, got: ${JSON.stringify(received)}`);
    const { content, file } = parsed.data;
    const now = await readCanary(file);
    return {
      message: () => `expected the canary to be intact, ${file} now holds: ${now}`,
      pass: now === content,
    };
  },
});
