import scoringData from '../data/deckAnalysis.json';
import subtypeData from '../data/cardSubtypes.json';
import type { KardsCardRecord } from '../types/card';

type Role = 'board' | 'fast' | 'interaction' | 'supply' | 'defense' | 'offense' | 'tempo';
interface Evidence {
  role: Role; points: number; conditional?: boolean; requires?: string[];
  responses?: string[];
  target?: string;
  conditions?: string[];
  activation?: Pick<Evidence, 'event' | 'context' | 'trigger' | 'conditions' | 'requires'>;
  veteranEvent?: string;
  zone?: 'deck' | 'hand' | 'board';
  context?: string; event?: string; scale?: string; factor?: number; choice?: number; option?: number;
  trigger?: string;
  mechanic?: 'defense-damage' | 'attack-operation-swap' | 'ignore-hq' | 'retrigger-death' | 'retrigger-deployment' | 'reset-stats' | 'random-transform' | 'next-copy' | 'mass-copy';
  transform?: { self: boolean; sameCost: boolean; enemy?: boolean };
  cost?: 'discard' | 'sacrifice' | 'self-damage' | 'end-turn';
  economy?: { kind: 'slots' | 'temporary' | 'discount' | 'set-cost'; amount: number; scope: string[]; self?: boolean; enemy?: boolean; all?: boolean };
}
interface Support { tag: string; conditional?: boolean; chance?: number }
export interface CardAbilities {
  roles: Evidence[]; provides: Support[]; cannotAttack: boolean;
  minimumKredits: number;
  cannotAttackHQ: boolean; hqAttackDelay: boolean;
  /** Explicit approximations remain separate from genuinely unsupported text. */
  assumptions: string[];
  /** Developer audit only. A match is evidence, not a claim that the full effect is simulated. */
  unmodeled: string[];
}
interface Profile {
  id: string; copies: number; cost: number; unit: boolean; guard: boolean; defense: number;
  pressure: number; roles: Evidence[]; provides: Support[];
  attack: number; operation: number; canOperate: boolean;
}

// A shared, finite neutral scenario, not a match simulator or a win-rate model.
// Opening: first 5 cards. Main observation: first 9 cards.
// Kredit budgets are soft efficiency weights, not hard deadlines for late-game cards.
// A deployed engine is active for 1.5 turns; neither guaranteed survival nor perfect combos.
export const DECK_ABILITY_MODEL = 'kards-capacity-4';
export const DECK_ABILITY_SCENARIO = Object.freeze({ seen: 9, budget: 6, activeTurns: 1.5, enemyUnits: 2, enemyHand: 4, hand: 3, remaining: 30,
  enemyTypes: Object.freeze({ infantry: 0.35, tank: 0.25, artillery: 0.1, fighter: 0.15, bomber: 0.15 }),
});
const SCENARIO = DECK_ABILITY_SCENARIO;
// Reference bands are descriptive sample data; no reference value enters a score formula.
export const DECK_ABILITY_REFERENCE = scoringData.reference;
export type DeckAbility = typeof DECK_ABILITY_REFERENCE.axes[number] & { score: number };
export interface DeckAbilityResult { status: 'ready' | 'incomplete' | 'unsupported'; axes: DeckAbility[] }
const normalizeText = (text: string) => text.normalize('NFKC').replace(/\\r\\n|\\n|\\r/g, '').replace(/\s+/gu, '');
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const capacity = (value: number, anchor: number) => Math.max(0, value) / (Math.max(0, value) + anchor);
const affordable = (p: Profile, budget: number) => Math.min(1, budget / Math.max(1, p.cost));

function enemyTargetChance(text: string, area: boolean) {
  const types = SCENARIO.enemyTypes;
  const shares: [RegExp, number][] = [[/步兵|infantry/, types.infantry], [/坦克|tank/, types.tank], [/炮兵|artillery/, types.artillery],
    [/战斗机|fighter/, types.fighter], [/轰炸机|bomber/, types.bomber]];
  let share = /空军|airunit/.test(text) ? types.fighter + types.bomber : /陆军|groundunit/.test(text) ? types.infantry + types.tank + types.artillery
    : shares.filter(([pattern]) => pattern.test(text)).reduce((n, [, value]) => n + value, 0) || 1;
  if (/非坦克|nontank/.test(text)) share = 1 - types.tank;
  const limit = /(攻击力|防御力|花费)(不大于|不小于|小于|大于|为)(\d+)/.exec(text);
  if (limit) {
    const threshold = Number(limit[3]);
    share *= [1, 3, 5].filter(n => limit[2] === '不大于' ? n <= threshold : limit[2] === '不小于' ? n >= threshold
      : limit[2] === '小于' ? n < threshold : limit[2] === '大于' ? n > threshold : n === threshold).length / 3;
  }
  if (/未受伤|undamaged/.test(text)) share *= 0.65;
  else if (/受伤|damaged/.test(text)) share *= 0.35;
  if (/被压制|pinned/.test(text)) share *= 0.25;
  if (/没有对战词条/.test(text)) share *= 0.4;
  if (/前线|frontline/.test(text)) share *= 0.5;
  return area ? clamp(share) : 1 - (1 - clamp(share)) ** SCENARIO.enemyUnits;
}

function conditionKind(text: string) {
  const value = text.replace(/^NOT:/, '');
  if (/如此做|若可能|^可能$/.test(value)) return 'performed';
  if (/构筑之外/.test(value)) return 'outside-deck';
  if (/先手|后手/.test(value)) return 'turn-order';
  if (/^在场上$|^在手中$/.test(value)) return 'zone';
  if (/部署过单位|攻击过|没有攻击|没有被攻击|没有部署单位|唯一部署的单位|消灭过敌方|第[二2]张指令/.test(value)) return 'history';
  if (/盟国/.test(value)) return 'ally';
  if (/卡组顶.*(?:海军|naval|navy)/.test(value)) return 'top-naval';
  if (/从手中最|最左侧|最右侧/.test(value)) return 'position';
  if (/第一张|第1张|第一个|第1个|首次/.test(value)) return 'first';
  if (/前线|支援阵线|相邻单位|敌方空军|友方.*单位数|敌方单位数|唯一友方单位|没有敌方单位|本单位复制数/.test(value)) return 'board';
  if (/攻击力|防御力|总部/.test(value)) return 'stats';
  if (/被消灭|将其消灭|存活/.test(value)) return 'combat-result';
  if (/使用过指令|使用过.*(?:晴天|降雨|风暴|天气)|两者都有/.test(value)) return 'played';
  if (/海军|坦克|步兵|炮兵|空军|单位|老兵|谢尔曼|闪击|守护|烟幕|伏击|冲击|协力|隐蔽|山地|流亡|收缴|动员|突击队|词条|card:|sherman/.test(value)
      || /^(?:(?:有|没有)?友方|是友方|是敌方)$/.test(value) || NATIONS.some(([pattern]) => pattern.test(value))) return 'keyword';
  if (/敌方回合|友方回合|卡组中的回合数/.test(value)) return 'time';
  if (/伤害|受伤|被压制|明牌|情报/.test(value)) return 'state';
  if (/手牌|手中|指挥点|花费/.test(value)) return 'resources';
  if (/返回卡组/.test(value)) return 'return';
  return undefined;
}

const FRIENDLY = /^(?:所有|其他|\d+个)?(?:友方|本单位|自己)|^(?:1|target|all)?(?:friendly|your|thisunit|own)/;
const UNIT = /单位|陆军|空军|步兵|坦克|炮兵|目标|unit|infantry|tank|artillery|air|ground|target|^其$|^it$/;
const AREA = /所有|全部|相邻|每个|all|each|adjacent/;
const GROUPS: [RegExp, string][] = [
  [/步兵|infantry/, 'infantry'], [/坦克|tank/, 'tank'], [/炮兵|artillery/, 'artillery'],
  [/战斗机|fighter/, 'fighter'], [/轰炸机|bomber/, 'bomber'], [/空军|airunit/, 'air'], [/陆军|groundunit/, 'land'],
  [/单位|unit/, 'unit'], [/指令|order/, 'order'], [/反制|countermeasure/, 'countermeasure'],
  [/山地|alpine/, 'alpine'], [/情报|intel/, 'intel'], [/天气|晴天|降雨|风暴|weather|sunny|rain|storm|forecast/, 'weather'],
  [/守护|guard/, 'guard'], [/动员|mobiliz/, 'mobilize'], [/协力|bond/, 'bond'],
  [/海军|naval|navy/, 'naval'], [/喷火|spitfire/, 'spitfire'], [/突击队|commando/, 'commandos'],
  [/流亡|exile/, 'exile'], [/隐蔽|covert/, 'covert'], [/收缴|salvag/, 'salvage'],
  [/谢尔曼|sherman/, 'sherman'],
];
const NATIONS: [RegExp, string][] = [[/德国|german/, 'germany'], [/英国|british/, 'britain'], [/苏联|soviet/, 'soviet'],
  [/美国|american|\bus\b/i, 'usa'], [/日本|japanese/, 'japan'], [/法国|french/, 'france'], [/波兰|polish/, 'poland'],
  [/芬兰|finnish/, 'finland'], [/澳新|anzac/, 'anzac'], [/意大利|italian/, 'italy'], [/中立|neutral/, 'neutral']];

