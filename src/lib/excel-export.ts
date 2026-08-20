// Excel export helper built on ExcelJS (replaces the legacy xlsx/SheetJS
// dependency — see MIGRATION_STATUS.md for why). Mirrors the same shape the
// legacy pages built by hand: one or more named sheets, each a list of
// plain row objects keyed by column header, with fixed column widths.
//
// ExcelJS is dynamically imported — it's a large library (~900KB) that only
// a handful of admin export buttons ever touch, so it shouldn't sit in the
// main bundle every user downloads on every page load.

export interface ExcelSheetSpec {
  name: string;
  /** Row-object sheets: header row is Object.keys() of the first row. */
  rows?: Record<string, string | number>[];
  /** Raw array-of-arrays sheets — for title blocks / key-value layouts that
   * don't fit a single-header table (e.g. a "Summary" sheet). */
  aoa?: (string | number)[][];
  /** Column widths in characters, same order as the sheet's columns. */
  columnWidths?: number[];
}

// Excel sheet names: max 31 chars, and \ / ? * [ ] : are not allowed.
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
}

export async function exportWorkbook(sheets: ExcelSheetSpec[], filename: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(safeSheetName(spec.name));

    if (spec.aoa) {
      ws.addRows(spec.aoa);
      spec.columnWidths?.forEach((w, i) => {
        ws.getColumn(i + 1).width = w;
      });
      continue;
    }

    const rows = spec.rows || [];
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    ws.columns = headers.map((h, i) => ({
      header: h,
      key: h,
      width: spec.columnWidths?.[i] ?? 18,
    }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
