import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { errorResult, exec, fail, maxBuffer, text } from '#src/lib/exec.js';
import * as build from '#test/builders.js';
import { textOf } from '#test/helpers.js';

// exec() and execShell() are integration-tested through every tool test.
// These unit tests cover the pure helper functions and exec's options.

/*
 * Sets a variable no other test reads, under a generated name, and removes
 * it once the test's `using` scope ends.
 */
const scopedEnv = () => {
  const name = `READONLY_MCP_TEST_${faker.string.alphanumeric({ casing: 'upper', length: 12 })}`;
  process.env[name] = faker.lorem.word();
  return { name, [Symbol.dispose]: () => Reflect.deleteProperty(process.env, name) };
};

// Node args that print whether the variable `name` is set.
const printSet = (name: string) => [
  '-e', 'process.stdout.write(process.env[process.argv[1]] === undefined ? "unset" : "set")',
  name,
];

describe(exec, () => {
  it('passes the environment on by default', async ({ expect }) => {
    using variable = scopedEnv();
    const result = await exec(process.execPath, printSet(variable.name));

    expect(textOf(result)).toBe('set');
  });

  it('drops the variables excludedEnv names, in any case', async ({ expect }) => {
    using variable = scopedEnv();
    const excludedEnv = [variable.name.toLowerCase()];
    const result = await exec(process.execPath, printSet(variable.name), { excludedEnv });

    expect(textOf(result)).toBe('unset');
  });

  it('keeps the variables excludedEnv does not name', async ({ expect }) => {
    using excluded = scopedEnv();
    using kept = scopedEnv();
    const result = await exec(process.execPath, printSet(kept.name), {
      excludedEnv: [excluded.name],
    });

    expect(textOf(result)).toBe('set');
  });
});

describe('text()', () => {
  it('combines stdout and stderr', ({ expect }) => {
    const stdout = faker.lorem.sentence();
    const stderr = faker.lorem.sentence();
    const result = text(`${stdout}\n`, `${stderr}\n`);

    expect(textOf(result)).toBe(`${stdout}\n${stderr}`);
  });

  it('trims trailing whitespace', ({ expect }) => {
    const stdout = faker.lorem.sentence();
    const result = text(`${stdout}  \n\n`, '');

    expect(textOf(result)).toBe(stdout);
  });

  it('returns (no output) for empty strings', ({ expect }) => {
    const result = text('', '');

    expect(textOf(result)).toBe('(no output)');
  });

  it('returns (no output) for whitespace-only', ({ expect }) => {
    const result = text('  \n', '  \n');

    expect(textOf(result)).toBe('(no output)');
  });

  it('does not set isError', ({ expect }) => {
    const result = text(faker.lorem.sentence(), '');

    expect(result.isError).toBeUndefined();
  });
});

describe('fail()', () => {
  it('returns isError: true', ({ expect }) => {
    const result = fail(faker.lorem.sentence());

    expect(result.isError).toBe(true);
  });

  it('includes the message', ({ expect }) => {
    const message = faker.lorem.sentence();
    const result = fail(message);

    expect(textOf(result)).toBe(message);
  });

  it('handles empty message', ({ expect }) => {
    const result = fail('');

    expect(textOf(result)).toBe('');
  });
});

/**
 * What execFile rejects with when its timeout kills the command.
 */
const timeoutKill = (stdout: string) => ({
  /* eslint-disable-next-line unicorn/no-null --
     execFile rejects a killed process with a null code */
  code: null,
  killed: true,
  message: faker.lorem.sentence(),
  signal: 'SIGTERM',
  stderr: '',
  stdout,
});

describe(errorResult, () => {
  // Shapes mirror what node:child_process.execFile rejects with: a timeout
  // sets killed/signal with empty output; maxBuffer overflow sets the
  // ERR_CHILD_PROCESS_STDIO_MAXBUFFER code; ordinary failures carry output.

  it('surfaces a timeout kill instead of the generic message', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(2);
    const err = timeoutKill('');
    const result = errorResult(err, cmd, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Command timed out after 30s: ${cmd} ${args.join(' ')}`);
  });

  it('appends partial output to a timeout message', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(2);
    const partial = faker.lorem.sentence();
    const err = timeoutKill(`${partial}\n`);
    const result = errorResult(err, cmd, args);

    expect(textOf(result))
      .toBe(`Command timed out after 30s: ${cmd} ${args.join(' ')}\n${partial}`);
  });

  it('surfaces a maxBuffer overflow', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(2);
    const err = {
      code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      killed: true,
      message: faker.lorem.sentence(),
      stderr: '',
      stdout: '',
    };
    const result = errorResult(err, cmd, args);

    expect(result.isError).toBe(true);
    expect(textOf(result))
      .toBe(`Command output exceeded ${String(maxBuffer)} bytes: ${cmd} ${args.join(' ')}`);
  });

  it('returns ordinary failure output without isError', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(1);
    const stderr = faker.lorem.sentence();
    const err = { code: 1, message: faker.lorem.sentence(), stdout: '', stderr: `${stderr}\n` };
    const result = errorResult(err, cmd, args);

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe(stderr);
  });

  it('falls back to err.message when there is no output', ({ expect }) => {
    const message = faker.lorem.sentence();
    const err = { code: 'ENOENT', message, stdout: '', stderr: '' };
    const result = errorResult(err, faker.lorem.word(), []);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
  });

  it('reads the fields off a real Error instance', ({ expect }) => {
    const message = faker.lorem.sentence();
    const err = Object.assign(new Error(message), { code: 'ENOENT', stdout: '', stderr: '' });
    const result = errorResult(err, faker.lorem.word(), []);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
  });

  it('reports a thrown value that is not an execFile error', ({ expect }) => {
    const thrown = faker.lorem.sentence();
    const result = errorResult(thrown, faker.lorem.word(), []);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(thrown);
  });
});
