import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { z } from 'zod';
import {
  ArgsSchema, isAllowlisted, rejectBlockedFlags, rejectSubcommand, shortFlags,
} from '#src/lib/allowlist.js';
import * as build from '#test/builders.js';

describe('ArgsSchema coercion', () => {
  const schema = z.object(ArgsSchema);

  it('accepts a normal array', ({ expect }) => {
    const args = [faker.lorem.word(), build.longFlag()];

    expect(schema.parse({ args }).args).toStrictEqual(args);
  });

  it('coerces a JSON-stringified array to an array', ({ expect }) => {
    const args = [faker.lorem.word(), build.longFlag()];

    expect(schema.parse({ args: JSON.stringify(args) }).args).toStrictEqual(args);
  });

  it('uses default when args is omitted', ({ expect }) => {
    expect(schema.parse({}).args).toStrictEqual([]);
  });

  it('rejects a plain string that is not valid JSON array', ({ expect }) => {
    const args = `${faker.lorem.word()} ${build.longFlag()}`;

    expect(() => schema.parse({ args })).toThrow(z.ZodError);
  });

  it('rejects a JSON-stringified object', ({ expect }) => {
    const args = JSON.stringify({ [faker.lorem.word()]: faker.lorem.word() });

    expect(() => schema.parse({ args })).toThrow(z.ZodError);
  });

  it('rejects a JSON-stringified number', ({ expect }) => {
    expect(() => schema.parse({ args: String(faker.number.int()) })).toThrow(z.ZodError);
  });
});

