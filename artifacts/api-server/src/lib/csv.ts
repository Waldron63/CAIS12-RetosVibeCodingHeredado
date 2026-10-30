const BOM = "\uFEFF";
const NEWLINE = "\r\n";
// Spreadsheets run cells that start with these characters as formulas.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 CSV with BOM so Excel shows accents correctly. */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return BOM + lines.join(NEWLINE) + NEWLINE;
}
