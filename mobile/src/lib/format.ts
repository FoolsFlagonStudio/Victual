import type { RecipeSummary } from '@/api/recipes';

/** $84.20, or $84 when `whole`. */
export function money(n: number | null | undefined, whole = false): string {
  if (n == null || Number.isNaN(n)) return '-';
  return whole ? `$${Math.round(n)}` : `$${n.toFixed(2)}`;
}

/** "$2.85/serving", or "from $2.85/serving" when some lines couldn't be priced. */
export function perServing(r: Pick<RecipeSummary, 'costPerServing' | 'costComplete'>): string | null {
  if (r.costPerServing == null) return null;
  return `${r.costComplete ? '' : 'from '}${money(r.costPerServing)}/serving`;
}

export function minutes(m: number | null | undefined): string | null {
  if (!m) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

export const round = (n: number | null | undefined) => (n == null ? null : Math.round(n));

/** "520 cal · 32g protein" */
export function macroLine(r: Pick<RecipeSummary, 'caloriesPerServing' | 'proteinGPerServing'>): string | null {
  const parts = [
    r.caloriesPerServing != null && `${Math.round(r.caloriesPerServing)} cal`,
    r.proteinGPerServing != null && `${Math.round(r.proteinGPerServing)}g protein`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

const FRACTIONS: [number, string][] = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
];

/** 1.5 -> "1 1/2", 0.333 -> "1/3", 2 -> "2". */
export function amount(n: number): string {
  const whole = Math.floor(n + 1e-6);
  const rest = n - whole;
  if (rest < 0.06) return String(whole || (n > 0 ? Number(n.toFixed(2)) : 0));
  if (rest > 0.94) return String(whole + 1);
  const [, frac] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  return whole ? `${whole} ${frac}` : frac;
}

const UNIT_WORDS: Record<string, [string, string]> = {
  cup: ['cup', 'cups'],
  tbsp: ['tbsp', 'tbsp'],
  tsp: ['tsp', 'tsp'],
  lb: ['lb', 'lb'],
  oz: ['oz', 'oz'],
  fl_oz: ['fl oz', 'fl oz'],
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  l: ['l', 'l'],
  clove: ['clove', 'cloves'],
  can: ['can', 'cans'],
  pinch: ['pinch', 'pinches'],
};

/** "1 1/2 lb chicken thighs", "3 bell peppers", "salt to taste". */
export function ingredientText(line: { amount: number | null; displayAmount?: string | null; unit: string | null; name: string }): string {
  if (line.unit === 'to_taste') return `${line.name}, to taste`;
  if (line.amount == null) return line.name;
  const qty = line.displayAmount ?? amount(line.amount);
  const words = line.unit ? UNIT_WORDS[line.unit] : undefined;
  if (!words) return `${qty} ${line.name}`; // count / unknown units read naturally without a unit word
  return `${qty} ${line.amount > 1 ? words[1] : words[0]} ${line.name}`;
}
