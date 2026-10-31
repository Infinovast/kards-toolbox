import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CARD_BACK_CATEGORIES, CARD_BACKS, DEFAULT_HEADQUARTERS_BY_NATION, DEFAULT_TABLECLOTH, HEADQUARTERS, HEADQUARTERS_STACKS, TABLECLOTHS, USER_TABLECLOTHS, cardBackForDeck, cardBackIsAvailable, defaultCardBackForNation, defaultHeadquartersForNation, headquartersForDeck, headquartersOptions, resolveSelectedTablecloth, tableclothForHeadquarters } from './cardAssets';
import manifest from '../data/assets.json';
import { CARD_PACKS, FACTION_ASSETS, SUBCLASS_ICONS, WILDCARDS, cardFactionIcon, factionIcon, wildcardAsset } from './assetCatalog';
import { ALL_CARD_KEYWORDS } from './cardKeywords';
import { CARD_SUBTYPES } from './cardSubtypes';
import { factionLabel, typeLabel, type KardsCardRecord } from '../types/card';
import { CacheBundleInstaller } from '../../electron/cacheBundle';

const privateAssets = path.resolve('assets-private/static/assets');
const manager = new CacheBundleInstaller(path.resolve('test-results/asset-test'), '', { root: process.cwd() });
const assetBuffer = async (url: string) => { const asset = await manager.readStaticAsset(url); assert.ok(asset, `asset exists: ${url}`); return asset.buffer; };
assert.deepEqual(HEADQUARTERS_STACKS.map(stack => stack.id), ['USA', 'Soviet', 'Britain', 'Japan', 'Germany', 'Common']);
assert.ok(HEADQUARTERS_STACKS.every(stack => stack.cards.length > 0));
assert.ok(HEADQUARTERS_STACKS.find(stack => stack.id === 'Common')!.cards.every(item => item.nation === 'Blank'));
assert.equal(new Set(HEADQUARTERS_STACKS.find(stack => stack.id === 'Common')!.cards.map(item => item.groupId)).size, HEADQUARTERS_STACKS.find(stack => stack.id === 'Common')!.cards.length);
assert.equal(HEADQUARTERS.length, 50);
assert.equal(new Set(HEADQUARTERS.map(item => item.groupId)).size, 25);
assert.ok(HEADQUARTERS.every(item => item.brief || item.history));
assert.ok(HEADQUARTERS.every(item => item.englishName));
assert.ok(HEADQUARTERS.every(item => /^\/assets\/headquarters\/[A-Za-z]+_[A-Za-z_]+\.png$/.test(item.image)), 'headquarters art uses flat, English filenames');
assert.equal(HEADQUARTERS.find(item => item.groupId === 'Germany/danzig')?.englishName, 'Danzig');
assert.equal(HEADQUARTERS.find(item => item.groupId === 'Britain/alam_el_halfa')?.englishName, 'Alam el Halfa');
assert.ok(CARD_BACK_CATEGORIES.every(category => category.backs.length > 0));
assert.equal(CARD_BACKS.length, 70);
assert.ok(CARD_BACKS.every(back => /^[\w/-]+\.png$/i.test(back.file.replace(/^\/assets\//, ''))));
for (const url of [...CARD_BACKS.map(back => back.file), ...HEADQUARTERS.map(item => item.image), ...TABLECLOTHS.map(item => item.file)]) await assetBuffer(url);
const cards: KardsCardRecord[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8')).cards;
for (const cloth of TABLECLOTHS.filter(item => item.type === 'wallpaper' && item.nation)) {
  const card = cards.find(card => card.cardId === cloth.cardId);
  assert.ok(card || cloth.cardType === 'infantry', `wallpaper name has a source: ${cloth.file}`);
  assert.equal(cloth.name, `${factionLabel(cloth.nation)}：${card?.json.title?.['zh-Hans'] || typeLabel(cloth.cardType)}`);
  for (const previous of cloth.previousFiles || []) assert.equal(resolveSelectedTablecloth(previous), cloth.file);
}
assert.equal(TABLECLOTHS.find(item => item.cardId === 'escort_group')?.name, '英国：护航船队');

const germanBack = CARD_BACKS.find(back => back.nation === 'Germany' && back.scope === 'main')!;
const commonBack = CARD_BACKS.find(back => back.scope === 'common')!;
const frenchAllyBack = CARD_BACKS.find(back => back.nation === 'France' && back.scope === 'ally')!;
const anzacBack = CARD_BACKS.find(back => back.nation === 'Anzac' && back.scope === 'ally')!;
assert.equal(cardBackIsAvailable(germanBack, 'Germany', 'Soviet'), true);
assert.equal(cardBackIsAvailable(germanBack, 'USA', 'Soviet'), false);
assert.equal(cardBackIsAvailable(commonBack, 'USA', 'Soviet'), true);
assert.equal(cardBackIsAvailable(frenchAllyBack, 'USA', 'France'), true);
assert.equal(cardBackIsAvailable(frenchAllyBack, 'USA', 'Finland'), false);
assert.equal(cardBackIsAvailable(anzacBack, 'USA', 'Anzac'), true);
assert.equal(cardBackIsAvailable(anzacBack, 'USA', 'France'), false);
assert.ok(defaultCardBackForNation('Germany'));
for (const nation of ['Finland', 'France', 'Italy', 'Poland', 'Anzac']) {
  assert.equal(defaultCardBackForNation(nation.toLowerCase()), CARD_BACKS.find(back => back.nation === nation && back.isDefault)!.file);
}

const hq = headquartersOptions('USA').find(item => item.groupId === 'USA/arracourt')!;
assert.equal(headquartersForDeck(hq.groupId, 'USA')?.name, hq.name);
assert.equal(headquartersForDeck(undefined, 'USA')?.name, '瑟堡');
assert.equal(headquartersForDeck('default', 'Britain')?.name, '阿拉姆哈勒法');
assert.equal(DEFAULT_HEADQUARTERS_BY_NATION.Japan, 'Japan/truk');
assert.deepEqual(['USA', 'Soviet', 'Britain', 'Japan', 'Germany'].map(nation => defaultHeadquartersForNation(nation)?.name), ['瑟堡', '斯大林格勒', '阿拉姆哈勒法', '特鲁克', '但泽']);
assert.equal(defaultHeadquartersForNation('unknown')?.name, '地堡');
assert.equal(DEFAULT_TABLECLOTH, '/assets/tablecloths/default/wood.jpeg');
assert.equal(resolveSelectedTablecloth('', []), DEFAULT_TABLECLOTH);
assert.equal(resolveSelectedTablecloth('/assets/tablecloths/default/removed.jpeg', []), DEFAULT_TABLECLOTH);
assert.equal(resolveSelectedTablecloth('/assets/tablecloths/default/2.jpeg'), '/assets/tablecloths/default/kards.jpeg');
assert.equal(resolveSelectedTablecloth('data:image/png;base64,custom', ['data:image/png;base64,custom']), 'data:image/png;base64,custom');
assert.equal(tableclothForHeadquarters(hq.groupId), '/assets/tablecloths/headquarters/arracourt.jpg');
assert.ok(USER_TABLECLOTHS.every(item => item.type === 'default' || item.type === 'wallpaper'));
assert.equal(cardBackForDeck({ mainNation: 'USA', allyNation: 'Finland', cardBackUrl: '/assets/cardbacks/Allies/Finland/cardback-001.png' }), '/assets/cardbacks/Allies/finland.png');
assert.equal(cardBackForDeck({ mainNation: 'USA', allyNation: 'France', cardBackUrl: '/assets/cardbacks/Allies/Finland/cardback-001.png' }), defaultCardBackForNation('USA'));
const neutralBack = CARD_BACKS.find(item => item.id === 'cardback-neutral')!;
assert.equal(cardBackIsAvailable(neutralBack, 'Germany', 'Japan'), true);

for (const [nation, asset] of Object.entries(FACTION_ASSETS)) {
  assert.equal(factionIcon(nation.toLowerCase(), 'white'), asset.white || asset.icon);
  for (const type of ['fighter', 'BOMBER']) assert.equal(cardFactionIcon(nation, type), asset.air || asset.icon);
  for (const type of ['infantry', 'tank', 'artillery', 'order', 'countermeasure', undefined]) assert.equal(cardFactionIcon(nation, type), asset.icon);
}
assert.equal(cardFactionIcon('unknown', 'fighter'), FACTION_ASSETS.Neutral.icon);
assert.equal(cardFactionIcon('Germany', 'fighter'), FACTION_ASSETS.Germany.icon, 'a missing air variant uses the regular icon');
assert.equal(CARD_PACKS.length, 28);
assert.deepEqual(Object.keys(SUBCLASS_ICONS).sort(), CARD_SUBTYPES.map(item => item.id).sort());
assert.equal(SUBCLASS_ICONS['t-34'], SUBCLASS_ICONS.sherman);
assert.equal(SUBCLASS_ICONS.naval, '/assets/subclass/navy.png');
assert.equal(SUBCLASS_ICONS.spitfire, '/assets/subclass/fighter.png');
assert.equal(SUBCLASS_ICONS.commandos, '/assets/subclass/infantry.png');
assert.equal(new Set(CARD_PACKS.map(pack => pack.id)).size, CARD_PACKS.length);
assert.equal(Object.keys(WILDCARDS).length, 6);
assert.ok(Object.values(WILDCARDS).every(group => Object.keys(group).length === 4));
for (const nation of ['USA', 'Britain', 'Germany', 'Japan', 'Soviet']) {
  for (const rarity of ['Elite', 'Special', 'Limited']) assert.equal(wildcardAsset(nation.toLowerCase(), rarity), WILDCARDS[nation][rarity]);
  assert.equal(wildcardAsset(nation, 'Standard'), WILDCARDS.Common.Standard, 'ordinary rarity always uses the common wildcard');
}
for (const nation of ['France', 'Italy', 'Finland', 'Poland', 'Anzac', 'Neutral', undefined]) assert.equal(wildcardAsset(nation, 'Standard'), WILDCARDS.Common.Standard);
assert.equal(wildcardAsset('USA', 'unknown'), undefined);

// Check exact-case paths and coverage so moves/additions cannot silently leave broken URLs.
function imagePaths(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('/assets/') ? [value] : [];
  return value && typeof value === 'object' ? Object.values(value).flatMap(imagePaths) : [];
}
const catalogPaths = new Set([
  ...imagePaths(manifest), ...imagePaths(ALL_CARD_KEYWORDS), ...CARD_BACKS.map(item => item.file),
  ...HEADQUARTERS.map(item => item.image), ...TABLECLOTHS.map(item => item.file),
]);
const actualImages = new Set((existsSync(privateAssets) ? readdirSync(privateAssets, { recursive: true }) : [...catalogPaths].map(file => file.slice('/assets/'.length))).map(file => `/assets/${String(file).replaceAll('\\', '/')}`)
  .filter(file => /\.(png|jpe?g|svg|webp)$/i.test(file) && !/_(reserved|reversed)_\d+\./.test(file)));
assert.deepEqual([...catalogPaths].sort(), [...actualImages].sort(), 'all supported assets are registered exactly once per file; reserved faction variants stay unused');
for (const file of [...catalogPaths].filter(file => file.startsWith('/assets/keywords/') && file.endsWith('.png'))) {
  const { data, info } = await sharp(await assetBuffer(file)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4, `${file} retains RGBA transparency`);
  let solid = 0, antialiased = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    if (x < 3 || y < 3 || x >= info.width - 3 || y >= info.height - 3) assert.equal(alpha, 0, `${file} has no rectangular alpha matte`);
    if (alpha === 255) solid++;
    if (alpha > 0 && alpha < 255) antialiased++;
  }
  assert.ok(solid > 100 && antialiased > 0, `${file} preserves the glyph and smooth edges`);
}
console.log(`Card asset catalogue tests passed: ${catalogPaths.size} files, faction variants, moved selections, deck restrictions and headquarters`);
