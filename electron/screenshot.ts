import { app, desktopCapturer, screen } from 'electron';
import fs from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import type { CaptureRegion } from '../shared/types';

function ensureCaptureDir(): string {
  const captureDir = path.join(app.getPath('userData'), 'captures');
  fs.mkdirSync(captureDir, { recursive: true });
  return captureDir;
}

export async function captureScreenshot(
  x?: number,
  y?: number,
  outputPath?: string,
  options?: { width?: number; height?: number; quality?: number; mode?: 'snippet' | 'fullscreen' },
): Promise<{ path: string; region?: CaptureRegion }> {
    const point = { x: x ?? 0, y: y ?? 0 };
    const targetDisplay = screen.getDisplayNearestPoint(point);
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.max(1, Math.floor(targetDisplay.size.width * targetDisplay.scaleFactor)),
          height: Math.max(1, Math.floor(targetDisplay.size.height * targetDisplay.scaleFactor)),
        },
    });

    const matched = sources.find((source) => source.display_id === String(targetDisplay.id)) ?? sources[0];
    const imageBuf = matched.thumbnail.toPNG();
    const imageSize = matched.thumbnail.getSize();

    const finalPath = outputPath || path.join(ensureCaptureDir(), `screenshot-${Date.now()}.jpg`);
    const quality = options?.quality ?? 85;

    if (options?.mode !== 'fullscreen' && x !== undefined && y !== undefined) {
        // Crop region around click in input coordinate space.
        const width = Math.max(32, options?.width ?? 800);
        const height = Math.max(32, options?.height ?? 600);

        const displayBounds = targetDisplay.bounds;
        const localX = Math.max(0, Math.min(x - displayBounds.x, displayBounds.width));
        const localY = Math.max(0, Math.min(y - displayBounds.y, displayBounds.height));

        const clampedWidth = Math.min(width, displayBounds.width);
        const clampedHeight = Math.min(height, displayBounds.height);
        const cropLocalX = Math.max(0, Math.min(localX - clampedWidth / 2, displayBounds.width - clampedWidth));
        const cropLocalY = Math.max(0, Math.min(localY - clampedHeight / 2, displayBounds.height - clampedHeight));

        // Convert from display coordinate space to actual thumbnail pixel space.
        const ratioX = imageSize.width / displayBounds.width;
        const ratioY = imageSize.height / displayBounds.height;
        let extractLeft = Math.floor(cropLocalX * ratioX);
        let extractTop = Math.floor(cropLocalY * ratioY);
        let extractWidth = Math.max(1, Math.floor(clampedWidth * ratioX));
        let extractHeight = Math.max(1, Math.floor(clampedHeight * ratioY));

        // Keep extraction rectangle fully inside captured thumbnail bounds.
        extractLeft = Math.max(0, Math.min(extractLeft, Math.max(0, imageSize.width - 1)));
        extractTop = Math.max(0, Math.min(extractTop, Math.max(0, imageSize.height - 1)));
        extractWidth = Math.max(1, Math.min(extractWidth, imageSize.width - extractLeft));
        extractHeight = Math.max(1, Math.min(extractHeight, imageSize.height - extractTop));

        try {
          await sharp(imageBuf)
              .extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight })
              .jpeg({ quality })
              .toFile(finalPath);
        } catch {
          // Fallback: full-display image so we still keep a screenshot for this step.
          await sharp(imageBuf).jpeg({ quality }).toFile(finalPath);
        }
        return {
          path: finalPath,
          region: {
            x: Math.floor(displayBounds.x + cropLocalX),
            y: Math.floor(displayBounds.y + cropLocalY),
            width: clampedWidth,
            height: clampedHeight,
          },
        };
    } else {
        // Full display capture
        await sharp(imageBuf).jpeg({ quality }).toFile(finalPath);
        return {
          path: finalPath,
          region: {
            x: targetDisplay.bounds.x,
            y: targetDisplay.bounds.y,
            width: targetDisplay.bounds.width,
            height: targetDisplay.bounds.height,
          },
        };
    }
}
