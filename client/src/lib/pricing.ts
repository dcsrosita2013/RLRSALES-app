// Mirror of the server pricing rule: +25% / +30% / +35% from cost.
export const MARKUP_OPTIONS = [25, 30, 35] as const;

export function sellingPriceFromCost(cost: number, markupPercent: number): number {
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}

export function priceOptions(cost: number): { markup: number; price: number }[] {
  return MARKUP_OPTIONS.map((markup) => ({ markup, price: sellingPriceFromCost(cost, markup) }));
}
