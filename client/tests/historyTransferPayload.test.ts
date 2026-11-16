import { describe, expect, it } from 'vitest';
import { buildTransferAuthPayload, parseTransferAuthPayload } from '../src/components/HistoryTransferModal';

const FIELDS = {
    transferId: '3f6c2f14-0f0f-4a44-9f6c-2f14a44b0f0f',
    challenge: 'Y2hhbGxlbmdlLWJhc2U2NA==',
    sourceEphemeralPubKey: 'c291cmNlLWVwaGVtZXJhbC1wdWJrZXk=',
    sourceUserId: 'usr_source_001',
    sourceDeviceId: 1,
    destUserId: 'usr_dest_002',
    destDeviceId: 2,
    expiresAt: '2026-11-04 12:00:00',
    policy: { include_groups: true, include_direct: true, date_range: null }
};

describe('history transfer authorization payload', () => {
    it('encodes every field the destination device needs', () => {
        const payload = JSON.parse(buildTransferAuthPayload(FIELDS));
        expect(payload).toEqual({ type: 'history_transfer_auth', version: 1, ...FIELDS });
    });

    it('round-trips through the destination parser', () => {
        expect(parseTransferAuthPayload(buildTransferAuthPayload(FIELDS))).toEqual({
            type: 'history_transfer_auth',
            version: 1,
            ...FIELDS
        });
    });

    it('rejects a payload of another type', () => {
        expect(() => parseTransferAuthPayload(JSON.stringify({ type: 'other' }))).toThrow('Invalid QR code');
    });

    it('rejects an incomplete payload', () => {
        expect(() => parseTransferAuthPayload(JSON.stringify({ type: 'history_transfer_auth', transferId: 'x' })))
            .toThrow('Transfer code is incomplete');
    });

    it('still reads the legacy snake_case payload', () => {
        const legacy = JSON.stringify({
            type: 'history_transfer_auth',
            transfer_id: 'legacy-transfer',
            challenge: 'legacy-challenge',
            source_ephemeral_pubkey: 'legacy-ephemeral',
            source_user_id: 'usr_source_001',
            dest_user_id: 'usr_dest_002',
            policy: { include_groups: true, include_direct: true, date_range: null }
        });
        expect(parseTransferAuthPayload(legacy)).toMatchObject({
            transferId: 'legacy-transfer',
            challenge: 'legacy-challenge',
            sourceEphemeralPubKey: 'legacy-ephemeral',
            sourceUserId: 'usr_source_001',
            destUserId: 'usr_dest_002'
        });
    });
});
