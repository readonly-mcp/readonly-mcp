import { rm, writeFile } from 'node:fs/promises';
import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, it } from 'vitest';
import { rejectedMetaKey } from '#src/lib/exec.js';
import { reject, run } from '#src/lib/plan.js';
import * as build from '#test/builders.js';
import { createCanary } from '#test/canary.js';

// A call the server refused, as runPlan reports it.
const rejected = (text: string): CallToolResult => ({
  _meta: { [rejectedMetaKey]: true },
  content: [{ text, type: 'text' }],
  isError: true,
});

// A command that ran and failed without output, timed out, or was not installed.
const failed = (text: string): CallToolResult => ({
  content: [{ text, type: 'text' }],
  isError: true,
});

// A command that ran, as exec reports it: text with no error flag.
const ran = (text: string): CallToolResult => ({ content: [{ text, type: 'text' }] });

describe.concurrent('toBeBlocked', () => {
  it('passes for a rejected call', ({ expect }) => {
    expect(rejected(faker.lorem.sentence())).toBeBlocked();
  });

  it('fails for a call that ran', ({ expect }) => {
    expect(() => {
      expect(ran(faker.lorem.sentence())).toBeBlocked();
    }).toThrow('expected the call to be blocked');
  });

  it('fails for a call that ran and failed', ({ expect }) => {
    expect(() => {
      expect(failed(faker.lorem.sentence())).toBeBlocked();
    }).toThrow('expected the call to be blocked');
  });

  it('passes negated for a call that ran', ({ expect }) => {
    expect(ran(faker.lorem.sentence())).not.toBeBlocked();
  });

  it('fails negated for a rejected call', ({ expect }) => {
    expect(() => {
      expect(rejected(faker.lorem.sentence())).not.toBeBlocked();
    }).toThrow('expected the call not to be blocked');
  });

  it('quotes the result text in its failure', ({ expect }) => {
    const text = faker.lorem.sentence();

    expect(() => {
      expect(ran(text)).toBeBlocked();
    }).toThrow(text);
  });

  it('says no request was recorded for a result made by hand', ({ expect }) => {
    expect(() => {
      expect(ran(faker.lorem.sentence())).toBeBlocked();
    }).toThrow('expected the call to be blocked, no request recorded');
  });

  it('rejects a value that is not a tool result', ({ expect }) => {
    expect(() => {
      expect(faker.lorem.word()).toBeBlocked();
    }).toThrow('expected a tool result');
  });
});

describe.concurrent('toSucceed', () => {
  it('passes for a call that ran', ({ expect }) => {
    expect(ran(faker.lorem.sentence())).toSucceed();
  });

  it('fails for a call that ran and failed', ({ expect }) => {
    expect(() => {
      expect(failed(faker.lorem.sentence())).toSucceed();
    }).toThrow('expected the call to succeed');
  });

  it('quotes the result text in its failure', ({ expect }) => {
    const text = faker.lorem.sentence();

    expect(() => {
      expect(rejected(text)).toSucceed();
    }).toThrow(text);
  });

  it('rejects a value that is not a tool result', ({ expect }) => {
    expect(() => {
      expect(faker.lorem.word()).toSucceed();
    }).toThrow('expected a tool result');
  });
});

describe.concurrent('toBeIntact', () => {
  it('passes for an untouched canary', async ({ expect }) => {
    await using canary = await createCanary();

    await expect(canary).toBeIntact();
  });

  it('fails for a rewritten canary', async ({ expect }) => {
    await using canary = await createCanary();
    await writeFile(canary.file, faker.lorem.sentence(), 'utf8');

    await expect(expect(canary).toBeIntact()).rejects.toThrow('expected the canary to be intact');
  });

  it('quotes the rewritten content in its failure', async ({ expect }) => {
    await using canary = await createCanary();
    const content = faker.lorem.sentence();
    await writeFile(canary.file, content, 'utf8');

    await expect(expect(canary).toBeIntact()).rejects.toThrow(content);
  });

  it('fails for a deleted canary', async ({ expect }) => {
    await using canary = await createCanary();
    await rm(canary.file);

    await expect(expect(canary).toBeIntact()).rejects.toThrow('unreadable');
  });

  it('rejects a value that is not a canary', async ({ expect }) => {
    await expect(expect(faker.lorem.word()).toBeIntact()).rejects.toThrow('expected a canary');
  });
});

describe.concurrent('toRun', () => {
  it('passes for a run of the command with those args', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(3);

    expect(run(cmd, args)).toRun(cmd, [...args]);
  });

  it('passes for a run of the command when no args are expected', ({ expect }) => {
    const cmd = faker.lorem.word();

    expect(run(cmd, build.words(2))).toRun(cmd);
  });

  it('fails for a run of another command', ({ expect }) => {
    const cmd = faker.lorem.word();
    const other = `${cmd}-${faker.lorem.word()}`;

    expect(() => {
      expect(run(other, [])).toRun(cmd);
    }).toThrow(`expected the plan to run ${cmd}`);
  });

  it('fails for a run with other args', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(2);

    expect(() => {
      expect(run(cmd, args)).toRun(cmd, args.slice(1));
    }).toThrow(`it runs: ${cmd} ${args.join(' ')}`);
  });

  it('quotes an arg holding a space in its failure', ({ expect }) => {
    const cmd = faker.lorem.word();
    const words = build.words(2);
    const line = words.join(' ');

    expect(() => {
      expect(run(cmd, words)).toRun(cmd, [line]);
    }).toThrow(`expected the plan to run ${cmd} "${line}", it runs: ${cmd} ${line}`);
  });

  it('fails negated for a run of the command', ({ expect }) => {
    const cmd = faker.lorem.word();

    expect(() => {
      expect(run(cmd, [])).not.toRun(cmd);
    }).toThrow(`expected the plan not to run ${cmd}, it runs: ${cmd}`);
  });

  it('quotes a rejection reason in its failure', ({ expect }) => {
    const reason = faker.lorem.sentence();

    expect(() => {
      expect(reject(reason)).toRun(faker.lorem.word());
    }).toThrow(`it rejects: ${reason}`);
  });

  it('rejects a value that is not a plan', ({ expect }) => {
    expect(() => {
      expect(faker.lorem.word()).toRun(faker.lorem.word());
    }).toThrow('expected a plan');
  });
});

describe.concurrent('toBeRejected', () => {
  it('passes for a rejection', ({ expect }) => {
    expect(reject(faker.lorem.sentence())).toBeRejected();
  });

  it('fails negated for a rejection', ({ expect }) => {
    const reason = faker.lorem.sentence();

    expect(() => {
      expect(reject(reason)).not.toBeRejected();
    }).toThrow(`expected the plan not to be rejected, it rejects: ${reason}`);
  });

  it('names the command in its failure for a run', ({ expect }) => {
    const cmd = faker.lorem.word();
    const args = build.words(2);

    expect(() => {
      expect(run(cmd, args)).toBeRejected();
    }).toThrow(`expected the plan to be rejected, it runs: ${cmd} ${args.join(' ')}`);
  });

  it('rejects a value that is not a plan', ({ expect }) => {
    expect(() => {
      expect(faker.lorem.word()).toBeRejected();
    }).toThrow('expected a plan');
  });
});