describe('isAllowlisted', () => {
  describe('single-word allowlist', () => {
    const word = build.distinctWords();
    const command = word();
    const single = new Set([command, word(), word()]);

    it('matches exact command', ({ expect }) => {
      expect(isAllowlisted([command], single)).toBe(true);
    });

    it('matches with trailing args', ({ expect }) => {
      expect(isAllowlisted([command, build.longFlag()], single)).toBe(true);
    });

    it('rejects unknown command', ({ expect }) => {
      expect(isAllowlisted([word()], single)).toBe(false);
    });
  });

  describe('two-word allowlist', () => {
    const word = build.distinctWords();
    const group = word();
    const sub = word();
    const multi = new Set([`${group} ${sub}`, `${group} ${word()}`, `${word()} ${word()}`]);

    it('matches two-word subcommand', ({ expect }) => {
      expect(isAllowlisted([group, sub], multi)).toBe(true);
    });

    it('matches with trailing args', ({ expect }) => {
      expect(isAllowlisted([group, sub, build.longFlag()], multi)).toBe(true);
    });

    it('rejects partial match (first word only)', ({ expect }) => {
      expect(isAllowlisted([group], multi)).toBe(false);
    });

    it('rejects unknown second word', ({ expect }) => {
      expect(isAllowlisted([group, word()], multi)).toBe(false);
    });
  });

  describe('mixed-depth allowlist', () => {
    const word = build.distinctWords();
    const top = word();
    const group = word();
    const sub = word();
    const mixed = new Set([top, `${group} ${sub}`, `${word()} ${word()}`]);

    it('matches single-word entry', ({ expect }) => {
      expect(isAllowlisted([top, build.longFlag()], mixed)).toBe(true);
    });

    it('matches two-word entry', ({ expect }) => {
      expect(isAllowlisted([group, sub], mixed)).toBe(true);
    });

    it('rejects partial match of two-word entry', ({ expect }) => {
      expect(isAllowlisted([group], mixed)).toBe(false);
    });
  });

  describe('three-word allowlist', () => {
    const word = build.distinctWords();
    const head = word();
    const path = [head, word(), word()];
    const deep = new Set([path.join(' '), `${head} ${word()} ${word()}`]);

    it('matches three-word subcommand', ({ expect }) => {
      expect(isAllowlisted(path, deep)).toBe(true);
    });

    it('matches with trailing args', ({ expect }) => {
      expect(isAllowlisted([...path, build.longFlag()], deep)).toBe(true);
    });

    it('rejects partial match', ({ expect }) => {
      expect(isAllowlisted(path.slice(0, 2), deep)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty args', ({ expect }) => {
      const allowlist = new Set(build.words(3));

      expect(isAllowlisted([], allowlist)).toBe(false);
    });

    it('does not match single arg containing space against multi-word entry', ({ expect }) => {
      // "issue list" as one arg matches the set entry at depth 0
      // This is a known quirk — safe because execFile passes it as one argv element
      // which the target CLI would reject
      const entry = build.words(2).join(' ');

      expect(isAllowlisted([entry], new Set([entry]))).toBe(true);
    });

    it('handles empty Set', ({ expect }) => {
      expect(isAllowlisted([faker.lorem.word()], new Set())).toBe(false);
    });
  });
});

describe('rejectSubcommand', () => {
  const word = build.distinctWords();
  const allowed = [word(), word()];
  const allowlist = new Set(allowed);

  it('returns a rejection', ({ expect }) => {
    const result = rejectSubcommand([word()], allowlist);

    expect(result.kind).toBe('reject');
  });

  it('includes the rejected subcommand in message', ({ expect }) => {
    const rejected = word();
    const result = rejectSubcommand([rejected], allowlist);

    expect(result.reason).toContain(`not allowed: ${rejected}.`);
  });

  it('includes allowed subcommands in message', ({ expect }) => {
    const result = rejectSubcommand([word()], allowlist);

    expect(result.reason).toContain(`Allowed: ${allowed.join(', ')}`);
  });

  it('shows (none) for empty args', ({ expect }) => {
    const result = rejectSubcommand([], allowlist);

    expect(result.reason).toContain('(none)');
  });
});

/**
 * Args for rejectBlockedFlags: a generated subcommand, which it skips, then `flags`.
 */
const withSubcommand = (...flags: string[]): string[] => [faker.lorem.word(), ...flags];

describe('rejectBlockedFlags', () => {
  /*
   * The flag names stay literal: each test pins a specific prefix relation
   * between the blocked set and the arg (an abbreviation, a longer flag that
   * merely starts the same way). Subcommands and values are incidental.
   */
  const blocked = new Set(['--fix', '--registry']);

  describe('exact matches', () => {
    it('blocks exact flag', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('--fix'), blocked);

      expect(result?.kind).toBe('reject');
    });

    it('blocks flag=value form', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand(`--registry=${build.httpsUrl()}`), blocked);

      expect(result?.kind).toBe('reject');
    });

    it('returns undefined when no blocked flags present', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand(build.longFlag()), blocked);

      expect(result).toBeUndefined();
    });
  });

  describe('skips args[0]', () => {
    it('does not check the subcommand at index 0', ({ expect }) => {
      // "--fix" at index 0 is the "subcommand", not checked
      expect(rejectBlockedFlags(['--fix'], blocked)).toBeUndefined();
    });
  });

  describe('prefix matching (abbreviation defense)', () => {
    it('blocks abbreviated --reg (matches --registry)', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('--reg', build.httpsUrl()), blocked);

      expect(result?.kind).toBe('reject');
    });

    it('blocks abbreviated --registr', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('--registr', build.httpsUrl()), blocked);

      expect(result?.kind).toBe('reject');
    });

    it('blocks abbreviated --fi (matches --fix)', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('--fi'), blocked);

      expect(result?.kind).toBe('reject');
    });

    it('blocks abbreviated --reg=value form', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand(`--reg=${build.httpsUrl()}`), blocked);

      expect(result?.kind).toBe('reject');
    });

    it('does not block unrelated flag with similar prefix', ({ expect }) => {
      // "--format" does not start any blocked flag, and no blocked flag starts with "--format"
      const result = rejectBlockedFlags(withSubcommand('--format', faker.lorem.word()), blocked);

      expect(result).toBeUndefined();
    });

    it('does not block longer flag that starts with blocked flag', ({ expect }) => {
      // "--fix-missing-peers" is neither "--fix" nor "--fix=…", and no blocked
      // flag is a prefix of it reversed: neither starts with "--fix-missing-peers".
      expect(rejectBlockedFlags(withSubcommand('--fix-missing-peers'), blocked)).toBeUndefined();
    });
  });

  describe('concatenated short flags', () => {
    const shortBlocked = new Set(['-X', '-f']);

    it('blocks -XPOST (value concatenated to short flag)', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand(faker.lorem.word(), '-XPOST'), shortBlocked);

      expect(result?.kind).toBe('reject');
    });

    it('blocks -fkey=val (value concatenated to short flag)', ({ expect }) => {
      const arg = `-f${faker.lorem.word()}=${faker.lorem.word()}`;
      const result = rejectBlockedFlags(withSubcommand(faker.lorem.word(), arg), shortBlocked);

      expect(result?.kind).toBe('reject');
    });

    it('does not false-positive on long flag starting with single dash char', ({ expect }) => {
      // -Xtra is not a concatenated -X if -X is not in the blocked set for this test
      const unrelated = new Set(['--registry']);

      expect(rejectBlockedFlags(withSubcommand('-Xtra'), unrelated)).toBeUndefined();
    });

    it('does not apply short-flag rule to long flags', ({ expect }) => {
      // --method is 8 chars, not a 2-char short flag
      const longOnly = new Set(['--method']);

      // "--methodical" is neither "--method" nor "--method=…", "--method" does not
      // start with it, and the short-flag rule covers only two-character flags.
      expect(rejectBlockedFlags(withSubcommand('--methodical'), longOnly)).toBeUndefined();
    });
  });

  describe('end-of-options marker', () => {
    it('does not false-positive on bare --', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('--', faker.lorem.word()), blocked);

      expect(result).toBeUndefined();
    });

    it('does not false-positive on bare -', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('-', faker.lorem.word()), blocked);

      expect(result).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns undefined for single-element args', ({ expect }) => {
      expect(rejectBlockedFlags([faker.lorem.word()], blocked)).toBeUndefined();
    });

    it('returns undefined for empty blocked set', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand(build.longFlag()), new Set());

      expect(result).toBeUndefined();
    });

    it('reports the first blocked flag found', ({ expect }) => {
      const result = rejectBlockedFlags(withSubcommand('--fix', '--registry'), blocked);

      expect(result?.reason).toBe('Flag not allowed: --fix');
    });
  });
});

