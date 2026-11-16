import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import QRCode from 'qrcode';

const INITIATE_RESULT = {
    transferId: '3f6c2f14-0f0f-4a44-9f6c-2f14a44b0f0f',
    challenge: 'Y2hhbGxlbmdlLWJhc2U2NA==',
    sourceEphemeralPubKey: 'c291cmNlLWVwaGVtZXJhbC1wdWJrZXk=',
    expiresAt: '2026-11-04 12:00:00'
};

const SOURCE_DEVICE = { deviceId: 1, deviceName: 'Laptop', publicKey: 'source-pub', isRevoked: false };
const DEST_DEVICE = { deviceId: 2, deviceName: 'Phone', publicKey: 'dest-pub', isRevoked: false };

// The initiate call is held open so the "Preparing transfer code..." placeholder
// is observable before the payload exists.
let initiateDeferred: { promise: Promise<typeof INITIATE_RESULT>; resolve: (v: typeof INITIATE_RESULT) => void };

vi.mock('../src/services/api', () => ({
    ApiService: {
        listPeerDevices: vi.fn(async () => ({ devices: [DEST_DEVICE] })),
        // The component polls for authorization; keep that poll parked forever so
        // the test never advances past the QR step.
        getHistoryTransferStatus: vi.fn(() => new Promise(() => {})),
        searchUsers: vi.fn(async () => ({ users: [] }))
    }
}));

vi.mock('../src/services/e2ee', () => ({
    E2EEService: {
        initiateHistoryTransfer: vi.fn(() => initiateDeferred.promise),
        authorizeHistoryTransfer: vi.fn(),
        cancelHistoryTransfer: vi.fn(),
        beginHistoryTransfer: vi.fn(),
        exportHistoryForTransfer: vi.fn(),
        sendHistoryBatch: vi.fn(),
        completeHistoryTransfer: vi.fn()
    }
}));

vi.mock('../src/services/signalClient', () => ({
    SignalClientService: {
        listDevices: vi.fn(async () => [SOURCE_DEVICE]),
        getLocalIdentityKey: vi.fn(),
        getPeerIdentityKey: vi.fn()
    }
}));

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HistoryTransferModal, buildTransferAuthPayload } from '../src/components/HistoryTransferModal';

/**
 * jsdom has no 2D canvas backend, so `getContext('2d')` returns null and the
 * qrcode renderer cannot paint. This minimal recorder stands in for the canvas
 * backend and keeps every `putImageData` call so the test can inspect the
 * pixels that the production component actually painted.
 */
interface PaintedImage { width: number; height: number; data: Uint8ClampedArray }

let painted: PaintedImage[] = [];

function installCanvasBackend() {
    const proto = window.HTMLCanvasElement.prototype as unknown as {
        getContext: (type: string) => unknown;
    };
    const original = proto.getContext;
    proto.getContext = function (type: string) {
        if (type !== '2d') return null;
        return {
            clearRect() {},
            fillRect() {},
            createImageData(width: number, height: number) {
                return { width, height, data: new Uint8ClampedArray(width * height * 4) };
            },
            putImageData(image: PaintedImage) {
                painted.push(image);
            }
        };
    };
    return () => { proto.getContext = original; };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
    const match = Array.from(container.querySelectorAll('button'))
        .find((b) => (b.textContent ?? '').includes(label));
    if (!match) throw new Error(`button "${label}" not found`);
    return match as HTMLButtonElement;
}

function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buildExpectedPayload() {
    return buildTransferAuthPayload({
        transferId: INITIATE_RESULT.transferId,
        challenge: INITIATE_RESULT.challenge,
        sourceEphemeralPubKey: INITIATE_RESULT.sourceEphemeralPubKey,
        sourceUserId: 'usr_source_001',
        sourceDeviceId: SOURCE_DEVICE.deviceId,
        destUserId: 'usr_dest_002',
        destDeviceId: DEST_DEVICE.deviceId,
        expiresAt: INITIATE_RESULT.expiresAt,
        policy: { include_groups: true, include_direct: true, date_range: { start: '', end: '' } }
    });
}

/**
 * Samples the centre pixel of every QR module and compares it with the module
 * matrix the qrcode library derives from the payload. Equal matrices mean a
 * scanner reading the painted canvas recovers exactly the payload.
 */
