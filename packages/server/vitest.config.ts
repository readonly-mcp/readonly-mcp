import { configurePackage } from '@gtbuchanan/vitest-config/configure';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(configurePackage(), defineConfig({
  test: {
    /*
     * The integration suites start a server in their beforeAll, and the npm
     * and pnpm suites install a project before that. Spawned beside every
     * other suite and the rest of a turbo build, that outlasts the default
     * hook timeout.
     */
    hookTimeout: 60_000,
  },
}));
