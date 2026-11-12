import { defineConfig } from 'tsup';

export default defineConfig({
  format: ['esm'],
  entry: {
    index: 'src/index.ts',
    'schema/index': 'src/schema/index.ts',
    'testing/index': 'src/testing/index.ts',
    'eslint/index': 'src/eslint/index.ts',
    'deploy/index': 'src/deploy/index.ts',
  },
  target: 'es2019',
  dts: false,
  clean: true,
  splitting: true,
  treeshake: true,
});
