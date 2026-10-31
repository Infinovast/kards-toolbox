const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ quiet: true });
const file = path.resolve(__dirname, '../build/pack-tools.cjs');
fs.mkdirSync(path.dirname(file), { recursive: true });
require('esbuild').buildSync({ entryPoints: [path.resolve(__dirname, '../electron/packTools.ts')], outfile: file, platform: 'node', format: 'cjs', bundle: true });
module.exports = require(file);
