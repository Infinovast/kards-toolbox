import scoringData from '../data/deckAnalysis.json';
import type { KardsCardRecord } from '../types/card';

type Role = 'board' | 'fast' | 'interaction' | 'supply' | 'defense' | 'offense';
interface Evidence {
  role: Role; points: number; conditional?: boolean; requires?: string[];
  responses?: string[];
}
interface Support { tag: string; conditional?: boolean }
export interface CardAbilities {
  roles: Evidence[]; provides: Support[]; cannotAttack: boolean;
  minimumKredits: number;
  /** Developer audit only. A match is evidence, not a claim that the full effect is simulated. */
  unmodeled: string[];
}
interface Profile {
  id: string; copies: number; cost: number; unit: boolean; guard: boolean; defense: number;
  pressure: number; roles: Evidence[]; provides: Support[];
}

// Fixed 5/9-card windows, 0.5 conditional weight, raw capacity scores.
// Reference bands are descriptive sample data; no reference value enters a score formula.
export const DECK_ABILITY_REFERENCE = scoringData.reference;
export type DeckAbility = typeof DECK_ABILITY_REFERENCE.axes[number] & { score: number };
export interface DeckAbilityResult { status: 'ready' | 'incomplete' | 'unsupported'; axes: DeckAbility[] }
const normalizeText = (text: string) => text.normalize('NFKC').replace(/\\r\\n|\\n|\\r/g, '').replace(/\s+/gu, '');
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const capacity = (value: number, anchor: number) => value / (value + anchor);
const affordable = (p: Profile, budget: number) => Math.min(1, budget / Math.max(1, p.cost));

const FRIENDLY = /^(?:所有|其他|\d+个)?(?:友方|本单位|自己)|^(?:1|target|all)?(?:friendly|your|thisunit|own)/;
const UNIT = /单位|陆军|空军|步兵|坦克|炮兵|目标|unit|infantry|tank|artillery|air|ground|target|^其$|^it$/;
const AREA = /所有|全部|相邻|每个|all|each|adjacent/;
const GROUPS: [RegExp, string][] = [
  [/步兵|infantry/, 'infantry'], [/坦克|tank/, 'tank'], [/炮兵|artillery/, 'artillery'],
  [/战斗机|fighter/, 'fighter'], [/轰炸机|bomber/, 'bomber'], [/空军|airunit/, 'air'], [/陆军|groundunit/, 'land'],
  [/单位|unit/, 'unit'], [/指令|order/, 'order'], [/反制|countermeasure/, 'countermeasure'],
  [/山地|alpine/, 'alpine'], [/情报|intel/, 'intel'], [/天气|晴天|降雨|风暴|weather|sunny|rain|storm|forecast/, 'weather'],
  [/守护|guard/, 'guard'], [/动员|mobiliz/, 'mobilize'], [/协力|bond/, 'bond'],
];
const NATIONS: [RegExp, string][] = [[/德国|german/, 'germany'], [/英国|british/, 'britain'], [/苏联|soviet/, 'soviet'],
  [/美国|american|\bus\b/i, 'usa'], [/日本|japanese/, 'japan'], [/法国|french/, 'france'], [/波兰|polish/, 'poland'], [/中立|neutral/, 'neutral']];

