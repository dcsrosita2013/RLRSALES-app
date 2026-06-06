// Selling-price options auto-computed from cost: +25% / +30% / +35%.
export const MARKUP_OPTIONS = [25, 30, 35] as const;
export type MarkupOption = (typeof MARKUP_OPTIONS)[number];

export function sellingPriceFromCost(cost: number, markupPercent: number): number {
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}

export function priceOptions(cost: number): { markup: number; price: number }[] {
  return MARKUP_OPTIONS.map((markup) => ({ markup, price: sellingPriceFromCost(cost, markup) }));
}
