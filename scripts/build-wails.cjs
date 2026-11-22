const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const tools = require('./load-pack-tools.cjs');
const { stageCards, exists } = require('./card-pack-source.cjs');

const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'desktop');
const workRoot = path.join(root, 'build', 'wails');
const frontend = path.join(desktop, 'frontend', 'dist');
const exeName = 'kards_toolbox.exe';
const { version } = require('../package.json');
const localGo = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'KardsToolboxDev', 'go', 'bin', 'go.exe');
const go = process.env.KARDS_GO || (localGo && existsSync(localGo) ? localGo : 'go');
const goEnv = { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' };
const noticeFiles = [
  ['LICENSE', 'LICENSE.KARDS-Toolbox.txt'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['THIRD_PARTY_NOTICES_en.md', 'THIRD_PARTY_NOTICES_en.md'],
];

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`${path.basename(executable)} exited with ${signal || code}`)));
  });
}

function linkValue(name, value) {
  if (/[\r\n]/.test(value)) throw new Error(`${name} 不能包含换行`);
  const quote = value.includes('"') ? "'" : '"';
  if (value.includes(quote)) throw new Error(`${name} 不能同时包含单引号和双引号`);
  return `-X ${quote}main.${name}=${value}${quote}`;
}

async function collectGoNotices() {
  const { stdout } = await promisify(execFile)(go, [
    'list', '-deps', '-tags', 'production', '-f',
    '{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}|{{.Module.Version}}|{{.Module.Dir}}{{end}}{{else if .Standard}}Go standard library||{{.Root}}{{end}}',
    '.',
  ], { cwd: desktop, env: goEnv, windowsHide: true });
  const sections = [];
  for (const line of [...new Set(stdout.trim().split(/\r?\n/))].sort()) {
    if (!line) continue;
    const [name, release, directory] = line.split('|');
    const notices = (await fs.readdir(directory)).filter(file => /^(licen[cs]e|copying|notice|patents)([._-]|$)/i.test(file)).sort();
    if (!notices.length) throw new Error(`Missing Go license text: ${name}`);
    sections.push(`\n${'='.repeat(72)}\n${name} ${release}\n`);
    for (const file of notices) sections.push(`--- ${file} ---\n${await fs.readFile(path.join(directory, file), 'utf8')}`);
  }
  await fs.appendFile(path.join(frontend, 'THIRD_PARTY_LICENSES.txt'), sections.join('\n') + '\n');
}

async function build(work, executable, developer) {
  await run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', frontend]);
  await run(process.execPath, [path.join(root, 'scripts', 'collect-licenses.cjs'), frontend]);
  await Promise.all(noticeFiles.map(([source, target]) => fs.copyFile(path.join(root, source), path.join(frontend, target))));
  const bundled = path.join(desktop, 'bundled');
  await fs.mkdir(bundled, { recursive: true });
  const staticPack = await tools.buildStaticPack(root);
  await fs.copyFile(staticPack, path.join(bundled, 'static.kpak'));
  const pack = await tools.Kpak.open(staticPack);
  const icons = [];
  for (const color of ['Black', 'White']) {
    const name = `KardsLogo${color}_cards_new.png`;
    const icon = await pack.read(tools.hashPackKey(`assets/kards_logos/${name}`, tools.packSalt()));
    if (!icon) throw new Error(`静态资源包缺少应用图标：${name}`);
    const file = path.join(work, name);
    await fs.writeFile(file, icon.buffer);
    icons.push(file);
  }
  const syso = path.join(desktop, 'app_windows_amd64.syso');
  const resource = path.join(work, 'app_windows_amd64.syso');
  await run(go, ['run', './cmd/winresources', ...icons, version, resource], { cwd: desktop, env: goEnv });
  await fs.rename(resource, syso);
  await collectGoNotices();
  const ldflags = [
    '-s -w -H windowsgui',
    linkValue('buildPackSalt', tools.packSalt()),
    linkValue('buildVersion', version),
    linkValue('buildDeveloperOptions', String(developer)),
  ].join(' ');
  console.log('正在构建 Windows x64 桌面应用…');
  const tags = developer ? 'production,debug,devtools' : 'production';
  await run(go, ['build', '-trimpath', '-tags', tags, '-ldflags', ldflags, '-o', executable, '.'], { cwd: desktop, env: goEnv });
}

