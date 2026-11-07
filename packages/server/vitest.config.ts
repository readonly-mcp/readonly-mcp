import { configureGlobal, configureProject } from '@gtbuchanan/vitest-config/configure';
import { defineConfig, mergeConfig } from 'vitest/config';

/*
 * configurePackage composed from its parts, since its own options type omits
 * the `slow` and `tags` that configureGlobal reads.
 */
const configured = mergeConfig(configureGlobal({
  /*
   * A lower priority wins where a file carries both tags, so the npm and pnpm
   * suites keep slow's timeout rather than integration's. Without one, the
   * tag listed last would win.
   */
  slow: { priority: 0 },
  tags: [{
    description: 'Calls tools through an MCP server, which runs real commands',
    name: 'integration',
    priority: 1,
    // Each call spawns a real command, which outlasts the 5s default under load.
    timeout: 30_000,
  }],
}), configureProject());

export default mergeConfig(configured, defineConfig({
  test: {
    /*
     * The integration suites start a server in their beforeAll, and the npm
     * and pnpm suites install a project before that. Spawned beside every
     * other suite and the rest of a turbo build, that outlasts the default
     * hook timeout. A tag's timeout covers only the tests, not the hooks.
     */
    hookTimeout: 60_000,
  },
}));
