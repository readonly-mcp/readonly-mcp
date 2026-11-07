import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { plan } from '#src/tools/npm.js';
import * as build from '#test/builders.js';
import { rejectionOf, runOf } from '#test/helpers.js';

describe.concurrent('npm tool', () => {
  describe('allowed subcommands', () => {
    it.for(['audit', 'bin', 'explain', 'fund', 'ls', 'outdated', 'root', 'search', 'view'])(
      'runs %s through the shell runner', (sub, { expect }) => {
        const { cmd, runner } = runOf(plan([sub]));

        expect({ cmd, runner }).toStrictEqual({ cmd: 'npm', runner: 'shell' });
      },
    );
  });

  describe('--ignore-scripts injection', () => {
    it('prepends --ignore-scripts before the subcommand', ({ expect }) => {
      const name = faker.internet.domainWord();

      expect(runOf(plan(['view', name])).args).toStrictEqual(['--ignore-scripts', 'view', name]);
    });
  });

  // Each redirects registry requests by a name --registry does not prefix.
  describe('blocked registry overrides', () => {
    const scopedRegistry = `--@${faker.internet.domainWord()}:registry`;
    const configFile = build.relativeFilePath();
    const directory = build.absolutePath();
    const name = faker.internet.domainWord();
    const url = build.httpsUrl();

    it.for([
      { name: '--@scope:registry <url>', args: ['view', name, scopedRegistry, url] },
      { name: '--@scope:registry=<url>', args: ['view', name, `${scopedRegistry}=${url}`] },
      { name: '--userconfig <file>', args: ['view', name, '--userconfig', configFile] },
      { name: '--userconfig=<file>', args: ['view', name, `--userconfig=${configFile}`] },
      { name: '--globalconfig <file>', args: ['view', name, '--globalconfig', configFile] },
      // The prefix is where npm reads the project .npmrc from.
      { name: '--prefix <dir>', args: ['ls', '--prefix', directory] },
      { name: '-C <dir>', args: ['ls', '-C', directory] },
      // npm expands a group of short flags into each of them.
      { name: '-lC <dir>', args: ['ls', '-lC', directory] },
      { name: '--proxy <url>', args: ['view', name, '--proxy', url] },
      { name: '--https-proxy <url>', args: ['view', name, '--https-proxy', url] },
      // npm reads a single-dash arg as a long name unless it spells out shorthands.
      { name: '-registry=<url>', args: ['view', name, `-registry=${url}`] },
      { name: '-reg=<url>', args: ['view', name, `-reg=${url}`] },
      { name: '-userconfig <file>', args: ['view', name, '-userconfig', configFile] },
      { name: '-prefix <dir>', args: ['ls', '-prefix', directory] },
      { name: '-proxy <url>', args: ['view', name, '-proxy', url] },
    ])('blocks $name', ({ args }, { expect }) => {
      const flag = args.find(arg => arg.startsWith('-'));

      expect(rejectionOf(plan(args))).toBe(`Flag not allowed: ${flag ?? ''}`);
    });

    // A whole flag name is not an abbreviation of the blocked flag it prefixes.
    it.for([
      { name: 'ls --global (prefixes --globalconfig)', args: ['ls', '--global'] },
      { name: 'root --global (prefixes --globalconfig)', args: ['root', '--global'] },
      { name: 'ls -global (prefixes --globalconfig)', args: ['ls', '-global'] },
      { name: 'ls -g (a shorthand, not a long name)', args: ['ls', '-g'] },
    ])('runs $name', ({ args }, { expect }) => {
      expect(runOf(plan(args)).args).toStrictEqual(['--ignore-scripts', ...args]);
    });
  });
});