async function publishDirectory(output, executable) {
  const folder = path.join(output, 'win-unpacked');
  if (await exists(path.join(folder, 'resources', 'app.asar'))) {
    let legacy = path.join(output, 'win-unpacked-electron');
    for (let index = 2; await exists(legacy); index++) legacy = path.join(output, `win-unpacked-electron-${index}`);
    // Rename only the existing, resolved output folder and leave it intact.
    const target = await fs.realpath(folder);
    const parent = await fs.realpath(output);
    if (path.relative(parent, target) !== 'win-unpacked') throw new Error('发布目录必须直接位于输出目录中，且不能为链接。');
    await fs.rename(target, legacy);
    console.log(`已保留之前的 Electron 发布目录：${legacy}`);
    await fs.mkdir(folder);
    const pack = path.join(legacy, 'cards.kpak');
    if (await exists(pack)) await fs.copyFile(pack, path.join(folder, 'cards.kpak'));
  }
  await fs.mkdir(folder, { recursive: true });
  await fs.copyFile(executable, path.join(folder, exeName));
  await Promise.all([...noticeFiles.map(([, name]) => name), 'THIRD_PARTY_LICENSES.txt'].map(name =>
    fs.copyFile(path.join(frontend, name), path.join(folder, name)),
  ));
  console.log(`已生成 ${folder}`);
}

async function main() {
  if (process.platform !== 'win32') throw new Error('当前桌面构建脚本需要 Windows。');
  const [mode, ...args] = process.argv.slice(2);
  if (!['build', 'dev', 'dir', 'portable', 'zip', 'full-dir', 'full-portable', 'cache-only'].includes(mode)) {
    throw new Error(`未知构建目标：${mode}`);
  }
  const opts = { output: path.join(root, 'release'), developer: mode === 'dev' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--developer') { opts.developer = true; continue; }
    const key = ({ '--output': 'output', '--cards-pack': 'pack', '--profile': 'profile' })[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`未知参数或缺少值：${args[i]}`);
    opts[key] = path.resolve(args[++i]);
  }
  if (opts.pack && opts.profile) throw new Error('请选择 --cards-pack 或 --profile 其中一项。');

  if (mode !== 'cache-only') {
    try {
      await run(go, ['version'], { cwd: desktop, env: goEnv });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new Error(`找不到 Go（${go}）。请安装 Go 1.26.2 或更新版本并加入 PATH，或将 KARDS_GO 设为 go.exe 的绝对路径。`);
    }
  }

  await fs.mkdir(workRoot, { recursive: true });
  const resolvedRoot = await fs.realpath(workRoot);
  if (path.relative(await fs.realpath(root), resolvedRoot) !== path.join('build', 'wails')) {
    throw new Error('构建目录不能为链接。');
  }
  const work = await fs.mkdtemp(path.join(workRoot, 'stage-'));
  try {
    const executable = path.join(work, exeName);
    const full = mode.startsWith('full-');
    const cards = path.join(work, 'cards.kpak');
    if (full || mode === 'cache-only') await stageCards(opts, cards);
    if (mode !== 'cache-only') await build(work, executable, opts.developer);
    if (mode === 'dev' || mode === 'build') {
      const dest = path.join(workRoot, exeName);
      await fs.copyFile(executable, dest);
      console.log(`已生成 ${dest}`);
      if (mode === 'dev') await run(dest, []);
      return;
    }
    await fs.mkdir(opts.output, { recursive: true });
    if (mode === 'dir') await publishDirectory(opts.output, executable);
    else if (mode === 'portable' || mode === 'cache-only') {
      const artifact = mode === 'portable' ? exeName : 'cards.kpak';
      const dest = path.join(opts.output, artifact);
      await fs.copyFile(path.join(work, artifact), dest);
      console.log(`已生成 ${dest}`);
    } else {
      const name = `kards_toolbox-${version}${full ? `-${mode.slice(5)}-full` : ''}.zip`;
      const archive = path.join(work, name);
      await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), [
        '-a', '-cf', archive, '-C', work, exeName, ...(full ? ['cards.kpak'] : []),
      ]);
      const dest = path.join(opts.output, name);
      await fs.copyFile(archive, dest);
      console.log(`已生成 ${dest}`);
    }
  } finally {
    // Work is a newly created directory inside this project's build output.
    if (path.dirname(await fs.realpath(work)) === resolvedRoot) await fs.rm(work, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