function assertPaintedMatrixMatchesPayload(image: PaintedImage, payload: string) {
    const qr = QRCode.create(payload);
    const size = qr.modules.size;
    const margin = 1;
    // Mirrors qrcode/lib/renderer/utils.js for the production render options
    // { width: 256, margin: 1 }: a fixed width wins over the scale factor.
    const scale = 256 >= size + margin * 2 ? 256 / (size + margin * 2) : 4;
    const symbolSize = Math.floor((size + margin * 2) * scale);
    const scaledMargin = margin * scale;

    expect(image.width).toBe(symbolSize);
    expect(image.height).toBe(symbolSize);

    // Walk the painted pixels and map each one back to the module it belongs
    // to, exactly the way the qrcode renderer lays the symbol out. Every pixel
    // must match the module matrix derived from the payload, which is what a
    // scanner reads back.
    const mismatches: string[] = [];
    let darkPixels = 0;
    for (let y = 0; y < symbolSize; y++) {
        for (let x = 0; x < symbolSize; x++) {
            const insideSymbol = y >= scaledMargin && x >= scaledMargin &&
                y < symbolSize - scaledMargin && x < symbolSize - scaledMargin;
            const moduleRow = Math.floor((y - scaledMargin) / scale);
            const moduleCol = Math.floor((x - scaledMargin) / scale);
            const isDark = insideSymbol && qr.modules.data[moduleRow * size + moduleCol] === 1;
            const offset = (y * image.width + x) * 4;
            const [r, g, b, a] = [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
            const expected = isDark ? { r: 0, g: 0, b: 0, a: 255 } : { r: 255, g: 255, b: 255, a: 255 };
            if (r !== expected.r || g !== expected.g || b !== expected.b || a !== expected.a) {
                mismatches.push(`(${x},${y}) expected ${JSON.stringify(expected)} got ${JSON.stringify({ r, g, b, a })}`);
            }
            if (isDark) darkPixels++;
        }
    }

    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
    expect(darkPixels).toBeGreaterThan(0);
}

describe('history transfer QR code', () => {
    let root: Root;
    let container: HTMLElement;
    let restoreCanvas: () => void;

    beforeEach(() => {
        painted = [];
        restoreCanvas = installCanvasBackend();
        let resolveInitiate!: (v: typeof INITIATE_RESULT) => void;
        initiateDeferred = {
            promise: new Promise<typeof INITIATE_RESULT>((resolve) => { resolveInitiate = resolve; }),
            resolve: resolveInitiate
        };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        restoreCanvas();
        document.body.innerHTML = '';
    });

    it('paints a scannable QR code that encodes the transfer authorization payload', async () => {
        await act(async () => {
            root.render(
                <HistoryTransferModal
                    onClose={() => {}}
                    currentUser={{ id: 'usr_source_001', display_name: 'Source' }}
                    currentDeviceId={SOURCE_DEVICE.deviceId}
                />
            );
        });

        await act(async () => {
            button(container, 'This Device (Source)').click();
        });

        await act(async () => {
            button(container, 'Device ID: 1').click();
        });

        const input = container.querySelector('input') as HTMLInputElement;
        await act(async () => {
            setInputValue(input, 'usr_dest_002');
        });

        await act(async () => {
            button(container, 'Find').click();
        });

        await act(async () => {
            button(container, 'Device ID: 2').click();
        });

        await act(async () => {
            button(container, 'Continue').click();
        });

        // The payload is only known once the initiate call resolves, so the
        // placeholder is shown until then.
        expect(container.textContent).toContain('Preparing transfer code...');
        expect(container.querySelector('canvas')).toBeNull();

        await act(async () => {
            initiateDeferred.resolve(INITIATE_RESULT);
            await Promise.resolve();
        });

        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        expect(canvas).toBeTruthy();
        expect(canvas.width).toBeGreaterThan(0);
        expect(container.textContent).not.toContain('QR Code Placeholder');
        expect(container.textContent).not.toContain('Preparing transfer code...');

        // The human-readable fallback is rendered next to the QR code.
        expect(container.textContent).toContain(INITIATE_RESULT.transferId);
        expect(container.textContent).toContain(INITIATE_RESULT.challenge);
        expect(container.textContent).not.toContain('Could not render the QR code');

        expect(painted.length).toBeGreaterThan(0);
        const payload = buildExpectedPayload();
        assertPaintedMatrixMatchesPayload(painted[painted.length - 1], payload);

        // The QR encodes exactly this JSON, so a scanner recovers the fields the
        // destination device needs.
        const qr = QRCode.create(payload);
        expect(qr.segments.map((s) => Buffer.from(s.data).toString('utf8')).join('')).toBe(payload);
    });
});
