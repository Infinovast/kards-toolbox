import scoringData from '../data/deckAnalysis.json';
import type { KardsCardRecord } from '../types/card';

type Role = 'board' | 'fast' | 'interaction' | 'supply' | 'defense' | 'offense';
interface Evidence {
  role: Role; points: number; conditional?: boolean; requires?: string[];
  responses?: string[]; conditionalResponses?: string[];
}
interface Support { tag: string; conditional?: boolean }
interface Rule { fingerprint: string; roles: Evidence[]; provides?: Support[]; cannotAttack?: boolean }
interface Profile {
  id: string; copies: number; cost: number; unit: boolean; guard: boolean; defense: number;
  pressure: number; roles: Evidence[]; provides: Support[];
}

// kards-radar-2: fixed 5/9-card windows, 0.5 conditional weight, raw capacity scores.
// Reference bands describe 12 supplied builds; they are neither targets nor strength ranks.
export const DECK_ABILITY_REFERENCE = scoringData.reference;
export type DeckAbility = typeof DECK_ABILITY_REFERENCE.axes[number] & { score: number };
export interface DeckAbilityResult { status: 'ready' | 'incomplete' | 'unsupported'; axes: DeckAbility[] }
const rules = scoringData.rules as Record<string, Rule>;
const normalizeText = (text: string) => text.normalize('NFKC').replace(/\\r\\n|\\n|\\r/g, '').replace(/\s+/gu, '');
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const capacity = (value: number, anchor: number) => value / (value + anchor);
const affordable = (p: Profile, budget: number) => Math.min(1, budget / Math.max(1, p.cost));

