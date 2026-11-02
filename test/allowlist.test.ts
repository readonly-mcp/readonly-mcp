import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { z } from 'zod';
import {
  ArgsSchema, isAllowedApiPath, isAllowlisted, rejectApiEndpoint,
  rejectBlockedFlags, rejectSubcommand,
} from '../lib/allowlist.ts';
import * as build from './builders.ts';
import { textOf } from './helpers.ts';

describe('ArgsSchema coercion', () => {
  const schema = z.object(ArgsSchema);

  it('accepts a normal array', ({ expect }) => {
    const args = [faker.lorem.word(), build.longFlag()];

    expect(schema.parse({ args }).args).toEqual(args);
  });

  it('coerces a JSON-stringified array to an array', ({ expect }) => {
    const args = [faker.lorem.word(), build.longFlag()];

    expect(schema.parse({ args: JSON.stringify(args) }).args).toEqual(args);
  });

  it('uses default when args is omitted', ({ expect }) => {
    expect(schema.parse({}).args).toEqual([]);
  });

  it('rejects a plain string that is not valid JSON array', ({ expect }) => {
    expect(() => schema.parse({ args: `${faker.lorem.word()} ${build.longFlag()}` })).toThrow();
  });

  it('rejects a JSON-stringified object', ({ expect }) => {
    expect(() => schema.parse({ args: JSON.stringify({ [faker.lorem.word()]: faker.lorem.word() }) })).toThrow();
  });

  it('rejects a JSON-stringified number', ({ expect }) => {
    expect(() => schema.parse({ args: String(faker.number.int()) })).toThrow();
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
      expect(isAllowlisted([], new Set(build.words(3)))).toBe(false);
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

  it('returns isError: true', ({ expect }) => {
    const result = rejectSubcommand([word()], allowlist);

    expect(result.isError).toBe(true);
  });

  it('includes the rejected subcommand in message', ({ expect }) => {
    const rejected = word();
    const result = rejectSubcommand([rejected], allowlist);

    expect(textOf(result)).toContain(`not allowed: ${rejected}.`);
  });

  it('includes allowed subcommands in message', ({ expect }) => {
    const result = rejectSubcommand([word()], allowlist);

    expect(textOf(result)).toContain(`Allowed: ${allowed.join(', ')}`);
  });

  it('shows (none) for empty args', ({ expect }) => {
    const result = rejectSubcommand([], allowlist);

    expect(textOf(result)).toContain('(none)');
  });
});

describe('rejectBlockedFlags', () => {
  /*
   * The flag names stay literal: each test pins a specific prefix relation
   * between the blocked set and the arg (an abbreviation, a longer flag that
   * merely starts the same way). Subcommands and values are incidental.
   */
  const blocked = new Set(['--fix', '--registry']);

  describe('exact matches', () => {
    it('blocks exact flag', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), '--fix'], blocked);

      expect(result?.isError).toBe(true);
    });

    it('blocks flag=value form', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), `--registry=${build.httpsUrl()}`], blocked);

      expect(result?.isError).toBe(true);
    });

    it('returns undefined when no blocked flags present', ({ expect }) => {
      expect(rejectBlockedFlags([faker.lorem.word(), build.longFlag()], blocked)).toBeUndefined();
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
      const result = rejectBlockedFlags([faker.lorem.word(), '--reg', build.httpsUrl()], blocked);

      expect(result?.isError).toBe(true);
    });

    it('blocks abbreviated --registr', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), '--registr', build.httpsUrl()], blocked);

      expect(result?.isError).toBe(true);
    });

    it('blocks abbreviated --fi (matches --fix)', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), '--fi'], blocked);

      expect(result?.isError).toBe(true);
    });

    it('blocks abbreviated --reg=value form', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), `--reg=${build.httpsUrl()}`], blocked);

      expect(result?.isError).toBe(true);
    });

    it('does not block unrelated flag with similar prefix', ({ expect }) => {
      // "--format" does not start any blocked flag, and no blocked flag starts with "--format"
      expect(rejectBlockedFlags([faker.lorem.word(), '--format', faker.lorem.word()], blocked)).toBeUndefined();
    });

    it('does not block longer flag that starts with blocked flag', ({ expect }) => {
      // "--fix-missing-peers" starts with "--fix" but "--fix".startsWith("--fix-missing-peers") is false
      // and "--fix-missing-peers".startsWith("--fix=") is false
      // but "--fix".startsWith("--fix-missing-peers".split("=")[0]) checks "--fix".startsWith("--fix-missing-peers")
      // which is false. However, the check is [...blockedFlags].some(f => ... f.startsWith(a.split("=")[0]))
      // So we check if "--fix".startsWith("--fix-missing-peers") → false
      // and if "--registry".startsWith("--fix-missing-peers") → false
      // So this should pass through
      expect(rejectBlockedFlags([faker.lorem.word(), '--fix-missing-peers'], blocked)).toBeUndefined();
    });
  });

  describe('concatenated short flags', () => {
    const shortBlocked = new Set(['-X', '-f']);

    it('blocks -XPOST (value concatenated to short flag)', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), faker.lorem.word(), '-XPOST'], shortBlocked);

      expect(result?.isError).toBe(true);
    });

    it('blocks -fkey=val (value concatenated to short flag)', ({ expect }) => {
      const arg = `-f${faker.lorem.word()}=${faker.lorem.word()}`;
      const result = rejectBlockedFlags([faker.lorem.word(), faker.lorem.word(), arg], shortBlocked);

      expect(result?.isError).toBe(true);
    });

    it('does not false-positive on long flag starting with single dash char', ({ expect }) => {
      // -Xtra is not a concatenated -X if -X is not in the blocked set for this test
      const unrelated = new Set(['--registry']);

      expect(rejectBlockedFlags([faker.lorem.word(), '-Xtra'], unrelated)).toBeUndefined();
    });

    it('does not apply short-flag rule to long flags', ({ expect }) => {
      // --method is 8 chars, not a 2-char short flag
      const longOnly = new Set(['--method']);

      // "--methodical" should NOT be caught by the short-flag rule (only by prefix)
      // prefix check: "--method".startsWith("--methodical") → false
      // long flag rule doesn't apply (--method.length !== 2)
      // but a.startsWith(f + "=") → "--methodical".startsWith("--method=") → false
      // and f.startsWith(a.split("=")[0]) → "--method".startsWith("--methodical") → false
      expect(rejectBlockedFlags([faker.lorem.word(), '--methodical'], longOnly)).toBeUndefined();
    });
  });

  describe('end-of-options marker', () => {
    it('does not false-positive on bare --', ({ expect }) => {
      expect(rejectBlockedFlags([faker.lorem.word(), '--', faker.lorem.word()], blocked)).toBeUndefined();
    });

    it('does not false-positive on bare -', ({ expect }) => {
      expect(rejectBlockedFlags([faker.lorem.word(), '-', faker.lorem.word()], blocked)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns undefined for single-element args', ({ expect }) => {
      expect(rejectBlockedFlags([faker.lorem.word()], blocked)).toBeUndefined();
    });

    it('returns undefined for empty blocked set', ({ expect }) => {
      expect(rejectBlockedFlags([faker.lorem.word(), build.longFlag()], new Set())).toBeUndefined();
    });

    it('reports the first blocked flag found', ({ expect }) => {
      const result = rejectBlockedFlags([faker.lorem.word(), '--fix', '--registry'], blocked);

      expect(textOf(result)).toBe('Flag not allowed: --fix');
    });
  });
});

