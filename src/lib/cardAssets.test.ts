import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CARD_BACK_CATEGORIES, CARD_BACKS, HEADQUARTERS, HEADQUARTERS_STACK, TABLECLOTHS, USER_TABLECLOTHS, cardBackIsAvailable, defaultCardBackForNation, headquartersForDeck, headquartersOptions, tableclothForHeadquarters } from './cardAssets';

const assetPath = (url: string) => path.resolve('public', url.replace(/^\/assets\//, 'assets/'));
assert.equal(HEADQUARTERS_STACK.length, 6);
assert.equal(HEADQUARTERS.length, 50);
assert.equal(new Set(HEADQUARTERS.map(item => item.groupId)).size, 25);
assert.ok(HEADQUARTERS.every(item => item.brief || item.history));
assert.ok(CARD_BACK_CATEGORIES.every(category => category.backs.length > 0));
assert.equal(CARD_BACKS.length, 68);
assert.ok(CARD_BACKS.every(back => /^[\w/-]+\.png$/i.test(back.file.replace(/^\/assets\//, ''))));
assert.ok(CARD_BACKS.every(back => existsSync(assetPath(back.file))));
assert.ok(HEADQUARTERS.every(item => existsSync(assetPath(item.image))));
assert.ok(TABLECLOTHS.every(item => existsSync(assetPath(item.file))));

const germanBack = CARD_BACKS.find(back => back.nation === 'Germany' && back.scope === 'main')!;
const commonBack = CARD_BACKS.find(back => back.scope === 'common')!;
const frenchAllyBack = CARD_BACKS.find(back => back.nation === 'France' && back.scope === 'ally')!;
assert.equal(cardBackIsAvailable(germanBack, 'Germany', 'Soviet'), true);
assert.equal(cardBackIsAvailable(germanBack, 'USA', 'Soviet'), false);
assert.equal(cardBackIsAvailable(commonBack, 'USA', 'Soviet'), true);
assert.equal(cardBackIsAvailable(frenchAllyBack, 'USA', 'France'), true);
assert.equal(cardBackIsAvailable(frenchAllyBack, 'USA', 'Finland'), false);
assert.ok(defaultCardBackForNation('Germany'));

const hq = headquartersOptions('USA').find(item => item.groupId === 'USA/arracourt')!;
assert.equal(headquartersForDeck(hq.groupId, 'USA')?.name, hq.name);
assert.equal(tableclothForHeadquarters(hq.groupId), '/assets/tablecloths/headquarters/arracourt.jpg');
assert.ok(USER_TABLECLOTHS.every(item => item.type === 'default' || item.type === 'wallpaper'));
console.log('Card asset catalogue tests passed: filename mappings, deck restrictions, headquarters details and temporary tablecloth lookup');
