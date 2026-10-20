import { MUTED, NAVY, startPdf } from './pdf-common';

/** Owner 2026-10-20: a document built from a template — the title and the
 * filled text, paragraph by paragraph. Lines starting with "# " are
 * headings. No signature block: signing is its own step. */
export function renderDocumentPdf(input: {
  title: string;
  text: string;
}): Promise<Buffer> {
  const { doc, done } = startPdf({ title: input.title });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.fillColor(NAVY).fontSize(18).text(input.title, left, 54, {
    width,
    align: 'center',
  });
  doc.moveDown(1.2);
  doc.fontSize(11);
  for (const raw of input.text.split('\n')) {
    const line = raw.trimEnd();
    if (line === '') {
      doc.moveDown(0.6);
    } else if (line.startsWith('# ')) {
      doc
        .moveDown(0.3)
        .fillColor(NAVY)
        .fontSize(13)
        .text(line.slice(2), { width });
      doc.fontSize(11);
    } else {
      doc
        .fillColor('#1A2238')
        .fontSize(11)
        .text(line, { width, align: 'left' });
    }
  }
  if (doc.y > doc.page.height - 120) doc.addPage();
  // Below the bottom margin pdfkit would start a new page for the footer.
  doc.page.margins.bottom = 0;
  doc.fillColor(MUTED).fontSize(8);
  doc.text(
    'Prepared in LawBid from a template. Check it before use. / Подготовлено в LawBid по шаблону. Проверьте перед использованием.',
    left,
    doc.page.height - 70,
    { width, align: 'center', lineBreak: true },
  );
  doc.end();
  return done;
}
