import { rm, writeFile } from 'node:fs/promises';
import { faker } from '@faker-js/faker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, it } from 'vitest';
import { createCanary } from '#test/canary.js';

const rejected = (text: string): CallToolResult => ({
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
