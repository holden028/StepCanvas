import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { dialog, BrowserWindow } from 'electron';
import PptxGenJS from 'pptxgenjs';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import type { BrandingSettings, Chapter, ExportFormat, GuideData, Step } from '../../shared/types';
import { renderAnnotatedStepImage } from './annotate';

function imageTypeForPath(imagePath: string): 'png' | 'jpg' {
  return path.extname(imagePath).toLowerCase() === '.png' ? 'png' : 'jpg';
}

function imageToDataUrl(imagePath: string): string | null {
  if (!fs.existsSync(imagePath)) {
    return null;
  }
  const ext = path.extname(imagePath).toLowerCase() === '.png' ? 'png' : 'jpeg';
  const base64 = fs.readFileSync(imagePath, 'base64');
  return `data:image/${ext};base64,${base64}`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface ChapterGroup {
  chapter: Chapter | null;
  steps: Step[];
}

function groupStepsByChapter(guide: GuideData): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  const ungrouped = guide.steps.filter((s) => !s.chapterId);
  if (ungrouped.length > 0 || guide.chapters.length === 0) {
    groups.push({ chapter: null, steps: ungrouped });
  }
  for (const ch of guide.chapters) {
    groups.push({ chapter: ch, steps: guide.steps.filter((s) => s.chapterId === ch.id) });
  }
  return groups;
}

function tocHtml(guide: GuideData, color: string): string {
  if (guide.chapters.length === 0) return '';
  const groups = groupStepsByChapter(guide);
  let html = `<div class="toc" style="page-break-after: always; padding: 40px 20px; min-height: 70vh;">
    <h2 style="font-size: 24px; color: ${color}; margin-bottom: 24px; font-weight: 700;">Table of Contents</h2>`;
  let stepCounter = 0;
  for (const group of groups) {
    if (group.chapter) {
      html += `<div style="margin-bottom: 16px;">
        <div style="font-size: 16px; font-weight: 700; color: ${color}; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid ${color}20;">${escapeHtml(group.chapter.title)}</div>`;
      for (const step of group.steps) {
        stepCounter++;
        html += `<div style="font-size: 13px; color: #444; padding: 3px 0 3px 16px;">${stepCounter}. ${escapeHtml(step.title.replace(/^Step \d+:\s*/, ''))}</div>`;
      }
      html += `</div>`;
    } else {
      for (const step of group.steps) {
        stepCounter++;
        html += `<div style="font-size: 13px; color: #444; padding: 3px 0;">${stepCounter}. ${escapeHtml(step.title.replace(/^Step \d+:\s*/, ''))}</div>`;
      }
    }
  }
  html += `</div>`;
  return html;
}

