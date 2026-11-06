import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { plan } from '#src/tools/pnpm.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

describe.concurrent('pnpm tool (unit)', () => {
  describe('allowed global flags', () => {
    it.for([
      { name: '--version', args: ['--version'] },
      { name: '--help', args: ['--help'] },
      { name: '-h', args: ['-h'] },
    ])('runs $name as given', ({ args }, { expect }) => {
      expect(runOf(plan(args)).args).toStrictEqual(args);
    });
  });

  describe('allowed subcommands', () => {
    it.for([
      { name: 'audit', args: ['audit'] },
      { name: 'bin', args: ['bin'] },
      { name: 'licenses list', args: ['licenses', 'list'] },
      { name: 'list', args: ['list'] },
      { name: 'outdated', args: ['outdated'] },
      { name: 'root', args: ['root'] },
      { name: 'search', args: ['search', 'zod'] },
      { name: 'store status', args: ['store', 'status'] },
      { name: 'why', args: ['why', 'zod'] },
    ])('runs $name as given, through the shell runner', ({ args }, { expect }) => {
      const { args: argv, cmd, runner } = runOf(plan(args));

      expect({ argv, cmd, runner }).toStrictEqual({ argv: args, cmd: 'pnpm', runner: 'shell' });
    });
  });

  // Each redirects registry requests by a name --registry does not prefix.
  describe('blocked registry overrides', () => {
    const scopedRegistry = `--@${faker.internet.domainWord()}:registry`;
    const configFile = build.relativeFilePath();
    const directory = build.absolutePath();
    const url = build.httpsUrl();

    it.for([
      { name: '--config.registry <url>', args: ['outdated', '--config.registry', url] },
      { name: '--config.registry=<url>', args: ['outdated', `--config.registry=${url}`] },
      { name: '--@scope:registry=<url>', args: ['outdated', `${scopedRegistry}=${url}`] },
      { name: '--userconfig <file>', args: ['outdated', '--userconfig', configFile] },
      { name: '--globalconfig <file>', args: ['outdated', '--globalconfig', configFile] },
      { name: '--npmrc-auth-file <file>', args: ['outdated', '--npmrc-auth-file', configFile] },
      // The directory is where pnpm reads the project .npmrc from.
      { name: '--dir <dir>', args: ['list', '--dir', directory] },
      { name: '-C <dir>', args: ['list', '-C', directory] },
      // pnpm expands a group of short flags into each of them.
      { name: '-rC <dir>', args: ['list', '-rC', directory] },
      { name: '--proxy <url>', args: ['outdated', '--proxy', url] },
      { name: '--https-proxy <url>', args: ['outdated', '--https-proxy', url] },
      // pnpm before 12 parses flags as npm does, reading -name as --name.
      { name: '-registry=<url>', args: ['outdated', `-registry=${url}`] },
      { name: '-config.registry=<url>', args: ['outdated', `-config.registry=${url}`] },
      { name: '-dir <dir>', args: ['list', '-dir', directory] },
    ])('blocks $name', ({ args }, { expect }) => {
      const flag = args.find(arg => arg.startsWith('-'));

      expect(rejectionOf(plan(args))).toBe(`Flag not allowed: ${flag ?? ''}`);
    });

    // A whole flag name is not an abbreviation of the blocked flag it prefixes.
    it.for([
      { name: 'list --global (prefixes --globalconfig)', args: ['list', '--global'] },
      { name: 'root --global (prefixes --globalconfig)', args: ['root', '--global'] },
      { name: 'list -g (a shorthand, not a long name)', args: ['list', '-g'] },
    ])('runs $name as given', ({ args }, { expect }) => {
      expect(runOf(plan(args)).args).toStrictEqual(args);
    });
  });
});