function effectText(text: string) {
  const numbers: Record<string, string> = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8' };
  return normalizeText(text.replace(/\\r\\n|\\n|\\r|\r?\n/g, '。').replace(/\\+"/g, '"')
    .replace(/\b(a|an|one|two|three|four|five|six|seven|eight)\b/gi, word => numbers[word.toLowerCase()])).toLowerCase();
}

/** One reader for every card, including renamed, newly downloaded and changed cards. No ID whitelist. */
export function createCardAbilityReader(cards: Iterable<KardsCardRecord>) {
  const catalogue = [...cards], byId = new Map(catalogue.map(card => [card.cardId, card]));
  const titles = new Map<string, string>();
  for (const card of [...catalogue].sort((a, b) => a.cardId.localeCompare(b.cardId))) for (const language of ['zh-Hans', 'en-EN']) {
    const title = card.json.title?.[language];
    if (title && (!titles.has(effectText(title)) || !card.json.attributes?.some(a => a.startsWith('VeteranOf:')))) titles.set(effectText(title), card.cardId);
  }
  return function read(card: KardsCardRecord, nested = false): CardAbilities {
    const d = card.json, unit = !['order', 'countermeasure'].includes(d.type?.toLowerCase() || '');
    const raw = d.text?.['zh-Hans'] || d.description?.['zh-Hans'] || d.text?.['en-EN'] || d.description?.['en-EN'] || '';
    const roles: Evidence[] = [], provides: Support[] = [], unmodeled: string[] = [], names: string[] = [];
    // Quoted names are retained for tutors; quoted abilities are never read as immediate effects.
    const value = effectText(raw).replace(/“([^”]*)”|「([^」]*)」|『([^』]*)』|"([^"]*)"/g, (_, ...groups) => {
      const quoted = groups.slice(0, 4).find(Boolean) || '';
      names.push(quoted); return `@${names.length - 1}@`;
    });
    const requirements = (text: string): string[] => {
      const named = [...text.matchAll(/@(\d+)@/g)].map(m => titles.get(names[Number(m[1])])).filter(Boolean);
      if (named.length) return named.length === 1 ? [`card:${named[0]}`] : [];
      // An OR group must not be treated as an AND requirement.
      const group = /步兵或坦克|坦克或步兵|infantryortank|tankorinfantry/.test(text) ? 'infantry-or-tank'
        : GROUPS.find(([pattern]) => pattern.test(text))?.[1];
      const nation = !/非|non-/.test(text) && NATIONS.find(([pattern]) => pattern.test(text))?.[1];
      return group ? [nation && ['unit', 'infantry', 'tank', 'artillery', 'fighter', 'bomber', 'air', 'land'].includes(group) ? `${group}:${nation}` : group] : [];
    };
    const cannotAttack = /(?:^|[。:：])(?:本单位)?(?:无法|不能)攻击(?!敌方总部)|^(?:thisunit)?(?:cannot|can't)attack(?!theenemyhq)/.test(value);
    let mode = d.type?.toLowerCase() === 'countermeasure';
    for (let sentence of value.split(/[。.;；]/).filter(Boolean)) {
      let heading: RegExpExecArray | null;
      while ((heading = /^(部署|亡计|揭示|钳击|抽取|抉择|deployment|destruction|reveal|pincer|chooseone|showwhendrawn)[:：]/.exec(sentence))) {
        mode = !/部署|deployment/.test(heading[1]) || d.type?.toLowerCase() === 'countermeasure'; sentence = sentence.slice(heading[0].length);
      }
      const conditional = mode || /若|如果|时|后|每|抉择|when|if|after|before|nextturn|foreach|chooseone/.test(sentence);
      const trigger = /^(.*?(?:时|后))[，,:：]|^(when[^,]+|atthe(?:start|end)[^,]+|onceperturn[^,]*)[,：:]/.exec(sentence);
      const context = trigger?.[0] || '';
      const required = /友方.*(?:使用|部署|加入)|your.*(?:play|deploy)|you(?:play|deploy)|youcontrol|有友方|有其他|相邻|adjacent/.test(sentence)
        ? requirements(context || sentence.split(/[，,]/)[0]) : [];
      const discarded = [...sentence.matchAll(/(?:选择并)?弃(?:掉|置)?(\d+)张|discard(\d+)/g)].reduce((n, m) => n + Number(m[1] || m[2]), 0);
      const wholeDiscard = /弃掉(?:全部|所有)手牌|discardyourhand|shuffle(?:all)?yourhand|将所有手牌洗入/.test(value);
      const discardText = value.split(/[。，,]/).filter(clause => !/敌方|对手|enemy|opponent/.test(clause)).join('。');
      const totalDiscard = [...discardText.matchAll(/(?:选择并)?弃(?:掉|置)?(\d+)张|discard(\d+)|(?:选择|将|返回|放回)(\d+)张手牌.*?卡组/g)]
        .reduce((n, m) => n + Number(m[1] || m[2] || m[3]), 0);
      const destroyedFriend = /消灭\d+个友方|destroy1friendly/.test(value);
      let priorTarget = /敌方|enemy/.test(context) ? '敌方单位' : /友方|friendly/.test(context) ? '友方单位' : '单位';
      const effects = (trigger ? sentence.slice(context.length) : sentence).split(/[，,]|(?:并|然后|且|或)(?=抽|将|使|获得|对|造成|压制|抑制|消灭|开发)|(?:and|or)(?=draw|give|add|deal|destroy|pin|develop)/);
      for (let effect of effects) {
        if (!effect) continue;
        // Remove the condition, not the action inside that condition (e.g. an enemy's draw).
        if (/^(?:若|如果|if|when|unless|直到|until)|^(?:本回合|可影响隐蔽单位)$/.test(effect)) continue;
        if (/^(?:指向|指定|target)\d*个?单位$/.test(effect)) { priorTarget = '单位'; continue; }
        effect = effect.replace(/(?:if|when|unless|after).*$/, '').replace(/^(?:改为|instead)/, '')
          .replace(/^(?:然后|并|再|额外|随机|本回合|友方|then|and|also|randomly|you)(?=抽|对|造成|将|使|获得|消灭|压制|抑制|draw|deal|add|give|gain|destroy|pin|suppress)/, '');
        const add = (role: Role, points: number, extra: Partial<Evidence> = {}) => {
          if (points > 0) roles.push({ role, points, conditional, ...(required.length ? { requires: required } : {}), ...extra });
        };
        let matched = false;
        const draw = /^(?:抽(?:取)?(?:(\d+)张)?|draw(\d+)?)(.*)/.exec(effect);
        const generated = !/加入敌方手|to(?:the)?enemyhand/.test(effect)
          && /^(?:将|随机将|分别随机将|选择).*?加入.*?(?:友方)?手(?:中|牌)|^(?:add|put).*?(?:to|into)(?:your)?hand/.exec(effect);
        const develop = /^(?:开发|从.*开发|develop)/.test(effect) && !/加入卡组|toyourdeck/.test(sentence);
        if (draw || generated || develop) {
          matched = true;
          const namedAmounts = [...effect.matchAll(/(\d+)张@\d+@/g)].map(m => Number(m[1]));
          const namedAmount = namedAmounts.length ? /或|\bor\b/.test(effect) ? Math.max(...namedAmounts) : namedAmounts.reduce((a, b) => a + b, 0) : undefined;
          const amount = Number(draw?.[1] ?? draw?.[2] ?? namedAmount ?? /(?:将|开发)(\d+)|^(?:add|develop)(\d+)/.exec(effect)?.slice(1).find(Boolean) ?? 1);
          const retained = !/抽.*弃掉|drawanddiscard|其所有者抽|owner.*draw/.test(sentence);
          const restricted = draw && !/^(?:抽\d+张牌|draw\d+(?:extra)?cards?)(?:$|并|and)/.test(effect);
          const needs = restricted ? requirements(draw[3]) : required;
          const available = Math.max(0, amount - Math.max(discarded, totalDiscard));
          if (retained && !wholeDiscard && available > 0) add('supply', Math.min(2, (available + (unit ? 1 : 0)) / 2),
            { conditional: conditional || !!restricted || destroyedFriend || /直至|直到|foreach|upto/.test(effect), ...(needs.length ? { requires: needs } : {}) });
          if (generated || develop) provides.push({ tag: 'generated-card', conditional });
          if (restricted && needs.length) matched = true;
        }
        const summon = /^(?:将|随机将|分别随机将|加入|复制).*(?:加入|加入到|^加入)(?:友方)?(?:支援阵线|前线|战场|相邻处|同一阵线|总部相邻)|^加入\d+张@\d+@|^add.*(?:supportline|frontline|battlefield|beside|asdefender)|^copy.*(?:unit|tank)/.test(effect);
        if (summon && !/加入敌方|totheenemy/.test(effect)) {
          matched = true;
          const needs = /将手(?:中|牌)|手(?:中|牌).*选择.*单位|友方单位的复制|friendly.*copy|from.*hand|copy.*friendly/.test(sentence) ? requirements(sentence) : required;
          add('board', 1, { ...(needs.length ? { requires: needs } : {}) });
          add('offense', 1, { ...(needs.length ? { requires: needs } : {}) });
          provides.push({ tag: 'unit', conditional });
        }
        const damage = /^(?:随机)?对(.+?)造成(?:(\d+)(?:-(\d+))?点|等同于(.+?)的)伤害|^造成(\d+)点伤害|^deal(?:(\d+)(?:-(\d+))?damage(?:to(.+))?|damageto(.+))/.exec(effect);
        if (damage) {
          matched = true;
          const variable = !!(damage[4] || damage[9]);
          const amount = Number(damage[2] ?? damage[5] ?? damage[6] ?? 1);
          const target = damage[1] || damage[8] || damage[9] || '目标';
          const friendlyOnly = FRIENDLY.test(target), multi = AREA.test(target) || /随机分配|distribute/.test(sentence);
          if (amount && !friendlyOnly) {
            const response = variable || amount >= 3 ? 'single' : 'light';
            if (UNIT.test(target) || /敌方目标|目标|enemy$|all|^其$|^it$/.test(target)) add('interaction', variable ? 0.6 : amount >= 3 ? 0.8 : amount === 2 ? 0.6 : 0.3,
              { conditional: conditional || variable, responses: [response, ...(multi ? ['area'] : [])] });
            if (/总部|hq|目标|enemy$|all/.test(target) && !/友方总部|yourhq/.test(target)) add('offense', Math.min(2, amount / 3), { conditional: conditional || variable });
          }
          priorTarget = target;
        }
        const removal = /^(?:随机|将)?(?:消灭|移除|控制)(.+)|^将(.+?)消灭|^(?:destroy|remove|takecontrol(?:of)?)(.+)/.exec(effect);
        const delay = /^(?:压制|抑制)(.+)|^(?:使|将)(.+?)(?:压制|抑制|撤退|返回(?:其所有者)?手(?:中|牌)|返回其所有者卡组顶)|^(?:pin|suppress|retreat)(.+)|^send(.+?)(?:tohand|backto)/.exec(effect);
        let target = removal?.slice(1).find(Boolean) || delay?.slice(1).find(Boolean);
        if (target) {
          if (/^(?:其|it)(?:$|并|and)/.test(target)) target = priorTarget;
          const temporary = /直到|until/.test(sentence) || /移除|remove/.test(effect) && /返回战场|return.*battlefield/.test(value);
          const friendlyOnly = FRIENDLY.test(target) || /卡组顶|fromyourdeck|ofyourdeck|countermeasure|反制|指挥点/.test(target);
          if (UNIT.test(target) && !friendlyOnly) {
            const single = removal && !temporary;
            add('interaction', single ? 1 : 0.6, { responses: [single ? 'single' : 'delay', ...(AREA.test(target) ? ['area'] : [])] });
          }
          priorTarget = target; matched = true;
        }
        const fighting = /与.*敌方.*战斗|fights?.*enemy/.test(effect);
        if (fighting) { add('interaction', 0.8, { conditional: conditional || !unit, ...(!unit ? { requires: ['operating-unit'] } : {}), responses: ['single'] }); matched = true; }
        const replacement = /(?:将|convert)(.+?)(?:转换为|into)@(\d+)@/.exec(effect);
        const replacementCard = replacement && byId.get(titles.get(names[Number(replacement[2])]) || '');
        if (replacementCard && UNIT.test(replacement![1]) && !FRIENDLY.test(replacement![1])
            && replacementCard.json.attack! <= 1 && replacementCard.json.defense! <= 1) {
          add('interaction', 0.8, { responses: ['single', ...(AREA.test(replacement![1]) ? ['area'] : [])] }); matched = true;
        }
        const enemy = /^(?:使|将)?(?:所有|其他|\d+个)?(?:敌方|对手)|^(?:give)?(?:all|1|target)?enemy/.test(effect)
          || /^(?:使)?其/.test(effect) && /敌方|enemy/.test(priorTarget);
        const external = !unit || /相邻|其他友方|使\d+个|使所有|友方.*(?:具有|获得)|friendly|adjacent|give|yourother/.test(effect);
        const buffNeeds = external && !/总部|hq/.test(effect) ? requirements(effect) : required;
        const points = (n: number) => Math.min(2, Math.max(0.25, n / 2));
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
          matched = true;
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
          const id = titles.get(names[Number(name[1])]);
          if (id) provides.push({ tag: `card:${id}`, conditional: true });
        }
        // Amounts and probabilities of economy, discard, sequencing and hand replacement
        // are outside this model; retain them for the catalogue audit rather than inventing a bonus.
        if (!matched) unmodeled.push(effect);
      }
    }
    if (!nested) {
      // Only effects granted to existing battlefield targets enter the observation window.
      // Abilities attached to hand/deck/generated cards remain explicitly unmodeled.
      for (const quoted of names.filter(name => /[：:。]|抽|draw|gets|when|亡计/.test(name))) {
        if (/单位|总部|unit|hq/.test(value) && !/手牌|手中|卡组|加入|hand|deck|^add/.test(value) && !/^(?:使)?敌方总部|^give.*enemyhq/.test(value)) {
          const granted = read({ ...card, json: { ...d, attributes: [], text: { 'zh-Hans': quoted }, description: {} } }, true);
          roles.push(...granted.roles.map(e => ({ ...e, conditional: true, requires: /总部|hq/.test(value) ? e.requires : [...new Set(['unit', ...(e.requires || [])])] })));
          unmodeled.push(...granted.unmodeled);
        } else unmodeled.push(quoted);
      }
      const veteranId = d.attributes?.find(a => a.startsWith('BecomesVeteran:'))?.split(':')[1];
      const veteran = veteranId && byId.get(veteranId);
      if (veteran) {
        const upgraded = read(veteran, true), needs = requirements(value);
        roles.push(...upgraded.roles.map(e => ({ ...e, conditional: true, ...(needs.length ? { requires: [...new Set([...needs, ...(e.requires || [])])] } : {}) })));
        if (veteran.json.attack! > d.attack!) roles.push({ role: 'offense', points: Math.min(2, (veteran.json.attack! - d.attack!) / 2), conditional: true });
        if (veteran.json.defense! > d.defense!) roles.push({ role: 'defense', points: Math.min(2, (veteran.json.defense! - d.defense!) / 2), conditional: true });
      }
    }
    const minimumKredits = Number(/指挥点槽数小于(\d+).*无法部署|cannotbedeployedunlessyouhave(\d+)ormorekreditslots/.exec(value)?.slice(1).find(Boolean) || 0);
    return { roles, provides, cannotAttack, minimumKredits, unmodeled: [...new Set(unmodeled)] };
  };
}

