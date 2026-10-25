const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const enableDeveloperOptions = process.env.KARDS_ENABLE_DEVELOPER_OPTIONS === 'true';

esbuild.build({
  entryPoints: [
    path.join(rootDir, 'electron', 'main.ts'),
    path.join(rootDir, 'electron', 'preload.ts'),
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: path.join(rootDir, 'dist-electron'),
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  define: {
    __KARDS_ENABLE_DEVELOPER_OPTIONS__: JSON.stringify(enableDeveloperOptions),
  },
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
