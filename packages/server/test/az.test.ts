import { describe, it } from 'vitest';
import { plan } from '#src/tools/az.js';
import * as build from '#test/builders.js';
import { runOf } from '#test/helpers.js';

describe.concurrent('az tool (unit)', () => {
  describe('allowed subcommands', () => {
    it.for([
      { args: ['devops', 'project', 'list'], name: 'devops project list' },
      { args: ['pipelines', 'list'], name: 'pipelines list' },
      {
        args: ['pipelines', 'build', 'show', '--id', build.resourceId()],
        name: 'pipelines build show',
      },
    ])('runs $name as given, through the shell runner', ({ args }, { expect }) => {
      const { args: argv, cmd, runner } = runOf(plan(args));

      expect({ argv, cmd, runner }).toStrictEqual({ argv: args, cmd: 'az', runner: 'shell' });
    });
  });

  describe('allowed devops invoke endpoints', () => {
    it.for([
      { area: 'build', resource: 'builds' },
      { area: 'build', resource: 'timeline' },
      { area: 'build', resource: 'logs' },
      { area: 'build', resource: 'changes' },
      { area: 'build', resource: 'artifacts' },
      { area: 'build', resource: 'leases' },
      { area: 'test', resource: 'runs' },
    ])('runs --area $area --resource $resource as GET', ({ area, resource }, { expect }) => {
      const args = ['devops', 'invoke', '--area', area, '--resource', resource];

      expect(runOf(plan(args)).args).toStrictEqual([...args, '--http-method', 'GET']);
    });

    it('runs with extra safe flags', ({ expect }) => {
      const args = [
        'devops', 'invoke', '--area', 'build', '--resource', 'builds',
        '--route-parameters', `buildId=${build.resourceId()}`,
        '--query-parameters', 'api-version=7.0',
        '--output', 'json',
      ];

      expect(runOf(plan(args)).args).toStrictEqual([...args, '--http-method', 'GET']);
    });

    it('runs the --area=value --resource=value form', ({ expect }) => {
      const args = ['devops', 'invoke', '--area=build', '--resource=builds'];

      expect(runOf(plan(args)).args).toStrictEqual([...args, '--http-method', 'GET']);
    });
  });
});