function effectText(text: string) {
  const numbers: Record<string, string> = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8' };
  return normalizeText(text.replace(/\\r\\n|\\n|\\r|\r?\n/g, '。').replace(/\\+"/g, '"')
    .replace(/\b(a|an|one|two|three|four|five|six|seven|eight)\b/gi, word => numbers[word.toLowerCase()])).toLowerCase();
}

/** Protect outer quotes, retaining nested ability/name quotes for the recursive reader. */
function quotedText(text: string, names: string[]) {
  const pairs: Record<string, string> = { '“': '”', '‘': '’', '「': '」', '『': '』', '"': '"' };
  let result = '', start = -1;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (stack.length && ch === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) { names.push(text.slice(start + 1, i)); result += '@' + (names.length - 1) + '@'; start = -1; }
    } else if (pairs[ch]) { if (!stack.length) start = i; stack.push(pairs[ch]); }
    else if (!stack.length && !/[”’」』]/.test(ch)) result += ch;
  }
  // Malformed catalogue punctuation must not swallow the remainder of the effect.
  if (start >= 0) result += text.slice(start + 1).replace(/[“”‘’「」『』"]/g, '');
  return result;
}

function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

/** One reader for every card, including renamed, newly downloaded and changed cards. No ID whitelist. */
export function createCardAbilityReader(cards: Iterable<KardsCardRecord>) {
  const catalogue = [...cards], byId = new Map(catalogue.map(card => [card.cardId, card]));
  const titles = new Map<string, string>();
  for (const card of [...catalogue].sort((a, b) => a.cardId.localeCompare(b.cardId))) for (const language of ['zh-Hans', 'en-EN']) {
    const title = card.json.title?.[language];
    if (title && (!titles.has(effectText(title)) || !card.json.attributes?.some(a => a.startsWith('VeteranOf:')))) titles.set(effectText(title), card.cardId);
  }
  const cache = new Map<string, CardAbilities>();
  return function read(card: KardsCardRecord, nested = false, path: string[] = []): CardAbilities {
    const d = card.json, unit = !['order', 'countermeasure'].includes(d.type?.toLowerCase() || '');
    const raw = d.text?.['zh-Hans'] || d.description?.['zh-Hans'] || d.text?.['en-EN'] || d.description?.['en-EN'] || '';
    const roles: Evidence[] = [], provides: Support[] = [], unmodeled: string[] = [], names: string[] = [], assumptions: string[] = [];
    const cacheKey = JSON.stringify([d, nested]);
    if (!path.length && cache.has(cacheKey)) return structuredClone(cache.get(cacheKey)!);
    if (path.length >= 3 || path.includes(effectText(raw))) return { roles, provides, cannotAttack: false, cannotAttackHQ: false,
      hqAttackDelay: false, minimumKredits: 0, unmodeled, assumptions: ['生成/授予/自复制链在三层或重复效果处截断'] };
    // Quoted names are retained for tutors; quoted abilities are never read as immediate effects.
    const value = quotedText(effectText(raw), names)
      .replace(/(\d),(?=\d)/g, '$1、')
      .replace(/(步兵|坦克|炮兵|战斗机|轰炸机),(?=步兵|坦克|炮兵|战斗机|轰炸机)/g, '$1、')
      .replace(/(?:使)?手(?:中|牌),(?=卡组和场上)/g, '使手牌和');
    const namedIds = (name: string | undefined): string[] => {
      if (!name) return [];
      const exact = titles.get(name);
      if (exact) return [exact];
      // Catalogue relationships can resolve a one-character translation typo,
      // but an unrelated card with a similar name cannot override current text.
      const related = (d.can_create || []).map(id => byId.get(id)).filter((c): c is KardsCardRecord => !!c);
      const close = related.filter(c => Object.values(c.json.title || {}).some(title => oneEditApart(effectText(title), name)));
      if (close.length === 1) return [close[0].cardId];
      // A printed model family such as D3A includes its numbered variants.
      const model = /^([a-z]+\d+[a-z]+)([^a-z\d].*)$/.exec(name);
      if (!model) return [];
      const suffix = model[2].replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
      const family = new RegExp('^' + model[1] + '\\d+' + suffix + '$');
      return [...new Set([...titles].filter(([title]) => family.test(title)).map(([, id]) => id))];
    };
    const namedId = (name: string | undefined) => { const ids = namedIds(name); return ids.length === 1 ? ids[0] : undefined; };
    const requirements = (text: string): string[] => {
      const named = [...text.matchAll(/@(\d+)@/g)].map(m => namedIds(names[Number(m[1])]))
        .filter(ids => ids.length).map(ids => ids.length === 1 ? 'card:' + ids[0] : 'any:' + ids.map(id => 'card:' + id).join('|'));
      if (named.length) return named.length === 1 ? named : /或|or/.test(text)
        ? ['any:' + named.flatMap(tag => tag.startsWith('any:') ? tag.slice(4).split('|') : [tag]).join('|')] : named;
      // An OR group must not be treated as an AND requirement.
      const group = /步兵或坦克|坦克或步兵|infantryortank|tankorinfantry/.test(text) ? 'infantry-or-tank'
        : [...GROUPS.slice(12), ...GROUPS.slice(0, 12)].find(([pattern]) => pattern.test(text))?.[1];
      const nation = !/非|non-/.test(text) && NATIONS.find(([pattern]) => pattern.test(text))?.[1];
      const special = /花费不大于[23]|低费/.test(text) ? 'low-cost-unit' : /攻击力不小于4/.test(text) ? 'high-attack-' + (group === 'tank' ? 'tank' : 'unit') : group;
      return special ? [nation && ['unit', 'infantry', 'tank', 'artillery', 'fighter', 'bomber', 'air', 'land'].includes(special) ? special + ':' + nation : special]
        : nation ? ['nation:' + nation] : [];
    };
    const cannotAttack = /(?:^|[。:：])(?:本单位)?(?:无法|不能)攻击(?!敌方总部)|^(?:thisunit)?(?:cannot|can't)attack(?!theenemyhq)/.test(value);
    const cannotAttackHQ = /^(?:本单位)?无法攻击敌方总部[。.]|^(?:thisunit)?cannotattacktheenemyhq[。.]/.test(value);
    const hqAttackDelay = /(?:部署|deployment)[:：].*?(?:本回合.*无法攻击敌方总部|cannotattacktheenemyhqthisturn)/.test(value);
    let mode = d.type?.toLowerCase() === 'countermeasure', event = mode ? 'counter' : unit ? 'passive' : 'deployment', choice = 0;
    let upgradeActivation: Evidence['activation'];
    let previousSentenceStart = 0;
    let priorTarget = '单位', previousZone = 'self';
    const localBoard = new Set<string>(), localHand = new Set<string>();
    for (let sentence of value.split(/[。.;；]/).filter(Boolean)) {
      let heading: RegExpExecArray | null;
      let hasHeading = false;
      while ((heading = /^(部署|亡计|揭示|钳击|抽取|抉择|deployment|destruction|reveal|pincer|chooseone|showwhendrawn)[:：]/.exec(sentence))) {
        hasHeading = true;
        mode = !/部署|deployment/.test(heading[1]) || d.type?.toLowerCase() === 'countermeasure';
        event = /亡计|destruction/.test(heading[1]) ? 'death' : /抉择|chooseone/.test(heading[1]) ? 'choice'
          : /钳击|pincer/.test(heading[1]) ? 'pincer' : /抽取|showwhendrawn/.test(heading[1]) ? 'drawn'
          : /揭示|reveal/.test(heading[1]) ? 'reveal' : mode ? 'counter' : 'deployment';
        if (event === 'choice') choice++;
        sentence = sentence.slice(heading[0].length);
      }
      const conditional = mode || /若|如果|时|后|每|抉择|when|if|after|before|nextturn|foreach|chooseone/.test(sentence);
      const trigger = /^(.*?(?:时|后))[，,:：]|^((?:每次|每当|[^，,]*每(?:抽|弃|使用|部署))[^，,]*)[，,]|^(when[^,]+|atthe(?:start|end)[^,]+|onceperturn[^,]*)[,：:]/.exec(sentence);
      const context = trigger?.[0] || '';
      if (context && !hasHeading && unit) event = 'passive';
      const required = context && !/敌方|enemy/.test(context) && /使用|部署|加入|play|deploy|youcontrol|相邻|adjacent/.test(context)
        ? requirements(context) : [];
      const wholeDiscard = /弃掉(?:全部|所有)手牌|discardyourhand|shuffle(?:all)?yourhand|将所有手牌洗入/.test(value);
      const destroyedFriend = /消灭\d+个友方|destroy1friendly/.test(value);
      if (/单位|陆军|空军|步兵|坦克|炮兵|unit/.test(context) && !/本单位|thisunit/.test(context)) {
        priorTarget = /敌方|enemy/.test(context) ? '敌方单位' : /友方|friendly/.test(context) ? '友方单位' : '单位';
      }
      const effects = (trigger ? sentence.slice(context.length) : sentence)
        .replace(/(?:或|or)(?=抽|将|使|获得|对|造成|压制|抑制|消灭|开发|draw|give|add|deal|destroy|pin|develop)/g, ',OPTION,')
        .split(/[，,]|(?:并|然后|且)(?=抽|将|使|获得|对|造成|压制|抑制|消灭|开发)|and(?=draw|give|add|deal|destroy|pin|develop)/);
      let selection = false;
      let option = 0;
      let conditions: string[] = [];
      const sentenceStart = roles.length;
      for (let effect of effects) {
        if (!effect) continue;
        if (effect === 'OPTION') { option++; continue; }
        const condition = /^(?:(?:然后|此前)?(?:若|如果)|if)(.+)/.exec(effect);
        if (condition) {
          let predicate = condition[1].replace(/@(\d+)@/g, (_, i) => namedIds(names[Number(i)]).map(id => 'card:' + id).join('|') || names[Number(i)]);
          if (/^没有$/.test(predicate)) predicate += '友方' + (requirements(priorTarget)[0] || '单位');
          if (conditionKind(predicate) === 'zone') conditions = conditions.filter(c => conditionKind(c) !== 'zone');
          if (/^是(?:友方|敌方)$/.test(predicate)) conditions = conditions.filter(c => !/^是(?:友方|敌方)$/.test(c));
          conditions.push(predicate);
          if (!conditionKind(predicate)) unmodeled.push('未建模条件：' + predicate);
          else assumptions.push('条件兑现按卡组支撑与有限中性场景估算');
          continue;
        }
        if (/^(?:否则|otherwise)/.test(effect)) {
          if (conditions.length) conditions = [...conditions.slice(0, -1), 'NOT:' + conditions[conditions.length - 1]];
          effect = effect.replace(/^(?:否则|otherwise)/, '');
          if (!effect) continue;
        }
        // Remove the condition, not the action inside that condition (e.g. an enemy's draw).
        if (/^(?:when|unless|直到|until)|^(?:本回合|可影响隐蔽单位)$/.test(effect)) continue;
        if (/^(?:指向|指定|target).*(?:单位|坦克|步兵|空军|目标|unit|tank|infantry)$/.test(effect)) { priorTarget = effect; continue; }
        const replacing = /^(?:改为|instead)/.test(effect);
        const effectStart = roles.length;
        effect = effect.replace(/(?:if|when|unless|after).*$/, '').replace(/^(?:改为|instead)/, '')
          .replace(/^(?:(?:然后|并|再|额外|随机|本回合|友方|then|and|also|randomly|you))+(?=抽|对|造成|将|使|获得|消灭|压制|抑制|开发|draw|deal|add|give|gain|destroy|pin|suppress|develop)/, '');
        const add = (role: Role, points: number, extra: Partial<Evidence> = {}) => {
          const local = /手牌|手中|hand/.test(effect) || extra.zone === 'hand' ? localHand : localBoard;
          const selfTarget = unit && ['offense', 'defense', 'fast'].includes(role) && /使(?:所有)?友方|使1个友方/.test(effect) && !/其他|other/.test(effect);
          const selfTags = [d.type?.toLowerCase(), 'unit', 'unit:' + d.faction?.toLowerCase()];
          const needs = (extra.requires || required).filter(tag => extra.zone === 'deck' || !local.has(tag) && !(selfTarget && selfTags.includes(tag)));
          const target = extra.target || (role === 'interaction' && points > 0 && !extra.responses?.includes('control') && /单位|陆军|空军|坦克|步兵|炮兵|战斗机|轰炸机|unit|tank|infantry/.test(effect) ? effect : undefined);
          if (points !== 0) roles.push({ role, points, conditional, event, context: sentence, trigger: context,
            ...(event === 'choice' ? { choice, option } : {}), ...(conditions.length ? { conditions: [...conditions] } : {}),
            ...extra, ...(target ? { target } : {}), ...(needs.length ? { requires: needs } : { requires: undefined }) });
        };
        let matched = false;
        const draw = /^(?:抽(?:取)?(?:(\d+)张)?|draw(\d+)?)(.*)/.exec(effect);
        const generated = !/加入敌方手|to(?:the)?enemyhand/.test(effect)
          && /^(?:将|随机将|分别随机将|选择|从).*?加入.*?(?:友方)?手(?:中|牌)|^(?:add|put).*?(?:to|into)(?:your)?hand/.exec(effect);
        const develop = /^(?:开发|从.*开发|develop)/.test(effect) && !/加入卡组|toyourdeck/.test(sentence);
        if (draw || generated || develop) {
          matched = true;
          const namedAmounts = [...effect.matchAll(/(\d+)张@\d+@/g)].map(m => Number(m[1]));
          const namedAmount = namedAmounts.length ? /或|\bor\b/.test(effect) ? Math.max(...namedAmounts) : namedAmounts.reduce((a, b) => a + b, 0) : undefined;
          const selectedAmount = /选择(\d+)张.*加入|choose(\d+).*hand/.exec(effect);
          let amount = Number(draw?.[1] ?? draw?.[2] ?? selectedAmount?.[1] ?? selectedAmount?.[2] ?? namedAmount ?? /(?:将|开发)(\d+)|^(?:add|develop)(\d+)/.exec(effect)?.slice(1).find(Boolean) ?? 1);
          if (/每弃1张/.test(sentence) && generated) amount *= SCENARIO.hand;
          if (draw && /各|和战斗机/.test(effect)) amount *= Math.max(1, [...effect.matchAll(/步兵|坦克|炮兵|战斗机|轰炸机/g)].length);
          const retained = !/抽.*将其弃掉|drawanddiscard|其所有者抽|owner.*draw/.test(sentence);
          const restricted = draw && !/^(?:抽\d+张牌|draw\d+(?:extra)?cards?)(?:$|并|and)/.test(effect);
          const needs = restricted ? requirements(draw[3]) : required;
          const temporary = /回合.*弃掉|turn.*discard/.test(value) || /将其弃掉/.test(sentence);
          if (retained && !wholeDiscard) add('supply', amount / 2 * (temporary ? /下个友方回合/.test(value) ? 0.5 : 0.25 : 1),
            { conditional: conditional || destroyedFriend, ...(needs.length ? { requires: needs } : {}),
              ...(draw && needs.length ? { zone: 'deck' as const } : {}),
              ...(generated || develop ? { factor: /从3张|开发|develop/.test(effect) ? 1.15 : 1 } : {}) });
          if (draw && !temporary) provides.push({ tag: 'draw-event', conditional, chance: 0.8 });
          if (generated || develop) { provides.push({ tag: 'generation-event', conditional }); previousZone = 'generated'; priorTarget = '友方手牌'; }
          if (generated) for (const name of effect.matchAll(/@(\d+)@/g)) {
            const target = byId.get(namedId(names[Number(name[1])]) || '');
            if (target) for (const tag of cardTags(target)) localHand.add(tag);
          }
          if (restricted && needs.length) matched = true;
        }
        const summon = /^(?:将|随机将|分别随机将|加入|复制).*(?:加入|加入到|^加入)(?:友方)?(?:支援阵线|前线|战场|本单位相邻处|.*相邻处|同一阵线|总部相邻)|^加入\d+[个张]@\d+@|^add.*(?:supportline|frontline|battlefield|beside|asdefender)|^copy.*(?:unit|tank)/.test(effect);
        if (summon && !/加入敌方|totheenemy/.test(effect)) {
          matched = true;
          const needs = /将手(?:中|牌)|手(?:中|牌).*选择.*单位|友方单位的复制|friendly.*copy|from.*hand|copy.*friendly/.test(sentence) ? requirements(sentence) : required;
          let amount = Number(/(?:将|加入|add)(\d+)/.exec(effect)?.[1] || 1);
          if (/各1个/.test(effect)) amount *= (effect.match(/\d+[、和]/g)?.length || 0) + 1;
          const summoned = [...effect.matchAll(/@(\d+)@/g)].map(m => byId.get(namedId(names[Number(m[1])]) || '')).filter((c): c is KardsCardRecord => !!c);
          const pressure = summoned.length ? summoned.reduce((n, c) => n + (c.json.attack || 0) / (3 * (1 + (c.json.operationCost || 0) / 2)), 0) / summoned.length
            : /@\d+@/.test(effect) ? 0 : 0.6;
          add('board', amount, { ...(needs.length ? { requires: needs } : {}) });
          add('offense', amount * pressure, { ...(needs.length ? { requires: needs } : {}) });
          if (summoned.some(c => c.json.attributes?.some(a => /^guard$/i.test(a)))) add('defense', amount * 0.7);
          for (const target of summoned) for (const tag of cardTags(target)) localBoard.add(tag);
          localBoard.add('unit');
          priorTarget = '友方单位';
          previousZone = 'generated';
          provides.push({ tag: 'unit', conditional });
        }
        effect = effect.replace(/^(?:先|再次|其随机|随机)?(?=对)/, '').replace(/造成一次(\d+)点/, '造成$1点')
          .replace(/^使(?:其|1个友方单位)随机对/, '对');
        const damage = /^(?:随机)?对(.+?)造成(?:(\d+)(?:-(\d+))?点|等同于(.+?)(?:的)?|同等|等量)伤害|^造成(\d+)(?:-(\d+))?点(?:伤害)?|^deal(?:(\d+)(?:-(\d+))?damage(?:to(.+))?|damageto(.+))/.exec(effect);
        if (damage) {
          matched = true;
          const variable = !!(damage[4] || /等同|等量|同等/.test(damage[0]));
          const low = Number(damage[2] ?? damage[5] ?? damage[7] ?? (variable ? d.attack || 3 : 1));
          const high = Number(damage[3] ?? damage[6] ?? damage[8] ?? low);
          const split = /随机分配|distribut/.test(sentence);
          const amount = (low + high) / 2 / (split ? SCENARIO.enemyUnits + 1 : 1);
          let target = damage[1] || damage[9] || damage[10] || (replacing ? priorTarget : '目标');
          if (/^(?:其|it)$/.test(target)) target = priorTarget;
          const friendlyOnly = FRIENDLY.test(target), multi = AREA.test(target) || split;
          if (amount && !friendlyOnly) {
            const response = variable || amount >= 3 ? 'single' : 'light';
            if (UNIT.test(target) || /敌方目标|目标|enemy$|all|^其$|^it$/.test(target)) add('interaction', Math.min(1.2, amount / 4),
              { target, conditional: conditional || variable, responses: [response, ...(multi ? ['area'] : [])] });
            if (/总部|hq|目标|enemy$|all/.test(target) && !/友方总部|yourhq/.test(target)) add('offense', Math.min(2, amount / 3), { conditional: conditional || variable });
            if (/所有单位|allunits/.test(target) && !/敌方|enemy/.test(target)) {
              add('defense', -amount / 5, { cost: 'self-damage', requires: ['unit'] });
              provides.push({ tag: 'self-damage-event', conditional });
            }
          } else {
            add(/总部|hq/.test(target) ? 'defense' : 'offense', -amount / 5, { cost: 'self-damage' });
            provides.push({ tag: 'self-damage-event', conditional });
          }
          priorTarget = target;
        }
        const removal = /^(?:随机|将)?(?:消灭|移除|控制)(.+)|^将(.+?)消灭|^(?:destroy|remove|takecontrol(?:of)?)(.+)/.exec(effect);
        const delay = /^(?:压制|抑制)(.+)|^(?:使|将)(.+?)(?:压制|抑制|撤退|返回(?:(?:其)?所有者)?手(?:中|牌)|返回其所有者卡组顶)|^(?:pin|suppress|retreat)(.+)|^send(.+?)(?:tohand|backto)/.exec(effect);
        let target = removal?.slice(1).find(Boolean) || delay?.slice(1).find(Boolean);
        if (target) {
          if (/^(?:其|it)(?:$|并|and)/.test(target)) target = priorTarget;
          const returnedControl = /控制/.test(value) && /返回(?:其)?所有者手/.test(value);
          const settlement = returnedControl && /返回(?:其)?所有者手/.test(effect);
          const temporary = /直到|until/.test(sentence) || returnedControl || /移除|remove/.test(effect) && /返回战场|return.*battlefield/.test(value);
          const friendlyOnly = FRIENDLY.test(target) || /卡组顶|fromyourdeck|ofyourdeck|countermeasure|反制|指挥点/.test(target);
          if (settlement) assumptions.push('临时控制及归还按一次有限干扰计算，归还不重复计为解牌');
          else if (UNIT.test(target) && !friendlyOnly) {
            const single = removal && !temporary;
            add('interaction', single ? 1 : 0.6, { target, responses: [single ? 'single' : 'delay', ...(AREA.test(target) ? ['area'] : [])] });
            if (removal && /^(?:所有|全部)单位|^allunits/.test(target) && !/敌方|enemy/.test(target)) {
              add('offense', -0.6, { cost: 'sacrifice', requires: ['unit'] });
              add('defense', -0.35, { cost: 'sacrifice', requires: ['unit'] });
              provides.push({ tag: 'death-event', conditional });
            }
          } else if (UNIT.test(target) && friendlyOnly && removal && !/卡组/.test(target)) {
            add('offense', -0.6, { cost: 'sacrifice', requires: requirements(target) });
            add('defense', -0.35, { cost: 'sacrifice', requires: requirements(target) });
            provides.push({ tag: 'death-event', conditional });
          } else if (/本单位/.test(target) && /抑制/.test(effect) && cannotAttack) {
            add('offense', (d.attack || 0) / 3); add('fast', 0.5);
          }
          priorTarget = target; matched = true;
        }
        const fighting = /与.*敌方.*战斗|fights?.*enemy/.test(effect);
        if (fighting) { add('interaction', 0.8, { conditional: conditional || !unit, ...(!unit ? { requires: ['operating-unit'] } : {}), responses: ['single'] }); matched = true; }
        const replacement = /(?:将|convert)(.+?)(?:转换为|into)@(\d+)@/.exec(effect);
        const replacementCard = replacement && byId.get(namedId(names[Number(replacement[2])]) || '');
        if (replacementCard && UNIT.test(replacement![1]) && !FRIENDLY.test(replacement![1])
            && replacementCard.json.attack! <= 1 && replacementCard.json.defense! <= 1) {
          add('interaction', 0.8, { responses: ['single', ...(AREA.test(replacement![1]) ? ['area'] : [])] }); matched = true;
        }
        const enemy = /^(?:使|将)?(?:所有|其他|\d+个)?(?:敌方|对手)|^(?:give)?(?:all|1|target)?enemy/.test(effect)
          || /^(?:使)?其/.test(effect) && /敌方|enemy/.test(priorTarget);
        const external = !unit || /相邻|其他友方|使\d+个|使所有|友方.*(?:具有|获得)|friendly|adjacent|give|yourother/.test(effect);
        const buffNeeds = external && !/总部|hq/.test(effect) ? requirements(effect) : required;
        const points = (n: number) => Math.min(3, Math.max(0.25, n / 2));
        const attack = /\+(\d+)(?:[+-]\d+|攻击力)|\+(\d+)(?:attack)|攻击力.*(?:翻倍|等同于)|attack.*(?:double|equal)/.exec(effect);
        const protection = /\+\d+\+(\d+)|\+(\d+)(?:防御力|defense)|获得(?:等同于.+?|等量的?|同等)防御力|守护|重甲|免疫|完全修复|烟幕|伏击|guard|heavyarmor|immune|fullyrepair|smokescreen|ambush/.exec(effect);
        const operation = /-\d+行动花费|行动花费为0|(?:operate|operationcost).*(?:less|free|0)|-\d+operationcost|再次行动|operateagain/.test(effect);
        const fast = /(?:获得|具有).*(?:闪击|冲击)|(?:give|gain|gets?|have).*?(?:blitz|shock)/.test(effect);
        if (!enemy && (attack || protection || operation || fast) && !/失去|无法|不能|cannot|loses?/.test(effect)) {
          const needs = buffNeeds.length ? { requires: buffNeeds } : {};
          if (attack || operation) add('offense', attack ? points(Number(attack[1] || attack[2] || 2)) : 1, needs);
          if (protection) add('defense', points(Number(protection[1] || protection[2] || 2)), needs);
          if (fast) add('fast', 1, needs);
          if (fast) add('offense', 1, needs);
          if (/友方|friendly/.test(effect)) priorTarget = '友方单位:' + effect;
          matched = true;
        }
        if (enemy && (attack || protection || operation || fast) && !/失去|无法|不能|cannot|loses?/.test(effect)) {
          if (attack || operation || fast) add('defense', -(attack ? points(Number(attack[1] || attack[2] || 2)) : 1));
          if (protection) add('offense', -points(Number(protection[1] || protection[2] || 2)));
          matched = true;
        }
        if (enemy && /总部.*(?:获得|增加)\+?(\d+)防御力|enemyhq.*(?:gain|gets?)\+?(\d+)defense/.test(effect)) {
          const amount = Number(/(\d+)/.exec(effect)?.[1] || 3);
          add('offense', -amount / 6); matched = true;
        }
        if (!enemy && /(?:本单位|友方)?.*(?:受到的(?:对战)?伤害-|防御力无法降|无法被(?:压制|抑制|陆军攻击))/.test(effect)) {
          add('defense', 0.7); matched = true;
        }
        if (enemy && /-\d+攻击力|攻击力为0|attack.*0|-\d+attack|防御力为1|defense.*1|无法攻击|cannotattack/.test(effect)) {
          add('interaction', 0.6, { responses: ['delay', ...(AREA.test(effect) ? ['area'] : [])] }); matched = true;
        }
        if (/反制(?:其|敌方)|将其反制|^counter(?:an?enemy|1enemy|an?order|1order)/.test(effect)) {
          add('defense', 1); matched = true;
        }
        if (/(?:友方总部|yourhq).*(?:受到的伤害-|伤害至多|防御力无法降|改为由.*承受)|受到的对战伤害至多|无法被敌方指令指向|无法撤退或被抑制|damageto.*(?:yourhq|thisunit).*(?:reduc|atmost)|cannotbetargeted/.test(effect)) {
          add('defense', 1); matched = true;
        }
        if (/^(?:预报|forecast)$/.test(effect)) {
          add('supply', unit ? 1 : 0.5); provides.push({ tag: 'weather', conditional }); matched = true;
        }
        if (/移至前线|moves?intothefrontline/.test(effect) && !/敌方|enemy/.test(effect)) {
          add('fast', 1, external ? { requires: buffNeeds.length ? buffNeeds : ['unit'] } : {}); matched = true;
        }
        if (generated || summon || develop) for (const name of effect.matchAll(/@(\d+)@/g)) {
          const id = namedId(names[Number(name[1])]);
          if (id) provides.push({ tag: `card:${id}`, conditional: true });
        }
        // Economy is expressed in actual kredits before the deck-context evaluator
        // converts it into availability. A slot, a temporary kredit and a discount differ.
        const enemyEffect = /敌方|对手|enemy|opponent/.test(effect);
        const symmetric = /双方|bothplayers|bothsides/.test(effect);
        const kredit = /(?:获得|失去|增加|减少)(\d+)个?指挥点(槽)?|(?:gain|lose)(\d+)(?:extra)?kredit(slots?)?/.exec(effect);
        if (kredit) {
          const amount = Number(kredit[1] || kredit[3]), slots = !!(kredit[2] || kredit[4]);
          const losing = /失去|减少|lose/.test(kredit[0]);
          const benefit = (losing ? -1 : 1) * (enemyEffect ? -1 : 1);
          const economy = { kind: slots ? 'slots' as const : 'temporary' as const, amount: amount * benefit, scope: [] as string[], enemy: enemyEffect };
          add(enemyEffect ? 'interaction' : 'tempo', amount * benefit / 3, { economy, ...(enemyEffect ? { responses: ['control'] } : {}) });
          if (symmetric) add('interaction', -amount * (losing ? -1 : 1) / 4, { responses: ['control'] });
          provides.push({ tag: slots && !losing ? 'ramp-event' : 'kredit-event', conditional });
          if (slots && losing && !enemyEffect) provides.push({ tag: 'lost-slot-event', conditional });
          matched = true;
        }
        const discount = /([+-]\d+)(?:部署)?花费|(?:降低|失去)(\d+)花费|(?:cost|costs?)(\d+)(less|more)/.exec(effect);
        const setCost = /(?:花费为|cost(?:is|to))(\d+)/.exec(effect);
        const variableDiscount = /降低等同于|失去等同于.*花费|降低同等花费|花费.*(?:降低|减少)/.test(effect);
        if ((discount || setCost || variableDiscount) && (!/行动花费|operationcost/.test(effect) || /失去等同于.*行动花费.*花费/.test(effect))) {
          const amount = discount ? -(Number(discount[1]) || (discount[2] ? -Number(discount[2]) : Number(discount[3]) * (discount[4] === 'less' ? -1 : 1)))
            : setCost ? Number(setCost[1]) : /轰炸机.*攻击力/.test(effect) ? 4 : /行动/.test(effect) ? 2 : Math.max(1, d.operationCost || 2);
          const self = previousZone === 'self' && !/友方|手牌|手中|卡组|所有|其他|friendly|yourhand|deck|all|other/.test(effect);
          const scope = previousZone === 'generated' ? ['outside-deck'] : requirements(effect).length ? requirements(effect) : /^(?:使)?其/.test(effect) ? requirements(priorTarget) : [];
          const economy = { kind: setCost ? 'set-cost' as const : 'discount' as const, amount: setCost ? amount : enemyEffect ? -amount : amount, scope, self, enemy: enemyEffect,
            all: AREA.test(effect) || /^(?:(?:使)?友方.*(?:具有|花费)|手牌获得|使手牌获得)/.test(effect) };
          add(enemyEffect ? 'interaction' : 'tempo', setCost ? 0.1 : economy.amount / 3, { economy, ...(enemyEffect ? { responses: ['control'] } : {}) });
          if (variableDiscount) assumptions.push('可变降费按本卡组支撑与中性行动/目标数值估算');
          matched = true;
        }
        if (/指挥点槽数与敌方相等/.test(effect)) {
          add('tempo', 0.4, { economy: { kind: 'slots', amount: 1, scope: [] } });
          assumptions.push('追平指挥点槽按落后一槽的中性情景估算'); matched = true;
        }
        if (/失去剩余指挥点|花费剩余指挥点|花费友方剩余/.test(effect)) {
          add('tempo', -0.6); matched = true;
        }
        if (/敌方.*(?:无法|不能)(?:使用指令|抽牌|部署单位|增加指挥点槽)|enemy.*cannot(?:playorders?|draw|deploy|gain)/.test(effect)) {
          const points = /部署|deploy/.test(effect) ? 0.85 : /抽牌|draw/.test(effect) ? 0.5 : 0.65;
          add('interaction', points, { responses: ['control'] }); matched = true;
        }
        if (/^(?:双方|敌方|友方)?.*(?:部署无法触发|反制无法触发|只能使用至多1张指令)/.test(effect)) {
          add('interaction', 0.75, { responses: ['control'] });
          if (symmetric) add('tempo', -0.45, { requires: /反制/.test(effect) ? ['countermeasure'] : /部署/.test(effect) ? ['deployment-event'] : ['order'] });
          matched = true;
        }
        const discard = /弃(?:掉|置)?(\d+)张|discard(\d+)/.exec(effect);
        if (discard && !/每弃|when.*discard/.test(effect)) {
          const n = Number(discard[1] || discard[2]);
          if (enemyEffect || /^其随机弃/.test(effect) && /敌方/.test(priorTarget)) {
            add('interaction', n * 0.45, { responses: ['control'] });
          } else if (!/弃掉此牌/.test(effect)) {
            add('supply', -n / 2, { cost: 'discard' });
            provides.push({ tag: 'discard-event', conditional });
            if (/选择并|choose/.test(effect) && /抽|draw/.test(sentence)) add('supply', 0.15);
          }
          matched = true;
        }
        if (/^(?:敌方|对手|其所有者|双方玩家).*(?:抽(\d+)张|draw(\d+))/.test(effect)) {
          const n = Number(/抽(\d+)|draw(\d+)/.exec(effect)?.slice(1).find(Boolean) || 1);
          if (symmetric) add('supply', n / 2);
          add('interaction', -n * 0.4, { responses: ['control'] }); matched = true;
        }
        if (/^(?:从敌方卡组抽|随机复制敌方卡组中的).*?(\d+)张/.test(effect)) {
          add('supply', Number(/(\d+)张/.exec(effect)?.[1] || 1) / 2); matched = true;
        }
        if (/^(?:从卡组顶.*选择|选择.*手牌|选择手.*(?:单位|指令|坦克|空军|反制)|choose.*hand)/.test(effect)) {
          selection = true;
          priorTarget = effect;
          previousZone = /卡组顶/.test(effect) ? 'deck' : 'hand';
          if (/从卡组顶/.test(effect)) add('supply', /抽取|draw/.test(sentence) ? 0.15 : 0.65);
          matched = true;
        }
        if (/^(?:将|选择).*(?:\d+张手牌|手牌.*\d+张).*(?:洗入|放回|返回|置于).*(?:卡组|deck)/.test(effect)) {
          const n = Number(/(\d+)张/.exec(effect)?.[1] || 1);
          add('supply', -n / 2);
          if (/抽|draw/.test(value)) add('supply', 0.15);
          matched = true;
        }
        if (/将其抽取|^drawit$/.test(effect)) { add('supply', 0.5); matched = true; }
        if (/^(?:随机复制手牌中的|将手牌中的.*复制.*手牌)/.test(effect)) { add('supply', 0.5, { requires: ['unit'] }); matched = true; }
        if (/随机激活手牌中的.*反制/.test(effect)) { add('tempo', 0.5, { requires: ['countermeasure'] }); matched = true; }
        const returnedHandSelection = previousZone === 'hand' && /^将其(?:返回|洗入|放回|置于).*卡组/.test(effect);
        if (returnedHandSelection) { add('supply', -0.35); previousZone = 'deck'; matched = true; }
        const deckInjection = /(?:加入|洗入|置于|返回).*(?:卡组|deck)|(?:shuffle|add|put).*deck/.test(effect)
          && !/手牌.*(?:洗入|放回)|所有手牌|全部手牌|卡组顶.*选择/.test(effect) && !returnedHandSelection;
        if (deckInjection) {
          const amount = Number(/(\d+)张/.exec(effect)?.[1] || 1);
          if (enemyEffect) {
            if (/友方卡组/.test(effect)) add('interaction', 0.8, { responses: ['single'] });
            else if (/@\d+@/.test(effect)) add('interaction', amount * 3 / SCENARIO.remaining * 0.5, { responses: ['control'] });
          } else {
            const reach = /顶|top/.test(effect) ? 0.85 : 3 / SCENARIO.remaining;
            if (/友方单位|本单位|其$/.test(effect) && /洗入|返回/.test(effect)) {
              add('offense', -0.35); add('defense', 0.2);
            } else add('supply', amount * reach / 2);
            previousZone = 'deck';
            provides.push({ tag: 'generation-event', conditional: true, chance: reach });
          provides.push({ tag: 'deck-generation-event', conditional: true, chance: reach });
          }
          assumptions.push('洗入牌库按窗口内抽到的概率折算，置顶另算');
          matched = true;
        }
        if (/返回.*(?:手牌|手中|hand)|return.*hand/.test(effect) && /友方|本单位|friendly|thisunit/.test(effect + priorTarget) && !enemyEffect) {
          add('defense', 0.2); add('tempo', -0.25);
          provides.push({ tag: 'replay-event', conditional, chance: 0.6 });
          matched = true;
        }
        if (/弃掉(?:全部|所有)手牌|discardyourhand|将所有手牌洗入/.test(effect)) { matched = true; }
        if (/弃掉(?:最左侧手牌|所有非单位|所有.*牌)|选择并弃.*(?:单位|空军|反制|喷火)$/.test(effect)) {
          add('supply', -0.5, { cost: 'discard' }); provides.push({ tag: 'discard-event', conditional }); matched = true;
        }
        if (/^从敌方3张手牌中选择1张(?:并弃掉)?$/.test(effect)) {
          add('interaction', 0.6, { responses: ['control'] }); matched = true;
        }
        if (/从其所有者的手牌和卡组中移除所有复制|从卡组顶移除/.test(effect)) {
          add('interaction', 0.25, { responses: ['control'] }); matched = true;
        }
        if (/(?:升为老兵|becomeveteran)/.test(effect)) {
          if (d.attributes?.some(a => a.startsWith('BecomesVeteran:')) && /升为老兵$/.test(effect)) {
            upgradeActivation = { event, context: context || sentence, trigger: context, conditions: [...conditions], requires: required };
            matched = true;
          }
          else { add('offense', 0.45, { requires: ['veteran'] }); add('defense', 0.45, { requires: ['veteran'] }); matched = true; }
        }
        if (/具有(?:奋战|情报\d*|收缴)|获得奋战/.test(effect)) {
          if (/奋战/.test(effect)) add('offense', 0.8);
          if (/情报/.test(effect)) { add('supply', 0.25); provides.push({ tag: 'intel', conditional }); }
          if (/收缴/.test(effect)) { add('interaction', 0.4, { responses: ['delay'] }); provides.push({ tag: 'salvage', conditional }); }
          matched = true;
        }
        if (/获得动员|获得1个随机对战词条|获得1个单位的所有对战词条/.test(effect)) {
          add('offense', 0.35, { requires: external ? ['unit'] : [] });
          add('defense', 0.35, { requires: external ? ['unit'] : [] });
          if (/动员/.test(effect)) provides.push({ tag: 'mobilize', conditional: true, chance: 0.65 });
          matched = true;
        }
        if (/也算作是坦克/.test(effect)) { provides.push({ tag: 'tank' }); matched = true; }
        if (/算作是海军/.test(effect)) { provides.push({ tag: 'naval', conditional: true, chance: previousZone === 'deck' ? 0.4 : 0.8 }); matched = true; }
        if (/获得协力|失去协力|具有山地/.test(effect)) {
          const tag = /协力/.test(effect) ? 'bond' : 'alpine';
          if (!/失去/.test(effect)) provides.push({ tag, conditional: true, chance: 0.65 });
          add('tempo', /失去/.test(effect) ? -0.2 : 0.2, { requires: requirements(effect) }); matched = true;
        }
        if (/^无法攻击(?:或移动|敌方总部)?$/.test(effect)) { matched = true; }
        if (/^无法(?:被)?部署$/.test(effect)) {
          if (!/指挥点槽数/.test(sentence)) add('tempo', -0.35);
          assumptions.push('最低费用之外的部署顺序限制按中性排序成本折算'); matched = true;
        }
        if (/同一回合.*移动并攻击|moves?andattack.*sameturn/.test(effect)) {
          add('fast', 0.65, { requires: external ? (buffNeeds.length ? buffNeeds : ['unit']) : [] }); matched = true;
        }
        if (/无法被压制|无法被抑制|无法撤退或被抑制|被压制的单位可以行动/.test(effect)) {
          add('defense', 0.35); add('fast', 0.25); matched = true;
        }
        if (/无法被陆军攻击|防御力无法降为1以下|总部累计失去的防御力至多为/.test(effect)) {
          add('defense', 0.9); matched = true;
        }
        if (/(?:失去守护|失去亡计|失去.*烟幕|揭示1个隐蔽单位)/.test(effect)) {
          add('interaction', 0.35, { responses: ['delay'] }); matched = true;
        }
        if (/具有-\d+攻击力|获得-\d+-\d+|攻击力为0|变为2\/2|行动花费为4|获得\+\d+行动花费/.test(effect)) {
          add('interaction', AREA.test(effect) ? 0.75 : 0.45, { responses: ['delay', ...(AREA.test(effect) ? ['area'] : [])] }); matched = true;
        }
        if (/所有单位造成的对战伤害为1|攻击力不小于4的单位无法攻击|所有陆军无法攻击/.test(effect)) {
          add('interaction', 0.8, { responses: ['area', 'delay'] });
          add('offense', -0.5, { requires: /陆军/.test(effect) ? ['land'] : ['high-attack-unit'] }); matched = true;
        }
        if (/受到的(?:对战)?伤害-\d+|每次造成的伤害-\d+|造成的伤害-1/.test(effect)) {
          add('defense', /-2/.test(effect) ? 0.8 : 0.5); matched = true;
        }
        if (/伤害.*由(?:本单位|钳击同伴)承受|由本单位承受|由钳击同伴承受|使其成为攻击目标/.test(effect)) {
          add('defense', 0.65, { requires: ['unit'] }); matched = true;
        }
        if (/由敌方总部承受|溢出.*伤害.*(?:转移|分配)|伤害也会施加到敌方总部|攻击时也对敌方总部造成伤害/.test(effect)) {
          add('offense', Math.max(0.3, (d.attack || 3) / 6)); matched = true;
        }
        const doubleDamage = /对(.+?)造成(?:双|三)倍伤害|对(.+?)造成的伤害\+(\d+)/.exec(effect);
        if (doubleDamage) {
          const target = doubleDamage[1] || doubleDamage[2];
          const bonus = Number(doubleDamage[3] || (/三倍/.test(effect) ? 4 : 2));
          if (/总部/.test(target)) add('offense', bonus / 3);
          if (!/总部/.test(target) || /和|或|、/.test(target)) add('interaction', bonus / 5, { responses: ['combat'] });
          matched = true;
        }
        if (/造成双倍伤害/.test(effect) && !doubleDamage) { add('offense', 0.6); add('interaction', 0.4, { responses: ['combat'] }); matched = true; }
        if (/所有数值\+/.test(effect) && previousZone === 'enemy-hand') {
          assumptions.push('往返指令的全数值增长同时改变费用与伤害，不另作单位属性加成'); matched = true;
        } else if (/所有数值\+|获得等量攻击力|获得同等.*攻击力|获得等同于.*攻击力|获得等同于.*数值|防御力.*攻击力/.test(effect) && !attack) {
          add('offense', 0.7); if (/防御力|所有数值/.test(effect)) add('defense', 0.7); matched = true;
        }
        if (/友方指令造成的伤害\+|非对战、非攻击伤害\+|伤害指令造成的伤害\+/.test(effect)) {
          add('offense', 0.35, { requires: ['damage-order'] }); add('interaction', 0.35, { requires: ['damage-order'], responses: ['light'] }); matched = true;
        }
        if (/触发.*(?:亡计|非指向部署)|亡计触发两次|非指向部署触发两次|亡计额外触发/.test(effect)) {
          const tag = /亡计/.test(effect) ? 'death-payoff' : 'deployment-event';
          add('tempo', 0.01, { requires: [tag], mechanic: /亡计/.test(effect) ? 'retrigger-death' : 'retrigger-deployment' });
          provides.push({ tag: /亡计/.test(effect) ? 'death-retrigger' : 'deployment-retrigger', conditional, chance: 0.7 });
          assumptions.push('重新触发按卡组中对应效果估算，递归限制为三层');
          matched = true;
        }
        if (/^(?:重复|再重复|对敌方单位重复)/.test(effect)) {
          const times = Number(/(\d+)/.exec(effect)?.[1] || (/三次/.test(effect) ? 3 : 1));
          const payloads = roles.slice(roles.length > sentenceStart ? sentenceStart : previousSentenceStart, effectStart);
          for (const evidence of payloads) for (let repeat = 1; repeat <= (conditions.length ? 3 : Math.min(3, times)); repeat++) {
            roles.push({ ...evidence, conditions: [...(evidence.conditions || []), ...Array.from({ length: repeat }, () => conditions).flat()] });
          }
          assumptions.push('条件重复按兑现概率逐次衰减，最多额外重复三次'); matched = true;
        }
        if (/^(?:结束回合|立即结束下个敌方回合)$/.test(effect)) {
          add(/敌方/.test(effect) ? 'interaction' : 'tempo', /敌方/.test(effect) ? 1 : -0.7, { cost: 'end-turn', responses: ['control'] }); matched = true;
        }
        if (/^(?:即将降雨|将是晴天|风暴将至)$/.test(effect)) {
          provides.push({ tag: 'weather', conditional: true, chance: 0.8 }); add('tempo', 0.15); matched = true;
        }
        const variableDamage = /^(?:使1个友方单位|其)?造成等同于(.+?)的?伤害$/.exec(effect);
        if (variableDamage) {
          if (/攻击时/.test(sentence) && /防御力/.test(effect)) {
            add('offense', 1, { mechanic: 'defense-damage', requires: ['land'] });
          } else {
            const n = /所有单位数/.test(effect) ? SCENARIO.enemyUnits + 2 : /防御力/.test(effect) ? d.defense || 3 : /修复/.test(effect) ? 3 : d.attack || 3;
            const split = /随机分配/.test(sentence), perTarget = n / (split ? SCENARIO.enemyUnits + 1 : 1);
            add('interaction', perTarget / 4, { responses: [perTarget >= 3 ? 'single' : 'light', ...(split ? ['area'] : [])], requires: /友方单位/.test(effect) ? ['unit'] : required });
            add('offense', perTarget / 3, { requires: /友方单位/.test(effect) ? ['unit'] : required });
          }
          assumptions.push('可变伤害按来源数值、卡组属性或统一目标数值估算'); matched = true;
        }
        if (/^(?:使|将)?(?:本单位|1个单位)的攻击力和行动花费交换/.test(effect)) {
          add('offense', 1, { mechanic: 'attack-operation-swap', requires: unit ? [] : ['unit'] });
          if (!unit) add('interaction', 0.4, { responses: ['delay'] });
          matched = true;
        }
        if (/忽略@\d+@/.test(effect) && names.some(name => /无法攻击敌方总部/.test(name))) {
          add('offense', 1, { mechanic: 'ignore-hq', requires: ['cannot-attack-hq'] }); matched = true;
        }
        if (/复制本单位|复制1个友方坦克/.test(effect)) {
          add('board', 1, { requires: /友方坦克/.test(effect) ? ['tank'] : [] });
          if (!cannotAttack) add('offense', Math.max(0.25, (d.attack || 3) / 4), { requires: /友方坦克/.test(effect) ? ['tank'] : [] });
          provides.push({ tag: 'unit', conditional: true, chance: 0.6 }); matched = true;
        }
        const transform = /(?:将|^)(.+?)(?:转换为|变为)(?:@(\d+)@|(\d+)\/(\d+))/.exec(effect)
          || /^(转换为)@(\d+)@/.exec(effect);
        if (transform && !matched) {
          const transformed = byId.get(namedId(names[Number(transform[2])]) || '');
          if (transformed || transform[3]) {
            const attack = transformed?.json.attack ?? Number(transform[3] || 0), defense = transformed?.json.defense ?? Number(transform[4] || 0);
            if (/手牌|手中/.test(effect)) add('interaction', 0.25, { responses: ['control'] });
            else if (enemyEffect || /敌方/.test(priorTarget)) add('interaction', (6 - attack - defense) / 6, { responses: ['single'] });
            else {
              const oldAttack = /本单位/.test(effect) && unit ? d.attack || 0 : 3, oldDefense = /本单位/.test(effect) && unit ? d.defense || 0 : 3;
              add('offense', (attack - oldAttack) / 3); add('defense', (defense - oldDefense) / 4);
            }
            if (transformed && /手牌|手中|hand/.test(effect)) add('supply', 0.15);
            matched = true;
          }
        }
        if (/将其(?:返回战场|返回并复制|返回)$/.test(effect)) {
          if (/复制/.test(effect)) { add('board', 1); add('offense', 0.6); }
          else if (/友方|本单位/.test(value) && /移除/.test(value)) {
            provides.push({ tag: 'replay-event', conditional, chance: 0.65 }); add('fast', /闪击/.test(value) ? 0.7 : 0);
          }
          assumptions.push('暂时移除与返回按延迟/重新部署计入，不作为永久解牌'); matched = true;
        }
        if (/^(?:加入前线|加入战场|加入支援阵线)$/.test(effect)) {
          if (/被.*弃|被.*移除/.test(context)) {
            const tag = /弃/.test(context) ? 'discard-event' : 'mill-event';
            add('board', 1, { requires: [tag] }); add('offense', (d.attack || 2) / 4, { requires: [tag] });
          } else if (/前线/.test(effect)) add('fast', 0.25);
          else add('board', 0.5);
          matched = true;
        }
        if (/^再次将其压制$|^压制$|额外压制一回合|空军进入战场时会被压制|重置被攻击单位的攻击力/.test(effect)) {
          add('interaction', /额外/.test(effect) ? 0.3 : 0.6, { responses: ['delay'] }); matched = true;
        }
        if (/将其收缴/.test(effect)) { add('interaction', 0.5, { responses: ['single'] }); add('supply', 0.3); matched = true; }
        if (/^(?:将其移除|消灭)$/.test(effect)) { add('interaction', 0.8, { responses: ['single'] }); matched = true; }
        if (/将其激活/.test(effect)) { add('tempo', 0.45, { requires: ['countermeasure'] }); matched = true; }
        if (/增加(\d+)点防御力/.test(effect)) {
          add('defense', Number(/(\d+)/.exec(effect)?.[1] || 1) / 3, { factor: /随机分配/.test(sentence) ? 0.7 : 1 }); matched = true;
        }
        const hqSet = /使(?:友方|双方)总部的防御力为(\d+)/.exec(effect);
        if (hqSet) {
          const target = Number(hqSet[1]), change = target - 14;
          add('defense', change / 6);
          if (symmetric) add('offense', -change / 6);
          assumptions.push('总部数值重设按双方总部各十四防御力的中性情景估算'); matched = true;
        }
        if (/本单位受到的对战伤害翻倍/.test(effect)) { add('defense', -0.7); matched = true; }
        if (/^获得-\d+攻击力$/.test(effect)) { add('offense', -Number(/\d+/.exec(effect)?.[0] || 1) / 3); matched = true; }
        if (/使敌方卡组中的所有单位获得\+\d+攻击力/.test(effect)) {
          add('defense', -0.4); matched = true;
        }
        if (/^(?:所有敌方空军具有\+\d+行动花费|敌方使用的第1张牌花费翻倍|敌方随机将1张手牌放回卡组顶)$/.test(effect)) {
          add('interaction', 0.55, { responses: ['control'] }); matched = true;
        }
        if (/^无法使用指令$/.test(effect)) { add('tempo', -0.6, { requires: ['order'] }); matched = true; }
        if (/友方手牌无法被弃掉/.test(effect)) { add('defense', 0.3); matched = true; }
        if (/^本单位撤退$|在伤害造成前撤退/.test(effect)) { add('defense', /伤害造成前/.test(effect) ? 0.5 : 0.15); add('offense', -0.25); matched = true; }
        if (/伤害转移至.*敌方目标/.test(effect)) { add('interaction', 0.65, { responses: ['single'] }); add('defense', 0.5); matched = true; }
        if (/^闪击$/.test(effect)) { add('fast', 1); matched = true; }
        if (/获得\+3\+3/.test(effect) && !matched) { add('offense', 1.5); add('defense', 1.5); matched = true; }
        if (/获得其攻击力和防御力/.test(effect)) { add('offense', 1, { requires: ['unit'] }); add('defense', 0.75, { requires: ['unit'] }); matched = true; }
        const previousCopies = /此前每使用/.test(sentence) ? requirements(sentence.slice(sentence.indexOf('此前'))) : [];
        if (/在第四回合抽取/.test(effect)) { assumptions.push('定时抽取按固定观察窗口内可见处理'); matched = true; }
        if (/使所有单位的攻击力、防御力和行动花费为2/.test(effect)) {
          add('offense', 1, { mechanic: 'reset-stats' });
          add('defense', 1, { mechanic: 'reset-stats' });
          add('interaction', 0.4, { responses: ['area', 'delay'] }); matched = true;
        }
        if (/^额外加入1张$/.test(effect)) { add('supply', 0.5, { scale: sentence, requires: previousCopies }); matched = true; }
        if (/^伤害\+1$/.test(effect)) {
          add('offense', 1 / 3, { scale: sentence, requires: previousCopies });
          add('interaction', 0.25, { scale: sentence, requires: previousCopies, responses: ['light'] }); matched = true;
        }
        if (/友方@\d+@(?:造成的伤害|抽取的卡牌数|增加的指挥点数)\+1/.test(effect)) {
          add(/抽取/.test(effect) ? 'supply' : /指挥点/.test(effect) ? 'tempo' : 'offense', 0.5, { requires: requirements(effect) }); matched = true;
        }
        if (/^将卡组中的\d+张海军卡牌移到卡组顶$/.test(effect)) { add('supply', 0.3, { requires: ['naval'] }); matched = true; }
        if (/将卡组中的\d+张牌转换为本单位|将卡组顶.*转换为|将卡组顶的牌转换为此牌/.test(effect)) {
          add('supply', 0.15); assumptions.push('牌库转换只计筛选/重塑收益，不视作立即增加手牌'); matched = true;
        }
        if (/^(?:弃掉手牌中所有花费不大于2的牌|弃掉花费更低的那张|弃掉所有@\d+@)$/.test(effect)) {
          add('supply', -0.5, { cost: 'discard', ...(requirements(effect).length ? { requires: requirements(effect) } : {}) });
          provides.push({ tag: 'discard-event', conditional }); matched = true;
        }
        if (/^受到等量伤害$/.test(effect) && /总部获得防御力/.test(context)) {
          add('offense', 0.3); add('defense', -0.3, { requires: ['healing-event'] }); assumptions.push('治疗转伤害分别计入敌我总部，中性对手治疗量有限'); matched = true;
        }
        if (/无法(?:获得防御力|被修复)/.test(effect)) {
          add('offense', 0.25); add('defense', -0.25, { requires: [/总部/.test(effect) ? 'healing-event' : 'unit-healing-event'] }); matched = true;
        }
        if (/^受到\d+点伤害$/.test(effect)) {
          add('defense', -Number(/\d+/.exec(effect)?.[0] || 1) / 5, { cost: 'self-damage' });
          provides.push({ tag: 'self-damage-event', conditional }); matched = true;
        }
        if (/己方|友方/.test(effect) && /造成的伤害\+3/.test(effect)) { add('offense', 0.7, { requires: ['high-attack-unit'] }); matched = true; }
        if (/友方被收缴单位消灭受到其伤害的单位/.test(effect)) { add('interaction', 0.65, { requires: ['salvage'], responses: ['single'] }); matched = true; }
        if (/也对被攻击目标左侧所有敌方目标造成伤害/.test(effect)) { add('interaction', 0.6, { responses: ['area', 'combat'] }); matched = true; }
        if (/将其行动花费为1|使其行动花费为1/.test(effect)) { add('offense', 0.4, { requires: ['unit'] }); matched = true; }
        if (/触发等同于.*情报/.test(effect)) { add('supply', 0.3, { requires: requirements(effect) }); matched = true; }
        if (/将其移至最左侧/.test(effect)) {
          provides.push({ tag: 'leftmost-event', conditional: true, chance: 0.8 });
          assumptions.push('手牌重排本身不增加资源，后续最左侧收益另算'); matched = true;
        }
        if (/与1个友方单位交换位置|将其与场上1个友方单位交换/.test(effect)) {
          add('fast', 0.35, { requires: ['unit'] });
          add('tempo', 0.25, { requires: ['unit'] }); matched = true;
        }
        if (/^获得行动花费的指挥点$/.test(effect)) {
          add('tempo', 0.5, { economy: { kind: 'temporary', amount: 1.5, scope: ['operating-unit'] } }); matched = true;
        }
        if (/降低等同于本回合单位行动花费的指挥点的花费/.test(effect)) {
          add('tempo', 0.6, { requires: ['operating-unit'], economy: { kind: 'discount', amount: 2, scope: [], self: true } }); matched = true;
        }
        if (/使用的第一张指令会对敌方总部造成等同于其花费的伤害/.test(effect)) {
          add('offense', 0.8, { requires: ['order'] }); matched = true;
        }
        if (/^将两者转换为@\d+@$/.test(effect)) { assumptions.push('双方手牌重塑不按净新增卡牌计分'); matched = true; }
        if (/^将@\d+@加入敌方手牌$/.test(effect)) {
          add('interaction', -0.2, { responses: ['control'] });
          previousZone = 'enemy-hand'; priorTarget = '敌方手牌';
          assumptions.push('赠予敌方递增花费的往返指令按有限回复能力折算'); matched = true;
        }
        if (/弃掉双方所有激活的反制/.test(effect)) {
          add('interaction', 0.5, { responses: ['control'] });
          add('tempo', -0.4, { requires: ['countermeasure'] }); matched = true;
        }
        if (/将双方手牌中花费最高的单位加入各自支援阵线/.test(effect)) {
          add('board', 1, { requires: ['unit'] }); add('offense', 0.75, { requires: ['unit'] }); add('defense', -0.65); matched = true;
        }
        if (/双方移除手中和\/或场上2张花费最高的卡牌/.test(effect)) {
          add('interaction', 1, { responses: ['single', 'area'] });
          add('offense', -0.8, { requires: ['unit'] }); add('defense', -0.45, { requires: ['unit'] });
          assumptions.push('对称移除按双方高费资源损失折算，不视为单边清场'); matched = true;
        }
        if (/手牌中单位数最多的玩家抽2张牌/.test(effect)) {
          add('supply', 1, { requires: ['unit'], factor: 0.6 });
          add('interaction', -0.4, { responses: ['control'], factor: 0.4 });
          assumptions.push('比拼手牌单位数按己方构成与中性敌方手牌折算'); matched = true;
        }
        if (/始终是随机效果的目标|随机排列所有敌方单位/.test(effect)) {
          assumptions.push('随机指向/站位重排没有固定正向净收益，暂不独立加分'); matched = true;
        }
        if (/^双方抽数张牌$/.test(effect)) matched = true; // Net refill is evaluated once below.
        if (/(?:将其|将本单位)转换为1个(?:花费相同的)?单位$/.test(effect)) {
          const transform = { self: /本单位/.test(effect), sameCost: /花费相同/.test(effect), enemy: /敌方/.test(priorTarget) };
          if (!transform.enemy) add('offense', 1, { mechanic: 'random-transform', transform });
          add('defense', 1, { mechanic: 'random-transform', transform });
          if (!transform.self && previousZone === 'hand') add('supply', 0.15);
          assumptions.push('随机转换按当前非预备役可构筑单位池的属性期望估算，随机得到的复杂能力不假定为额外收益');
          matched = true;
        }
        if (/将本单位转换为此单位/.test(effect)) {
          add('offense', 1, { mechanic: 'next-copy', requires: ['unit'] });
          add('defense', 1, { mechanic: 'next-copy', requires: ['unit'] });
          assumptions.push('持续复制按后续单位属性期望替换原数值，不把多次更新累加为永久增益');
          matched = true;
        }
        if (/将其所有者的所有单位转换为此单位/.test(effect)) {
          add('offense', 1, { mechanic: 'mass-copy', requires: ['unit'] });
          add('defense', 1, { mechanic: 'mass-copy', requires: ['unit'] });
          add('interaction', 0.3, { responses: ['area', 'delay'] });
          assumptions.push('群体转换按两单位场面的可选目标期望估算，不假定场上必有卡组中最强或最弱的牌'); matched = true;
        }
        if (/使其获得此效果/.test(effect)) {
          if (/亡计.*加入支援阵线/.test(value)) {
            const continuation = 0.55 * 0.5;
            for (const evidence of roles.slice(sentenceStart)) if (['board', 'offense'].includes(evidence.role)) evidence.factor = (evidence.factor || 1) * (1 + continuation + continuation ** 2);
            assumptions.push('继承亡计按三层有限分枝期望折算，不能形成无限收益'); matched = true;
          } else if (/将本单位转换为此单位/.test(value)) matched = true;
        }
        // These clauses carry selection, timing, distribution or multiplier metadata
        // in Evidence.context. They are not independent bonuses.
        const qualifier = /^(?:下个(?:友方|敌方)?回合(?:中|开始时)?|友方回合中|敌方回合中|每回合|否则|至少为1|花费至少为1|随机分配至.+|将其余\d+张置于卡组底|洗切(?:其所有者)?卡组|可以指向隐蔽单位|回合结束时弃掉|将其弃掉|弃掉此牌|使用|受到\d+点伤害|获得\d+点|造成\d+点|坦克|炮兵和战斗机|两项都触发|视为由友方触发|失去烟幕|从最右侧时|前线至多有2个单位)$/;
        if (qualifier.test(effect)) {
          assumptions.push('条件/时机/数量约束：' + effect); matched = true;
        }
        if (/^(?:每有|.*每有|此前.*每|单位行动每花费|每次友方使用|每个友方|每修复|每弃|每抽到|每消灭|每溢出|每获得|行动每花费|其每具有|其他友方单位每有)/.test(effect) && /抽|造成|获得|具有|加入|伤害/.test(sentence)) {
          if (!/此前|每弃|每次.*使用/.test(effect)) for (const evidence of roles.slice(sentenceStart)) evidence.scale = effect;
          matched = true;
        }
        if (!matched) unmodeled.push(effect);
        if (replacing && conditions.length) {
          const changedRoles = new Set(roles.slice(effectStart).map(e => e.role));
          for (const prior of roles.slice(effectStart > sentenceStart ? sentenceStart : previousSentenceStart, effectStart)) if (changedRoles.has(prior.role) && !prior.conditions?.length) {
            prior.conditions = ['NOT:' + conditions[conditions.length - 1]];
          }
        }
      }
      if (/每有|每具有|每有一种|防御力每大于|每比友方多|foreach/.test(sentence)) for (const evidence of roles.slice(sentenceStart)) evidence.scale ||= sentence;
      for (const evidence of roles.slice(sentenceStart)) if (evidence.scale?.includes('@')) {
        evidence.requires = [...new Set([...(evidence.requires || []), ...requirements(evidence.scale)])];
      }
      if (selection && !/卡组顶/.test(sentence)) assumptions.push('手牌选择约束按当前手牌与对应卡牌密度估算');
      previousSentenceStart = sentenceStart;
    }
    {
      // Granted effects retain their event and beneficiary. Delayed zones are discounted.
      for (const quoted of names.filter(name => !titles.has(name) && /[：:。]|抽|draw|gets|when|亡计|无法/.test(name))) {
        if (/忽略/.test(value) && /无法攻击敌方总部/.test(quoted)) continue;
        if (/获得|具有|且|give|gets?|have/.test(value)) {
          const granted = read({ ...card, json: { ...d, attributes: [], text: { 'zh-Hans': quoted }, description: {} } }, true, [...path, effectText(raw)]);
          const reach = /卡组|deck/.test(value) ? 3 / SCENARIO.remaining : /手牌|手中|hand/.test(value) ? 0.6 : 1;
          const recipient = /总部|hq/.test(value) ? [] : /加入|洗入|置于/.test(value) ? [] : requirements(value).length ? requirements(value) : ['unit'];
          const hqThreshold = /敌方总部|enemyhq/.test(value) && /每回合.*累计受到的伤害不小于3/.test(quoted);
          roles.push(...granted.roles.map(e => ({ ...e, conditional: true, ...(hqThreshold ? { event: 'hq-threshold', context: quoted } : {}), factor: (e.factor || 1) * reach,
            requires: [...new Set([...recipient, ...(e.requires || [])])] })));
          if (hqThreshold) assumptions.push('敌方总部附加效果收益归施放者；双方每个回合累计伤害首次达三点时至多触发一次');
          if (granted.cannotAttackHQ) roles.push({ role: /所有友方|友方单位/.test(value) ? 'offense' : 'interaction',
            points: /所有友方|友方单位/.test(value) ? -0.6 : 0.5, responses: ['delay'], requires: recipient, context: value });
          unmodeled.push(...granted.unmodeled);
          assumptions.push(...granted.assumptions);
          // The placeholder is structural; retain the child's actual unknown text instead.
          const marker = '@' + names.indexOf(quoted) + '@';
          for (let i = unmodeled.length - 1; i >= 0; i--) if (unmodeled[i].includes(marker) && /获得|且|具有/.test(unmodeled[i])) unmodeled.splice(i, 1);
        } else unmodeled.push(quoted);
      }
      const veteranId = d.attributes?.find(a => a.startsWith('BecomesVeteran:'))?.split(':')[1];
      const veteran = veteranId && byId.get(veteranId);
      if (veteran && !nested) {
        const upgraded = read(veteran, true, [...path, effectText(raw)]);
        roles.push(...upgraded.roles.filter(e => e.event !== 'deployment' && !roles.some(base => base.role === e.role && base.context === e.context && base.points === e.points))
          .map(e => ({ ...e, conditional: true, veteranEvent: e.event, event: 'veteran', activation: upgradeActivation })));
        if (veteran.json.attack! !== d.attack!) roles.push({ role: 'offense', points: Math.max(-2, Math.min(2, (veteran.json.attack! - d.attack!) / 2)), conditional: true, event: 'veteran', activation: upgradeActivation });
        if (veteran.json.defense! !== d.defense!) roles.push({ role: 'defense', points: Math.max(-2, Math.min(2, (veteran.json.defense! - d.defense!) / 2)), conditional: true, event: 'veteran', activation: upgradeActivation });
        const oldAttributes = new Set((d.attributes || []).map(a => a.toLowerCase()));
        for (const [tag, role, points] of [['blitz', 'fast', 1], ['guard', 'defense', 1], ['fury', 'offense', (d.attack || 0) / 4]] as const) {
          if (veteran.json.attributes?.some(a => a.toLowerCase() === tag) && !oldAttributes.has(tag)) roles.push({ role, points, event: 'veteran', activation: upgradeActivation });
        }
        const armor = (attributes: string[]) => Math.max(0, ...attributes.map(a => Number(/^heavyarmor(\d+)$/i.exec(a)?.[1] || 0)));
        const extraArmor = armor(veteran.json.attributes || []) - armor(d.attributes || []);
        if (extraArmor) roles.push({ role: 'defense', points: extraArmor / 2, event: 'veteran', activation: upgradeActivation });
        if (!upgradeActivation) unmodeled.push('未解析老兵激活条件');
        assumptions.push('升级按实际触发条件计算属性差和后续能力，升级本身不重触发部署');
      }
    }
    const handReplacement = /弃掉(?:全部|所有)手牌|将所有手牌洗入|discardyourhand|shuffle(?:all)?yourhand/.test(value);
    if (handReplacement) {
      const drawn = /抽(\d+)张|draw(\d+)/.exec(value);
      const n = /洗入数量加1/.test(value) ? SCENARIO.hand + 1
        : /等量.*(?:手牌|手中)|(?:抽|draw).*(?:等同|等量|thatmany)/.test(value) ? SCENARIO.hand : Number(drawn?.[1] || drawn?.[2] || 0);
      roles.push({ role: 'supply', points: (n - SCENARIO.hand) / 2 + (n ? 0.2 : 0), event: 'deployment', context: value, cost: 'discard' });
      if (/弃/.test(value)) provides.push({ tag: 'discard-event' });
      assumptions.push('整手替换按出牌后余下三张手牌估算净变化与筛选收益');
      for (const evidence of roles) if (/每弃1张/.test(evidence.context || '')) {
        evidence.context = evidence.context!.replace(/每弃1张/g, '本次整手替换');
        evidence.trigger = evidence.trigger?.replace(/每弃1张/g, '本次整手替换');
        if (evidence.role === 'tempo' || /抽/.test(evidence.context) && !/加入/.test(evidence.context)) evidence.scale = '手牌中每有1张牌';
      }
    }
    const namedDiscard = /弃掉所有@(\d+)@/.exec(value);
    if (namedDiscard) for (const evidence of roles) if (/每弃1张/.test(evidence.context || '')) {
      evidence.context = evidence.context!.replace(/每弃1张/g, '本次弃牌');
      evidence.trigger = evidence.trigger?.replace(/每弃1张/g, '本次弃牌');
      evidence.requires = requirements('@' + namedDiscard[1] + '@');
      evidence.scale = '手牌中每有1张牌';
    }
    if (/双方抽数张牌|抽牌直至.*(\d+)张|drawuntil/.test(value)) {
      const target = Number(/直至.*?(\d+)张/.exec(value)?.[1] || 8), gain = Math.max(0, target - SCENARIO.hand);
      roles.push({ role: 'supply', points: gain / 2, context: value });
      if (/双方/.test(value)) roles.push({ role: 'interaction', points: -Math.max(0, target - SCENARIO.enemyHand) * 0.4, responses: ['control'] });
    }
    // Follow named generated cards with the same interpreter and a finite recursion bound.
    for (let i = 0; i < names.length; i++) {
      const target = byId.get(namedId(names[i]) || '');
      const clause = value.split(/[。.;；]/).find(part => part.includes('@' + i + '@')) || '';
      if (!target) {
        if (!namedIds(names[i]).length && !/[：:。]|无法|获得|本单位|友方|敌方/.test(names[i]) && /加入|洗入|置于|add|put|shuffle/.test(clause)) unmodeled.push('未找到生成牌资料：' + names[i]);
        continue;
      }
      if (!/(?:将|加入|复制|add|put|copy)/.test(value)) continue;
      if (/敌方(?:手牌|卡组|支援阵线)|enemy(?:hand|deck|supportline)/.test(clause) && !/友方卡组/.test(clause)) continue;
      if (!/加入|洗入|置于|add|put|shuffle/.test(clause)) continue;
      const amount = Math.min(8, Number(/(\d+)[个张]@/.exec(clause)?.[1] || 1) * (handReplacement && /每弃1张/.test(clause) ? SCENARIO.hand : 1));
      const reach = /卡组|deck/.test(clause) ? (/顶|top/.test(clause) ? 0.85 : 3 / SCENARIO.remaining)
        : /手牌|手中|hand/.test(clause) ? 0.55 * Math.min(1, SCENARIO.budget / Math.max(1, /使其花费为0/.test(clause) ? 0 : target.json.kredits || 1)) : 1;
      const alternatives = /或|or/.test(clause) ? Math.max(1, (clause.match(/@\d+@/g) || []).length) : 1;
      const factor = amount * reach / alternatives;
      const tags = [...cardTags(target), 'generation-event'];
      provides.push(...tags.map(tag => ({ tag, conditional: true, chance: clamp(reach) })));
      if (path.length >= 3 || path.includes(effectText(raw)) || effectText(target.json.text?.['zh-Hans'] || '') === effectText(raw)) {
        assumptions.push('生成/自复制链在三层或重复效果处截断');
        continue;
      }
      const child = read(target, false, [...path, effectText(raw)]);
      roles.push(...child.roles.map(e => ({ ...e, conditional: true, factor: (e.factor || 1) * factor,
        context: e.context, event: e.event || 'deployment' })));
      unmodeled.push(...child.unmodeled.map(text => names[i] + '：' + text));
      assumptions.push(...child.assumptions);
    }
    if (roles.some(e => e.event === 'death')) provides.push({ tag: 'death-payoff' });
    if (roles.some(e => e.role === 'defense' && e.points > 0 && /总部.*(?:获得|增加).*防御力|修复.*总部/.test(e.context || ''))) provides.push({ tag: 'healing-event' });
    if (roles.some(e => e.role === 'defense' && e.points > 0 && /完全修复/.test(e.context || ''))) provides.push({ tag: 'unit-healing-event' });
    if (unit && roles.some(e => e.event === 'deployment')) provides.push({ tag: 'deployment-event' });
    if (!unit && roles.some(e => ['offense', 'interaction'].includes(e.role) && /伤害|damage/.test(e.context || ''))) provides.push({ tag: 'damage-order' });
    if (roles.some(e => e.target && /步兵|坦克|炮兵|战斗机|轰炸机|空军|陆军|攻击力|防御力|花费|受伤|前线/.test(e.target))) assumptions.push('敌方兵种、数值及状态限制按统一中性目标分布折算，不视为无条件解牌');
    const paidTarget = /选择并弃\d+张(?:单位|空军|反制|喷火)|消灭\d+个友方(?:单位|坦克|步兵)/.exec(value)?.[0];
    if (paidTarget) {
      const needs = requirements(paidTarget);
      for (const evidence of roles) {
        evidence.requires = [...new Set([...(evidence.requires || []), ...needs])];
        evidence.zone ||= /弃/.test(paidTarget) ? 'hand' : 'board';
      }
    }
    const minimumKredits = Number(/指挥点槽数小于(\d+).*无法部署|cannotbedeployedunlessyouhave(\d+)ormorekreditslots/.exec(value)?.slice(1).find(Boolean) || 0);
    for (let i = unmodeled.length - 1; i >= 0; i--) {
      const fragment = unmodeled[i];
      if (/每有|防御力每大于|每比友方多/.test(fragment) && roles.some(e => e.scale?.includes(fragment))) unmodeled.splice(i, 1);
      else if (/处于隐蔽状态下友方回合每结束一次/.test(fragment) && roles.some(e => e.context?.includes(fragment))) {
        assumptions.push('隐蔽期间的回合累计按揭示前有限活跃窗口估算'); unmodeled.splice(i, 1);
      }
    }
    const result = { roles, provides, cannotAttack, cannotAttackHQ, hqAttackDelay, minimumKredits,
      unmodeled: [...new Set(unmodeled)], assumptions: [...new Set(assumptions)] };
    if (!path.length) cache.set(cacheKey, result);
    return structuredClone(result);
  };
}

/** The same identities are used for printed cards and generated descendants. */
function cardTags(card: KardsCardRecord) {
  const d = card.json, type = d.type?.toLowerCase() || '', nation = d.faction?.toLowerCase();
  const tags = ['card:' + card.cardId, type, ...(d.attributes || []).map(a => a.toLowerCase().replace(/\d+$/, ''))];
  if (nation) tags.push('nation:' + nation);
  if (nation === 'neutral') tags.push('neutral');
  for (const subtype of subtypeData.subtypes) if (subtype.cardIds.includes(card.cardId)) tags.push(subtype.id);
  if (d.exile) tags.push('exile');
  if (d.attributes?.some(a => /^intel/i.test(a))) tags.push('intel');
  if (d.attributes?.some(a => /^(?:becomesveteran|veteranof):/i.test(a))) tags.push('veteran');
  if (['infantry', 'tank', 'artillery', 'fighter', 'bomber'].includes(type)) {
    tags.push('unit');
    if (nation) tags.push('unit:' + nation, type + ':' + nation);
    const group = ['infantry', 'tank', 'artillery'].includes(type) ? 'land' : 'air';
    tags.push(group); if (nation) tags.push(group + ':' + nation);
    if (['infantry', 'tank'].includes(type)) tags.push('infantry-or-tank');
    for (const [, id] of NATIONS) if (nation !== id) tags.push('non-' + id + '-unit');
    if (type !== 'tank') tags.push('non-tank-unit');
    if (d.kredits! <= 3) tags.push('low-cost-unit');
    if (d.attack! >= 4) tags.push('high-attack-unit');
    if (d.attack! >= 4 && type === 'tank') tags.push('high-attack-tank');
    if (d.operationCost! >= 2) tags.push('high-operation');
  }
  return [...new Set(tags)];
}

function profile(card: KardsCardRecord, copies: number, abilities: CardAbilities): Profile | null {
  const d = card.json, type = d.type?.toLowerCase() || '', nation = d.faction?.toLowerCase();
  const unit = ['infantry', 'tank', 'artillery', 'fighter', 'bomber'].includes(type);
  if ((!unit && !['order', 'countermeasure'].includes(type)) || !Number.isInteger(d.kredits) || !finiteNonnegative(d.kredits)
      || (unit && ![d.attack, d.defense, d.operationCost].every(finiteNonnegative))) return null;
  const attrs = (d.attributes || []).map(a => a.toLowerCase()), guard = attrs.includes('guard');
  const attack = unit ? d.attack! : 0, operation = unit ? d.operationCost! : 0;
  const cannotAttack = abilities.cannotAttack;
  const roles: Evidence[] = [], provides: Support[] = cardTags(card).map(tag => ({ tag }));
  const tags = (...values: string[]) => provides.push(...values.map(tag => ({ tag })));
  if (abilities.cannotAttackHQ) tags('cannot-attack-hq');
  if (unit) {
    roles.push({ role: 'board', points: 1 });
    if (attack > 0 && !cannotAttack) {
      tags('operating-unit'); if (nation === 'germany') tags('german-operating-unit');
      if (attrs.includes('blitz') || ['fighter', 'bomber', 'artillery'].includes(type)) roles.push({ role: 'fast', points: 1 });
    }
    const armor = Math.max(0, ...attrs.map(a => Number(/^heavyarmor(\d+)$/.exec(a)?.[1] || 0)));
    const protection = (guard ? 1 : 0) + Math.min(armor, 2) * 0.25;
    if (protection) roles.push({ role: 'defense', points: protection });
  }
  roles.push(...abilities.roles);
  provides.push(...abilities.provides);
  return { id: card.cardId, copies, cost: Math.max(d.kredits!, abilities.minimumKredits), unit, guard, defense: unit ? d.defense! : 0, roles, provides,
    attack, operation, canOperate: unit && attack > 0 && !cannotAttack,
    pressure: !unit || cannotAttack || abilities.cannotAttackHQ ? 0
      : Math.min(attack, 8) / (3 * (1 + operation / 2)) * Math.min(1, 4 / Math.max(1, d.kredits!))
        * (attrs.includes('fury') ? 1.5 : 1) * (abilities.hqAttackDelay ? 0.75 : 1) };
}

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1, limit = Math.min(k, n - k); i <= limit; i++) result *= (n - i + 1) / i;
  return result;
}

