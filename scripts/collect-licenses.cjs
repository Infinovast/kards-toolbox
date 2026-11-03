// Keep the full notices for installed production dependencies with web bundles.
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function main() {
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const sections = [
    'KARDS Toolbox - third-party software licenses',
    'Generated from the installed production dependencies in package-lock.json.',
    'Electron/Chromium notices accompany the desktop runtime separately.',
    'See THIRD_PARTY_NOTICES_en.md for game content and native-library obligations.',
  ];
  const missing = [];
  let count = 0;
  for (const [relative, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!relative || entry.dev) continue;
    const directory = path.join(root, relative);
    let names;
    try { names = await fs.readdir(directory); }
    catch (error) {
      if (error.code === 'ENOENT' && entry.optional) continue;
      throw error;
    }
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const notices = [];
    for (const name of names.filter(name => /^(licen[cs]e|copying|notice|authors)([._-]|$)/i.test(name))) {
      const file = path.join(directory, name);
      if ((await fs.stat(file)).isFile()) notices.push(file);
    }
    // Platform-only npm packages may carry their terms in the parent project.
    const upstream = pkg.name.startsWith('@esbuild/') ? 'esbuild'
      : pkg.name.startsWith('@rollup/rollup-') ? 'rollup' : null;
    if (!notices.length && upstream) {
      const source = path.resolve(directory, '../../', upstream);
      const sourcePkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
      if (sourcePkg.version !== pkg.version) throw new Error(`License source version mismatch: ${pkg.name}`);
      notices.push(path.join(source, 'LICENSE.md'));
    }
    // Some small packages put the complete MIT text in their README.
    if (!notices.length) {
      for (const name of names.filter(name => /^readme([.]|$)/i.test(name))) {
        const file = path.join(directory, name);
        if (/Permission is hereby granted[\s\S]+THE SOFTWARE IS PROVIDED/i.test(await fs.readFile(file, 'utf8'))) notices.push(file);
      }
    }
    // Sharp's native-package README identifies its bundled libraries and terms.
    if (pkg.name.startsWith('@img/sharp-') && names.includes('README.md')) notices.push(path.join(directory, 'README.md'));
    if (!notices.length) { missing.push(`${pkg.name}@${pkg.version}`); continue; }
    sections.push(`\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\nLicense: ${pkg.license || entry.license || 'See notices'}\n`);
    for (const file of notices.sort()) {
      sections.push(`--- ${path.relative(root, file).split(path.sep).join('/')} ---\n${await fs.readFile(file, 'utf8')}`);
    }
    count++;
  }
  if (missing.length) throw new Error(`Missing dependency license texts: ${missing.join(', ')}`);
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist/THIRD_PARTY_LICENSES.txt'), sections.join('\n') + '\n');
  console.log(`Collected license notices for ${count} production dependencies.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
