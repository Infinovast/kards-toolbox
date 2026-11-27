import './cardImageLoading.css';

export default function CardImageLoading({ compact = false, label = '正在载入卡图' }: {
  compact?: boolean;
  label?: string;
}) {
  return <span className={compact ? 'card-image-loading is-compact' : 'card-image-loading'} role="img" aria-label={label}>
    <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
  </span>;
}
