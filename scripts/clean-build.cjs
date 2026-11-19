const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const outputs = ['dist', 'build/wails', 'desktop/bundled/static.kpak', 'desktop/frontend/dist', 'desktop/app_windows_amd64.syso'];

for (const output of outputs) {
  const target = path.join(root, output);
  let resolved;
  try { resolved = fs.realpathSync(target); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (resolved.toLowerCase() !== target.toLowerCase()) throw new Error(`构建目录不能为链接：${output}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}
