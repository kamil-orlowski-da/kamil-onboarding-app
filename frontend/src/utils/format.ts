/**
 * Display formatting. Values keep their wire form (timestamps as ISO 8601)
 * everywhere except the point of rendering, which is here.
 */

/** An ISO 8601 timestamp, in the viewer's locale. Blank if unparseable. */
export function formatDateTime(value: string | undefined): string {
  if (value === undefined || value === '') return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