function coverPageHtml(guide: GuideData): string {
  const b = guide.settings.branding;
  if (!b?.includeCoverPage) return '';
  const color = b.primaryColor || '#2563eb';
  const logoImg = b.logoPath ? imageToDataUrl(b.logoPath) : null;
  const bgImg = b.backgroundPath ? imageToDataUrl(b.backgroundPath) : null;

  const highlightsHtml = (b.highlights ?? []).filter((h) => h.trim()).length > 0
    ? `<div style="text-align: left; max-width: 440px; margin: 0 auto 24px; padding: 16px 20px; background: ${bgImg ? 'rgba(255,255,255,0.7)' : '#f5f5f5'}; border-radius: 10px; border-left: 4px solid ${color};${bgImg ? ' backdrop-filter: blur(4px);' : ''}">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; font-weight: 600;">What you'll learn</div>
        ${b.highlights!.filter((h) => h.trim()).map((h) => `<div style="font-size: 13px; color: #333; margin-bottom: 4px;">• ${escapeHtml(h)}</div>`).join('')}
      </div>`
    : '';

  const bgStyle = bgImg
    ? `position: relative; background-image: url(${bgImg}); background-size: cover; background-position: center;`
    : '';
  const overlayDiv = bgImg
    ? `<div style="position: absolute; inset: 0; background: rgba(255,255,255,0.82);"></div>`
    : '';
  const contentZIndex = bgImg ? 'position: relative; z-index: 1;' : '';

  return `
    <div class="cover-page" style="page-break-after: always; min-height: 90vh; ${bgStyle}">
      ${overlayDiv}
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; text-align: center; padding: 40px 20px; ${contentZIndex}">
        ${logoImg ? `<img src="${logoImg}" alt="Logo" style="max-width: 180px; max-height: 120px; margin-bottom: 32px;" />` : ''}
        ${b.brandName ? `<div style="font-size: 16px; color: ${color}; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px;">${escapeHtml(b.brandName)}</div>` : ''}
        <h1 style="font-size: 36px; margin: 0 0 16px; color: #111;">${escapeHtml(guide.meta.title)}</h1>
        ${b.purposeSummary ? `<p style="font-size: 16px; color: #555; max-width: 500px; margin: 0 auto 24px;">${escapeHtml(b.purposeSummary)}</p>` : ''}
        ${highlightsHtml}
        <div style="margin-top: 32px; font-size: 14px; color: #666;">
          ${b.authorName ? `<div>Authored by <strong>${escapeHtml(b.authorName)}</strong></div>` : ''}
          ${b.authorRole ? `<div>${escapeHtml(b.authorRole)}</div>` : ''}
          ${b.showDate !== false ? `<div style="margin-top: 8px;">${formatDate(guide.meta.updatedAt)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function authorFooterHtml(b?: BrandingSettings): string {
  if (!b?.authorName) return '';
  return `<footer style="margin-top: 48px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 12px; color: #888;">
    Document by ${escapeHtml(b.authorName)}${b.authorRole ? ` (${escapeHtml(b.authorRole)})` : ''}${b.brandName ? ` — ${escapeHtml(b.brandName)}` : ''}
  </footer>`;
}

export function htmlForGuide(guide: GuideData): string {
  const b = guide.settings.branding;
  const color = b?.primaryColor || '#2563eb';
  const hasCover = !!b?.includeCoverPage;
  const hasChapters = guide.chapters.length > 0;
  const groups = groupStepsByChapter(guide);

  let stepCounter = 0;
  let body = '';

  for (const group of groups) {
    if (group.chapter) {
      body += `<div class="chapter-heading" style="page-break-before: always; margin-bottom: 24px; padding-bottom: 8px; border-bottom: 3px solid ${color};">
        <h2 style="font-size: 22px; margin: 0; color: ${color}; font-weight: 700;">${escapeHtml(group.chapter.title)}</h2>
      </div>`;
    }
    for (const step of group.steps) {
      stepCounter++;
      const image = step.screenshotPath ? imageToDataUrl(step.screenshotPath) : null;
      const annotations = step.annotations.length > 0 ? `<p><strong>Annotations:</strong> ${step.annotations.length}</p>` : '';
      const extraInstructions = step.additionalInstructions
        ? `<p><strong>Additional instructions:</strong><br/>${escapeHtml(step.additionalInstructions).replaceAll('\n', '<br/>')}</p>`
        : '';
      body += `
        <section class="step">
          <h3 style="color: ${color};">${stepCounter}. ${escapeHtml(step.title)}</h3>
          ${image ? `<img src="${image}" alt="Step ${stepCounter}" />` : ''}
          ${step.description ? `<p>${escapeHtml(step.description)}</p>` : ''}
          ${extraInstructions}
          ${annotations}
        </section>`;
    }
  }

  const titleBlock = hasCover ? '' : `<h1 style="color: ${color}; margin-bottom: 24px;">${escapeHtml(guide.meta.title)}</h1>`;
  const tocBlock = hasChapters ? tocHtml(guide, color) : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(guide.meta.title)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #111; line-height: 1.5; }
    h1 { margin-bottom: 24px; }
    .step { margin-bottom: 28px; page-break-inside: avoid; }
    .step h3 { margin-bottom: 8px; }
    .step img { max-width: 100%; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 8px; }
    .step p { margin: 4px 0; font-size: 14px; }
  </style>
</head>
<body>
  ${coverPageHtml(guide)}
  ${tocBlock}
  ${titleBlock}
  ${body}
  ${authorFooterHtml(b)}
</body>
</html>`;
}

export function toMarkdown(guide: GuideData): string {
  const b = guide.settings.branding;
  const coverLines: string[] = [];
  if (b?.includeCoverPage) {
    coverLines.push(`# ${guide.meta.title}\n`);
    if (b.brandName) coverLines.push(`**${b.brandName}**\n`);
    if (b.purposeSummary) coverLines.push(`${b.purposeSummary}\n`);
    const hl = (b.highlights ?? []).filter((h) => h.trim());
    if (hl.length > 0) {
      coverLines.push('**What you\'ll learn:**\n');
      hl.forEach((h) => coverLines.push(`- ${h}`));
      coverLines.push('');
    }
    if (b.authorName) coverLines.push(`*${b.authorName}${b.authorRole ? ` — ${b.authorRole}` : ''}*\n`);
    if (b.showDate !== false) coverLines.push(`*${formatDate(guide.meta.updatedAt)}*\n`);
    coverLines.push('---\n');
  }

  const groups = groupStepsByChapter(guide);
  const hasChapters = guide.chapters.length > 0;

  if (hasChapters) {
    const tocLines: string[] = ['## Table of Contents\n'];
    let counter = 0;
    for (const g of groups) {
      if (g.chapter) {
        tocLines.push(`### ${g.chapter.title}`);
        for (const step of g.steps) {
          counter++;
          tocLines.push(`${counter}. ${step.title.replace(/^Step \d+:\s*/, '')}`);
        }
        tocLines.push('');
      } else {
        for (const step of g.steps) {
          counter++;
          tocLines.push(`${counter}. ${step.title.replace(/^Step \d+:\s*/, '')}`);
        }
      }
    }
    tocLines.push('---\n');
    coverLines.push(...tocLines);
  }

  const parts: string[] = [];
  let stepCounter = 0;
  for (const group of groups) {
    if (group.chapter) {
      parts.push(`## ${group.chapter.title}`);
    }
    for (const step of group.steps) {
      stepCounter++;
      const image = step.screenshotPath ? `![Step ${stepCounter}](images/${path.basename(step.screenshotPath)})\n\n` : '';
      const extra = step.additionalInstructions ? `\n\n**Additional instructions**\n${step.additionalInstructions}` : '';
      parts.push(`### Step ${stepCounter} - ${step.title.replace(/^Step \d+:\s*/, '')}\n\n${image}${step.description || ''}${extra}`.trim());
    }
  }

  const header = coverLines.length > 0 ? coverLines.join('\n') : `# ${guide.meta.title}`;
  return [header, ...parts].join('\n\n');
}

async function exportMarkdown(win: BrowserWindow, guide: GuideData): Promise<boolean> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Export Markdown Bundle',
    buttonLabel: 'Export Here',
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return false;
  }
  const targetDir = result.filePaths[0];
  const imagesDir = path.join(targetDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  guide.steps.forEach((step) => {
    if (!step.screenshotPath || !fs.existsSync(step.screenshotPath)) {
      return;
    }
    fs.copyFileSync(step.screenshotPath, path.join(imagesDir, path.basename(step.screenshotPath)));
  });
  fs.writeFileSync(path.join(targetDir, 'guide.md'), toMarkdown(guide), 'utf-8');
  return true;
}

