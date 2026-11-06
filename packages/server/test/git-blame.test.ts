import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { plan } from '#src/tools/git.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

const planBlame = async (args: readonly string[]) => plan(['blame', ...args]);

describe.concurrent('git blame option allowlist (unit)', () => {
  /*
   * Each asserts the allowlist's own message: git rejects some of these
   * itself, and its error would pass for a block.
   */
  it.for([
    { flag: '--contents', name: '--contents <path>', rest: [build.absolutePath()] },
    { flag: `--contents=${build.absolutePath()}`, name: '--contents=<path>', rest: [] },
    { flag: '--cont', name: '--cont (abbreviation)', rest: [build.absolutePath()] },
    { flag: '-S', name: '-S <path>', rest: [build.absolutePath()] },
    { flag: `-S${build.absolutePath()}`, name: '-S<path>', rest: [] },
    { flag: '-wS', name: '-wS (grouped)', rest: [build.absolutePath()] },
    {
      flag: '--ignore-revs-file', name: '--ignore-revs-file <path>',
      rest: [build.absolutePath()],
    },
    {
      flag: `--ignore-revs-file=${build.absolutePath()}`, name: '--ignore-revs-file=<path>',
      rest: [],
    },
    { flag: '--stdin', name: 'a rev-list option outside the allowlist', rest: [] },
    { flag: '--porc', name: 'an abbreviation of an allowed option', rest: [] },
    { flag: '-wx', name: 'a short flag outside the allowlist, grouped', rest: [] },
    { flag: '--porcelain=1', name: 'a value on an option that takes none', rest: [] },
  ])('rejects $name', async ({ flag, rest }, { expect }) => {
    const result = await planBlame([flag, ...rest, build.fileName('md')]);

    expect(rejectionOf(result)).toBe(`Flag not allowed for git blame: ${flag}`);
  });

  /*
   * Stepping over an option's value must stop there: the option after it is
   * still checked, whether the range came as the next arg or in the group.
   */
  it.for([
    { args: ['-L', '1,2'], name: '-L <range>' },
    { args: ['-L1,2L'], name: '-L<range> ending in L' },
    { args: ['--ignore-rev', faker.git.commitSha()], name: '--ignore-rev <rev>' },
  ])('checks the option after $name', async ({ args }, { expect }) => {
    const result = await planBlame([...args, '--stdin', build.fileName('md')]);

    expect(rejectionOf(result)).toBe('Flag not allowed for git blame: --stdin');
  });

  it.for([
    { args: ['-w'], name: '-w' },
    { args: ['-ls'], name: '-ls (grouped)' },
    { args: ['-wM'], name: '-wM (grouped, optional score)' },
    { args: ['-C20'], name: '-C20 (attached score)' },
    { args: ['-L', '1,2'], name: '-L <range>' },
    { args: ['-wL1,2'], name: '-wL<range> (grouped)' },
    { args: ['-L/S/,+1'], name: '-L<range> holding an S' },
    { args: ['--porcelain'], name: '--porcelain' },
    { args: ['--no-progress'], name: '--no-progress (negated)' },
    { args: ['--diff-algorithm', faker.lorem.word()], name: '--diff-algorithm <name>' },
    { args: [`--diff-algorithm=${faker.lorem.word()}`], name: '--diff-algorithm=<name>' },
    { args: ['--abbrev=8'], name: '--abbrev=<n>' },
    { args: ['--first-parent'], name: '--first-parent' },
    { args: [`--date=${faker.lorem.word()}`], name: '--date=<format>' },
    { args: ['--encoding', faker.lorem.word()], name: '--encoding <encoding>' },
    { args: [`--since=${faker.lorem.word()}`], name: '--since=<date>' },
    { args: ['--until', faker.lorem.word()], name: '--until <date>' },
    {
      args: ['--ignore-rev', faker.git.commitSha()],
      name: '--ignore-rev <rev>, a prefix of --ignore-revs-file',
    },
    {
      args: [`--ignore-rev=${faker.git.commitSha()}`],
      name: '--ignore-rev=<rev>, a prefix of --ignore-revs-file',
    },
    { args: ['--', `-${build.fileName('md')}`], name: 'a dash-led path after --' },
  ])('passes $name to git', async ({ args }, { expect }) => {
    const file = build.fileName('md');
    const result = await planBlame([...args, file]);

    expect(runOf(result).args).toStrictEqual(['--no-pager', 'blame', ...args, file]);
  });
});
