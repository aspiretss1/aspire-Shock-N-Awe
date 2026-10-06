'use client';

/**
 * Rasterize the on-screen letter article into a multi-page PDF download.
 */
export async function downloadLetterPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#f8f7f3',
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const usableW = pageWidth - margin * 2;
  const usableH = pageHeight - margin * 2;

  const imgWidth = usableW;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  if (imgHeight <= usableH) {
    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
  } else {
    // Slice the tall canvas across pages.
    const sliceH = Math.floor((usableH * canvas.width) / imgWidth);
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      if (page > 0) pdf.addPage();
      const h = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#f8f7f3';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      const sliceData = slice.toDataURL('image/jpeg', 0.92);
      const drawH = (h * imgWidth) / canvas.width;
      pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, drawH);
      y += h;
      page += 1;
    }
  }

  pdf.save(filename);
}
