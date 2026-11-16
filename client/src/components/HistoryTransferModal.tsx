import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { QrCode, Check, X, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Smartphone, ScanLine, ShieldCheck, AlertCircle, WifiOff, RotateCcw, Trash2 } from 'lucide-react';
import { UserSummary, MessageType } from '../types/index';
import { SignalClientService } from '../services/signalClient';
import { E2EEService } from '../services/e2ee';
import { ApiService } from '../services/api';

interface HistoryTransferModalProps {
  onClose: () => void;
  currentUser: { id: string; display_name: string } | null;
  currentDeviceId: number;
}

export interface TransferAuthPolicy {
  include_groups: boolean;
  include_direct: boolean;
  date_range: { start?: string; end?: string } | null;
}

export interface TransferAuthPayload {
  type: 'history_transfer_auth';
  version: number;
  transferId: string;
  challenge: string;
  sourceEphemeralPubKey: string;
  sourceUserId: string;
  sourceDeviceId: number;
  destUserId: string;
  destDeviceId: number;
  expiresAt: string;
  policy: TransferAuthPolicy;
}

/**
 * Serialises the authorization challenge the destination device signs.
 * The field names mirror the POST /history-transfer/initiate response
 * (transferId, challenge, sourceEphemeralPubKey, expiresAt) plus the
 * destination identifiers the scanner matches against its own session.
 */
export function buildTransferAuthPayload(fields: Omit<TransferAuthPayload, 'type' | 'version'>): string {
  return JSON.stringify({
    type: 'history_transfer_auth',
    version: 1,
    ...fields
  });
}

/**
 * Parses a scanned authorization challenge. Accepts the current camelCase
 * payload and the legacy snake_case payload emitted before the QR code was
 * implemented.
 */
export function parseTransferAuthPayload(raw: string): TransferAuthPayload {
  const data = JSON.parse(raw);
  if (data?.type !== 'history_transfer_auth') throw new Error('Invalid QR code');

  const transferId = data.transferId ?? data.transfer_id;
  const challenge = data.challenge;
  const sourceEphemeralPubKey = data.sourceEphemeralPubKey ?? data.source_ephemeral_pubkey;

  if (!transferId || !challenge || !sourceEphemeralPubKey) {
    throw new Error('Transfer code is incomplete');
  }

  return {
    type: 'history_transfer_auth',
    version: Number(data.version ?? 1),
    transferId,
    challenge,
    sourceEphemeralPubKey,
    sourceUserId: data.sourceUserId ?? data.source_user_id ?? '',
    sourceDeviceId: Number(data.sourceDeviceId ?? data.source_device_id ?? 0),
    destUserId: data.destUserId ?? data.dest_user_id ?? '',
    destDeviceId: Number(data.destDeviceId ?? data.dest_device_id ?? 0),
    expiresAt: data.expiresAt ?? '',
    policy: data.policy ?? { include_groups: true, include_direct: true, date_range: null }
  };
}

