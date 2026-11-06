import type { ExecOptions } from '#src/lib/exec.js';

/*
 * What a tool decides to do with a call, with no side effects: run a command
 * or reject the call. `runPlan` in exec.ts is the only place one is carried
 * out, so a tool's checks can be tested by reading the plan they produce.
 */
export type Plan = Reject | Run;

export interface Reject {
  readonly kind: 'reject';
  readonly reason: string;
}

export interface Run {
  readonly args: readonly string[];
  readonly cmd: string;
  readonly kind: 'run';
  readonly options: ExecOptions;
  /*
   * `shell` runs the command through bash on Windows, for npm-installed
   * .cmd shims and shell utilities that execFile cannot start directly.
   */
  readonly runner: 'exec' | 'shell';
}

// What a check returns: the rejection, or undefined when nothing is rejected.
export type Rejection = Reject | undefined;

export const reject = (reason: string): Reject => ({ kind: 'reject', reason });

export interface RunOptions {
  readonly options?: ExecOptions;
  readonly runner?: Run['runner'];
}

export const run = (
  cmd: string, args: readonly string[], { options = {}, runner = 'exec' }: RunOptions = {},
): Run => ({ args, cmd, kind: 'run', options, runner });
