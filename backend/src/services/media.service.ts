import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOADS_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface UploadedMedia {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  waveform?: number[];
}

export class MediaService {
  static saveBase64Media(params: {
    base64Data: string;
    fileName: string;
    mimeType: string;
    waveform?: number[];
  }): UploadedMedia {
    // Remove base64 header if present (e.g. data:image/png;base64,...)
    const matches = params.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const dataStr = matches ? matches[2] : params.base64Data;
    const buffer = Buffer.from(dataStr, 'base64');

    const ext = path.extname(params.fileName) || this.getExtensionFromMime(params.mimeType);
    const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    fs.writeFileSync(filePath, buffer);

    return {
      url: `/uploads/${uniqueName}`,
      fileName: params.fileName,
      fileSize: buffer.length,
      mimeType: params.mimeType,
      waveform: params.waveform,
    };
  }

  private static getExtensionFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'application/pdf': '.pdf',
    };
    return map[mime] || '.bin';
  }
}
