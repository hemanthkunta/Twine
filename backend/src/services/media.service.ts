import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOADS_DIR = path.resolve('backend', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
    // Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',

    // Video
    'video/mp4',
    'video/webm',

    // Audio
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',

    // Documents
    'application/pdf',

    // Text/common files
    'application/json',
    'text/plain',
]);

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
        if (!params.base64Data || !params.fileName || !params.mimeType) {
            throw new Error('File data, filename, and MIME type are required');
        }

        const mimeType = params.mimeType.toLowerCase().trim();

        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            throw new Error(`File type not allowed: ${params.mimeType}`);
        }

        // Browser MediaRecorder can produce Data URLs such as:
        // data:audio/webm;codecs=opus;base64,AAAA...
        // Split at the first comma so MIME parameters do not affect decoding.
        const commaIndex = params.base64Data.indexOf(',');

        const dataStr =
            commaIndex >= 0 ? params.base64Data.slice(commaIndex + 1) : params.base64Data;

        let buffer: Buffer;

        try {
            buffer = Buffer.from(dataStr.replace(/\s/g, ''), 'base64');
        } catch {
            throw new Error('Invalid base64 file data');
        }

        if (!buffer.length) {
            throw new Error('Uploaded file is empty');
        }

        if (buffer.length > MAX_FILE_SIZE) {
            throw new Error('File exceeds the 50 MB upload limit');
        }

        console.log(
            '[MEDIA DEBUG]',
            mimeType,
            'size=',
            buffer.length,
            'first16=',
            buffer.subarray(0, 16).toString('hex')
        );

        // Verify binary file signatures.
        if (!this.validateFileSignature(buffer, mimeType)) {
            throw new Error(`File content does not match declared MIME type: ${mimeType}`);
        }

        // Server-generated filename.
        const ext = this.getExtensionFromMime(mimeType);

        const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;

        const filePath = path.join(UPLOADS_DIR, uniqueName);

        fs.writeFileSync(filePath, buffer);

        return {
            url: `/uploads/${uniqueName}`,
            fileName: path.basename(params.fileName),
            fileSize: buffer.length,
            mimeType,
            waveform: params.waveform,
        };
    }

    private static validateFileSignature(buffer: Buffer, mimeType: string): boolean {
        switch (mimeType) {
            case 'image/png':
                return (
                    buffer.length >= 8 &&
                    buffer
                        .subarray(0, 8)
                        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
                );

            case 'image/jpeg':
                return (
                    buffer.length >= 3 &&
                    buffer[0] === 0xff &&
                    buffer[1] === 0xd8 &&
                    buffer[2] === 0xff
                );

            case 'image/gif':
                return (
                    buffer.length >= 6 &&
                    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
                        buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
                );

            case 'image/webp':
                return (
                    buffer.length >= 12 &&
                    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
                    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
                );

            case 'application/pdf':
                return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';

            case 'video/mp4':
                // MP4 normally contains "ftyp" at byte offset 4.
                return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';

            case 'video/webm':
            case 'audio/webm':
                return this.looksLikeWebM(buffer);

            case 'audio/ogg':
                return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS';

            case 'audio/wav':
                return (
                    buffer.length >= 12 &&
                    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
                    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
                );

            case 'audio/mpeg':
            case 'audio/mp3':
                return this.looksLikeMp3(buffer);

            // JSON/TXT do not have reliable universal magic bytes.
            case 'application/json':
            case 'text/plain':
                return true;

            default:
                return false;
        }
    }

    private static looksLikeWebM(buffer: Buffer): boolean {
        if (buffer.length >= 4) {
            if (
                buffer[0] === 0x1a &&
                buffer[1] === 0x45 &&
                buffer[2] === 0xdf &&
                buffer[3] === 0xa3
            ) {
                return true;
            }
        }

        const maxSearch = Math.min(buffer.length - 4, 1024);

        for (let i = 0; i <= maxSearch; i++) {
            if (
                buffer[i] === 0x1a &&
                buffer[i + 1] === 0x45 &&
                buffer[i + 2] === 0xdf &&
                buffer[i + 3] === 0xa3
            ) {
                return true;
            }
        }

        return false;
    }

    private static looksLikeMp3(buffer: Buffer): boolean {
        if (buffer.length >= 3) {
            const id3 = buffer.subarray(0, 3).toString('ascii');

            if (id3 === 'ID3') {
                return true;
            }
        }

        if (buffer.length >= 2) {
            return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
        }

        return false;
    }

    private static getExtensionFromMime(mime: string): string {
        const map: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',

            'audio/webm': '.webm',
            'audio/ogg': '.ogg',
            'audio/mpeg': '.mp3',
            'audio/mp3': '.mp3',
            'audio/wav': '.wav',

            'video/mp4': '.mp4',
            'video/webm': '.webm',

            'application/pdf': '.pdf',
            'application/json': '.json',
            'text/plain': '.txt',
        };

        return map[mime] || '.bin';
    }
}
