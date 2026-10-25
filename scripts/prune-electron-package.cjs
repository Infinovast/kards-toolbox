const fs = require('node:fs/promises');
const path = require('node:path');

const OPTIONAL_RUNTIME_FILES = [
  // Keep Electron runtime DLLs intact for portable builds.
  // Portable NSIS wraps the unpacked app and can fail early if Chromium runtime
  // files are missing, even when the app itself is a simple 2D React UI.
];

exports.default = async function pruneElectronPackage(context) {
  await Promise.all(
    OPTIONAL_RUNTIME_FILES.map(async (fileName) => {
      const target = path.join(context.appOutDir, fileName);
      await fs.rm(target, { force: true });
    }),
  );
};
