// Use the toolset supplied by the installed electron-builder version.
module.exports = async function sevenZipPath() {
  try { return require('7zip-bin').path7za; }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  return require('app-builder-lib/out/toolsets/7zip').getPath7za();
};