/** Exact unordered sampling with overlapping support groups, not independent probabilities. */
function probabilityAllGroups(members: { mask: number; chance: number }[][], required: number, seen: number) {
  let ways = new Map<number, number>([[0, 1]]);
  const width = required + 1;
  for (const outcomes of members) {
    const next = new Map<number, number>(ways);
    for (const [state, weight] of ways) {
      const drawn = Math.floor(state / width), covered = state % width;
      if (drawn === seen) continue;
      for (const { mask, chance } of outcomes) {
        const key = (drawn + 1) * width + (covered | mask);
        next.set(key, (next.get(key) || 0) + weight * chance);
      }
    }
    ways = next;
  }
  return clamp((ways.get(seen * width + required) || 0) / choose(members.length, seen));
}

/** Without-replacement draw probability with contextual effectiveness per physical card. */
function availableChance(rates: number[], seen: number, minimum = 1) {
  const width = minimum + 1, ways = Array<number>((seen + 1) * width).fill(0);
  ways[0] = 1;
  let count = 0;
  for (const raw of rates) {
    const rate = clamp(raw);
    for (let drawn = Math.min(count, seen - 1); drawn >= 0; drawn--) for (let hits = minimum; hits >= 0; hits--) {
      const value = ways[drawn * width + hits];
      ways[(drawn + 1) * width + hits] += value * (1 - rate);
      ways[(drawn + 1) * width + Math.min(minimum, hits + 1)] += value * rate;
    }
    count++;
  }
  return clamp(ways[seen * width + minimum] / choose(rates.length, seen));
}

