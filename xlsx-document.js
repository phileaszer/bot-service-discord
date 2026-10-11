'use strict';

const { strToU8, zipSync } = require('fflate');

function xmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function columnName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
        value -= 1;
        name = String.fromCharCode(65 + (value % 26)) + name;
        value = Math.floor(value / 26);
    }
    return name;
}

function inlineCell(reference, value, style = 0) {
    const text = xmlEscape(String(value ?? '').replace(/[\r\n]+/g, ' ').trim());
    return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function createWorksheet({ title, subtitle, columns, rows }) {
    const safeColumns = Array.isArray(columns) && columns.length ? columns.map(String) : ['Données'];
    const safeRows = Array.isArray(rows) ? rows : [];
    const lastColumn = columnName(safeColumns.length - 1);
    const headerRow = 4;
    const lastRow = headerRow + safeRows.length;
    const widths = safeColumns.map((column) => {
        const longest = safeRows.reduce((length, row) => Math.max(length, String(row?.[column] ?? '').length), column.length);
        return Math.min(Math.max(longest + 3, 12), 42);
    });
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    const titleRow = `<row r="1" ht="28" customHeight="1">${inlineCell('A1', title || 'Rapport Sentinel', 1)}</row>`;
    const subtitleRow = `<row r="2" ht="20" customHeight="1">${inlineCell('A2', subtitle || 'Rapport administratif Sentinel', 3)}</row>`;
    const headingCells = safeColumns.map((column, index) => inlineCell(`${columnName(index)}${headerRow}`, column, 2)).join('');
    const headingRow = `<row r="${headerRow}" ht="24" customHeight="1">${headingCells}</row>`;
    const dataRows = safeRows.map((row, rowIndex) => {
        const rowNumber = headerRow + rowIndex + 1;
        const cells = safeColumns.map((column, columnIndex) => inlineCell(`${columnName(columnIndex)}${rowNumber}`, row?.[column])).join('');
        return `<row r="${rowNumber}">${cells}</row>`;
    }).join('');
    const mergedCells = safeColumns.length > 1
        ? `<mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>`
        : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${Math.max(lastRow, headerRow)}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${titleRow}${subtitleRow}${headingRow}${dataRows}</sheetData>
  <autoFilter ref="A${headerRow}:${lastColumn}${Math.max(lastRow, headerRow)}"/>
  ${mergedCells}
</worksheet>`;
}

function createXlsxDocument({ title, subtitle, columns, rows }) {
    const createdAt = new Date().toISOString();
    const files = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
        '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
        'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title || 'Rapport Sentinel')}</dc:title><dc:creator>Sentinel</dc:creator><cp:lastModifiedBy>Sentinel</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`),
        'docProps/app.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Sentinel</Application></Properties>`),
        'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sentinel" sheetId="1" r:id="rId1"/></sheets></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
        'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="18"/><color rgb="FF152838"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123544"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F7F7"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD3DEE3"/></left><right style="thin"><color rgb="FFD3DEE3"/></right><top style="thin"><color rgb="FFD3DEE3"/></top><bottom style="thin"><color rgb="FFD3DEE3"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
        'xl/worksheets/sheet1.xml': strToU8(createWorksheet({ title, subtitle, columns, rows }))
    };

    return Buffer.from(zipSync(files, { level: 6 }));
}

module.exports = { createXlsxDocument };
