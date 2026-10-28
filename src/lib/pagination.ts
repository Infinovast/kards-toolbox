export function paginationItems(page: number, pageCount: number): (number | 'start-gap' | 'end-gap')[] {
  const total = Math.max(1, Math.floor(pageCount));
  const current = Math.max(1, Math.min(total, Math.floor(page)));
  if (total <= 11) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(current - 3, total - 7));
  const end = Math.min(total - 1, Math.max(current + 3, 8));
  return [
    1,
    ...(start === 3 ? [2] : start > 3 ? ['start-gap' as const] : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end === total - 2 ? [total - 1] : end < total - 2 ? ['end-gap' as const] : []),
    total,
  ];
}
