/** Render table relationships explicitly rather than silently shifting merged cells. */
export function tableMarkdown(table: HTMLTableElement, convert: (html: string) => string): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table,
  );
  if (!rows.length) return '';
  const cells = rows.map((row) =>
    Array.from(row.children).filter((cell) => /^(TH|TD)$/.test(cell.tagName)),
  );
  const span = (cell: Element, name: string) => {
    const value = Number(cell.getAttribute(name) ?? 1);
    return Number.isInteger(value) && value >= 0 ? value : 1;
  };
  const caption = Array.from(table.children).find((el) => el.tagName === 'CAPTION');
  const title = caption ? `${convert(caption.innerHTML).trim()}\n\n` : '';
  const records = () =>
    `\n\n${title}> Table shown as row/cell records to preserve its complex layout.\n\n${cells
      .map(
        (row, ri) =>
          `- Row ${ri + 1}:\n${row
            .map(
              (cell, ci) =>
                `  - Cell ${ci + 1} (row span ${span(cell, 'rowspan')}, column span ${span(cell, 'colspan')}):\n${convert(
                  cell.innerHTML,
                )
                  .trim()
                  .split('\n')
                  .map((line) => `    ${line}`)
                  .join('\n')}`,
            )
            .join('\n')}`,
      )
      .join('\n')}\n\n`;
  if (table.querySelector('table, pre, ul, ol, dl') || rows.length > 1000) return records();
  const grid: string[][] = rows.map(() => []);
  let merged = false;
  for (let ri = 0; ri < cells.length; ri++) {
    let column = 0;
    for (const cell of cells[ri]) {
      while (grid[ri][column] !== undefined) column++;
      const colSpan = Math.max(1, span(cell, 'colspan'));
      const rawRowSpan = span(cell, 'rowspan');
      // HTML rowspan=0 covers the rest of this row group, not subsequent groups.
      let groupEnd = ri + 1;
      while (groupEnd < rows.length && rows[groupEnd].parentElement === rows[ri].parentElement)
        groupEnd++;
      const rowSpan = rawRowSpan === 0 ? groupEnd - ri : Math.min(rawRowSpan, groupEnd - ri);
      if (column + colSpan > 128 || rows.length * (column + colSpan) > 20_000) return records();
      const content = convert(cell.innerHTML)
        .trim()
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '<br>');
      merged ||= colSpan > 1 || rowSpan > 1;
      for (let dy = 0; dy < Math.max(1, rowSpan); dy++) {
        for (let dx = 0; dx < colSpan; dx++) {
          if (grid[ri + dy][column + dx] !== undefined) return records();
          grid[ri + dy][column + dx] = content;
        }
      }
      column += colSpan;
    }
  }
  const width = Math.max(0, ...grid.map((row) => row.length));
  if (!width) return '';
  const padded = grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''));
  let headerRows = 0;
  for (let ri = 0; ri < cells.length; ri++) {
    const row = cells[ri];
    if (
      !row.length ||
      !row.every((cell) => cell.tagName === 'TH') ||
      row.some((cell) => /^(row|rowgroup)$/i.test(cell.getAttribute('scope') || ''))
    )
      break;
    const explicit =
      rows[ri].parentElement?.tagName === 'THEAD' ||
      row.every((cell) => /^(col|colgroup)$/i.test(cell.getAttribute('scope') || ''));
    if (explicit) {
      headerRows++;
      continue;
    }
    // A conventional first multi-column TH row may be inferred; later TH rows remain data.
    if (ri === 0 && width > 1) headerRows = 1;
    break;
  }
  const header = Array.from({ length: width }, (_, column) => {
    const labels = padded
      .slice(0, headerRows)
      .map((row) => row[column])
      .filter(Boolean);
    return labels.length
      ? labels.filter((label, i) => i === 0 || label !== labels[i - 1]).join(' / ')
      : `Column ${column + 1}`;
  });
  const data = padded.slice(headerRows);
  return `\n\n${title}${merged ? '> Merged table cells expanded across their covered rows/columns.\n\n' : ''}| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n${data.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`;
}
