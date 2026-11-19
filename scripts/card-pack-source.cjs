const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const tools = require('./load-pack-tools.cjs');

const root = path.resolve(__dirname, '..');
const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const wailsProfile = process.env.KARDS_USER_DATA_DIR || path.join(roaming, 'kards-toolbox-wails');
const electronProfile = path.join(roaming, 'kards-toolbox');

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function stageCards({ pack, profile }, destination) {
  const candidates = pack ? [{ file: pack }] : profile ? [profilePack(profile)] : [
    profilePack(wailsProfile), profilePack(electronProfile),
    { file: path.join(root, 'dist-packs', 'cards.kpak') },
    { file: path.join(root, 'assets-private', 'cards.kpak') },
  ];
  let source;
  for (const candidate of candidates) {
    if (await exists(candidate.file)) { source = candidate; break; }
  }
  if (!source) throw new Error(`找不到卡图包。通过 --cards-pack 指定文件。已检查：${candidates.map(({ file }) => file).join('、')}`);
  const inProgress = () => exists(`${source.file}.idx.bak`);
  const before = await fs.stat(source.file);
  if (await inProgress()) throw new Error('卡图包有未完成的写入。请打开原应用恢复，关闭后重试。');
  await fs.copyFile(source.file, destination);
  const after = await fs.stat(source.file);
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size || await inProgress()) {
    throw new Error('复制时卡图包发生变化。请关闭使用该卡图包的应用后重试。');
  }
  const cache = await tools.Kpak.open(destination, { writable: true });
  if (!cache.entries.size) throw new Error(`卡图包为空：${source.file}`);
  let full = 0;
  for (const [key, { meta }] of cache.entries) {
    tools.validateImageReference(meta);
    if (tools.hashPackKey(tools.cardImageIdentity(meta), tools.packSalt()) !== key) throw new Error(`卡图包包含无效条目：${source.file}`);
    await cache.read(key);
    if (meta.variant === 'full') full++;
  }
  if (source.snapshot && await exists(source.snapshot)) {
    const storage = JSON.parse(await fs.readFile(source.snapshot, 'utf8'));
    if (!storage || storage.schemaVersion !== 1) throw new Error('本地牌库文件格式无效');
    if (storage.active) {
      const { source: origin, fetchedAt, appliedAt, cards } = storage.active;
      if (!['bundled', 'official', 'kardscom', 'kardsplayer'].includes(origin) || (fetchedAt !== null && typeof fetchedAt !== 'string')) {
        throw new Error('本地牌库快照格式无效');
      }
      cache.database = { source: origin, fetchedAt, ...(typeof appliedAt === 'string' ? { appliedAt } : {}),
        cards: tools.validateCardRecords(cards, origin === 'kardscom' ? 'kardscom' : 'kardsplayer') };
    } else {
      cache.database = undefined;
    }
    // Copy the current database into the staged pack. The user profile stays read-only.
    await cache.append([]);
  }
  console.log(`使用 ${source.file}（大图 ${full} 张，缩略图 ${cache.entries.size - full} 张）`);
}

function profilePack(profile) {
  return { file: path.join(profile, 'packs', 'cards.kpak'), snapshot: path.join(profile, 'card-data.json') };
}

module.exports = { stageCards, exists };
