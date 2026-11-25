/**
 * Custom matchers for tool results, registered as a setup file so every test
 * file has them.
 */

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { type MatcherState, expect } from 'vitest';
import { z } from 'zod';
import { rejectedMetaKey } from '#src/lib/exec.js';
import type { Reject, Run } from '#src/lib/plan.js';
import { readCanary } from '#test/canary.js';
import { commandLine } from '#test/command-line.js';
import { describeRequest } from '#test/requests.js';

const CanarySchema = z.object({ content: z.string(), file: z.string() });

/*
 * The fields of a Plan the matchers read. Each schema satisfies the type it
 * parses, so a change to Plan that the matchers would misread fails tsc.
 */
const RejectSchema = z.object({ kind: z.literal('reject'), reason: z.string() }) satisfies
  z.ZodType<Reject>;

const RunSchema = z.object({
  args: z.array(z.string()), cmd: z.string(), kind: z.literal('run'),
}) satisfies z.ZodType<Pick<Run, 'args' | 'cmd' | 'kind'>>;

const PlanSchema = z.discriminatedUnion('kind', [RejectSchema, RunSchema]);

type ParsedPlan = z.infer<typeof PlanSchema>;

const parsePlan = (received: unknown): ParsedPlan => {
  const parsed = PlanSchema.safeParse(received);
  if (!parsed.success) throw new TypeError(`expected a plan, got: ${JSON.stringify(received)}`);
  return parsed.data;
};

const describePlan = (plan: ParsedPlan): string => (plan.kind === 'run'
  ? `it runs: ${commandLine(plan.cmd, plan.args)}`
  : `it rejects: ${plan.reason}`);

const haveSameItems = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && actual.every((item, index) => item === expected[index]);

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars --
     Merging requires the same type parameters as vitest's declaration */
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /*
     * Passes when the server refused the call: its result carries the marker
     * runPlan adds to a rejection. A command that ran and failed is not
     * blocked, though it also sets isError.
     */
    toBeBlocked: () => R;
    // Passes when a canary file still holds the content it was created with.
    toBeIntact: () => Promise<void>;
    // Passes when a plan rejects its call.
    toBeRejected: () => R;
    // Passes when a plan runs `cmd`, with exactly `args` when they are given.
    toRun: (cmd: string, args?: readonly string[]) => R;
    // Passes when the call ran its command and the command succeeded.
    toSucceed: () => R;
  }
}

type ToolResult = z.infer<typeof CallToolResultSchema>;

const parseResult = (received: unknown): ToolResult => {
  const parsed = CallToolResultSchema.safeParse(received);
  if (!parsed.success)
    throw new TypeError(`expected a tool result, got: ${JSON.stringify(received)}`);
  return parsed.data;
};

// The request a result answered and what it printed, for a failure message.
const describeResult = (received: unknown, { content }: ToolResult): string => {
  const output = content.map(item => (item.type === 'text' ? item.text : `[${item.type}]`));
  return `${describeRequest(received)}\nreceived: ${output.join('\n')}`;
};

// What a failure message inserts before its verb when the assertion was negated.
const negation = (isNot: boolean): string => (isNot ? 'not ' : '');

expect.extend({
  toBeBlocked(this: MatcherState, received: unknown) {
    const { isNot } = this;
    const result = parseResult(received);
    return {
      message: () =>
        `expected the call ${negation(isNot)}to be blocked, ${describeResult(received, result)}`,
      pass: result._meta?.[rejectedMetaKey] === true,
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
  toBeRejected(this: MatcherState, received: unknown) {
    const { isNot } = this;
    const plan = parsePlan(received);
    return {
      message: () => `expected the plan ${negation(isNot)}to be rejected, ${describePlan(plan)}`,
      pass: plan.kind === 'reject',
    };
  },
  toRun(this: MatcherState, received: unknown, cmd: string, args?: readonly string[]) {
    const { isNot } = this;
    const plan = parsePlan(received);
    const expected = commandLine(cmd, args ?? []);
    return {
      message: () =>
        `expected the plan ${negation(isNot)}to run ${expected}, ${describePlan(plan)}`,
      pass: plan.kind === 'run' && plan.cmd === cmd &&
        (args === undefined || haveSameItems(plan.args, args)),
    };
  },
  toSucceed(this: MatcherState, received: unknown) {
    const { isNot } = this;
    const result = parseResult(received);
    return {
      message: () =>
        `expected the call ${negation(isNot)}to succeed, ${describeResult(received, result)}`,
      pass: result.isError !== true,
    };
  },
});