describe('shortFlags', () => {
  // The flags stay literal: each case pins where a group ends.
  const takesValue = new Set(['L', 'M']);

  it.for([
    { arg: '-w', flags: ['w'], name: 'a lone flag', value: '' },
    { arg: '-wbs', flags: ['w', 'b', 's'], name: 'a group', value: '' },
    {
      arg: '-wL1,5', flags: ['w', 'L'], name: 'a group ended by a flag taking a value',
      value: '1,5',
    },
    { arg: '-L/S/,+1', flags: ['L'], name: 'a value holding flag letters', value: '/S/,+1' },
    { arg: '-wM', flags: ['w', 'M'], name: 'a value flag with nothing after it', value: '' },
    { arg: '-L😀', flags: ['L'], name: 'a value outside the BMP', value: '😀' },
  ])('reads $name', ({ arg, flags, value }, { expect }) => {
    expect(shortFlags(arg, takesValue)).toStrictEqual({ flags, value });
  });

  it.for([
    { arg: build.longFlag(), name: 'a long option' },
    { arg: '-', name: 'a lone dash' },
    { arg: '--', name: 'the end of options' },
    { arg: build.fileName('md'), name: 'a positional' },
  ])('reads no flags from $name', ({ arg }, { expect }) => {
    expect(shortFlags(arg, takesValue)).toStrictEqual({ flags: [], value: '' });
  });
});
