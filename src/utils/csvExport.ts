import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type CsvRow = Record<string, string | number | boolean | null | undefined>;

function csvEscape(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? '' : String(value);
  // Spreadsheet apps evaluate cells beginning with these characters as formulas.
  // Prefix user-controlled values so exported names/reasons remain plain text.
  const text = typeof value === 'string' && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

export async function shareCsv(filename: string, rows: CsvRow[]): Promise<void> {
  const csv = toCsv(rows);
  const safeName = filename.replace(/[^\w.-]+/g, '_');
  const uri = `${FileSystem.cacheDirectory}${safeName.endsWith('.csv') ? safeName : `${safeName}.csv`}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: safeName, UTI: 'public.comma-separated-values-text' });
  }
}
