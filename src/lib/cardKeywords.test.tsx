import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardText } from '../components/CardText';
import { ALL_CARD_KEYWORDS, CARD_KEYWORDS, COMBAT_KEYWORDS, cardTextKeywordMatches } from './cardKeywords';

const expectedLabels = ['伏击', '闪击', '奋战', '守护', '重甲', '冲击', '烟幕', '被守护', '战斗', '部署', '亡计', '免疫', '动员', '压制', '山地', '开发', '情报', '抑制', '控制', '撤退', '流亡', '老兵', '收缴', '被收缴', '钳击', '隐蔽', '揭示', '转换', '协力', '预报'];
assert.deepEqual(ALL_CARD_KEYWORDS.map(item => item.label), expectedLabels);
assert.equal(new Set(ALL_CARD_KEYWORDS.map(item => item.id)).size, ALL_CARD_KEYWORDS.length);
assert.ok(ALL_CARD_KEYWORDS.every(item => item.english && typeof item.attribute === 'boolean' && typeof item.highlighted === 'boolean'));
assert.equal(CARD_KEYWORDS.length, 16);
assert.deepEqual(COMBAT_KEYWORDS.map(item => item.label), expectedLabels.slice(0, 7));
assert.ok(ALL_CARD_KEYWORDS.filter(item => item.highlighted).every(item => item.attribute), 'combat keywords are a strict subset of attribute keywords');
assert.equal(ALL_CARD_KEYWORDS.find(item => item.label === '压制')?.english, 'Pin');
assert.equal(ALL_CARD_KEYWORDS.find(item => item.label === '抑制')?.english, 'Suppress');

for (const definition of ALL_CARD_KEYWORDS) {
  for (const text of [definition.label, definition.english, definition.english.toLowerCase()]) {
    const matches = [...cardTextKeywordMatches(text)];
    assert.deepEqual(matches, [{ index: 0, text, highlighted: definition.highlighted }], `${text} shares catalogue emphasis`);
  }
}
const numbered = ['重甲1', '重甲 2', '重甲3', '情报1', '情报 2', '情报3', 'Heavy Armor 1', 'Intel 2', '情报X', '重甲X'];
assert.deepEqual([...cardTextKeywordMatches(numbered.join('，'))].map(item => item.text), numbered);
assert.deepEqual([...cardTextKeywordMatches('战斗机，战斗，被守护，守护，被收缴，收缴，揭示，抉择，抽取')].map(item => item.text), ['战斗', '被守护', '守护', '被收缴', '收缴', '揭示']);
assert.deepEqual([...cardTextKeywordMatches('Guardian, mobilized, undeveloped, Guardsman, Guarded, guard')].map(item => item.text), ['Guarded', 'guard'], 'English keywords match whole words');

const markup = renderToStaticMarkup(<CardText text={'守护，被守护，重甲 3，揭示，战斗机'} />);
assert.equal(markup, '<strong class="font-bold text-kards-status">守护</strong>，<strong class="font-bold text-kards-text">被守护</strong>，<strong class="font-bold text-kards-status">重甲 3</strong>，<strong class="font-bold text-kards-text">揭示</strong>，战斗机');
assert.equal(renderToStaticMarkup(<CardText text={'没有匹配词语 & <保留文字>'} />), '没有匹配词语 &amp; &lt;保留文字&gt;');
console.log('Keyword catalogue tests passed: 30 terms, 16 attributes, 7 combat keywords, shared translations and text emphasis');
