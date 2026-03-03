import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Step, StepAnnotation } from '../../shared/types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function annotationScale(annotation: StepAnnotation, imageWidth: number, imageHeight: number): { sx: number; sy: number } {
  const sx = imageWidth / (annotation.baseWidth || imageWidth);
  const sy = imageHeight / (annotation.baseHeight || imageHeight);
  return { sx, sy };
}

function svgOverlayForAnnotations(annotations: StepAnnotation[], width: number, height: number): string {
  const shapes = annotations
    .map((annotation) => {
      const { sx, sy } = annotationScale(annotation, width, height);
      const x = (annotation.x || 0) * sx;
      const y = (annotation.y || 0) * sy;
      const w = (annotation.width || 0) * sx;
      const h = (annotation.height || 0) * sy;
      if (annotation.type === 'arrow') {
        const x2 = x + w;
        const y2 = y + h;
        return `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#a855f7" stroke-width="4" marker-end="url(#arrowhead)" />`;
      }
      if (annotation.type === 'circle') {
        const rx = Math.abs(w) / 2;
        const ry = Math.abs(h) / 2;
        const cx = x + w / 2;
        const cy = y + h / 2;
        return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#f59e0b" stroke-width="4" />`;
      }
      if (annotation.type === 'text') {
        const text = (annotation.text || 'Note').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        const boxWidth = Math.max(120 * sx, Math.abs(w) || 120 * sx);
        const boxHeight = Math.max(30 * sy, Math.abs(h) || 30 * sy);
        return `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" fill="rgba(15,23,42,0.75)" stroke="#a855f7" stroke-width="2" rx="6" ry="6" />
<text x="${x + 8}" y="${y + boxHeight / 2 + 5}" fill="#f8fafc" font-size="${Math.max(12 * sy, 12)}" font-family="Arial, sans-serif">${text}</text>`;
      }
      if (annotation.type === 'crop') {
        return `<rect x="${x}" y="${y}" width="${Math.abs(w)}" height="${Math.abs(h)}" fill="none" stroke="#22c55e" stroke-width="3" />`;
      }
      if (annotation.type === 'blur') {
        return `<rect x="${x}" y="${y}" width="${Math.abs(w)}" height="${Math.abs(h)}" fill="rgba(255,255,255,0.08)" stroke="#ef4444" stroke-width="2" stroke-dasharray="8,4" />`;
      }
      return '';
    })
    .join('\n');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="#a855f7" />
  </marker>
</defs>
${shapes}
</svg>`;
}

export async function renderAnnotatedStepImage(step: Step): Promise<string | null> {
  if (!step.screenshotPath || !fs.existsSync(step.screenshotPath)) {
    return null;
  }
  if (!step.annotations || step.annotations.length === 0) {
    return step.screenshotPath;
  }
  const image = sharp(step.screenshotPath);
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) {
    return step.screenshotPath;
  }

  let pipeline = image.clone();
  for (const annotation of step.annotations.filter((a) => a.type === 'blur')) {
    const { sx, sy } = annotationScale(annotation, width, height);
    const left = Math.floor(clamp(annotation.x * sx, 0, width));
    const top = Math.floor(clamp(annotation.y * sy, 0, height));
    const regionWidth = Math.floor(clamp(Math.abs((annotation.width || 0) * sx), 1, width - left));
    const regionHeight = Math.floor(clamp(Math.abs((annotation.height || 0) * sy), 1, height - top));
    if (regionWidth <= 0 || regionHeight <= 0) continue;
    const region = await sharp(step.screenshotPath).extract({ left, top, width: regionWidth, height: regionHeight }).blur(10).toBuffer();
    pipeline = pipeline.composite([{ input: region, left, top }]);
  }

  const svg = svgOverlayForAnnotations(step.annotations, width, height);
  const outputPath = path.join(os.tmpdir(), `stepcanvas-annotated-${randomUUID()}.png`);
  await pipeline.composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(outputPath);
  return outputPath;
}
