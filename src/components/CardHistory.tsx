import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { RARITY_ICONS, TYPE_ICONS } from '../lib/assetCatalog';
import { cardHistory, type CardHistoryAttributeField, type CardHistoryVersion } from '../lib/cardHistory';
import { CARD_TYPES } from '../types/card';
import { FilterIcon } from './CardFilterSelects';
import { CardText } from './CardText';
import KreditLabel from './KreditLabel';

type Event = CardHistoryVersion['events'][number];

const raritySymbols: Record<string, { key: string; width: number; height: number }> = {
  普通: { key: 'Standard', width: 34, height: 10 },
  稀有: { key: 'Limited', width: 36, height: 13 },
  限定: { key: 'Limited', width: 36, height: 13 },
  特殊: { key: 'Special', width: 30, height: 16 },
  精英: { key: 'Elite', width: 36, height: 15 },
};

const historyRows = 'col-span-full grid grid-cols-subgrid gap-y-2 text-left';
const statusLabels = { discarded: '废案', unannounced: '暗改' };
const attributeLabels: Record<CardHistoryAttributeField, string> = {
  kredits: '部署费用',
  operationCost: '行动费用',
  attack: '攻击力',
  defense: '防御力',
  rarity: '稀有度',
  type: '类型',
  faction: '国家',
};
const changeLabels = {
  add_keyword: '添加词条',
  remove_keyword: '移除词条',
  add_effect: '添加效果',
  remove_effect: '移除效果',
};

function RaritySymbol({ name }: { name: string }) {
  const symbol = raritySymbols[name];
  return <span className="inline-flex w-9 items-center">{symbol
    ? <img src={RARITY_ICONS[symbol.key]} alt={name} title={name} width={symbol.width} height={symbol.height} />
    : name}</span>;
}

function HistoryAttributeValue({ field, value }: { field: CardHistoryAttributeField; value: string | number }) {
  if (field === 'kredits' || field === 'operationCost') return <KreditLabel cost={value} compact />;
  if (field === 'rarity') return <RaritySymbol name={String(value)} />;
  if (field === 'type') {
    const label = value === '炮兵' ? '火炮' : value === '反制' ? '反制指令' : value;
    const type = CARD_TYPES.find(item => item.label === label || item.id === value);
    if (type) return <span role="img" aria-label={type.label} title={type.label} className="inline-block h-[18px] w-5 shrink-0">
      <FilterIcon src={TYPE_ICONS[type.id]} />
    </span>;
  }
  return <>{value}</>;
}

function HistoryEvent({ event }: { event: Event }) {
  if ('text' in event) return <p className="col-span-full whitespace-pre-wrap"><CardText text={event.text} /></p>;
  return <>
    <dl className={historyRows}>
      {event.status && <><dt>状态</dt><dd>{statusLabels[event.status]}</dd></>}
      {event.note && <><dt>备注</dt><dd className="whitespace-pre-wrap"><CardText text={event.note} /></dd></>}
      {event.changes.map((change, index) => {
        if (change.type === 'attribute') return <Fragment key={index}>
          <dt>{attributeLabels[change.field]}</dt>
          <dd><span className="inline-flex flex-wrap items-center gap-x-2">
            <HistoryAttributeValue field={change.field} value={change.from} />
            <span>→</span>
            <HistoryAttributeValue field={change.field} value={change.to} />
          </span></dd>
        </Fragment>;
        if (change.type === 'modify_effect') return <Fragment key={index}>
          <dt>修改效果</dt>
          <dd>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1">
              <dt>旧</dt><dd className="whitespace-pre-wrap"><CardText text={change.old || '原文缺失'} /></dd>
              <dt>新</dt><dd className="whitespace-pre-wrap"><CardText text={change.new || '原文缺失'} /></dd>
            </dl>
          </dd>
        </Fragment>;
        return <Fragment key={index}>
          <dt>{changeLabels[change.type]}</dt>
          <dd className="whitespace-pre-wrap">{'keywords' in change
            ? <CardText text={change.keywords.join('、')} requirePrefix={false} />
            : <CardText text={change.text} />}</dd>
        </Fragment>;
      })}
    </dl>
    {event.needs_review?.length ? <details className="col-span-full text-xs text-kards-text-muted">
      <summary tabIndex={0} className="cursor-pointer">原文待核对</summary>
      <ul className="mt-1 space-y-1">{event.needs_review.map(issue => <li key={issue}>{issue}</li>)}</ul>
      <p className="mt-2 whitespace-pre-wrap">{event.raw.join('\n')}</p>
    </details> : null}
  </>;
}

export default function CardHistory({ cardId }: { cardId: string }) {
  const versions = cardHistory(cardId);
  if (!versions.length) return null;

  return <details key={cardId} className="group card-detail-section break-words text-kards-text">
    <summary tabIndex={0} className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-bold hover:text-kards-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-kards-gold [&::-webkit-details-marker]:hidden">
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-90" />
      历史改动
    </summary>
    <ol className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 divide-y divide-kards-border">
      {versions.map(({ version, events }) => <li key={events[0].sourceLine} className="col-span-full grid grid-cols-subgrid gap-y-2 py-3 first:pt-0">
        <h3 className="col-span-full text-sm font-bold">{version.replace(/（不分先后）$/, '')}</h3>
        <ul className="col-span-full grid grid-cols-subgrid gap-y-3 text-sm leading-relaxed">
          {events.map(event => <li key={event.sourceLine} className={historyRows}><HistoryEvent event={event} /></li>)}
        </ul>
      </li>)}
    </ol>
  </details>;
}
