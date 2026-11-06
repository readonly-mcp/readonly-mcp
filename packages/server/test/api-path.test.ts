import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { isAllowedApiPath, rejectApiEndpoint } from '#src/lib/allowlist.js';
import * as build from '#test/builders.js';

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
      const endpoint = `${build.repoApiPath()}/commits/${build.commitSha()}/status`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(true);
    });
  });

  describe('trailing ** glob', () => {
    it('matches single trailing segment', ({ expect }) => {
      const endpoint = `${build.repoApiPath()}/contents/${build.fileName()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(true);
    });

    it('matches multiple trailing segments', ({ expect }) => {
      const endpoint = `${build.repoApiPath()}/contents/${build.relativeFilePath()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(true);
    });

    it('matches deeply nested path', ({ expect }) => {
      const endpoint = `${build.repoApiPath()}/contents/${build.words(4).join('/')}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(true);
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
      const endpoint = `${build.prCommentsPath()}${build.queryString()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(true);
    });

    it('strips trailing slash', ({ expect }) => {
      expect(isAllowedApiPath(`${build.prCommentsPath()}/`, patterns)).toBe(true);
    });

    it('strips leading slash, trailing slash, and query string together', ({ expect }) => {
      const endpoint = `/${build.prCommentsPath()}/${build.queryString()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(true);
    });
  });

  describe('rejection', () => {
    it('rejects full https URL', ({ expect }) => {
      const endpoint = `https://api.github.com/${build.prCommentsPath()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(false);
    });

    it('rejects full http URL', ({ expect }) => {
      /* eslint-disable-next-line unicorn/prefer-https --
         The plain http scheme is the input under test */
      const endpoint = `http://api.github.com/${build.prCommentsPath()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(false);
    });

    it('rejects too few segments', ({ expect }) => {
      const endpoint = `${build.repoApiPath()}/pulls/${build.resourceId()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(false);
    });

    it('rejects too many segments (non-** pattern)', ({ expect }) => {
      const endpoint = `${build.prCommentsPath()}/${faker.lorem.word()}`;

      expect(isAllowedApiPath(endpoint, patterns)).toBe(false);
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

  it('returns a rejection', ({ expect }) => {
    const result = rejectApiEndpoint(`${build.repoApiPath()}/${faker.lorem.word()}`, patterns);

    expect(result.kind).toBe('reject');
  });

  it('includes normalized endpoint in message', ({ expect }) => {
    const endpoint = `${build.repoApiPath()}/${faker.lorem.word()}`;
    const result = rejectApiEndpoint(`/${endpoint}${build.queryString()}`, patterns);

    expect(result.reason).toContain(`not allowed: ${endpoint}.`);
  });

  it('includes allowed patterns in message', ({ expect }) => {
    const result = rejectApiEndpoint(build.words(2).join('/'), patterns);

    expect(result.reason).toContain('repos/*/pulls/*/comments');
  });

  it('shows (none) for undefined endpoint', ({ expect }) => {
    const result = rejectApiEndpoint(undefined, patterns);

    expect(result.reason).toContain('(none)');
  });
});
