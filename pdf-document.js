'use strict';

const PAGE_SIZES = {
    portrait: { width: 595, height: 842 },
    landscape: { width: 842, height: 595 }
};

const COLORS = {
    ink: '#152033',
    muted: '#667085',
    line: '#D8DEE8',
    paper: '#FFFFFF',
    soft: '#F4F7FA',
    row: '#F8FAFC',
    navy: '#0B1220',
    cyan: '#13BBD2',
    mint: '#14B89A',
    pink: '#D9468A'
};

function cleanText(value) {
    return String(value ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-')
        .replace(/œ/g, 'oe')
        .replace(/Œ/g, 'OE')
        .replace(/€/g, 'EUR')
        .replace(/…/g, '...')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
        .replace(/\s+/g, ' ')
        .trim();
}

function pdfEscape(value) {
    return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function rgb(hex) {
    const value = String(hex || '#000000').replace('#', '');
    const parts = [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
    return parts.map(item => Number.isFinite(item) ? item.toFixed(3) : '0').join(' ');
}

function formatDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/Paris'
    }).format(date);
}

function wrapText(value, width, fontSize, maxLines = 8) {
    const text = cleanText(value);
    if (!text) return [''];
    const maxCharacters = Math.max(4, Math.floor(width / Math.max(fontSize * 0.52, 1)));
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';

    for (const originalWord of words) {
        const pieces = [];
        let word = originalWord;
        while (word.length > maxCharacters) {
            pieces.push(word.slice(0, Math.max(1, maxCharacters - 1)) + '-');
            word = word.slice(Math.max(1, maxCharacters - 1));
        }
        if (word) pieces.push(word);

        for (const piece of pieces) {
            const candidate = `${line} ${piece}`.trim();
            if (candidate.length > maxCharacters && line) {
                lines.push(line);
                line = piece;
            } else {
                line = candidate;
            }
            if (lines.length >= maxLines) break;
        }
        if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
        lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, maxCharacters - 3))}...`;
    }
    return lines.length ? lines : [''];
}

function computeColumnWidths(columns, rows, availableWidth) {
    if (!columns.length) return [];
    const minimum = columns.length >= 7 ? 54 : 72;
    const weights = columns.map(column => {
        const samples = rows.slice(0, 80).map(row => cleanText(row[column]).length);
        const longest = Math.max(cleanText(column).length, ...samples, 6);
        return Math.min(Math.max(Math.sqrt(longest) * 4, 8), 28);
    });
    const minimumTotal = minimum * columns.length;
    if (minimumTotal >= availableWidth) return columns.map(() => availableWidth / columns.length);
    const distributable = availableWidth - minimumTotal;
    const weightTotal = weights.reduce((sum, item) => sum + item, 0) || 1;
    return weights.map(weight => minimum + (distributable * weight / weightTotal));
}

function createProfessionalPdf({
    title,
    subtitle = 'Rapport administratif',
    metadata = [],
    sections = [],
    generatedAt = new Date(),
    confidentiality = 'Document interne Sentinel'
}) {
    const normalizedSections = (Array.isArray(sections) ? sections : []).map((section, index) => ({
        title: cleanText(section.title || `Section ${index + 1}`),
        description: cleanText(section.description || ''),
        columns: Array.isArray(section.columns) ? section.columns.map(cleanText) : [],
        rows: Array.isArray(section.rows) ? section.rows : []
    }));
    const landscape = normalizedSections.some(section => section.columns.length > 5);
    const { width, height } = PAGE_SIZES[landscape ? 'landscape' : 'portrait'];
    const margin = 38;
    const footerHeight = 34;
    const contentBottom = height - footerHeight - 18;
    const availableWidth = width - (margin * 2);
    const pages = [];
    let page = null;
    let y = 0;

    const command = value => page.commands.push(value);
    const fillRect = (x, top, rectWidth, rectHeight, color) => {
        command(`${rgb(color)} rg ${x.toFixed(2)} ${(height - top - rectHeight).toFixed(2)} ${rectWidth.toFixed(2)} ${rectHeight.toFixed(2)} re f`);
    };
    const line = (x1, top1, x2, top2, color = COLORS.line, lineWidth = 1) => {
        command(`${rgb(color)} RG ${lineWidth.toFixed(2)} w ${x1.toFixed(2)} ${(height - top1).toFixed(2)} m ${x2.toFixed(2)} ${(height - top2).toFixed(2)} l S`);
    };
    const text = (value, x, top, options = {}) => {
        const size = options.size || 9;
        const font = options.bold ? 'F2' : 'F1';
        const color = options.color || COLORS.ink;
        command(`BT /${font} ${size.toFixed(2)} Tf ${rgb(color)} rg ${x.toFixed(2)} ${(height - top - size).toFixed(2)} Td (${pdfEscape(value)}) Tj ET`);
    };

    function drawHeader(firstPage) {
        fillRect(0, 0, width, firstPage ? 92 : 62, COLORS.navy);
        fillRect(0, firstPage ? 89 : 59, width, 3, COLORS.cyan);
        fillRect(width - 106, 0, 106, 3, COLORS.pink);
        fillRect(margin, firstPage ? 22 : 17, 27, 27, COLORS.cyan);
        text('S', margin + 9, firstPage ? 27 : 22, { size: 13, bold: true, color: COLORS.navy });
        text('SENTINEL', margin + 39, firstPage ? 19 : 15, { size: 9, bold: true, color: COLORS.cyan });
        text(firstPage ? title : `${title} - suite`, margin + 39, firstPage ? 35 : 31, {
            size: firstPage ? 18 : 12,
            bold: true,
            color: COLORS.paper
        });
        if (firstPage) text(subtitle, margin + 39, 61, { size: 8.5, color: '#CCD5E2' });
        y = firstPage ? 108 : 78;
    }

    function startPage(firstPage = false) {
        page = { commands: [] };
        pages.push(page);
        fillRect(0, 0, width, height, COLORS.paper);
        drawHeader(firstPage);
    }

    function ensureSpace(required, repeat = null) {
        if (y + required <= contentBottom) return;
        startPage(false);
        if (typeof repeat === 'function') repeat();
    }

    function drawMetadata() {
        const items = [
            ...metadata.slice(0, 4).map(item => ({ label: cleanText(item.label), value: cleanText(item.value) })),
            { label: 'Généré le', value: formatDate(generatedAt) }
        ];
        const columns = Math.min(items.length, landscape ? 5 : 3);
        const boxWidth = availableWidth / columns;
        const rows = Math.ceil(items.length / columns);
        const boxHeight = 48;
        items.forEach((item, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = margin + (column * boxWidth);
            const top = y + (row * boxHeight);
            fillRect(x, top, boxWidth - 6, boxHeight - 6, COLORS.soft);
            text(item.label.toUpperCase(), x + 10, top + 9, { size: 6.5, bold: true, color: COLORS.muted });
            const valueLines = wrapText(item.value, boxWidth - 26, 8.5, 2);
            valueLines.forEach((itemLine, lineIndex) => text(itemLine, x + 10, top + 23 + (lineIndex * 10), {
                size: 8.5,
                bold: lineIndex === 0,
                color: COLORS.ink
            }));
        });
        y += rows * boxHeight + 10;
    }

    function drawSectionHeading(section, sectionNumber) {
        ensureSpace(52);
        text(String(sectionNumber).padStart(2, '0'), margin, y + 1, { size: 8, bold: true, color: COLORS.cyan });
        text(section.title, margin + 25, y, { size: 13, bold: true, color: COLORS.ink });
        line(margin + 25, y + 22, width - margin, y + 22, COLORS.line, 0.7);
        y += 30;
        if (section.description) {
            const descriptionLines = wrapText(section.description, availableWidth - 25, 8, 3);
            descriptionLines.forEach((itemLine, index) => text(itemLine, margin + 25, y + (index * 10), { size: 8, color: COLORS.muted }));
            y += descriptionLines.length * 10 + 7;
        }
    }

    function drawTableHeader(columns, widths) {
        const headerHeight = 25;
        fillRect(margin, y, availableWidth, headerHeight, COLORS.navy);
        let x = margin;
        columns.forEach((column, index) => {
            const lines = wrapText(column.toUpperCase(), widths[index] - 10, 6.8, 2);
            lines.forEach((itemLine, lineIndex) => text(itemLine, x + 5, y + 7 + (lineIndex * 8), {
                size: 6.8,
                bold: true,
                color: COLORS.paper
            }));
            x += widths[index];
        });
        y += headerHeight;
    }

    function drawSection(section, sectionNumber) {
        drawSectionHeading(section, sectionNumber);
        if (!section.columns.length || !section.rows.length) {
            ensureSpace(42);
            fillRect(margin + 25, y, availableWidth - 25, 34, COLORS.soft);
            text('Aucune donnée enregistrée pour cette section.', margin + 37, y + 11, { size: 8.5, color: COLORS.muted });
            y += 48;
            return;
        }

        const widths = computeColumnWidths(section.columns, section.rows, availableWidth);
        const fontSize = section.columns.length > 7 ? 6.3 : (section.columns.length > 5 ? 7 : 7.7);
        const lineHeight = fontSize + 2.4;
        const repeatHeader = () => drawTableHeader(section.columns, widths);
        ensureSpace(35);
        drawTableHeader(section.columns, widths);

        section.rows.forEach((row, rowIndex) => {
            const cells = section.columns.map((column, index) => wrapText(row[column], widths[index] - 10, fontSize, 8));
            const rowHeight = Math.max(25, Math.max(...cells.map(cell => cell.length)) * lineHeight + 10);
            ensureSpace(rowHeight + 1, repeatHeader);
            if (rowIndex % 2 === 0) fillRect(margin, y, availableWidth, rowHeight, COLORS.row);
            let x = margin;
            cells.forEach((cell, cellIndex) => {
                cell.forEach((itemLine, lineIndex) => text(itemLine, x + 5, y + 6 + (lineIndex * lineHeight), {
                    size: fontSize,
                    color: cellIndex === 0 ? COLORS.ink : COLORS.muted,
                    bold: cellIndex === 0
                }));
                if (cellIndex > 0) line(x, y, x, y + rowHeight, COLORS.line, 0.35);
                x += widths[cellIndex];
            });
            line(margin, y + rowHeight, width - margin, y + rowHeight, COLORS.line, 0.35);
            y += rowHeight;
        });
        y += 20;
    }

    startPage(true);
    drawMetadata();
    if (!normalizedSections.length) {
        drawSection({ title: 'Synthèse', description: '', columns: [], rows: [] }, 1);
    } else {
        normalizedSections.forEach((section, index) => drawSection(section, index + 1));
    }

    pages.forEach((item, index) => {
        page = item;
        line(margin, height - footerHeight, width - margin, height - footerHeight, COLORS.line, 0.7);
        text(confidentiality, margin, height - footerHeight + 10, { size: 7, color: COLORS.muted });
        text(`Page ${index + 1} / ${pages.length}`, width - margin - 48, height - footerHeight + 10, { size: 7, bold: true, color: COLORS.ink });
    });

    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
    const pageIds = [];
    const regularFontId = 3 + (pages.length * 2);
    const boldFontId = regularFontId + 1;
    pages.forEach((item, index) => {
        const pageObjectId = 3 + (index * 2);
        const contentObjectId = pageObjectId + 1;
        const stream = item.commands.join('\n');
        pageIds.push(pageObjectId);
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
        objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    });
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    let output = '%PDF-1.4\n%Sentinel\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(output, 'latin1'));
        output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    output += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output, 'latin1');
}

module.exports = {
    cleanText,
    createProfessionalPdf,
    formatDate
};
