/*
 * Stages the publishable package in dist/source beside the compiled code: the
 * manifest without its development-only fields, plus the README and LICENSE
 * npm expects at a package root. Scripts are dropped so that publishing the
 * directory cannot run a lifecycle hook written for the source checkout.
 *
 * The source manifest's bin points into dist/source, where the compiled entry
 * lives, and its imports map the #src aliases to the .ts sources;
 * publishConfig holds both relative to the package root, mapping the aliases
 * to compiled .js. pnpm applies those overrides on publish and npm does not,
 * so they are applied here.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import packageJson from '../package.json' with { type: 'json' };

const jsonIndent = 2;
const outDir = 'dist/source';

const {
  devDependencies, packageManager, scripts,
  publishConfig: { bin, imports, ...publishConfig },
  ...manifest
} = packageJson;

writeFileSync(
  `${outDir}/package.json`,
  `${JSON.stringify({ ...manifest, bin, imports, publishConfig }, undefined, jsonIndent)}\n`,
);
for (const file of ['README.md', 'LICENSE']) copyFileSync(file, `${outDir}/${file}`);