async function exportHtml(win: BrowserWindow, guide: GuideData): Promise<boolean> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Export HTML',
    defaultPath: `${guide.meta.title || 'guide'}.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (!result.filePath) {
    return false;
  }
  fs.writeFileSync(result.filePath, htmlForGuide(guide), 'utf-8');
  return true;
}

async function exportPdf(win: BrowserWindow, guide: GuideData): Promise<boolean> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Export PDF',
    defaultPath: `${guide.meta.title || 'guide'}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!result.filePath) {
    return false;
  }
  const tempFiles: string[] = [];
  const htmlGuide: GuideData = {
    ...guide,
    steps: [...guide.steps],
  };
  for (const [index, step] of guide.steps.entries()) {
    const rendered = await renderAnnotatedStepImage(step);
    if (rendered) {
      htmlGuide.steps[index] = { ...step, screenshotPath: rendered };
      if (rendered !== step.screenshotPath) {
        tempFiles.push(rendered);
      }
    }
  }
  const hiddenWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: false,
    width: 1280,
    height: 800,
    webPreferences: {
      sandbox: true,
    },
  });
  hiddenWindow.setMenuBarVisibility(false);
  const tempHtmlPath = path.join(os.tmpdir(), `stepcanvas-pdf-${randomUUID()}.html`);
  try {
    const html = htmlForGuide(htmlGuide);
    fs.writeFileSync(tempHtmlPath, html, 'utf-8');
    await hiddenWindow.loadFile(tempHtmlPath);
    await hiddenWindow.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true');
    const pdf = await hiddenWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'default',
      },
    });
    fs.writeFileSync(result.filePath, pdf);
  } finally {
    hiddenWindow.destroy();
    try {
      fs.unlinkSync(tempHtmlPath);
    } catch {
      // Ignore temp cleanup errors
    }
    tempFiles.forEach((filePath) => {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore temp cleanup errors
      }
    });
  }
  return true;
}

