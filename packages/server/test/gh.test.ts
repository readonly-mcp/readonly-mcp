import { faker } from '@faker-js/faker';
import { type ExpectStatic, describe, it } from 'vitest';
import type { Plan } from '#src/lib/plan.js';
import { plan } from '#src/tools/gh.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

const assertRuns = (expect: ExpectStatic, args: readonly string[]) => {
  expect(plan(args)).toMatchObject({ cmd: 'gh', kind: 'run' });
};

const assertRejected = (expect: ExpectStatic, result: Plan) => {
  expect(result).toMatchObject({ kind: 'reject' });
};

describe.concurrent('gh tool', () => {
  describe('allowed subcommands', () => {
    it.for([
      ['attestation', 'verify'],
      ['cache', 'list'],
      ['gist', 'list'],
      ['gist', 'view'],
      ['issue', 'list'],
      ['issue', 'status'],
      ['issue', 'view'],
      ['label', 'list'],
      ['pr', 'checks'],
      ['pr', 'diff'],
      ['pr', 'list'],
      ['pr', 'status'],
      ['pr', 'view'],
      ['project', 'field-list'],
      ['project', 'item-list'],
      ['project', 'list'],
      ['project', 'view'],
      ['release', 'list'],
      ['release', 'view'],
      ['repo', 'list'],
      ['repo', 'view'],
      ['ruleset', 'check'],
      ['ruleset', 'list'],
      ['ruleset', 'view'],
      ['run', 'list'],
      ['run', 'view'],
      ['search', 'code'],
      ['search', 'commits'],
      ['search', 'issues'],
      ['search', 'prs'],
      ['search', 'repos'],
      ['secret', 'list'],
      ['status'],
      ['variable', 'list'],
      ['workflow', 'list'],
      ['workflow', 'view'],
    ].map(args => ({ name: args.join(' '), args })))(
      'allows $name', ({ args }, { expect }) => {
        assertRuns(expect, args);
      },
    );

    it('allows subcommand with flags', ({ expect }) => {
      const args = ['pr', 'list', '--state', 'open', '--json', 'number'];
      assertRuns(expect, args);
    });
  });

  describe('--jq filters', () => {
    const json = () => ['--json', faker.lorem.word()];

    it.for([
      { args: ['pr', 'list', ...json(), '--jq', '$ENV'], name: '--jq $ENV', used: 'ENV' },
      { args: ['pr', 'list', ...json(), '--jq', 'env'], name: '--jq env', used: 'env' },
      { args: ['repo', 'view', ...json(), '-q', '$ENV.GH_TOKEN'], name: '-q', used: 'ENV' },
      { args: ['repo', 'view', ...json(), '-q$ENV'], name: 'attached -q', used: 'ENV' },
      { args: ['repo', 'view', ...json(), '-q=$ENV'], name: '-q=', used: 'ENV' },
      { args: ['repo', 'view', ...json(), '--jq=env'], name: '--jq=', used: 'env' },
      { args: ['pr', 'view', ...json(), '-wq', 'env'], name: 'q ending a group', used: 'env' },
      { args: ['pr', 'view', ...json(), '-wqenv'], name: 'q inside a group', used: 'env' },
      { args: ['api', 'user', '--jq', '$ENV'], name: 'api --jq', used: 'ENV' },
      {
        args: ['pr', 'list', ...json(), '--jq', 'import "m" as m; .'],
        name: '--jq import', used: 'import',
      },
      { args: ['pr', 'list', ...json(), '--jq', '"env"'], name: 'a string', used: 'env' },
    ])('blocks a filter using $name', ({ args, used }, { expect }) => {
      const result = plan(args);
      assertRejected(expect, result);

      expect(rejectionOf(result)).toBe(`Filter may not use ${used} for gh --jq`);
    });

    it.for([
      {
        args: ['pr', 'list', ...json(), '--jq', `.[].${faker.lorem.word()}`],
        name: 'a plain filter',
      },
      { args: ['repo', 'view', ...json(), '-q', '.env'], name: 'an .env field' },
      { args: ['api', 'user', '--jq', `.${faker.lorem.word()}`], name: 'api --jq' },
      { args: ['search', 'issues', 'env', ...json()], name: 'env as a search term' },
      // gh reads the next arg as the filter only when nothing follows q.
      { args: ['repo', 'view', ...json(), '-q.', 'env'], name: 'env after an attached filter' },
      { args: ['search', 'issues', '-Rorg/aqua', 'env'], name: 'env after a value holding q' },
      { args: ['pr', 'list', '-Squery', 'env'], name: 'env after a search holding q' },
    ])('allows $name', ({ args }, { expect }) => {
      assertRuns(expect, args);
    });
  });

  describe('environment', () => {
    /*
     * gh sends either one to any host outside github.com that a caller names
     * through -R or a URL positional.
     */
    it.for([
      { args: ['--version'], name: 'a global flag' },
      { args: ['pr', 'list'], name: 'a subcommand' },
      { args: ['api', 'user'], name: 'api' },
    ])('runs $name without the enterprise tokens', ({ args }, { expect }) => {
      const { excludedEnv } = runOf(plan(args)).options;

      expect(excludedEnv).toStrictEqual(['GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']);
    });
  });

  describe('github.localhost', () => {
    it.for([
      { args: () => ['pr', 'list', '-R', `github.localhost/${build.repoSlug()}`], name: '-R' },
      {
        args: () => ['pr', 'list', `--repo=api.github.localhost/${build.repoSlug()}`],
        name: 'a subdomain',
      },
      { args: () => ['pr', 'view', `http://github.localhost/${build.repoSlug()}/pull/1`], name: 'a URL' },
      { args: () => ['repo', 'view', `GitHub.LocalHost/${build.repoSlug()}`], name: 'any case' },
      // gh lowercases hosts with Go, which maps İ (U+0130) to a plain i.
      { args: () => ['repo', 'view', `gİthub.localhost/${build.repoSlug()}`], name: 'a dotted İ' },
    ])('blocks $name naming it', ({ args }, { expect }) => {
      const sent = args();
      const result = plan(sent);
      assertRejected(expect, result);

      expect(rejectionOf(result)).toBe(`gh may not reach github.localhost: ${sent.at(-1) ?? ''}`);
    });

    it('blocks api naming it', ({ expect }) => {
      const filter = '"github.localhost"';
      const result = plan(['api', build.prCommentsPath(), '--jq', filter]);
      assertRejected(expect, result);

      expect(rejectionOf(result)).toBe(`gh may not reach github.localhost: ${filter}`);
    });

    it('reports a disallowed subcommand first', ({ expect }) => {
      const result = plan(['auth', 'status', '--hostname', 'github.localhost']);
      assertRejected(expect, result);

      expect(rejectionOf(result)).toMatch(/^Subcommand not allowed: auth status\./v);
    });
  });

  describe('global flags', () => {
    it.for([
      ['--version'],
      ['--help'],
      ['-h'],
    ].map(args => ({ name: args[0], args })))(
      'allows standalone $name', ({ args }, { expect }) => {
        assertRuns(expect, args);
      },
    );

    it('blocks --help with extra args', ({ expect }) => {
      const result = plan(['--help', 'repo', 'delete']);
      assertRejected(expect, result);
    });

    it('blocks --version with extra args', ({ expect }) => {
      const result = plan(['--version', 'repo', 'delete']);
      assertRejected(expect, result);
    });
  });
});