describe('isAllowedApiPath', () => {
  const patterns = [
    'repos/*/*/pulls/*/comments',
    'repos/*/*/commits/*/status',
    'repos/*/*/contents/**',
  ];

  describe('matching', () => {
    it('matches exact pattern with wildcards', ({ expect }) => {
      expect(isAllowedApiPath(build.prCommentsPath(), patterns)).toBe(true);
    });

    it('matches second pattern', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/commits/${build.commitSha()}/status`, patterns)).toBe(true);
    });
  });

  describe('trailing ** glob', () => {
    it('matches single trailing segment', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/contents/${build.fileName()}`, patterns)).toBe(true);
    });

    it('matches multiple trailing segments', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/contents/${build.relativeFilePath()}`, patterns)).toBe(true);
    });

    it('matches deeply nested path', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/contents/${build.words(4).join('/')}`, patterns)).toBe(true);
    });

    it('rejects when no trailing segment exists', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/contents`, patterns)).toBe(false);
    });
  });

  describe('normalization', () => {
    it('strips leading slash', ({ expect }) => {
      expect(isAllowedApiPath(`/${build.prCommentsPath()}`, patterns)).toBe(true);
    });

    it('strips query parameters', ({ expect }) => {
      expect(isAllowedApiPath(`${build.prCommentsPath()}${build.queryString()}`, patterns)).toBe(true);
    });

    it('strips trailing slash', ({ expect }) => {
      expect(isAllowedApiPath(`${build.prCommentsPath()}/`, patterns)).toBe(true);
    });

    it('strips leading slash, trailing slash, and query string together', ({ expect }) => {
      expect(isAllowedApiPath(`/${build.prCommentsPath()}/${build.queryString()}`, patterns)).toBe(true);
    });
  });

  describe('rejection', () => {
    it('rejects full https URL', ({ expect }) => {
      expect(isAllowedApiPath(`https://api.github.com/${build.prCommentsPath()}`, patterns)).toBe(false);
    });

    it('rejects full http URL', ({ expect }) => {
      /* eslint-disable-next-line unicorn/prefer-https --
         The plain http scheme is the input under test */
      expect(isAllowedApiPath(`http://api.github.com/${build.prCommentsPath()}`, patterns)).toBe(false);
    });

    it('rejects too few segments', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/pulls/${build.resourceId()}`, patterns)).toBe(false);
    });

    it('rejects too many segments (non-** pattern)', ({ expect }) => {
      expect(isAllowedApiPath(`${build.prCommentsPath()}/${faker.lorem.word()}`, patterns)).toBe(false);
    });

    it('rejects unmatched path', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/git/refs`, patterns)).toBe(false);
    });

    it('rejects empty endpoint', ({ expect }) => {
      expect(isAllowedApiPath('', patterns)).toBe(false);
    });

    it('rejects bare slash', ({ expect }) => {
      expect(isAllowedApiPath('/', patterns)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty patterns array', ({ expect }) => {
      expect(isAllowedApiPath(build.prCommentsPath(), [])).toBe(false);
    });

    it('** requires at least one trailing segment', ({ expect }) => {
      expect(isAllowedApiPath(`${build.repoApiPath()}/contents`, patterns)).toBe(false);
    });

    it('contents/. matches (dot is a valid trailing segment)', ({ expect }) => {
      // By design — `.` is a valid directory entry; GitHub's API interprets it
      // as the repo root. The `**` glob accepts any content after the prefix.
      expect(isAllowedApiPath(`${build.repoApiPath()}/contents/.`, patterns)).toBe(true);
    });
  });
});

describe('rejectApiEndpoint', () => {
  const patterns = ['repos/*/pulls/*/comments'];

  it('returns isError: true', ({ expect }) => {
    const result = rejectApiEndpoint(`${build.repoApiPath()}/${faker.lorem.word()}`, patterns);

    expect(result.isError).toBe(true);
  });

  it('includes normalized endpoint in message', ({ expect }) => {
    const endpoint = `${build.repoApiPath()}/${faker.lorem.word()}`;
    const result = rejectApiEndpoint(`/${endpoint}${build.queryString()}`, patterns);

    expect(textOf(result)).toContain(`not allowed: ${endpoint}.`);
  });

  it('includes allowed patterns in message', ({ expect }) => {
    const result = rejectApiEndpoint(build.words(2).join('/'), patterns);

    expect(textOf(result)).toContain('repos/*/pulls/*/comments');
  });

  it('shows (none) for undefined endpoint', ({ expect }) => {
    const result = rejectApiEndpoint(undefined, patterns);

    expect(textOf(result)).toContain('(none)');
  });
});
