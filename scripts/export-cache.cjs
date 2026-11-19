const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const tools = require('./load-pack-tools.cjs');
const { stageCards, exists } = require('./card-pack-source.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = flag => {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`缺少 ${flag} 的值`);
  return path.resolve(args[index + 1]);
};

async function main() {
  const toLoose = args.includes('--to-loose');
  const profile = process.env.KARDS_BUNDLE_PROFILE || option('--profile');
  const pack = option('--cards-pack');
  const loose = option('--loose-dir') || path.join(root, 'assets-private', 'cards');
  const output = process.env.KARDS_BUNDLE_OUTPUT || option('--output') || path.join(root, 'dist-packs', 'cards.kpak');
  if (pack && profile) throw new Error('请选择 --cards-pack 或 --profile 其中一项。');
  if (!toLoose && !profile && !pack && await exists(path.join(loose, 'manifest.json'))) {
    await tools.buildLooseCardPack(loose, output);
    console.log(`已生成 ${output}`);
    return;
  }
  const workRoot = await fs.realpath(os.tmpdir());
  const work = await fs.mkdtemp(path.join(workRoot, 'kards-cache-export-'));
  try {
    const staged = path.join(work, 'cards.kpak');
    await stageCards({ pack, profile }, staged);
    if (toLoose) {
      await tools.exportPackToLoose(staged, loose);
      console.log(`已导出 ${loose}`);
    } else {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.copyFile(staged, output);
      console.log(`已生成 ${output}`);
    }
  } finally {
    if (path.dirname(work) === workRoot) await fs.rm(work, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