function fingerprint(text: string) {
  let hash = 2166136261;
  for (const char of normalizeText(text)) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Strip granted/quoted abilities before inference, but keep the enclosing effect.
function effectText(text: string) {
  const numbers: Record<string, string> = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };
  return normalizeText(text.replace(/\\r\\n|\\n|\\r|\r?\n/g, '。').replace(/\\+"/g, '"')
    .replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"/g, '')
    .replace(/\b(a|an|one|two|three|four|five|six)\b/gi, word => numbers[word.toLowerCase()])).toLowerCase();
}

/** Conservative common-effect estimates for the rest of the catalogue, including updated text. */
function inferRoles(text: string, unit: boolean): Evidence[] {
  const value = effectText(text), roles: Evidence[] = [];
  const conditional = /亡计|若|如果|时|回合|抉择|钳击|交战|when|if|after|before|chooseone|pincer|destruction:/.test(value);
  const add = (role: Role, points: number, extra: Partial<Evidence> = {}) => {
    if (points > 0) roles.push({ role, points, conditional, ...extra });
  };
  const friendly = /友方|本单位|自己|friendly|your|thisunit|own/;
  const targetUnit = /单位|陆军|空军|步兵|坦克|炮兵|目标|unit|infantry|tank|artillery|air|ground|target/;
  const discarded = [...value.matchAll(/(?:^|[。，,])(?:选择并|并)?(?:弃(?:掉|置)?|discard)(\d+)/g)]
    .reduce((n, match) => n + Number(match[1]), 0);
  for (const sentence of value.split(/[。.;；]/)) {
    // Drawn-then-discarded cards never enter retained hand supply.
    const retained = !/将其弃掉|抽.*弃掉卡组顶|drawanddiscard/.test(sentence);
    for (const clause of sentence.split(/[，,]/)) {
      // Do not read a trigger's draw/damage as the card's own effect.
      const effect = clause.replace(/^.*(?:时|后)[：:]?/, '').replace(/(?:when|if|unless).*$/, '')
        .replace(/^(?:部署|亡计|抉择|钳击|deployment|destruction|chooseone|pincer)[:：]/, '');
      const draw = /^(?:并|然后|再|额外)?(?:抽(?:取)?(\d+)张|draw(\d+))/.exec(effect);
      const generated = /^(?:(?:随机)?将|选择).*(\d+)张.*(?:加入|返回)(?:友方)?手(?:中|牌)|^(?:add|put)(\d+)?.*(?:to|into)(?:your)?hand/.exec(effect);
      const develop = /^(?:开发\d+张|develop)/.test(effect);
      if (retained && (draw || generated || develop)) {
        const amount = Number(draw?.[1] || draw?.[2] || generated?.[1] || generated?.[2] || 1);
        if (amount > 0) add('supply', Math.min(2, Math.max(0, 0.5 + 0.5 * (amount - discarded - (unit ? 0 : 1)))),
          { conditional: conditional || develop || !!draw && !/抽\d+张牌|draw\d+(?:extra)?cards?/.test(effect) });
      }
      const damage = /^对(.+?)造成(\d+)点伤害|^deal(\d+)damageto(.+)/.exec(effect);
      if (damage) {
        const target = damage[1] || damage[4], amount = Number(damage[2] || damage[3]);
        if (amount && !friendly.test(target)) {
          if (targetUnit.test(target)) add('interaction', amount >= 3 ? 0.8 : amount === 2 ? 0.6 : 0.3,
            { responses: [/所有|全部|相邻|all|each|adjacent/.test(target) ? 'area' : amount >= 3 ? 'single' : 'light'] });
          if (/总部|hq/.test(target)) add('offense', Math.min(2, amount / 3));
        }
      }
      const removal = /^(?:随机)?(?:消灭|移除|收缴)(.+)|^(?:destroy|remove|capture)(.+)/.exec(effect);
      const delay = /^(?:压制|抑制)(.+)|^使(.+?)(?:撤退|返回手(?:中|牌))|^(?:pin|suppress|retreat)(.+)/.exec(effect);
      const target = removal?.[1] || removal?.[2] || delay?.[1] || delay?.[2] || delay?.[3];
      if (target && targetUnit.test(target) && !friendly.test(target)) add('interaction', removal ? 1 : 0.6,
        { responses: [removal ? 'single' : 'delay', ...(/所有|全部|all|each/.test(target) ? ['area'] : [])] });
      if (/^(?:将|随机将).*(?:加入|部署到?)(?:友方)?(?:支援阵线|前线)|^add.*(?:to|into)(?:your)?(?:supportline|frontline)/.test(effect)
          && !/敌方|对手|enemy|opponent/.test(effect)) add('board', 1);
      if (/(?:使|获得|具有|gets?|gains?|give|have).*(?:\+\d+攻击力|\+\d+\+\d+|\+\d+attack)/.test(effect)
          && !/敌方|对手|enemy|opponent/.test(effect)) add('offense', 1,
        { conditional: true, ...(!unit || /友方|其他|相邻|friendly|adjacent/.test(effect) ? { requires: ['unit'] } : {}) });
      if (/(?:使|获得|具有|gets?|gains?|give|have).*(?:\+\d+防御力|\+\d+defense|守护|重甲|guard|heavyarmor)/.test(effect)
          && !/敌方|对手|enemy|opponent/.test(effect)) add('defense', 0.75, { ...(!unit && !/总部|hq/.test(effect) ? { requires: ['unit'] } : {}) });
    }
  }
  return roles;
}

function profile(card: KardsCardRecord, copies: number): Profile | null {
  const d = card.json, type = d.type?.toLowerCase() || '', nation = d.faction?.toLowerCase();
  const unit = ['infantry', 'tank', 'artillery', 'fighter', 'bomber'].includes(type);
  if ((!unit && !['order', 'countermeasure'].includes(type)) || !Number.isInteger(d.kredits) || !finiteNonnegative(d.kredits)
      || (unit && ![d.attack, d.defense, d.operationCost].every(finiteNonnegative))) return null;
  const text = d.text?.['zh-Hans'] || d.description?.['zh-Hans'] || d.text?.['en-EN'] || d.description?.['en-EN'] || '';
  const known = rules[card.cardId];
  const rule = known?.fingerprint === fingerprint(text) ? known : undefined;
  const reviewed = rule?.roles ?? inferRoles(text, unit);
  const attrs = (d.attributes || []).map(a => a.toLowerCase()), guard = attrs.includes('guard');
  const attack = unit ? d.attack! : 0, operation = unit ? d.operationCost! : 0;
  const cannotAttack = rule?.cannotAttack || /(?:^|。)(?:本单位)?(?:无法|不能)攻击(?!敌方总部)|^(?:thisunit)?(?:cannot|can't)attack(?!.*hq)/.test(effectText(text));
  const roles: Evidence[] = [], provides: Support[] = [{ tag: `card:${card.cardId}` }];
  const tags = (...values: string[]) => provides.push(...values.map(tag => ({ tag })));
  if (nation) tags(`nation:${nation}`);
  if (!unit) tags(type);
  if (nation === 'neutral') tags('neutral');
  if (attrs.some(a => /^intel\d*$/.test(a))) tags('intel');
  if (unit) {
    roles.push({ role: 'board', points: 1 }); tags('unit', type);
    if (nation) tags(`unit:${nation}`, `${type}:${nation}`);
    if (['infantry', 'tank'].includes(type)) tags('infantry-or-tank');
    if (['infantry', 'tank', 'artillery'].includes(type)) { tags('land'); if (nation) tags(`land:${nation}`); }
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
  roles.push(...(reviewed || []).map(e => ({ ...e, ...(type === 'countermeasure' ? { conditional: true } : {}) })));
  provides.push(...(rule?.provides || []).map(e => ({ ...e, ...(type === 'countermeasure' ? { conditional: true } : {}) })));
  return { id: card.cardId, copies, cost: d.kredits!, unit, guard, defense: unit ? d.defense! : 0, roles, provides,
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
  for (const [id, copies] of selected) {
    const card = cardsById.get(id), p = card && profile(card, copies);
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
    support(p, e, potential) > 0 && [...(e.responses || []), ...(potential ? e.conditionalResponses || [] : [])].some(kind => kinds.includes(kind)));
  const board = (p: Profile, potential: boolean) => p.unit ? p.pressure > 0 || p.guard : evidence(p, 'board', potential).some(e => support(p, e, potential) > 0);
  const earlyDefender = (p: Profile, potential: boolean) => p.cost <= 3
    && ((p.unit && (p.guard || (p.pressure > 0 && p.defense >= 2))) || response(p, potential, ['single', 'delay', 'area']));
  const printedPressure = profiles.reduce((n, p) => n + p.copies * p.pressure, 0);
  const scores = (potential: boolean) => [
    0.5 * chance(p => p.cost <= 2 && board(p, potential), 5) + 0.25 * chance(p => p.cost <= 2 && board(p, potential), 5, 2)
      + 0.25 * chance(p => p.cost <= 3 && board(p, potential), 9, 2),
    0.5 * capacity(printedPressure, 18) + 0.25 * chance(p => p.cost <= 4 && evidence(p, 'fast', potential).some(e => e.points > 0))
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