function profile(card: KardsCardRecord, copies: number, abilities: CardAbilities): Profile | null {
  const d = card.json, type = d.type?.toLowerCase() || '', nation = d.faction?.toLowerCase();
  const unit = ['infantry', 'tank', 'artillery', 'fighter', 'bomber'].includes(type);
  if ((!unit && !['order', 'countermeasure'].includes(type)) || !Number.isInteger(d.kredits) || !finiteNonnegative(d.kredits)
      || (unit && ![d.attack, d.defense, d.operationCost].every(finiteNonnegative))) return null;
  const attrs = (d.attributes || []).map(a => a.toLowerCase()), guard = attrs.includes('guard');
  const attack = unit ? d.attack! : 0, operation = unit ? d.operationCost! : 0;
  const cannotAttack = abilities.cannotAttack;
  const roles: Evidence[] = [], provides: Support[] = [{ tag: `card:${card.cardId}` }];
  const tags = (...values: string[]) => provides.push(...values.map(tag => ({ tag })));
  if (nation) tags(`nation:${nation}`);
  if (!unit) tags(type);
  if (nation === 'neutral') tags('neutral');
  if (attrs.some(a => /^intel\d*$/.test(a))) tags('intel');
  tags(...attrs.map(a => a.replace(/\d+$/, '')));
  if (unit) {
    roles.push({ role: 'board', points: 1 }); tags('unit', type);
    if (nation) tags(`unit:${nation}`, `${type}:${nation}`);
    if (['infantry', 'tank'].includes(type)) tags('infantry-or-tank');
    if (['infantry', 'tank', 'artillery'].includes(type)) { tags('land'); if (nation) tags(`land:${nation}`); }
    if (['fighter', 'bomber'].includes(type)) { tags('air'); if (nation) tags(`air:${nation}`); }
    if (nation !== 'usa') tags('non-usa-unit');
    if (type !== 'tank') tags('non-tank-unit');
    if (d.kredits! <= 3) tags('low-cost-unit');
    if (attack >= 4) tags('high-attack-unit');
    if (operation >= 2) tags('high-operation');
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
    pressure: !unit || cannotAttack ? 0 : Math.min(attack, 6) / (3 * (1 + operation / 2)) * Math.min(1, 4 / Math.max(1, d.kredits!)) };
}

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1, limit = Math.min(k, n - k); i <= limit; i++) result *= (n - i + 1) / i;
  return result;
}

