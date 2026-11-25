import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { plan } from '#src/tools/acli.js';

describe.concurrent('acli tool', () => {
  describe('allowed subcommands', () => {
    it.for([
      ['jira', 'board', 'list'],
      ['jira', 'filter', 'list'],
      ['jira', 'project', 'list'],
      ['jira', 'sprint', 'list'],
      ['jira', 'workitem', 'comment', 'list'],
      ['jira', 'workitem', 'list'],
      ['jira', 'workitem', 'search'],
      ['jira', 'workitem', 'view'],
    ].map(args => ({ name: args.join(' '), args })))(
      'runs $name as given', ({ args }, { expect }) => {
        expect(plan(args)).toRun('acli', args);
      },
    );

    it('runs a subcommand with flags as given', ({ expect }) => {
      const project = faker.string.alpha({ casing: 'upper', length: 3 });
      const args = ['jira', 'workitem', 'list', '--project', project];

      expect(plan(args)).toRun('acli', args);
    });
  });
});
