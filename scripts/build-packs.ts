import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from 'dotenv';
import { buildStaticPack, buildLooseCardPack } from '../electron/packTools';
config({ quiet: true });
const root = path.resolve(import.meta.dirname, '..');
await buildStaticPack(root);
if (!process.argv.includes('--static-only')) {
  const directory = path.join(root, 'assets-private', 'cards');
  if (await fs.access(path.join(directory, 'manifest.json')).then(() => true, () => false)) await buildLooseCardPack(directory, path.join(root, 'dist-packs', 'cards.kpak'));
}
console.log('KPAK 资源包已生成');
