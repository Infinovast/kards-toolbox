import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardText } from '../components/CardText';
import CardKeywordList from '../components/CardKeywordList';
import { ALL_CARD_KEYWORDS, CARD_KEYWORDS, COMBAT_KEYWORDS, KEYWORD_FILTER_GROUPS, cardHasKeyword, cardKeywordItems, cardTextKeywordMatches } from './cardKeywords';

const expectedLabels = ['伏击', '闪击', '奋战', '守护', '重甲', '冲击', '烟幕', '被守护', '战斗', '部署', '亡计', '免疫', '动员', '压制', '山地', '开发', '情报', '抑制', '控制', '撤退', '流亡', '老兵', '收缴', '被收缴', '钳击', '隐蔽', '揭示', '转换', '协力', '预报', '抉择', '抽取', '倒计时', '无词条', '无描述'];
assert.deepEqual(ALL_CARD_KEYWORDS.map(item => item.label).sort(), expectedLabels.sort());
assert.equal(new Set(ALL_CARD_KEYWORDS.map(item => item.id)).size, ALL_CARD_KEYWORDS.length);
assert.ok(ALL_CARD_KEYWORDS.every(item => item.order === undefined || Number.isInteger(item.order)), 'configured display orders are numeric; omitted orders stay hidden');
assert.ok(ALL_CARD_KEYWORDS.every(item => item.english && typeof item.attribute === 'boolean' && typeof item.highlighted === 'boolean'));
assert.equal(CARD_KEYWORDS.length, 16);
assert.deepEqual(COMBAT_KEYWORDS.map(item => item.label), ['伏击', '闪击', '奋战', '守护', '烟幕', '冲击', '重甲']);
assert.deepEqual(KEYWORD_FILTER_GROUPS.map(group => group.id), ['combat', 'independent', 'extended', 'special']);
assert.deepEqual(KEYWORD_FILTER_GROUPS.map(group => group.keywords.length), [7, 8, 7, 13]);
assert.equal(new Set(KEYWORD_FILTER_GROUPS.flatMap(group => group.keywords.map(item => item.id))).size, ALL_CARD_KEYWORDS.length);
assert.ok(ALL_CARD_KEYWORDS.filter(item => item.highlighted).every(item => item.attribute), 'combat keywords are a strict subset of attribute keywords');
assert.equal(ALL_CARD_KEYWORDS.find(item => item.label === '压制')?.english, 'Pin');
assert.equal(ALL_CARD_KEYWORDS.find(item => item.label === '抑制')?.english, 'Suppress');
assert.equal(ALL_CARD_KEYWORDS.filter(item => item.icon).length, 20);
assert.equal(ALL_CARD_KEYWORDS.find(item => item.id === 'veteran')?.icon, '/assets/keywords/veteran.png');
const iconCard = { id: 1, cardId: 'icons', importId: 'aa', json: { attributes: ['BecomesVeteran:next', 'heavyArmor2', 'VeteranOf:base', 'guard', 'guard', 'futureAbility'] } };
assert.deepEqual(cardKeywordItems(iconCard, 'zh-Hans').map(item => [item.label, item.icon]), [
  ['老兵', '/assets/keywords/veteran.png'], ['守护', '/assets/keywords/guard.png'], ['重甲 2', '/assets/keywords/heavyArmor.png'],
]);
assert.deepEqual(cardKeywordItems({ ...iconCard, json: { attributes: ['futureAbility', 'VeteranOf:base', 'heavyArmor2', 'guard', 'futureAbility', 'anotherAbility'] } }, 'en-EN').map(item => item.label),
  ['Veteran', 'Guard', 'Heavy Armor 2'], 'order is language-independent; keywords without a configured order stay hidden');
const guard = ALL_CARD_KEYWORDS.find(item => item.id === 'guard')!;
const originalOrder = guard.order;
try {
  guard.order = -1;
  assert.deepEqual(cardKeywordItems({ ...iconCard, json: { attributes: ['blitz', 'guard'] } }, 'zh-Hans').map(item => item.label), ['守护', '闪击'], 'display follows the numeric field rather than manifest or attribute positions');
  guard.order = undefined;
  assert.deepEqual(cardKeywordItems({ ...iconCard, json: { attributes: ['blitz', 'guard'] } }, 'zh-Hans').map(item => item.label), ['闪击'], 'removing an order hides the keyword without changing source attributes');
} finally { guard.order = originalOrder; }
assert.deepEqual(iconCard.json.attributes, ['BecomesVeteran:next', 'heavyArmor2', 'VeteranOf:base', 'guard', 'guard', 'futureAbility'], 'sorting does not mutate card attributes');
const iconMarkup = renderToStaticMarkup(<CardKeywordList card={iconCard} language="zh-Hans" />);
assert.equal((iconMarkup.match(/class="keyword-symbol"/g) || []).length, 3);
assert.ok(iconMarkup.includes('，') && !iconMarkup.includes('BecomesVeteran.png'));
assert.ok(iconMarkup.indexOf('>老兵</strong>') < iconMarkup.indexOf('>守护</strong>') && iconMarkup.indexOf('>守护</strong>') < iconMarkup.indexOf('>重甲 2</strong>'), 'rendered details use the configured order');