function probabilityAtLeast(total: number, successes: number, seen: number, minimum = 1) {
  let probability = 0;
  for (let hits = minimum; hits <= Math.min(successes, seen); hits++) probability += choose(successes, hits) * choose(total - successes, seen - hits) / choose(total, seen);
  return clamp(probability);
}

/** Exact unordered sampling with overlapping support groups, not independent probabilities. */
function probabilityAllGroups(masks: number[], required: number, seen: number) {
  const categories = new Map<number, number>();
  for (const mask of masks) categories.set(mask, (categories.get(mask) || 0) + 1);
  let ways = new Map<string, number>([['0:0', 1]]);
  for (const [mask, count] of categories) {
    const next = new Map<string, number>();
    for (const [state, weight] of ways) {
      const [drawn, covered] = state.split(':').map(Number);
      for (let take = 0; take <= Math.min(count, seen - drawn); take++) {
        const key = `${drawn + take}:${covered | (take ? mask : 0)}`;
        next.set(key, (next.get(key) || 0) + weight * choose(count, take));
      }
    }
    ways = next;
  }
  return clamp((ways.get(`${seen}:${required}`) || 0) / choose(masks.length, seen));
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
  const supportCache = new Map<string, number>();
  function support(p: Profile, e: Evidence, potential: boolean) {
    const tags = [...new Set(e.requires || [])].sort();
    if (!tags.length) return 1;
    const key = `${p.id}:${potential}:${tags.join('|')}`;
    if (!supportCache.has(key)) {
      // Remove this physical payoff copy: it must not also supply its own external support.
      const masks = profiles.flatMap(q => Array<number>(q.copies - (q === p ? 1 : 0)).fill(tags.reduce((mask, tag, i) =>
        mask | (q.provides.some(t => t.tag === tag && (potential || !t.conditional)) ? 1 << i : 0), 0)));
      supportCache.set(key, probabilityAllGroups(masks, (1 << tags.length) - 1, 8));
    }
    return supportCache.get(key)!;
  }
  const evidence = (p: Profile, role: Role, potential: boolean) => p.roles.filter(e => e.role === role && (potential || !e.conditional));
  const expected = (value: (p: Profile) => number) => profiles.reduce((n, p) => n + p.copies * 9 / 39 * value(p), 0);
  const chance = (predicate: (p: Profile) => boolean, seen = 9, minimum = 1) => probabilityAtLeast(39, profiles.reduce((n, p) => n + (predicate(p) ? p.copies : 0), 0), seen, minimum);
  const supported = (p: Profile, role: Role, potential: boolean, value = (e: Evidence) => e.points) => Math.max(0, ...evidence(p, role, potential).map(e => value(e) * support(p, e, potential)));
  const response = (p: Profile, potential: boolean, kinds: string[]) => evidence(p, 'interaction', potential).some(e =>
      support(p, e, potential) > 0 && e.responses?.some(kind => kinds.includes(kind)));
  const board = (p: Profile, potential: boolean) => p.unit ? p.pressure > 0 || p.guard : evidence(p, 'board', potential).some(e => support(p, e, potential) > 0);
  const earlyDefender = (p: Profile, potential: boolean) => p.cost <= 3
    && ((p.unit && (p.guard || (p.pressure > 0 && p.defense >= 2))) || response(p, potential, ['single', 'delay', 'area']));
  const printedPressure = profiles.reduce((n, p) => n + p.copies * p.pressure, 0);
  const scores = (potential: boolean) => [
    0.5 * chance(p => p.cost <= 2 && board(p, potential), 5) + 0.25 * chance(p => p.cost <= 2 && board(p, potential), 5, 2)
      + 0.25 * chance(p => p.cost <= 3 && board(p, potential), 9, 2),
    0.5 * capacity(printedPressure, 18) + 0.25 * chance(p => p.cost <= 4 && supported(p, 'fast', potential) > 0)
      + 0.25 * capacity(expected(p => affordable(p, 5) * supported(p, 'offense', potential)), 1.5),
    0.5 * chance(p => p.cost <= 3 && response(p, potential, ['light', 'single', 'delay', 'area']))
      + 0.35 * chance(p => p.cost <= 6 && response(p, potential, ['single']))
      + 0.15 * capacity(expected(p => affordable(p, 6) * (response(p, potential, ['area']) ? 1 : 0)), 1.5),
    0.6 * capacity(expected(p => affordable(p, 5) * supported(p, 'supply', potential, () => 1)), 2)
      + 0.4 * capacity(expected(p => affordable(p, 5) * supported(p, 'supply', potential, e => e.points >= 1 ? e.points : 0)), 1.5),
    0.5 * chance(p => earlyDefender(p, potential), 5) + 0.25 * chance(p => earlyDefender(p, potential), 5, 2)
      + 0.25 * capacity(expected(p => affordable(p, 6) * Math.max(supported(p, 'defense', potential), response(p, potential, ['area']) ? 0.75 : 0)), 2),
  ];
  const base = scores(false), potential = scores(true);
  return { status: 'ready', axes: DECK_ABILITY_REFERENCE.axes.map((axis, i) => {
    const baseScore = 100 * clamp(base[i]), potentialScore = 100 * clamp(potential[i]);
    return { ...axis, score: Math.round((baseScore + (potentialScore - baseScore) * 0.5) * 10) / 10 };
  }) };
}
