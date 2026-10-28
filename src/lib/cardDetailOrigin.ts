export interface CardDetailOrigin {
  kind: 'pool' | 'strip';
  left: number;
  top: number;
  width: number;
  height: number;
  image?: string;
  element?: HTMLElement;
  activation?: { x: number; y: number; time: number };
}

export function captureCardDetailOrigin(element: HTMLElement | null, kind: CardDetailOrigin['kind'], image?: string, event?: Pick<MouseEvent, 'detail' | 'clientX' | 'clientY' | 'timeStamp'>): CardDetailOrigin | undefined {
  if (!element) return;
  const art = kind === 'pool' ? element.querySelector<HTMLElement>('.card-face') : null;
  const bounds = (art || element).getBoundingClientRect();
  const activation = event?.detail === 1 ? { x: event.clientX, y: event.clientY, time: event.timeStamp } : undefined;
  if (kind === 'pool') return { kind, element, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
    image: art instanceof HTMLImageElement ? art.currentSrc || art.src : image, activation };
  const width = Math.min(96, bounds.width / 3);
  return { kind, element, left: bounds.left + (bounds.width - width) / 2, top: bounds.bottom + 4,
    width, height: width * 867 / 618, image, activation };
}