for (const definition of ALL_CARD_KEYWORDS.filter(item => item.textMatch !== false)) {
  for (const label of [definition.label, definition.english, definition.english.toLowerCase(), ...(definition.textAliases || [])]) {
    const text = definition.descriptionPrefix ? `${label}:` : label;
    const matches = [...cardTextKeywordMatches(text)];
    assert.deepEqual(matches, [{ index: 0, text, highlighted: definition.highlighted }], `${text} shares catalogue emphasis`);
    if (definition.descriptionPrefix) assert.deepEqual([...cardTextKeywordMatches(label)], [], `${label} alone is not a description prefix`);
  }
}
const numbered = ['重甲1', '重甲 2', '重甲3', '情报1', '情报 2', '情报3', 'Heavy Armor 1', 'Intel 2', '情报X', '重甲X'];
assert.deepEqual([...cardTextKeywordMatches(numbered.join('，'))].map(item => item.text), numbered);
assert.deepEqual([...cardTextKeywordMatches('战斗机，战斗，被守护，守护，被收缴，收缴，揭示，抉择，抽取')].map(item => item.text), ['战斗', '被守护', '守护', '被收缴', '收缴']);
assert.deepEqual([...cardTextKeywordMatches('Guardian, mobilized, undeveloped, Guardsman, Guarded, guard')].map(item => item.text), ['Guarded', 'guard'], 'English keywords match whole words');

const markup = renderToStaticMarkup(<CardText text={'守护，被守护，重甲 3，揭示，战斗机'} highlightCombat />);
assert.equal(markup, '<strong class="font-bold text-kards-status">守护</strong>，<strong class="font-bold text-kards-text">被守护</strong>，<strong class="font-bold text-kards-status">重甲 3</strong>，揭示，战斗机');
assert.equal(renderToStaticMarkup(<CardText text={'没有匹配词语 & <保留文字>'} />), '没有匹配词语 &amp; &lt;保留文字&gt;');
assert.ok(!renderToStaticMarkup(<CardText text="守护，重甲3，部署" />).includes('text-kards-status'), 'descriptions are bold without combat color');
const record = (json: Record<string, unknown>, cardId = 'test') => ({ id: 1, cardId, importId: 'aa', json });
assert.deepEqual([...cardTextKeywordMatches('或先行动。抉择：抽 1 张牌，或获得 2K。')].map(match => match.text), ['抉择：', '或']);
assert.deepEqual([...cardTextKeywordMatches('Choose: Draw a card OR gain 2K. Show when drawn: Deal damage.')].map(match => match.text), ['Choose:', 'OR', 'Show when drawn:']);
assert.deepEqual([...cardTextKeywordMatches('抽取或部署，draw or reveal')], [], 'conjunctions outside a choice remain plain');
assert.ok(cardHasKeyword(record({ text: { 'en-EN': 'Show when drawn: draw a card.' } }), 'draw'));
assert.equal(renderToStaticMarkup(<CardKeywordList card={record({ attributes: ['pincer'] })} language="zh-Hans" />), '', 'known keywords without an order stay hidden in details');
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
assert.ok(cardHasKeyword(record({ text: { 'zh-Hans': '压制一个单位。' } }), 'pin'));
assert.ok(cardHasKeyword(record({ description: { 'en-EN': 'PIN an enemy unit.' } }), 'pin'));
assert.ok(!cardHasKeyword(record({ text: { 'en-EN': 'Pincer: draw a card.' } }), 'pin'), 'special English keywords match whole words');
assert.ok(cardHasKeyword(record({ text: { 'zh-Hans': '战斗后抽一张牌。' } }), 'combat'));
assert.ok(!cardHasKeyword(record({ text: { 'zh-Hans': '获得一张战斗机。' } }), 'combat'), 'special filters honor excluded suffixes');
for (const field of ['text', 'description']) {
  assert.ok(cardHasKeyword(record({ [field]: { 'zh-Hans': '部署：控制 1 个敌方单位。' } }), 'control'));
  for (const text of ['你控制的单位获得 +1 攻击力。', '控制前线时抽一张牌。', '控制 2 个敌方单位。', 'Control a unit.']) {
    assert.ok(!cardHasKeyword(record({ [field]: { 'zh-Hans': text } }), 'control'), 'Control requires the exact phrase 控制 1 个');
  }
}
console.log('Keyword catalogue and four-column filter semantics passed');
