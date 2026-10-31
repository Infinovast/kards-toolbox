const path = require('path');
const esbuild = require('esbuild');
const fs = require('node:fs/promises');
const tools = require('./load-pack-tools.cjs');

const rootDir = path.resolve(__dirname, '..');
const enableDeveloperOptions = process.env.KARDS_ENABLE_DEVELOPER_OPTIONS === 'true';

async function main() {
  const packFile = await tools.buildStaticPack(rootDir);
  await fs.mkdir(path.join(rootDir, 'dist-electron'), { recursive: true });
  await fs.copyFile(packFile, path.join(rootDir, 'dist-electron/static.kpak'));
  const pack = await tools.Kpak.open(packFile);
  const icon = await pack.read(tools.hashPackKey('assets/kards_logos/KardsLogoBlack_cards_new.png', tools.packSalt()));
  if (!icon) throw new Error('静态资源包缺少应用图标');
  await fs.mkdir(path.join(rootDir, 'build'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'build/app-icon.png'), icon.buffer);
  await esbuild.build({
  entryPoints: [
    path.join(rootDir, 'electron', 'main.ts'),
    path.join(rootDir, 'electron', 'preload.ts'),
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: path.join(rootDir, 'dist-electron'),
  outExtension: { '.js': '.cjs' },
  external: ['electron', 'sharp'],
  define: {
    __KARDS_ENABLE_DEVELOPER_OPTIONS__: JSON.stringify(enableDeveloperOptions),
    'process.env.KARDS_PACK_SALT': JSON.stringify(tools.packSalt()),
  },
  });
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