export const HistoryTransferModal: React.FC<HistoryTransferModalProps> = ({ onClose, currentUser, currentDeviceId }) => {
  const [step, setStep] = useState<'idle' | 'source_init' | 'source_waiting' | 'dest_scan' | 'dest_verify' | 'dest_approve' | 'transferring' | 'complete' | 'error'>('idle');
  const [role, setRole] = useState<'source' | 'dest' | null>(null);
  
  // Source state
  const [sourceDevices, setSourceDevices] = useState<Array<{deviceId: number; deviceName: string | null; publicKey: string; isRevoked: boolean}>>([]);
  const [selectedSourceDevice, setSelectedSourceDevice] = useState<number | null>(null);
  const [destUserId, setDestUserId] = useState<string>('');
  const [destDevices, setDestDevices] = useState<Array<{deviceId: number; deviceName: string | null; publicKey: string; isRevoked: boolean}>>([]);
  const [selectedDestDevice, setSelectedDestDevice] = useState<number | null>(null);
  const [transferPolicy, setTransferPolicy] = useState({ include_groups: true, include_direct: true, date_range: { start: '', end: '' } });
  
  // Transfer state
  const [transferId, setTransferId] = useState<string>('');
  const [challenge, setChallenge] = useState<string>('');
  const [sourceEphemeralPubKey, setSourceEphemeralPubKey] = useState<string>('');
  const [destEphemeralPubKey, setDestEphemeralPubKey] = useState<string>('');
  const [signature, setSignature] = useState<string>('');
  const [transferKey, setTransferKey] = useState<Uint8Array | null>(null);
  const [transferStatus, setTransferStatus] = useState<string>('pending');
  const [expiresAt, setExpiresAt] = useState<string>('');
  
  // Progress
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferError, setTransferError] = useState<string | null>(null);
  
  // Dest device info
  const [destUser, setDestUser] = useState<UserSummary | null>(null);
  const [destDeviceId, setDestDeviceId] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [qrStatus, setQrStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  const qrCodeRef = useRef<HTMLCanvasElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  /**
   * The authorization challenge the destination device has to consume.
   * Field names mirror the POST /history-transfer/initiate response
   * (transferId, challenge, sourceEphemeralPubKey, expiresAt) plus the
   * destination identifiers the scanner must match against its own session.
   */
  const qrPayload = useMemo(() => {
    if (!transferId || !challenge || !sourceEphemeralPubKey || !selectedSourceDevice || !destUserId || !selectedDestDevice || !expiresAt) {
      return null;
    }
    return buildTransferAuthPayload({
      transferId,
      challenge,
      sourceEphemeralPubKey,
      sourceUserId: currentUser?.id ?? '',
      sourceDeviceId: selectedSourceDevice ?? 0,
      destUserId,
      destDeviceId: selectedDestDevice,
      expiresAt,
      policy: transferPolicy
    });
  }, [transferId, challenge, sourceEphemeralPubKey, destUserId, selectedDestDevice, selectedSourceDevice, expiresAt, transferPolicy, currentUser?.id]);

  const formatExpiry = (value: string) => {
    if (!value) return '';
    const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  };

  const generateQRCode = async (data: string): Promise<boolean> => {
    if (!qrCodeRef.current || !data) return false;
    try {
      await QRCode.toCanvas(qrCodeRef.current, data, { width: 256, margin: 1 });
      return true;
    } catch {
      return false;
    }
  };

  // Paint the challenge once the payload and the canvas are both available.
  useEffect(() => {
    if (step !== 'source_waiting' || !qrPayload) return;
    let cancelled = false;
    setQrStatus('idle');
    void generateQRCode(qrPayload).then((ok) => {
      if (cancelled) return;
      setQrStatus(ok ? 'ready' : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [step, qrPayload]);

  const loadDevices = async () => {
    if (!currentUser) return;
    const devices = await SignalClientService.listDevices(currentUser.id);
    setSourceDevices(devices.filter(d => !d.isRevoked));
  };

  const loadDestDevices = async () => {
    if (!destUserId.trim()) return;
    setLoading(true);
    setTransferError(null);
    try {
      const result = await ApiService.listPeerDevices(destUserId.trim());
      setDestDevices(result.devices.filter(d => !d.isRevoked));
      setSelectedDestDevice(null);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to load destination devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'source_init') loadDevices();
  }, [step]);

  const handleSourceInit = async () => {
    if (!currentUser || !selectedSourceDevice || !destUserId || !selectedDestDevice) return;
    
    setLoading(true);
    setTransferError(null);
    
    try {
      setStep('source_waiting');
      setRole('source');
      
      const result = await E2EEService.initiateHistoryTransfer(
        currentUser.id,
        selectedSourceDevice,
        destUserId,
        selectedDestDevice!,
        transferPolicy
      );
      
      setTransferId(result.transferId);
      setChallenge(result.challenge);
      setSourceEphemeralPubKey(result.sourceEphemeralPubKey);
      setExpiresAt(result.expiresAt);
      setTransferStatus('pending');
      
      // Poll for authorization
      pollForAuthorization(result.transferId);
      
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to initiate transfer');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const pollForAuthorization = async (tid: string) => {
    const poll = async () => {
      try {
        const status = await ApiService.getHistoryTransferStatus(tid);
        setTransferStatus(status.status);
        
        if (status.status === 'approved') {
          setStep('transferring');
          await startTransfer(tid);
        } else if (status.status === 'expired' || status.status === 'cancelled' || status.status === 'revoked') {
          setTransferError(`Transfer ${status.status}`);
          setStep('error');
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 2000);
      }
    };
    poll();
  };

  const handleDestScan = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    setTransferError(null);
    
    try {
      // Simulate QR code scan - in real app, use camera
      const scannedData = prompt('Paste QR code data (JSON):');
      if (!scannedData) throw new Error('No data scanned');
      
      const data = parseTransferAuthPayload(scannedData);
      
      if (data.destUserId && data.destUserId !== currentUser.id) {
        throw new Error('This transfer code was issued for a different account');
      }
      
      if (data.expiresAt) {
        const expiry = new Date(data.expiresAt.includes('T') ? data.expiresAt : `${data.expiresAt.replace(' ', 'T')}Z`);
        if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
          throw new Error('Transfer code has expired');
        }
      }
      
      setTransferId(data.transferId);
      setChallenge(data.challenge);
      setSourceEphemeralPubKey(data.sourceEphemeralPubKey);
      setExpiresAt(data.expiresAt);
      setDestUserId(data.destUserId);
      setDestDeviceId(data.destDeviceId || null);
      setTransferPolicy({
        include_groups: data.policy.include_groups ?? true,
        include_direct: data.policy.include_direct ?? true,
        date_range: data.policy.date_range
          ? { start: data.policy.date_range.start ?? '', end: data.policy.date_range.end ?? '' }
          : { start: '', end: '' }
      });
      setStep('dest_verify');
      setRole('dest');
      
      // Fetch dest user info
      if (data.sourceUserId) {
        const user = await ApiService.searchUsers(data.sourceUserId);
        setDestUser(user.users[0] || null);
      }
      
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to scan QR code');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDestApprove = async () => {
    if (!currentUser || !currentDeviceId || !transferId || !challenge || !sourceEphemeralPubKey) return;
    
    setLoading(true);
    setTransferError(null);
    
    try {
      setStep('dest_approve');
      
      const result = await E2EEService.authorizeHistoryTransfer(
        currentUser.id,
        currentDeviceId,
        transferId,
        challenge,
        sourceEphemeralPubKey
      );
      
      setSignature(result.signature);
      setDestEphemeralPubKey(result.destEphemeralPubKey);
      setTransferStatus('approved');
      setStep('transferring');
      
      // Derive transfer key and start transfer
      await startTransfer(transferId);
      
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to approve transfer');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const startTransfer = async (tid: string) => {
    if (!currentUser || !currentDeviceId || !transferKey) {
      // Derive transfer key
      try {
        // Get identity keys
        const sourceIdentityKey = await SignalClientService.getLocalIdentityKey(currentUser!.id, currentDeviceId);
        const destIdentityKey = await SignalClientService.getPeerIdentityKey(currentUser!.id, currentDeviceId, destUser?.id || '', 1);
        
        if (!sourceEphemeralPubKey || !destEphemeralPubKey || !sourceIdentityKey || !destIdentityKey) {
          throw new Error('Missing keys for key derivation');
        }
        
        const { transferKey: derivedKey } = await E2EEService.beginHistoryTransfer(
          currentUser!.id,
          currentDeviceId,
          tid,
          sourceEphemeralPubKey,
          destEphemeralPubKey,
          Buffer.from(sourceIdentityKey).toString('base64'),
          Buffer.from(destIdentityKey).toString('base64')
        );
        
        setTransferKey(derivedKey);
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : 'Failed to derive transfer key');
        setStep('error');
        return;
      }
    }
    
    // Export and send history
    try {
      const batches = await E2EEService.exportHistoryForTransfer(
        currentUser!.id,
        currentDeviceId,
        tid,
        { include_groups: true, include_direct: true, date_range: null }
      );
      
      setTotalBatches(batches.length);
      
      for (let i = 0; i < batches.length; i++) {
        setCurrentBatch(i);
        setTransferProgress((i / batches.length) * 100);
        
        // Cast message types to MessageType
const batch = {
          ...batches[i],
          messages: batches[i].messages.map(m => ({
            ...m,
            type: m.type as MessageType
          })),
        };
        
        await E2EEService.sendHistoryBatch(
          currentUser!.id,
          currentDeviceId,
          tid,
          batch.batch_seq,
          batch,
          transferKey!
        );
        
        // Wait for ACK
        await waitForAck(tid, i);
      }
      
      await E2EEService.completeHistoryTransfer(currentUser!.id, currentDeviceId, tid);
      setTransferStatus('completed');
      setStep('complete');
      setTransferProgress(100);
      
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Transfer failed');
      setStep('error');
    }
  };

  const waitForAck = (tid: string, batchSeq: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await ApiService.getHistoryTransferStatus(tid);
          if (status.session?.totalBatches != null && status.session.totalBatches > batchSeq) {
            // Check if this batch was acknowledged
            // In a real implementation, we'd track individual batch ACKs
            resolve();
          } else {
            setTimeout(poll, 1000);
          }
        } catch {
          setTimeout(poll, 1000);
        }
      };
      poll();
    });
  };

  const handleClose = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    onClose();
  };

  const handleCancel = async () => {
    if (!transferId) return;
    
    try {
      await E2EEService.cancelHistoryTransfer(currentUser?.id || '', currentDeviceId, transferId);
      setStep('idle');
      setTransferId('');
      setTransferStatus('cancelled');
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to cancel');
    }
  };

  const handleRetry = () => {
    setTransferError(null);
    if (role === 'source') {
      handleSourceInit();
    } else {
      handleDestScan();
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center space-x-2 mb-6">
      {['source_init', 'source_waiting', 'dest_scan', 'dest_verify', 'dest_approve', 'transferring', 'complete'].map((s, i) => (
        <React.Fragment key={s}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            ['source_init', 'source_waiting', 'dest_scan', 'dest_verify', 'dest_approve', 'transferring', 'complete'].indexOf(step) >= i
              ? 'bg-emerald-500 text-white'
              : 'bg-[#1e2a38] text-[#7f91a4] border border-[rgba(255,255,255,0.1)]'
          }`}>
            {i + 1}
          </div>
          {i < 6 && (
            <div className={`w-12 h-0.5 transition-all ${
              ['source_init', 'source_waiting', 'dest_scan', 'dest_verify', 'dest_approve', 'transferring', 'complete'].indexOf(step) > i
                ? 'bg-emerald-500'
                : 'bg-[#1e2a38] border border-[rgba(255,255,255,0.1)]'
            }`} />
)}
        </React.Fragment>
      ))}
    </div>
  );
  if (step === 'idle') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Transfer Message History</h3>
                <p className="text-[11px] text-[#7f91a4]">Securely move your encrypted messages to a new device</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="flex space-x-4">
              <button
                onClick={() => { setRole('source'); setStep('source_init'); loadDevices(); }}
                className="flex-1 py-4 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)] flex flex-col items-center space-y-2 transition-all"
              >
                <Smartphone className="w-8 h-8 text-emerald-400" />
                <span>This Device (Source)</span>
                <span className="text-[10px] text-[#7f91a4]">Send history to another device</span>
              </button>
              <button
                onClick={() => { setRole('dest'); setStep('dest_scan'); }}
                className="flex-1 py-4 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)] flex flex-col items-center space-y-2 transition-all"
              >
                <ScanLine className="w-8 h-8 text-[#2f88ff]" />
                <span>New Device (Destination)</span>
                <span className="text-[10px] text-[#7f91a4]">Receive history from existing device</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'source_init') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            {renderStepIndicator()}
            <button onClick={handleClose} className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Select Source Device</h3>
            <p className="text-xs text-[#7f91a4]">Choose which of your devices will send the history</p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
{sourceDevices.length === 0 ? (
                <>
                  <p className="text-center text-[#7f91a4] py-4">No active devices found</p>
                </>
              ) : (
                <>
                  {sourceDevices.map(device => (
                    <button
                      key={device.deviceId}
                      onClick={() => setSelectedSourceDevice(device.deviceId)}
                      className={`w-full p-3 rounded-xl border transition-all text-left ${
                        selectedSourceDevice === device.deviceId
                          ? 'bg-emerald-500/15 border-emerald-500/30'
                          : 'bg-[#17212b] border-[rgba(255,255,255,0.06)] hover:border-emerald-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{device.deviceName || `Device ${device.deviceId}`}</p>
                            <p className="text-[11px] text-[#7f91a4]">Device ID: {device.deviceId}</p>
                          </div>
                        </div>
                        {selectedSourceDevice === device.deviceId && (
                          <Check className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                     </button>
                  ))}
                </>
              )}
            </div>
            
            <div className="pt-2">
              <div className="space-y-2">
                <label className="text-xs text-[#7f91a4]">Destination user ID</label>
                <div className="flex space-x-2">
                  <input
                    value={destUserId}
                    onChange={(e) => { setDestUserId(e.target.value.trim()); setDestDevices([]); setSelectedDestDevice(null); }}
                    placeholder="usr_alice_001"
                    className="flex-1 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-xs text-white placeholder-[#55677a] focus:outline-none focus:border-emerald-500/40"
                  />
                  <button
                    onClick={loadDestDevices}
                    disabled={!destUserId.trim() || loading}
                    className="px-3 py-2 bg-[#1e2a38] hover:bg-[#28384b] disabled:opacity-50 text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)]"
                  >
                    Find
                  </button>
                </div>
                {destDevices.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {destDevices.map(device => (
                      <button
                        key={device.deviceId}
                        onClick={() => setSelectedDestDevice(device.deviceId)}
                        className={`w-full p-3 rounded-xl border transition-all text-left ${
                          selectedDestDevice === device.deviceId
                            ? 'bg-blue-500/15 border-blue-500/30'
                            : 'bg-[#17212b] border-[rgba(255,255,255,0.06)] hover:border-blue-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400">
                              <Smartphone className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{device.deviceName || `Device ${device.deviceId}`}</p>
                              <p className="text-[11px] text-[#7f91a4]">Device ID: {device.deviceId}</p>
                            </div>
                          </div>
                          {selectedDestDevice === device.deviceId && (
                            <Check className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <button
                onClick={() => { setStep('dest_scan'); setRole('dest'); }}
                className="w-full py-2.5 mt-3 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)] flex items-center justify-center space-x-1.5 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>I'm setting up a new device instead</span>
              </button>
              
              <button
                onClick={handleSourceInit}
                disabled={!selectedSourceDevice || !selectedDestDevice || !destUserId.trim() || loading}
                className={`w-full py-2.5 font-semibold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all ${
                  selectedSourceDevice && selectedDestDevice && destUserId.trim() && !loading
                    ? 'bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white shadow-lg shadow-[#2f88ff]/25'
                    : 'bg-[#1e2a38] text-[#7f91a4] border border-[rgba(255,255,255,0.08)]'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>{loading ? 'Starting...' : 'Continue'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'source_waiting') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            {renderStepIndicator()}
            <button onClick={handleCancel} className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 w-fit mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Waiting for Authorization</h3>
            <p className="text-xs text-[#7f91a4] leading-relaxed">
              Scan the QR code with your new device to authorize the history transfer.
              The code expires in 10 minutes.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4 my-2 text-left">
              <div className="flex justify-center shrink-0 w-full sm:w-auto">
                {qrPayload ? (
                  <canvas ref={qrCodeRef} className="w-64 h-64 bg-white rounded-lg p-2" width={256} height={256} />
                ) : (
                  <div className="w-64 h-64 rounded-lg bg-[#0f1822] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-center px-4 text-xs text-[#7f91a4]">
                    Preparing transfer code...
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 bg-[#0f1822] p-3 rounded-xl space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#7f91a4]">Transfer ID</p>
                  <p className="text-xs font-mono text-white break-all select-all">{transferId}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#7f91a4]">Challenge</p>
                  <p className="text-xs font-mono text-white break-all select-all">{challenge}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#7f91a4]">Expires</p>
                  <p className="text-xs font-mono text-white">{formatExpiry(expiresAt)}</p>
                </div>
                <p className="text-[10px] text-[#7f91a4]">If the QR code cannot be scanned, enter these values on the destination device.</p>
              </div>
            </div>

            {qrStatus === 'error' && (
              <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                Could not render the QR code - enter the transfer details manually instead.
              </div>
            )}

            <div className="flex space-x-2 pt-2">
              <button onClick={handleCancel} className="flex-1 py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)]">
                Cancel Transfer
              </button>
              <button onClick={() => setStep('source_init')} className="flex-1 py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)]">
                Change Device
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'dest_scan') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            {renderStepIndicator()}
            <button onClick={handleClose} className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="p-2 rounded-xl bg-[#2f88ff]/15 border border-[#2f88ff]/30 text-[#2f88ff] w-fit mx-auto">
              <ScanLine className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Scan QR Code</h3>
            <p className="text-xs text-[#7f91a4] leading-relaxed">
              Use your new device to scan the QR code displayed on your existing device.
              This will authorize the history transfer.
            </p>
            
            <button
              onClick={handleDestScan}
              className="w-full py-3 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white font-semibold text-sm rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-[#2f88ff]/25 transition-all"
            >
              <ScanLine className="w-5 h-5" />
              <span>Scan QR Code</span>
            </button>
            
            <button onClick={() => { setStep('idle'); setRole(null); }} className="w-full py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)]">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'dest_verify') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            {renderStepIndicator()}
            <button onClick={handleClose} className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 w-fit mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Verify Safety Number</h3>
            <p className="text-xs text-[#7f91a4] leading-relaxed">
              Compare the safety number below with the one shown on <strong className="text-white">{destUser?.display_name || 'the other device'}</strong>.
              They must match exactly to ensure no one is intercepting the transfer.
            </p>
            
            <div className="bg-[#0f1822] p-3 rounded-xl text-xs font-mono text-amber-300">
              Safety Number: {signature.slice(0, 20)}... (compare on both devices)
            </div>
            
            <div className="flex space-x-2 pt-2">
              <button onClick={handleClose} className="flex-1 py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)]">
                Cancel
              </button>
              <button onClick={handleDestApprove} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-95 text-white font-semibold text-sm rounded-xl flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/25 transition-all">
                <ShieldCheck className="w-4 h-4" />
                <span>Numbers Match - Approve</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'transferring') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            {renderStepIndicator()}
            <button onClick={handleCancel} className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]" disabled><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 w-fit mx-auto">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-white">Transferring History</h3>
            <p className="text-xs text-[#7f91a4]">Batch {currentBatch + 1} of {totalBatches}</p>
            
            <div className="w-full bg-[#0f1822] rounded-xl h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${transferProgress}%` }}
              />
            </div>
            
            <p className="text-xs text-[#7f91a4]">{Math.round(transferProgress)}% complete</p>
            
            {transferError && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-xs">
                {transferError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Transfer Complete</h3>
                <p className="text-[11px] text-[#7f91a4]">Your message history has been transferred</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 w-fit mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-white">All Done!</h3>
            <p className="text-xs text-[#7f91a4] leading-relaxed">
              Successfully transferred <strong className="text-white">{totalBatches}</strong> batch(es) containing your message history.
              Your new device is now ready to use.
            </p>
            
            <div className="bg-[#0f1822] p-3 rounded-xl text-xs text-[#7f91a4]">
              Transfer ID: {transferId.slice(0, 8)}...
            </div>
            
            <button
              onClick={handleClose}
              className="w-full py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white font-semibold text-sm rounded-xl flex items-center justify-center space-x-1.5 shadow-lg shadow-[#2f88ff]/25 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
          <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Transfer Failed</h3>
                <p className="text-[11px] text-[#7f91a4]">An error occurred during transfer</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 w-fit mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Transfer Failed</h3>
            <p className="text-xs text-[#7f91a4] leading-relaxed">
              {transferError || 'An unknown error occurred'}
            </p>
            
            <div className="flex space-x-2">
              <button onClick={handleRetry} className="flex-1 py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white font-semibold text-sm rounded-xl flex items-center justify-center space-x-1.5 shadow-lg shadow-[#2f88ff]/25 transition-all">
                <RotateCcw className="w-4 h-4" />
                <span>Retry</span>
              </button>
              <button onClick={handleClose} className="flex-1 py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)]">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default HistoryTransferModal;