async function exportDocx(win: BrowserWindow, guide: GuideData): Promise<boolean> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Export DOCX',
    defaultPath: `${guide.meta.title || 'guide'}.docx`,
    filters: [{ name: 'DOCX', extensions: ['docx'] }],
  });
  if (!result.filePath) {
    return false;
  }
  const b = guide.settings.branding;
  const children: Paragraph[] = [];
  const tempFiles: string[] = [];

  if (b?.includeCoverPage) {
    if (b.logoPath && fs.existsSync(b.logoPath)) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          type: imageTypeForPath(b.logoPath),
          data: fs.readFileSync(b.logoPath),
          transformation: { width: 150, height: 80 },
        })],
      }));
    }
    if (b.brandName) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: b.brandName, bold: true, size: 28 })],
      }));
    }
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: guide.meta.title, bold: true, size: 48 })],
    }));
    if (b.purposeSummary) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [new TextRun({ text: b.purposeSummary, size: 24, italics: true })],
      }));
    }
    const docxHighlights = (b.highlights ?? []).filter((h) => h.trim());
    if (docxHighlights.length > 0) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300 },
        children: [new TextRun({ text: "What you'll learn:", bold: true, size: 22 })],
      }));
      docxHighlights.forEach((h) => {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `• ${h}`, size: 22 })],
        }));
      });
    }
    if (b.authorName) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [
          new TextRun({ text: `By ${b.authorName}`, size: 22 }),
          ...(b.authorRole ? [new TextRun({ text: ` — ${b.authorRole}`, size: 22, italics: true })] : []),
        ],
      }));
    }
    if (b.showDate !== false) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100 },
        children: [new TextRun({ text: formatDate(guide.meta.updatedAt), size: 20 })],
      }));
    }
    children.push(new Paragraph({ text: '', spacing: { after: 600 } }));
  }

  const groups = groupStepsByChapter(guide);
  const hasChapters = guide.chapters.length > 0;

  if (hasChapters) {
    children.push(new Paragraph({ text: 'Table of Contents', heading: HeadingLevel.HEADING_1, spacing: { before: 200 } }));
    let tocCounter = 0;
    for (const g of groups) {
      if (g.chapter) {
        children.push(new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({ text: g.chapter.title, bold: true, size: 24 })],
        }));
      }
      for (const step of g.steps) {
        tocCounter++;
        children.push(new Paragraph({
          indent: { left: g.chapter ? 400 : 0 },
          children: [new TextRun({ text: `${tocCounter}. ${step.title.replace(/^Step \d+:\s*/, '')}`, size: 20 })],
        }));
      }
    }
    children.push(new Paragraph({ text: '', spacing: { after: 400 } }));
  }

  if (!b?.includeCoverPage) {
    children.push(new Paragraph({ text: guide.meta.title, heading: HeadingLevel.HEADING_1 }));
  }

  let stepCounter = 0;
  for (const group of groups) {
    if (group.chapter) {
      children.push(new Paragraph({
        text: group.chapter.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 600 },
      }));
    }
    for (const step of group.steps) {
      stepCounter++;
      children.push(new Paragraph({ text: `Step ${stepCounter}: ${step.title.replace(/^Step \d+:\s*/, '')}`, heading: HeadingLevel.HEADING_2 }));
      if (step.description) {
        children.push(new Paragraph(step.description));
      }
      if (step.additionalInstructions) {
        children.push(new Paragraph({ text: 'Additional instructions:', heading: HeadingLevel.HEADING_3 }));
        children.push(new Paragraph(step.additionalInstructions));
      }
      const rendered = await renderAnnotatedStepImage(step);
      if (rendered && fs.existsSync(rendered)) {
        if (rendered !== step.screenshotPath) {
          tempFiles.push(rendered);
        }
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: imageTypeForPath(rendered),
                data: fs.readFileSync(rendered),
                transformation: { width: 560, height: 320 },
              }),
            ],
          }),
        );
      }
    }
  }

  if (b?.authorName) {
    children.push(new Paragraph({
      spacing: { before: 600 },
      children: [new TextRun({
        text: `Document by ${b.authorName}${b.authorRole ? ` (${b.authorRole})` : ''}${b.brandName ? ` — ${b.brandName}` : ''}`,
        size: 18,
        italics: true,
      })],
    }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(result.filePath, buffer);
  tempFiles.forEach((filePath) => {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore temp cleanup errors
    }
  });
  return true;
}

async function exportPptx(win: BrowserWindow, guide: GuideData): Promise<boolean> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Export PPTX',
    defaultPath: `${guide.meta.title || 'guide'}.pptx`,
    filters: [{ name: 'PPTX', extensions: ['pptx'] }],
  });
  if (!result.filePath) {
    return false;
  }
  const b = guide.settings.branding;
  const color = b?.primaryColor || '#2563eb';
  const pptx = new PptxGenJS();

  const titleSlide = pptx.addSlide();
  if (b?.includeCoverPage) {
    if (b.backgroundPath && fs.existsSync(b.backgroundPath)) {
      titleSlide.addImage({ path: b.backgroundPath, x: 0, y: 0, w: '100%', h: '100%' });
      titleSlide.addShape('rect' as unknown as PptxGenJS.ShapeType, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: 'FFFFFF', transparency: 18 } });
    }
    if (b.logoPath && fs.existsSync(b.logoPath)) {
      titleSlide.addImage({ path: b.logoPath, x: 5, y: 0.5, w: 3, h: 1.5 });
    }
    if (b.brandName) {
      titleSlide.addText(b.brandName, { x: 0.5, y: 0.8, w: 12, h: 0.5, fontSize: 14, color: color.replace('#', ''), bold: true, align: 'center' });
    }
    titleSlide.addText(guide.meta.title, { x: 0.5, y: 2.5, w: 12, h: 1.2, fontSize: 32, bold: true, align: 'center', color: color.replace('#', '') });
    if (b.purposeSummary) {
      titleSlide.addText(b.purposeSummary, { x: 1.5, y: 3.8, w: 10, h: 0.8, fontSize: 14, align: 'center', color: '666666', italic: true });
    }
    const pptxHighlights = (b.highlights ?? []).filter((h) => h.trim());
    if (pptxHighlights.length > 0) {
      const hlText = pptxHighlights.map((h) => `• ${h}`).join('\n');
      titleSlide.addText(hlText, { x: 2, y: 4.7, w: 9, h: 1.2, fontSize: 11, color: '444444', align: 'left' });
    }
    const authorLine = [b.authorName, b.authorRole].filter(Boolean).join(' — ');
    if (authorLine) {
      titleSlide.addText(authorLine, { x: 0.5, y: 5.2, w: 12, h: 0.5, fontSize: 12, align: 'center', color: '888888' });
    }
    if (b.showDate !== false) {
      titleSlide.addText(formatDate(guide.meta.updatedAt), { x: 0.5, y: 5.7, w: 12, h: 0.4, fontSize: 10, align: 'center', color: 'aaaaaa' });
    }
  } else {
    titleSlide.addText(guide.meta.title, { x: 0.5, y: 1.5, w: 12, h: 1, fontSize: 28, bold: true });
  }

  const pptxGroups = groupStepsByChapter(guide);
  const hasChaptersPptx = guide.chapters.length > 0;

  if (hasChaptersPptx) {
    const tocSlide = pptx.addSlide();
    tocSlide.addText('Table of Contents', { x: 0.5, y: 0.3, w: 12, h: 0.7, fontSize: 24, bold: true, color: color.replace('#', '') });
    let tocY = 1.2;
    let tocNum = 0;
    for (const g of pptxGroups) {
      if (g.chapter) {
        tocSlide.addText(g.chapter.title, { x: 0.5, y: tocY, w: 12, h: 0.4, fontSize: 16, bold: true, color: color.replace('#', '') });
        tocY += 0.45;
      }
      for (const step of g.steps) {
        tocNum++;
        if (tocY < 6.8) {
          tocSlide.addText(`${tocNum}. ${step.title.replace(/^Step \d+:\s*/, '')}`, { x: g.chapter ? 1 : 0.5, y: tocY, w: 11, h: 0.3, fontSize: 11, color: '444444' });
          tocY += 0.32;
        }
      }
    }
  }

  const tempFiles: string[] = [];
  let pptxStepCounter = 0;
  for (const group of pptxGroups) {
    if (group.chapter) {
      const chSlide = pptx.addSlide();
      chSlide.addText(group.chapter.title, { x: 0.5, y: 2.5, w: 12, h: 1.5, fontSize: 32, bold: true, align: 'center', color: color.replace('#', '') });
    }
    for (const step of group.steps) {
      pptxStepCounter++;
      const slide = pptx.addSlide();
      slide.addText(`Step ${pptxStepCounter}: ${step.title.replace(/^Step \d+:\s*/, '')}`, { x: 0.5, y: 0.2, w: 12, h: 0.6, fontSize: 20, bold: true, color: color.replace('#', '') });
      const rendered = await renderAnnotatedStepImage(step);
      if (rendered && fs.existsSync(rendered)) {
        if (rendered !== step.screenshotPath) {
          tempFiles.push(rendered);
        }
        slide.addImage({ path: rendered, x: 0.7, y: 1, w: 8.8, h: 4.8 });
      }
      if (step.description) {
        slide.addText(step.description, { x: 9.6, y: 1.1, w: 3.3, h: 4.6, fontSize: 12 });
      }
      if (step.additionalInstructions) {
        slide.addText(`Additional instructions:\n${step.additionalInstructions}`, { x: 9.6, y: 5.8, w: 3.3, h: 1.3, fontSize: 10 });
      }
    }
  }
  await pptx.writeFile({ fileName: result.filePath });
  tempFiles.forEach((filePath) => {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore temp cleanup errors
    }
  });
  return true;
}

async function exportJson(win: BrowserWindow, guide: GuideData): Promise<boolean> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Export JSON',
    defaultPath: `${guide.meta.title || 'guide'}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!result.filePath) {
    return false;
  }
  fs.writeFileSync(result.filePath, JSON.stringify(guide, null, 2), 'utf-8');
  return true;
}

export async function exportGuide(win: BrowserWindow, guide: GuideData, format: ExportFormat): Promise<boolean> {
  switch (format) {
    case 'markdown':
      return exportMarkdown(win, guide);
    case 'html':
      return exportHtml(win, guide);
    case 'pdf':
      return exportPdf(win, guide);
    case 'docx':
      return exportDocx(win, guide);
    case 'pptx':
      return exportPptx(win, guide);
    case 'json':
    default:
      return exportJson(win, guide);
  }
}
