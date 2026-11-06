import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Plan } from '#src/lib/plan.js';

const run = promisify(execFile);

/*
 * Cloud-backed tools (az, gh, npm/pnpm network subcommands, acli) routinely
 * take many seconds on a cold start — az in particular pays Python startup
 * plus an AAD token refresh and a network round-trip to Azure DevOps. The
 * timeout is a runaway-command guard, not a latency target, so the bound is
 * generous while still terminating genuinely stuck processes.
 */
const millisecondsPerSecond = 1000;
const mebibyte = 1_048_576;

const timeoutMs = 30_000;
const timeoutSeconds = timeoutMs / millisecondsPerSecond;
const maxBufferMebibytes = 2;
export const maxBuffer = maxBufferMebibytes * mebibyte;

const execOptions = { maxBuffer, timeout: timeoutMs };

const isWindows = process.platform === 'win32';

export const text = (stdout: string, stderr: string): CallToolResult => ({
  content: [{ type: 'text', text: (stdout + stderr).trimEnd() || '(no output)' }],
});

export const fail = (msg: string): CallToolResult => ({
  content: [{ type: 'text', text: msg }],
  isError: true,
});

const append = (note: string, output: string): string =>
  (output.trim() ? `${note}\n${output.trimEnd()}` : note);

/*
 * The fields execFile decorates its rejection with. A catch clause sees the
 * rejection as unknown, so it is parsed rather than trusted.
 */
const ExecErrorSchema = z.object({
  code: z.union([z.string(), z.number(), z.null()]).optional(),
  killed: z.boolean().optional(),
  message: z.string(),
  stderr: z.string().optional(),
  stdout: z.string().optional(),
});

/*
 * Classify a child_process failure into a result. Node kills the child on a
 * timeout or a maxBuffer overflow; in both cases the captured output is usually
 * empty and err.message is a generic "Command failed: …" that hides the real
 * cause — which leads callers to misdiagnose a slow command as a parsing or
 * argument failure (e.g. reading a killed `az … --query '[?…]'` as mangled
 * JMESPath braces). Surface the actual reason, with any partial output
 * appended, so the failure mode is unambiguous. Pure so it can be unit-tested
 * against synthetic error objects without spawning a real process.
 */
export const errorResult = (err: unknown, cmd: string, args: readonly string[]): CallToolResult => {
  const parsed = ExecErrorSchema.safeParse(err);
  if (!parsed.success) return fail(String(err));
  const { code, killed, message, stderr = '', stdout = '' } = parsed.data;
  const partial = stdout + stderr;
  const command = `${cmd} ${args.join(' ')}`;
  if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return fail(append(`Command output exceeded ${String(maxBuffer)} bytes: ${command}`, partial));
  if (killed)
    return fail(append(`Command timed out after ${String(timeoutSeconds)}s: ${command}`, partial));
  if (partial) return text(stdout, stderr);
  return fail(message);
};

export interface ExecOptions {
  // Inherited environment variables the command runs without, matched in any case.
  readonly excludedEnv?: readonly string[];
}

/*
 * The server's environment without the named variables, compared in any
 * case: Windows reads names that way, and on POSIX dropping a variable that
 * differs only in case fails closed.
 */
const envWithout = (names: readonly string[]): NodeJS.ProcessEnv => {
  const unset = new Set(names.map(name => name.toUpperCase()));
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !unset.has(name.toUpperCase())),
  );
};

export const exec = async (
  cmd: string, args: readonly string[], { excludedEnv = [] }: ExecOptions = {},
): Promise<CallToolResult> => {
  const env = excludedEnv.length === 0 ? undefined : envWithout(excludedEnv);
  try {
    const { stdout, stderr } = await run(cmd, args, { ...execOptions, env });
    return text(stdout, stderr);
  } catch (error) {
    return errorResult(error, cmd, args);
  }
};

/*
 * What a command the server runs for itself prints, under the same limits
 * as exec. It rejects when the command fails, since the caller acts on the
 * output rather than passing it on.
 */
export const readOutput = async (cmd: string, args: readonly string[]): Promise<string> => {
  const { stdout } = await run(cmd, args, execOptions);
  return stdout;
};

export const execShell = async (
  cmd: string, args: readonly string[], options: ExecOptions = {},
): Promise<CallToolResult> => isWindows
  ? exec('bash', ['-c', 'exec "$@"', '--', cmd, ...args], options)
  : exec(cmd, args, options);

// Carries out a tool's plan: runs its command, or answers with its rejection.
export const runPlan = async (plan: Plan): Promise<CallToolResult> => {
  if (plan.kind === 'reject') return fail(plan.reason);
  const runner = plan.runner === 'shell' ? execShell : exec;
  return runner(plan.cmd, plan.args, plan.options);
};
