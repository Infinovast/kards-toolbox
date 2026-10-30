const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited with ${code}`)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  let profile = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'kards-toolbox');
  let release = path.join(root, 'release');
  let cacheOnly = false;
  let target;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--profile' && args[index + 1] && !args[index + 1].startsWith('--')) profile = path.resolve(args[++index]);
    else if (args[index] === '--output' && args[index + 1] && !args[index + 1].startsWith('--')) release = path.resolve(args[++index]);
    else if (args[index] === '--cache-only') cacheOnly = true;
    else if (args[index] === '--target' && ['dir', 'portable'].includes(args[index + 1])) target = args[++index];
    else throw new Error(`未知参数：${args[index]}`);
  }
  if (!cacheOnly && !target) throw new Error('请选择 --target dir 或 --target portable');
  const buildRoot = path.join(root, 'build');
  await fs.mkdir(buildRoot, { recursive: true });
  const work = await fs.mkdtemp(path.join(buildRoot, 'full-'));
  await fs.mkdir(release, { recursive: true });
  try {
    const dataPackage = path.join(work, 'kards-toolbox-cache.br');
    await esbuild.build({ entryPoints: [path.join(root, 'scripts/cache-bundle-reader.ts')], bundle: true, platform: 'browser', format: 'iife', globalName: 'cacheBundleReader', outfile: path.join(work, 'reader.js') });
    const env = { ...process.env, KARDS_BUNDLE_PROFILE: profile, KARDS_BUNDLE_WORK: work, KARDS_BUNDLE_OUTPUT: dataPackage };
    delete env.ELECTRON_RUN_AS_NODE;
    await run(require('electron'), [path.join(root, 'scripts/export-cache.cjs'), '--disable-crash-reporter'], { env });
    if (cacheOnly) {
      const destination = path.join(release, 'kards-toolbox-cache.br');
      await fs.copyFile(dataPackage, destination);
      console.log(`已生成 ${destination}`);
      return;
    }
    await run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build']);
    await run(process.execPath, [path.join(root, 'scripts/build-electron.cjs')]);
    await run(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--win', target === 'dir' ? '--dir' : 'portable', '--x64', '-c.win.signAndEditExecutable=false', `-c.directories.output=${path.join(work, 'app')}`]);
    const contents = target === 'dir' ? path.join(work, 'app', 'win-unpacked') : path.join(work, 'package');
    if (target === 'portable') {
      await fs.mkdir(contents);
      await fs.copyFile(path.join(work, 'app', 'kards_toolbox.exe'), path.join(contents, 'kards_toolbox.exe'));
    }
    await fs.rename(dataPackage, path.join(contents, 'kards-toolbox-cache.br'));
    const version = require('../package.json').version;
    const archive = path.join(work, `kards_toolbox-${version}-${target}-full.zip`);
    await run(require('7zip-bin').path7za, ['a', '-tzip', '-mx=9', archive, '.'], { cwd: contents });
    const destination = path.join(release, path.basename(archive));
    await fs.copyFile(archive, destination);
    console.log(`已生成 ${destination}`);
  } finally {
    // work is a freshly allocated child of this project's ignored build folder.
    if (path.dirname(work) === buildRoot) await fs.rm(work, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