export function analyzeDeckAbilities(entries: ReadonlyMap<string, number>, cardsById: ReadonlyMap<string, KardsCardRecord>): DeckAbilityResult {
  const selected = [...entries].filter(([, count]) => count !== 0);
  if (selected.some(([, count]) => !Number.isInteger(count) || count < 0)) return { status: 'unsupported', axes: [] };
  if (selected.reduce((n, [, count]) => n + count, 0) !== 39) return { status: 'incomplete', axes: [] };
  const profiles: Profile[] = [];
  const readAbilities = createCardAbilityReader(cardsById.values());
  for (const [id, copies] of selected) {
    const card = cardsById.get(id), p = card && profile(card, copies, readAbilities(card));
    if (!p || profiles.some(other => other.id === p.id)) return { status: 'unsupported', axes: [] };
    profiles.push(p);
  }
  profiles.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const randomUnits = [...cardsById.values()].filter(c => !c.reserved && ['infantry', 'tank', 'artillery', 'fighter', 'bomber'].includes(c.json.type || '')
    && !c.json.attributes?.some(a => /^onlyspawnable|^veteranof:/i.test(a)));
  const supportCache = new Map<string, number>();
  const tagEntries = (p: Profile, tag: string) => p.provides.filter(t => (tag.startsWith('any:') ? tag.slice(4).split('|') : [tag]).includes(t.tag));
  const hasTag = (p: Profile, tag: string) => tagEntries(p, tag).length > 0;
  const unitCount = profiles.reduce((n, p) => n + (p.unit ? p.copies : 0), 0);
  const boardPresence = Math.min(1, unitCount * SCENARIO.seen / 39 * 0.65 / 2);
  const buffDamage = Math.min(3, profiles.reduce((n, p) => n + p.copies * SCENARIO.seen / 39 * affordable(p, 5)
    * p.roles.filter(e => e.role === 'offense' && e.points > 0 && e.event !== 'hq-threshold' && /获得\+\d+(?:\+\d+|攻击力)/.test(e.context || ''))
      .reduce((sum, e) => sum + e.points * 0.65 * support(p, e), 0), 0));
  const damageTrial = (distribution: number[], outcomes: { damage: number; chance: number }[]) => {
    const next = [0, 0, 0, 0];
    for (let i = 0; i <= 3; i++) for (const outcome of outcomes) next[Math.min(3, i + Math.max(0, Math.round(outcome.damage)))] += distribution[i] * outcome.chance;
    return next;
  };
  const attacks = profiles.filter(p => p.unit).map(p => ({
    damage: p.pressure > 0 ? p.attack + buffDamage : 0,
    chance: unitCount ? p.copies / unitCount * boardPresence * 0.55 * affordable(p, 6) : 0,
  }));
  attacks.push({ damage: 0, chance: 1 - attacks.reduce((n, o) => n + o.chance, 0) });
  const burn = profiles.flatMap(p => p.roles.filter(e => e.role === 'offense' && e.points > 0 && e.event !== 'hq-threshold'
    && /(?:对.+(?:总部|目标).*造成|^造成\d+点|deal.*damage)/.test(e.context || '')).map(e => ({
    damage: e.points * 3, chance: p.copies / 39 * affordable(p, 6) * (e.event === 'death' ? 0 : 0.7) * support(p, e),
  })));
  const burnTotal = burn.reduce((n, o) => n + o.chance, 0);
  for (const outcome of burn) outcome.chance /= Math.max(1, burnTotal);
  burn.push({ damage: 0, chance: Math.max(0, 1 - burnTotal) });
  const deaths = profiles.flatMap(p => p.roles.filter(e => e.role === 'offense' && e.points > 0 && (e.event === 'death' || e.event === 'counter')
    && /敌方总部|其总部|enemyhq/.test(e.context || '')).map(e => ({ damage: e.points * 3, chance: p.copies / 39 * 0.55 * support(p, e) })));
  const deathTotal = deaths.reduce((n, o) => n + o.chance, 0);
  for (const outcome of deaths) outcome.chance /= Math.max(1, deathTotal);
  deaths.push({ damage: 0, chance: Math.max(0, 1 - deathTotal) });
  // Each side's turn has one threshold check, reset next turn. Damage beyond 3
  // increases reliability, never the number of triggers in that turn.
  const hqTriggerCount = SCENARIO.activeTurns * (
    damageTrial(damageTrial(damageTrial([1, 0, 0, 0], attacks), attacks), burn)[3]
    + damageTrial(damageTrial([1, 0, 0, 0], deaths), deaths)[3]);
  const density = (p: Profile, tags: string[], seen = 8) => profiles.reduce((n, q) =>
    n + Math.max(0, q.copies - (q === p ? 1 : 0)) * (tags.every(tag => hasTag(q, tag)) ? 1 : 0), 0) / 38 * seen;
  function support(p: Profile, e: Evidence) {
    const tags = [...new Set(e.requires || [])].sort();
    if (!tags.length) return 1;
    const key = p.id + ':' + (e.zone || 'visible') + ':' + tags.join('|');
    if (!supportCache.has(key)) {
      // Remove this physical payoff copy: it must not also supply its own external support.
      const members = profiles.flatMap(q => {
        const rates = tags.map(tag => Math.max(0, ...tagEntries(q, tag).map(t => t.chance ?? (t.conditional ? 0.65 : 1))));
        // Tags generated by the same card share an occurrence instead of pretending
        // their availability is independent.
        const limits = [...new Set([0, ...rates, 1])].sort((a, b) => a - b);
        const outcomes = limits.slice(1).map((limit, i) => ({
          mask: rates.reduce((mask, rate, bit) => mask | (rate >= limit ? 1 << bit : 0), 0),
          chance: limit - limits[i],
        }));
        return Array.from({ length: q.copies - (q === p ? 1 : 0) }, () => outcomes);
      });
      supportCache.set(key, probabilityAllGroups(members, (1 << tags.length) - 1,
        e.zone === 'deck' ? SCENARIO.remaining : e.zone === 'hand' ? SCENARIO.hand : e.zone === 'board' ? 2 : 8));
    }
    return supportCache.get(key)!;
  }
  const nationCounts = new Map<string, number>();
  for (const p of profiles) for (const t of p.provides.filter(t => !t.conditional && t.tag.startsWith('nation:') && t.tag !== 'nation:neutral')) {
    nationCounts.set(t.tag.slice(7), (nationCounts.get(t.tag.slice(7)) || 0) + p.copies);
  }
  const mainNation = [...nationCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const compare = (value: number, operator: string, limit: number) => operator === '不大于' ? value <= limit : operator === '不小于' ? value >= limit
    : operator === '小于' ? value < limit : operator === '大于' ? value > limit : value === limit;
  const binomial = (rate: number, operator: string, limit: number) => [0, 1, 2, 3, 4].reduce((n, hits) => n
    + (compare(hits, operator, limit) ? choose(4, hits) * rate ** hits * (1 - rate) ** (4 - hits) : 0), 0);
  const poissonAtLeast = (mean: number, minimum: number) => {
    let term = Math.exp(-mean), below = 0;
    for (let i = 0; i < minimum; i++) { below += term; term *= mean / (i + 1); }
    return clamp(1 - below);
  };
  function conditionProbability(p: Profile, predicate: string, e: Evidence): number {
    if (predicate.startsWith('NOT:')) return conditionKind(predicate.slice(4)) ? 1 - conditionProbability(p, predicate.slice(4), e) : 0;
    const kind = conditionKind(predicate);
    if (!kind) return 0; // Unknown conditions stay in the audit, never receive a guessed bonus.
    const available = (tag: string, zone: Evidence['zone'] = 'board') => support(p, { role: 'board', points: 1, requires: [tag], zone });
    const printed = (tag: string) => p.provides.some(t => t.tag === tag && !t.conditional);
    if (kind === 'performed') return /可能/.test(predicate) ? 0.75 : 1;
    if (kind === 'outside-deck') return Math.min(0.6, density(p, ['deck-generation-event'], 3) * 3 / SCENARIO.remaining);
    if (kind === 'turn-order') return 0.5;
    if (kind === 'zone') return /手中/.test(predicate) ? 0.45 : 0.55;
    if (kind === 'history') {
      if (/没有被攻击/.test(predicate)) return 0.65;
      if (/敌方没有部署单位/.test(predicate)) return 0.4;
      if (/没有攻击/.test(predicate)) return 0.35;
      if (/消灭过/.test(predicate)) return p.canOperate ? p.attack / (p.attack + 3) * 0.65 : 0;
      if (/攻击过/.test(predicate)) return available('operating-unit') * 0.65;
      if (/唯一部署/.test(predicate)) return 1 - clamp(density(p, ['unit'], SCENARIO.hand) * 0.35);
      return available(/指令/.test(predicate) ? 'order' : 'unit', 'hand') * 0.65;
    }
    if (kind === 'ally') {
      const nation = NATIONS.find(([pattern]) => pattern.test(predicate))?.[1];
      return Number(!!nation && nation !== mainNation && nationCounts.has(nation));
    }
    if (kind === 'top-naval') return profiles.reduce((n, q) => n + Math.max(0, q.copies - (q === p ? 1 : 0))
      * Math.max(0, ...tagEntries(q, 'naval').map(t => t.chance ?? (t.conditional ? 0.65 : 1))), 0) / 38;
    if (kind === 'position') return Math.min(0.9, 0.55 + available('leftmost-event', 'hand') * 0.3);
    if (kind === 'first') return /本局/.test(predicate) ? 1 / (1 + density(p, ['card:' + p.id]) * 0.65) : 0.9;
    if (kind === 'board') {
      if (/没有敌方空军/.test(predicate)) return (1 - SCENARIO.enemyTypes.fighter - SCENARIO.enemyTypes.bomber) ** 2;
      if (/有敌方空军/.test(predicate)) return 1 - (1 - SCENARIO.enemyTypes.fighter - SCENARIO.enemyTypes.bomber) ** 2;
      if (/没有敌方单位|前线没有单位/.test(predicate)) return 0.35;
      if (/唯一友方单位/.test(predicate)) return 0.25 + 0.75 * (1 - clamp(density(p, ['unit'], 1) * 0.7)) ** 2;
      if (/相邻单位/.test(predicate)) return /没有/.test(predicate) ? 0.45 : 0.55;
      if (/本单位复制数/.test(predicate)) return poissonAtLeast(Math.max(0, p.copies - 1) * 8 / 38 + density(p, ['lost-slot-event']) * 0.65, 3);
      const count = /单位数(不小于|不大于|大于|小于|为)(\d+)/.exec(predicate);
      if (count) {
        const tag = /钳击/.test(predicate) ? 'pincer' : 'unit';
        const mean = /敌方单位数/.test(predicate) ? SCENARIO.enemyUnits : Math.min(4, density(p, [tag], 2) + Number(p.unit));
        return binomial(clamp(mean / 4), count[1], Number(count[2]));
      }
      if (/友方单位数大于敌方单位/.test(predicate)) return binomial(clamp((density(p, ['unit'], 2) + Number(p.unit)) / 4), '大于', 2);
      if (/前线有友方/.test(predicate)) {
        const nation = NATIONS.find(([pattern]) => pattern.test(predicate))?.[1];
        return available(nation ? 'unit:' + nation : 'unit') * 0.55;
      }
      return /前线/.test(predicate) ? 0.55 : /支援阵线/.test(predicate) ? 0.5 : 0;
    }
    if (kind === 'stats') {
      const threshold = /(攻击力|防御力)(不大于|不小于|小于|大于|为)(\d+)/.exec(predicate);
      if (threshold && p.unit && /本单位|^攻击力|^防御力/.test(predicate)) {
        const role = threshold[1] === '攻击力' ? 'offense' : 'defense', base = role === 'offense' ? p.attack : p.defense;
        const growth = p.roles.filter(r => r !== e && r.role === role && r.points > 0 && !r.activation && !r.conditions?.length && /获得\+\d+|具有\+\d+/.test(r.context || ''))
          .reduce((n, r) => n + r.points * 2 * contextWeight(p, r) * support(p, r), 0);
        // A bounded Poisson approximation preserves rare threshold crossings;
        // testing only the mean would make a four-trigger upgrade impossible or certain.
        let probability = Math.exp(-growth), result = 0;
        for (let gain = 0; gain <= 24; gain++) {
          if (compare(base + gain, threshold[2], Number(threshold[3]))) result += probability;
          probability *= growth / (gain + 1);
        }
        return clamp(result);
      }
      if (threshold) return enemyTargetChance(predicate, false);
      if (/唯一最高/.test(predicate)) return 0.45;
      return 0.55;
    }
    if (kind === 'combat-result') return /存活/.test(predicate) ? 0.65 : 0.55;
    if (kind === 'keyword') {
      if (/处于隐蔽.*回合/.test(predicate)) return 0.65 ** Number(/\d+/.exec(predicate)?.[0] || 2);
      if (/本单位不是海军/.test(predicate)) return Number(!printed('naval'));
      const named = [...predicate.matchAll(/card:([\w-]+)/g)].map(m => 'card:' + m[1]);
      const nation = NATIONS.find(([pattern]) => pattern.test(predicate))?.[1];
      const keyword = /被守护/.test(predicate) ? 'guard' : /烟幕/.test(predicate) ? 'smokescreen' : /闪击/.test(predicate) ? 'blitz'
        : /伏击/.test(predicate) ? 'ambush' : /冲击/.test(predicate) ? 'shock' : /老兵/.test(predicate) ? 'veteran'
        : named.length ? named.length === 1 ? named[0] : 'any:' + named.join('|')
        : nation ? /非/.test(predicate) ? 'non-' + nation + '-unit' : /单位/.test(predicate) ? 'unit:' + nation : 'nation:' + nation
        : [...GROUPS.slice(12), ...GROUPS.slice(0, 12)].find(([pattern]) => pattern.test(predicate))?.[1];
      if (/^是友方(?:单位)?$/.test(predicate)) return available('unit');
      if (/^是敌方(?:单位)?$/.test(predicate)) return 1;
      if (/^(?:本单位|具有)/.test(predicate) && keyword) return printed(keyword) ? 1 : available(keyword) * 0.35;
      if (/是单位/.test(predicate)) return 0.8;
      if (/^是(?:坦克|步兵|炮兵|空军)/.test(predicate)) return enemyTargetChance(predicate, false);
      const probability = keyword ? /敌方/.test(predicate) ? 1 - 0.75 ** SCENARIO.enemyUnits
        : /友方|^是.*牌$/.test(predicate) ? available(keyword, /^是.*牌$/.test(predicate) ? 'hand' : 'board')
        : e.role === 'interaction' ? 0.25 : available(keyword) : 0;
      return /没有|不是|不具有/.test(predicate) ? 1 - probability : probability;
    }
    if (kind === 'played') {
      const tag = /指令/.test(predicate) ? 'order' : 'weather';
      return /两者都有/.test(predicate) ? 0.3 : (e.requires?.includes(tag) ? 1 : available(tag, 'hand')) * 0.8;
    }
    if (kind === 'time') return 0.5;
    if (kind === 'return') return available('replay-event');
    if (kind === 'state') return /被压制/.test(predicate) ? 0.25 : /明牌|情报/.test(predicate) ? 0.4 : 0.55;
    if (/没有手牌/.test(predicate)) {
      const discard = p.roles.filter(r => r.cost === 'discard' && !r.conditions?.length).reduce((n, r) => n - r.points * 2, 0);
      return Math.exp(-Math.max(0, SCENARIO.hand - discard));
    }
    const limit = /(手牌.*|指挥点槽数|花费)(不大于|不小于|小于|大于|为)(\d+)/.exec(predicate);
    if (limit) {
      const mean = /指挥点/.test(limit[1]) ? SCENARIO.budget : /敌方/.test(predicate) ? SCENARIO.enemyHand : SCENARIO.hand;
      return [Math.max(0, mean - 2), mean, mean + 2].filter(n => compare(n, limit[2], Number(limit[3]))).length / 3;
    }
    return /手牌|手中/.test(predicate) ? 0.6 : 0.5;
  }
  function contextWeight(p: Profile, e: Evidence) {
    if (e.event === 'veteran') {
      const activation = e.activation && { role: 'board' as const, points: 1, ...e.activation };
      return activation ? Math.min(1, contextWeight(p, activation) * support(p, activation))
        * contextWeight(p, { ...e, event: e.veteranEvent || 'passive', activation: undefined }) : 0;
    }
    const text = e.context || '';
    const trigger = e.trigger ?? text;
    let rate = e.event === 'hq-threshold' ? hqTriggerCount
      : e.event === 'death' ? Math.min(0.9, 0.55 + density(p, ['death-event']) * 0.12)
      : e.event === 'counter' ? 0.7 : e.event === 'reveal' ? 0.65 : e.event === 'pincer' ? 0.7 : 1;
    if (/回合(?:开始|结束)时|回合每结束一次|atthe(?:start|end).*turn/.test(trigger)) rate *= SCENARIO.activeTurns;
    else if (/总部受到伤害(?:时|后)|本单位受到.*伤害(?:时|后)/.test(trigger)) rate *= 0.65 + Math.min(1, density(p, ['self-damage-event'])) * 0.4;
    else if (/(?:攻击|行动)(?:时|后)|after.*(?:attack|operat)/.test(trigger)) rate *= p.canOperate ? Math.min(1.5, 2 / Math.max(1, p.operation)) : 0.65;
    else if (/(?:使用|部署).*(?:时|后)|每次.*(?:使用|部署)|wheneveryou(?:play|deploy)/.test(trigger)) {
      const tags = /指令|order/.test(trigger) ? ['order'] : e.requires?.length ? e.requires : /单位|unit/.test(trigger) ? ['unit'] : [];
      rate *= Math.min(4, density(p, tags) * 0.65 * SCENARIO.activeTurns / 2);
    } else if (/每抽|抽.*(?:时|后)|whenever.*draw/.test(trigger)) {
      rate *= /敌方|enemy/.test(trigger) ? SCENARIO.activeTurns * 1.2 : SCENARIO.activeTurns;
    } else if (/每弃|弃.*(?:时|后)|whenever.*discard/.test(trigger)) {
      rate *= Math.min(3, density(p, ['discard-event']) * 0.75);
    } else if (/每消灭|单位.*被消灭(?:时|后)/.test(trigger) && e.event !== 'death') rate *= 1.2;
    if (/失去\d+个指挥点槽时/.test(trigger)) rate *= Math.min(3, density(p, ['lost-slot-event']) * 0.65);
    if (/被完全修复时/.test(trigger)) rate *= support(p, { role: 'board', points: 1, requires: ['unit-healing-event'] }) * 0.55;
    const ordinal = /第([一二三四1234])(?:回合|次)|累计.*?(\d+|三)次|累计部署(\d+)张|消灭至少(\d+)个/.exec(trigger);
    if (ordinal) {
      const number = (s: string) => ({ 一: 1, 二: 2, 三: 3, 四: 4 }[s] || Number(s));
      const threshold = number(ordinal.slice(1).find(Boolean)!);
      const mean = /场上.*回合/.test(text) ? SCENARIO.activeTurns : /指挥点槽/.test(text) ? density(p, ['ramp-event']) * 0.65
        : /消灭/.test(text) ? 1.2 : /行动/.test(text) ? density(p, ['operating-unit']) * 0.65
        : density(p, e.requires || ['unit']) * 0.65;
      rate *= poissonAtLeast(mean, threshold);
    }
    if (/下个(?:友方)?回合|nextturn/.test(text)) rate *= 0.8;
    if (/在前线时|移至前线时/.test(text)) rate *= 0.55;
    if (/本回合/.test(text) && /每|时|后/.test(text)) rate = Math.min(rate, 1);
    if (/每回合.*(?:第一|第1|至多1)|onceperturn/.test(text)) rate = Math.min(rate, SCENARIO.activeTurns);
    for (const condition of e.conditions || []) rate *= conditionProbability(p, condition, e);
    if (e.scale) {
      const scale = e.scale;
      let count = 1;
      if (/每有一种|不同国家|非坦克类型/.test(scale)) {
        const groups = /国家/.test(scale) ? NATIONS.map(([, id]) => 'nation:' + id) : ['infantry', 'tank', 'artillery', 'fighter', 'bomber'];
        count = groups.reduce((n, tag) => n + 1 - Math.pow(1 - clamp(density(p, [tag], 1)), 2), 0);
      } else if (/每有10张牌/.test(scale)) count = SCENARIO.remaining / 10;
      else if (/手牌/.test(scale)) count = /敌方/.test(scale) ? SCENARIO.enemyHand : e.requires?.length ? density(p, e.requires, SCENARIO.hand) : SCENARIO.hand;
      else if (/每有.*敌方|敌方单位/.test(scale)) count = SCENARIO.enemyUnits;
      else if (/行动.*花费|花费过.*指挥点/.test(scale)) count = 2;
      else if (/此前每使用/.test(scale)) count = Math.min(3, density(p, e.requires || []) * 0.6);
      else if (/总部防御力每大于/.test(scale)) count = 1.2;
      else if (/每比友方多.*指挥点槽/.test(scale)) count = 0.6;
      else if (scale.includes('@') && e.requires?.some(tag => /^(?:any:)?card:/.test(tag))) {
        count = support(p, e) ? 2 * density(p, e.requires, 1) / support(p, e) : 0;
      }
      else if (/对战词条/.test(scale)) count = profiles.reduce((n, q) => n + q.copies * Math.min(3, q.provides.filter(t => ['guard', 'blitz', 'fury', 'ambush', 'shock', 'smokescreen'].includes(t.tag)).length), 0) / 39;
      else if (/相邻/.test(scale)) count = 1;
      else if (/受伤/.test(scale)) count = 1;
      else {
        const tag = [...GROUPS.slice(12), ...GROUPS.slice(0, 12)].find(([pattern]) => pattern.test(scale))?.[1] || 'unit';
        count = 2 * clamp(density(p, [tag], 1));
        if (p.provides.some(t => t.tag === tag) && !/其他/.test(scale)) count += 1;
      }
      rate *= Math.min(4, Math.max(0, count));
    }
    if (AREA.test(text) && !/总部|hq|随机分配|distribut|每有|每具有/.test(text)) {
      if (['offense', 'defense'].includes(e.role)) rate *= Math.min(3, 2 * clamp(density(p, e.requires || ['unit'], 1)));
      else if (e.role === 'interaction' && e.responses?.includes('area')) rate *= SCENARIO.enemyUnits;
    }
    if (e.mechanic === 'next-copy') rate = Math.min(1, rate);
    if (e.target) rate *= enemyTargetChance(e.target, !!e.responses?.includes('area'));
    return Math.min(6, Math.max(0, rate * (e.factor ?? 1)));
  }
  const expected = (value: (p: Profile) => number) => profiles.reduce((n, p) => n + p.copies * SCENARIO.seen / 39 * value(p), 0);
  const weights = new Map<Evidence, number>();
  for (const p of profiles) for (const e of p.roles) weights.set(e, contextWeight(p, e) * support(p, e));
  const value = (p: Profile, e: Evidence) => {
    if (e.mechanic === 'random-transform') {
      const pool = e.transform?.sameCost ? randomUnits.filter(c => c.json.kredits === p.cost) : randomUnits;
      if (!pool.length) return 0;
      const atk = pool.reduce((n, c) => n + (c.json.attack || 0) / (1 + (c.json.operationCost || 0) / 2), 0) / pool.length;
      const hp = pool.reduce((n, c) => n + (c.json.defense || 0), 0) / pool.length;
      const own = e.transform?.self;
      const oldAtk = own ? p.attack / (1 + p.operation / 2) : 2, oldHp = own ? p.defense : 3;
      const change = e.role === 'offense' ? (atk - oldAtk) / 3 : (hp - oldHp) / 4;
      return change * (e.transform?.enemy ? -1 : 1) * (own ? 1 : 0.55) * weights.get(e)!;
    }
    if (e.mechanic === 'next-copy' || e.mechanic === 'mass-copy') {
      const units = profiles.filter(q => q.unit).map(q => ({ q, count: q.copies - (q === p ? 1 : 0) })).filter(v => v.count > 0);
      const total = units.reduce((n, v) => n + v.count, 0);
      if (!total) return 0;
      const stat = (q: Profile) => e.role === 'offense' ? q.attack / (1 + q.operation / 2) : q.defense / 2;
      const average = units.reduce((n, v) => n + v.count * stat(v.q), 0) / total;
      let target = average, before = stat(p);
      if (e.mechanic === 'mass-copy') {
        const sorted = [...units].sort((a, b) => stat(a.q) - stat(b.q));
        let cdf = 0; target = 0; before = average;
        for (const { q, count } of sorted) {
          const next = cdf + count / total;
          target += (next ** 2 - cdf ** 2) * stat(q); cdf = next;
        }
      }
      return (target - before) / 2 * weights.get(e)!;
    }
    if (e.mechanic === 'reset-stats') {
      const units = profiles.filter(q => q.unit), count = units.reduce((n, q) => n + q.copies, 0);
      const change = count ? units.reduce((n, q) => n + q.copies * (e.role === 'offense'
        ? 2 / (1 + 2 / 2) - q.attack / (1 + q.operation / 2) : (2 - q.defense) / 2), 0) / count : 0;
      return change * weights.get(e)!;
    }
    if (e.mechanic === 'defense-damage') {
      const units = profiles.filter(q => q.unit && q.provides.some(t => t.tag === 'land')), total = units.reduce((n, q) => n + q.copies, 0);
      return (total ? units.reduce((n, q) => n + q.copies * (q.defense - q.attack), 0) / total / 3 : 0) * weights.get(e)!;
    }
    if (e.mechanic === 'attack-operation-swap') {
      const before = p.attack / (1 + p.operation / 2), after = p.operation / (1 + p.attack / 2);
      return (after - before) / 2 * weights.get(e)!;
    }
    if (e.mechanic === 'ignore-hq') return density(p, ['cannot-attack-hq'], 2) * 0.7 * weights.get(e)!;
    if (e.mechanic?.startsWith('retrigger-')) return 0;
    if (!e.economy) return e.points * weights.get(e)!;
    const econ = e.economy;
    let amount = econ.amount;
    if (econ.kind === 'set-cost') {
      const eligible = profiles.filter(q => !econ.scope.length || econ.scope.every(tag => q.provides.some(t => t.tag === tag)));
      const total = eligible.reduce((n, q) => n + q.copies, 0);
      amount = econ.enemy ? econ.amount - 3 : econ.self ? p.cost - econ.amount
        : total ? eligible.reduce((n, q) => n + q.copies * (q.cost - econ.amount), 0) / total : 0;
    }
    const enemyShare = econ.scope.some(tag => /order|countermeasure/.test(tag)) ? 0.4 : econ.scope.some(tag => /air|fighter|bomber/.test(tag)) ? 0.2 : 0.6;
    const targets = econ.self ? 1 : econ.kind === 'discount' || econ.kind === 'set-cost'
      ? econ.enemy ? econ.all ? SCENARIO.enemyHand * enemyShare : 1 : Math.min(econ.all ? 3 : 1, density(p, econ.scope, SCENARIO.hand)) : 1;
    return amount / 3 * (econ.kind === 'slots' ? 1.5 : 1) * targets * weights.get(e)!;
  };
  const totals = new Map<Profile, Map<Role, number>>();
  function supported(p: Profile, role: Role) {
    if (!totals.has(p)) totals.set(p, new Map());
    const cache = totals.get(p)!;
    if (!cache.has(role)) {
      let sum = 0;
      const choices = new Map<number, Map<number, number>>();
      for (const e of p.roles.filter(e => e.role === role)) {
        const points = value(p, e);
        if (e.choice) {
          if (!choices.has(e.choice)) choices.set(e.choice, new Map());
          const options = choices.get(e.choice)!;
          options.set(e.option || 0, (options.get(e.option || 0) || 0) + points);
        }
        else sum += points;
      }
      // Retriggers borrow the actual payloads in this deck, never a generic all-axis bonus.
      for (const trigger of p.roles.filter(e => e.mechanic?.startsWith('retrigger-'))) {
        const event = trigger.mechanic === 'retrigger-death' ? 'death' : 'deployment';
        for (const q of profiles.filter(q => q.unit)) for (const payload of q.roles.filter(e => e.role === role && e.event === event && !e.mechanic)) {
          const targetCount = Math.max(0, q.copies - (q === p ? 1 : 0)) / 38 * (/所有|两次/.test(trigger.context || '') ? 2 : 1);
          const forced = { ...payload, event: 'deployment' };
          sum += payload.points * contextWeight(q, forced) * support(q, payload) * targetCount * weights.get(trigger)!;
        }
      }
      cache.set(role, sum + [...choices.values()].reduce((n, options) => n + Math.max(...options.values()), 0));
    }
    return cache.get(role)!;
  }
  const ramp = Math.max(-2, Math.min(3, expected(p => affordable(p, 4) * p.roles.filter(e => e.economy?.kind === 'slots' && !e.economy.enemy).reduce((n, e) => n + e.economy!.amount * weights.get(e)!, 0))));
  const effectiveCost = (p: Profile) => {
    let discount = 0;
    for (const source of profiles) for (const e of source.roles) {
      const econ = e.economy;
      if (!econ || econ.enemy || !['discount', 'set-cost'].includes(econ.kind)) continue;
      if (econ.self && source !== p || !econ.self && econ.scope.some(tag => !p.provides.some(t => t.tag === tag))) continue;
      const amount = econ.kind === 'set-cost' ? p.cost - econ.amount : econ.amount;
      const availability = econ.self ? 1 : clamp(source.copies * 8 / 38) * affordable(source, 4) * 0.65;
      discount += amount * weights.get(e)! * availability;
    }
    return Math.max(0, p.cost - discount);
  };
  const costs = new Map(profiles.map(p => [p, effectiveCost(p)]));
  const fits = (p: Profile, budget: number) => clamp(budget / Math.max(1, costs.get(p)!));
  const chance = (evaluate: (p: Profile) => number, seen = 9, minimum = 1) => availableChance(profiles.flatMap(p => Array<number>(p.copies).fill(evaluate(p))), seen, minimum);
  const response = (p: Profile, kinds: string[]) => clamp(p.roles.filter(e => e.role === 'interaction' && e.points > 0 && e.responses?.some(kind => kinds.includes(kind)))
    .reduce((n, e) => n + weights.get(e)!, 0));
  const board = (p: Profile) => p.unit ? Number(p.canOperate || p.guard) : clamp(supported(p, 'board'));
  const early = (p: Profile) => costs.get(p)! <= 2 ? board(p) : 0;
  const middle = (p: Profile) => costs.get(p)! <= 3 + Math.max(0, ramp) ? board(p) : 0;
  const defender = (p: Profile) => costs.get(p)! <= 3 ? Math.max(Number(p.unit && (p.guard || p.canOperate && p.defense >= 2)), response(p, ['single', 'delay', 'area'])) : 0;
  const offense = expected(p => fits(p, 5 + ramp) * supported(p, 'offense'));
  const printedPressure = profiles.reduce((n, p) => n + p.copies * p.pressure * fits(p, 6 + ramp), 0);
  const tempo = expected(p => affordable(p, 4) * supported(p, 'tempo'));
  const supply = expected(p => fits(p, 5 + ramp) * supported(p, 'supply'));
  const control = expected(p => fits(p, 6 + ramp) * p.roles.filter(e => e.responses?.includes('control')).reduce((n, e) => n + value(p, e), 0));
  const controlCost = expected(p => fits(p, 6 + ramp) * p.roles.filter(e => e.responses?.includes('control')).reduce((n, e) => n + Math.min(0, value(p, e)), 0));
  const defenseBurden = Math.min(0, expected(p => fits(p, 6 + ramp) * supported(p, 'defense')));
  const scores = [
    (0.4 * chance(early, 5) + 0.2 * chance(early, 5, 2) + 0.4 * chance(middle, 9, 2)) * Math.max(0, 1 + Math.min(0, tempo) * 0.1)
      + 0.08 * capacity(tempo, 2) * chance(p => board(p) * fits(p, 6 + ramp)),
    0.55 * capacity(printedPressure + offense * 4, 18) + 0.2 * chance(p => fits(p, 4 + ramp) * clamp(supported(p, 'fast')))
      + 0.25 * capacity(offense, 1.5),
    (0.35 * chance(p => fits(p, 3) * response(p, ['light', 'single', 'delay', 'area', 'combat']))
      + 0.3 * chance(p => fits(p, 6 + ramp) * response(p, ['single']))
      + 0.15 * capacity(expected(p => fits(p, 6 + ramp) * response(p, ['area'])), 1.5)
      + 0.2 * capacity(control, 1.2)) * Math.max(0, 1 + controlCost * 0.12),
    0.6 * capacity(supply, 2) + 0.4 * capacity(supply, 1.5),
    (0.5 * chance(defender, 5) + 0.25 * chance(defender, 5, 2)
      + 0.25 * capacity(expected(p => fits(p, 6 + ramp) * (supported(p, 'defense') + response(p, ['area']) * 0.5)), 2)) * Math.max(0, 1 + defenseBurden * 0.12),
  ];
  return { status: 'ready', axes: DECK_ABILITY_REFERENCE.axes.map((axis, i) => {
    return { ...axis, score: Math.round(1000 * clamp(scores[i])) / 10 };
  }) };
}
