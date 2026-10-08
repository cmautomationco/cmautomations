/** Money is stored in pence (integers) so totals never drift. */
export const toPence = (pounds) => Math.round((Number(pounds) || 0) * 100);
export const toPounds = (pence) => (Number(pence) || 0) / 100;
export function formatMoney(pence, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(toPounds(pence));
}
