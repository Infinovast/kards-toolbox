// npx tsx scripts/cache-bundle-reader.ts file.kpak [--verify] [--extract directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { Kpak } from '../electron/kpak';
config({ quiet: true });
const args = process.argv.slice(2), file = args[0];
if (!file) throw new Error('用法：cache-bundle-reader.ts file.kpak [--verify] [--extract directory]');
const pack = await Kpak.open(path.resolve(file));
const extract = args.includes('--extract') ? args[args.indexOf('--extract') + 1] : undefined;
if (args.includes('--extract') && (!extract || extract.startsWith('--'))) throw new Error('缺少解包目录');
const directory = extract && path.resolve(extract);
if (directory) await fs.mkdir(directory, { recursive: true });
if (directory || args.includes('--verify')) {
  for (const [key, entry] of pack.entries) {
    const image = await pack.read(key); // Checks decoded CRC32.
    if (directory) await fs.writeFile(path.join(directory, `${key}.${entry.mime === 'image/svg+xml' ? 'svg' : entry.mime.split('/')[1]}`), image!.buffer);
  }
  if (directory) await fs.writeFile(path.join(directory, 'index.json'), JSON.stringify([...pack.entries], null, 2));
}
console.log(JSON.stringify({ file, version: 2, entries: pack.entries.size, fileBytes: pack.fileBytes, deadBytes: pack.deadBytes, verified: args.includes('--verify') || !!directory, databaseCards: pack.database?.cards.length || 0 }, null, 2));
