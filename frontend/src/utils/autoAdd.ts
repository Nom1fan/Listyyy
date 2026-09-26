import type { AutoAddRuleResponse, AutoAddUnit } from '../types';

/** Frequency unit options for automatic replenishment (Hebrew labels). */
export const AUTO_ADD_UNIT_OPTIONS: { value: AutoAddUnit; label: string }[] = [
  { value: 'DAYS', label: 'ימים' },
  { value: 'WEEKS', label: 'שבועות' },
  { value: 'MONTHS', label: 'חודשים' },
  { value: 'YEARS', label: 'שנים' },
];

const UNIT_LABELS: Record<AutoAddUnit, string> = {
  DAYS: 'ימים',
  WEEKS: 'שבועות',
  MONTHS: 'חודשים',
  YEARS: 'שנים',
};

/** Hebrew label for a recurrence unit (falls back to the raw value). */
export function autoAddUnitLabel(unit: string): string {
  return UNIT_LABELS[unit as AutoAddUnit] ?? unit;
}

/** Short schedule summary, e.g. "5 × כל 2 שבועות". */
export function formatRuleSummary(rule: Pick<AutoAddRuleResponse, 'quantity' | 'everyN' | 'everyUnit'>): string {
  return `${rule.quantity} × כל ${rule.everyN} ${autoAddUnitLabel(rule.everyUnit)}`;
}

/** Finds the rule governing an item: by product first, then by custom name. */
export function findRuleForItem(
  rules: AutoAddRuleResponse[],
  item: { productId: string | null; customNameHe: string | null; displayName: string }
): AutoAddRuleResponse | undefined {
  if (item.productId) {
    const byProduct = rules.find((r) => r.productId === item.productId);
    if (byProduct) return byProduct;
  }
  const key = item.customNameHe ?? item.displayName;
  return rules.find((r) => !r.productId && r.customNameHe === key);
}

/** Formats an ISO date-time for the "next auto-add" hint (Hebrew locale). */
export function formatNextRun(iso: string): string {
  const date = new Date(iso);
  return (
    date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  );
}
