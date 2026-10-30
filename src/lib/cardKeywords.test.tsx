import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardText } from '../components/CardText';
import CardKeywordList from '../components/CardKeywordList';
import { ALL_CARD_KEYWORDS, CARD_KEYWORDS, COMBAT_KEYWORDS, KEYWORD_FILTER_GROUPS, cardHasKeyword, cardKeywordItems, cardTextKeywordMatches } from './cardKeywords';

const expectedLabels = ['伏击', '闪击', '奋战', '守护', '重甲', '冲击', '烟幕', '被守护', '战斗', '部署', '亡计', '免疫', '动员', '压制', '山地', '开发', '情报', '抑制', '控制', '撤退', '流亡', '老兵', '收缴', '被收缴', '钳击', '隐蔽', '揭示', '转换', '协力', '预报', '抉择', '抽取', '倒计时', '无词条', '无描述'];
assert.deepEqual(ALL_CARD_KEYWORDS.map(item => item.label).sort(), expectedLabels.sort());
assert.equal(new Set(ALL_CARD_KEYWORDS.map(item => item.id)).size, ALL_CARD_KEYWORDS.length);
assert.ok(ALL_CARD_KEYWORDS.every(item => item.english && typeof item.attribute === 'boolean' && typeof item.highlighted === 'boolean'));
assert.equal(CARD_KEYWORDS.length, 16);
assert.deepEqual(COMBAT_KEYWORDS.map(item => item.label), ['闪击', '伏击', '冲击', '守护', '重甲', '奋战', '烟幕']);
assert.deepEqual(KEYWORD_FILTER_GROUPS.map(group => group.keywords.length), [7, 8, 9]);
assert.equal(new Set(KEYWORD_FILTER_GROUPS.flatMap(group => group.keywords.map(item => item.id))).size, 24);
assert.ok(ALL_CARD_KEYWORDS.filter(item => item.highlighted).every(item => item.attribute), 'combat keywords are a strict subset of attribute keywords');
assert.equal(ALL_CARD_KEYWORDS.find(item => item.label === '压制')?.english, 'Pin');
assert.equal(ALL_CARD_KEYWORDS.find(item => item.label === '抑制')?.english, 'Suppress');
assert.equal(ALL_CARD_KEYWORDS.filter(item => item.icon).length, 18);
assert.equal(ALL_CARD_KEYWORDS.find(item => item.id === 'veteran')?.icon, '/assets/keywords/VeteranOf.png');
const iconCard = { id: 1, cardId: 'icons', importId: 'aa', json: { attributes: ['BecomesVeteran:next', 'heavyArmor2', 'VeteranOf:base', 'guard', 'guard', 'futureAbility'] } };
assert.deepEqual(cardKeywordItems(iconCard, 'zh-Hans').map(item => [item.label, item.icon]), [
  ['重甲 2', '/assets/keywords/heavyArmor.png'], ['老兵', '/assets/keywords/VeteranOf.png'], ['守护', '/assets/keywords/guard.png'], ['futureAbility', undefined],
]);
const iconMarkup = renderToStaticMarkup(<CardKeywordList card={iconCard} language="zh-Hans" />);
assert.equal((iconMarkup.match(/class="keyword-symbol"/g) || []).length, 3);
assert.ok(iconMarkup.includes('，') && !iconMarkup.includes('BecomesVeteran.png'));

for (const definition of ALL_CARD_KEYWORDS.filter(item => item.textMatch !== false)) {
  for (const text of [definition.label, definition.english, definition.english.toLowerCase()]) {
    const matches = [...cardTextKeywordMatches(text)];
    assert.deepEqual(matches, [{ index: 0, text, highlighted: definition.highlighted }], `${text} shares catalogue emphasis`);
  }
}
const numbered = ['重甲1', '重甲 2', '重甲3', '情报1', '情报 2', '情报3', 'Heavy Armor 1', 'Intel 2', '情报X', '重甲X'];
assert.deepEqual([...cardTextKeywordMatches(numbered.join('，'))].map(item => item.text), numbered);
assert.deepEqual([...cardTextKeywordMatches('战斗机，战斗，被守护，守护，被收缴，收缴，揭示，抉择，抽取')].map(item => item.text), ['战斗', '被守护', '守护', '被收缴', '收缴', '揭示', '抉择', '抽取']);
assert.deepEqual([...cardTextKeywordMatches('Guardian, mobilized, undeveloped, Guardsman, Guarded, guard')].map(item => item.text), ['Guarded', 'guard'], 'English keywords match whole words');

const markup = renderToStaticMarkup(<CardText text={'守护，被守护，重甲 3，揭示，战斗机'} highlightCombat />);
assert.equal(markup, '<strong class="font-bold text-kards-status">守护</strong>，<strong class="font-bold text-kards-text">被守护</strong>，<strong class="font-bold text-kards-status">重甲 3</strong>，<strong class="font-bold text-kards-text">揭示</strong>，战斗机');
assert.equal(renderToStaticMarkup(<CardText text={'没有匹配词语 & <保留文字>'} />), '没有匹配词语 &amp; &lt;保留文字&gt;');
assert.ok(!renderToStaticMarkup(<CardText text="守护，重甲3，部署" />).includes('text-kards-status'), 'descriptions are bold without combat color');
const record = (json: Record<string, unknown>, cardId = 'test') => ({ id: 1, cardId, importId: 'aa', json });
for (const id of ['deployment', 'destruction', 'choice', 'reveal', 'draw', 'pincer']) {
  const definition = ALL_CARD_KEYWORDS.find(item => item.id === id)!;
  for (const colon of [':', '：']) assert.ok(cardHasKeyword(record({ text: { 'zh-Hans': `${definition.label}${colon}具体内容。` } }), id));
  assert.ok(!cardHasKeyword(record({ text: { 'zh-Hans': `获得${definition.label}。` } }), id), 'a mention is not a description prefix');
}
assert.ok(cardHasKeyword(record({ attributes: ['pincer'], text: { 'zh-Hans': '钳击：伏击。' } }), 'none'), 'Pincer is an extended keyword, not a combat/independent ability');
assert.ok(!cardHasKeyword(record({ attributes: ['guard'] }), 'none'));
assert.ok(!cardHasKeyword(record({ attributes: ['BecomesVeteran:vet'] }), 'none'));
assert.ok(cardHasKeyword(record({ attributes: ['guard'], text: { 'zh-Hans': ' ' } }), 'noDescription'));
assert.ok(!cardHasKeyword(record({ text: { 'en-EN': 'Nonempty' } }), 'noDescription'));
const countdown = ALL_CARD_KEYWORDS.find(item => item.id === 'countdown')!;
assert.equal(countdown.cardIds!.length, 6);
for (const id of countdown.cardIds!) {
  assert.ok(cardHasKeyword(record({}, id), 'countdown'));
  assert.ok(!cardHasKeyword(record({ attributes: [`VeteranOf:${id}`] }, `${id}_vet`), 'countdown'));
}
console.log('Keyword catalogue and three-column filter semantics passed');
