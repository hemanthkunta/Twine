import api from './api';
import { bytesToHex } from './crypto';
import { randomBytes } from './cryptoPolyfill';
import { DeviceRecord, SignalStore } from './signalStore';

/**
 * This device's identity.
 *
 * Two identifiers are involved:
 *  - `wsDeviceId` — a stable, persisted string sent in the WebSocket
 *    handshake so the server can tell this installation apart from the
 *    browser client and from other phones.
 *  - `e2eeDeviceId` — the numeric device id the pre-key bundle is published
 *    under. It is allocated from the account's registered devices so it never
 *    collides with the browser client's device (which is always 1).
 */
export class DeviceService {
  /** The persisted device record, created on first use. */
  static async getDeviceRecord(userId: string): Promise<DeviceRecord> {
    const existing = await SignalStore.getDeviceRecord(userId);
    if (existing?.wsDeviceId) {
      return existing;
    }
    const record: DeviceRecord = {
      wsDeviceId: `mobile_${bytesToHex(randomBytes(8))}`,
      e2eeDeviceId: 0,
    };
    await SignalStore.putDeviceRecord(userId, record);
    return record;
  }

  /** The numeric E2EE device id, allocated on first use. */
  static async ensureE2eeDeviceId(userId: string): Promise<number> {
    const record = await DeviceService.getDeviceRecord(userId);
    if (record.e2eeDeviceId > 0) {
      return record.e2eeDeviceId;
    }

    const devices = await api.listDevices();
    const used = (devices?.devices ?? []).map((device: { deviceId: number }) => device.deviceId);
    const next = used.length ? Math.max(...used) + 1 : 1;

    await SignalStore.putDeviceRecord(userId, { ...record, e2eeDeviceId: next });
    return next;
  }
}

export default DeviceService;
