const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const tools = require('./load-pack-tools.cjs');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const source = path.resolve(process.env.KARDS_BUNDLE_PROFILE || option('--profile') || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'), 'kards-toolbox'));
const loose = path.resolve(option('--loose-dir') || path.join(root, 'assets-private/cards'));
const output = path.resolve(process.env.KARDS_BUNDLE_OUTPUT || option('--output') || path.join(root, 'dist-packs/cards.kpak'));
const toLoose = args.includes('--to-loose');
const mode = toLoose ? '--to-loose' : '--to-pack';
function run(executable, argv, env) { return new Promise((resolve, reject) => {
  const child = spawn(executable, argv, { cwd: root, stdio: 'inherit', windowsHide: true, env });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`缓存导出失败 (${code})`)));
}); }
async function main() {
  if (!toLoose) {
    await tools.buildStaticPack(root);
    // Prefer explicitly selected profile exports over unrelated developer art.
    if (!option('--profile') && !process.env.KARDS_BUNDLE_PROFILE && await fs.access(path.join(loose, 'manifest.json')).then(() => true, () => false)) {
      await tools.buildLooseCardPack(loose, output); console.log(`已生成 ${output}`); return;
    }
  }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'kards-cache-export-'));
  try {
    const env = { ...process.env, KARDS_BUNDLE_PROFILE: source, KARDS_BUNDLE_WORK: work, KARDS_BUNDLE_OUTPUT: output, KARDS_BUNDLE_LOOSE: loose, KARDS_BUNDLE_MODE: mode };
    delete env.ELECTRON_RUN_AS_NODE;
    await run(require('electron'), [path.join(root, 'scripts/export-profile.cjs'), '--disable-crash-reporter'], env);
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
