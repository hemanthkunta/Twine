# Phase 4B.4: Secure End-to-End Encrypted Message History Transfer

## Protocol Design

### 1. Threat Model & Security Goals

**Assets to Protect:**
- Historical message plaintext (never leave source device unencrypted)
- Private identity keys (never leave any device)
- Historical session keys (never exported from Signal sessions)
- Message metadata (sender, timestamps, ordering)

**Adversary Capabilities:**
- Compromised backend server (passive observer, active manipulator)
- Compromised network (MITM)
- Revoked/compromised devices (should not access future transfers)
- Malicious user attempting to authorize unauthorized device

**Security Goals:**
- **Confidentiality**: Only authorized destination device can decrypt history
- **Integrity**: Detect tampering, truncation, replay, reordering
- **Authentication**: Both devices mutually authenticate before transfer
- **Authorization**: Explicit approval from existing trusted device required
- **Forward Secrecy**: Compromised transfer keys don't reveal future/past sessions
- **Revocation Awareness**: Transfer invalidated if either device revoked

### 2. Transfer Authorization Flow

```
┌─────────────┐                              ┌─────────────────┐
│  Source     │                              │  Destination    │
│  Device     │                              │  Device (new)   │
└──────┬──────┘                              └────────┬────────┘
       │                                             │
       │ 1. User initiates "Add Device" on Source    │
       │    - Source generates Transfer ID           │
       │    - Source creates auth challenge          │
       ├────────────────────────────────────────────►│
       │           Auth Challenge (QR code / code)   │
       │                                             │
       │ 2. User approves on Destination             │
       │    - Destination signs challenge            │
       │    - Destination publishes auth response    │
       │◄────────────────────────────────────────────┤
       │         Signed Authorization                │
       │                                             │
       │ 3. Source verifies signature & device ID    │
       │    - Establishes transfer session key       │
       │    - Begins history transfer                │
       ├────────────────────────────────────────────►│
       │         Encrypted History Batches           │
       │                                             │
       │ 4. Destination decrypts, validates, imports │
       │    - Sends acknowledgment per batch         │
       │◄────────────────────────────────────────────┤
       │              Batch ACKs                     │
```

### 3. Cryptographic Primitives

**Identity Keys**: Ed25519 (Signal identity keys, 32 bytes + 0x05 prefix)

**Transfer Session Key**: 
- Derived via ECDH between source device's ephemeral key and destination device's identity key
- HKDF-SHA256 with salt = Transfer ID, info = "history-transfer"
- Separate encryption/authentication keys via HKDF

**Message Encryption**: AES-256-GCM with 96-bit nonce
- Nonce = batch sequence number (64-bit) || random 32-bit
- AAD = Transfer ID || batch sequence || message count

### 4. Transfer Data Structures

**Transfer Authorization Challenge** (Source → Destination via QR/out-of-band):
```json
{
  "type": "history_transfer_auth",
  "version": 1,
  "transfer_id": "uuid-v4",
  "source_device": {
    "user_id": "usr_alice_001",
    "device_id": 1,
    "identity_key": "base64-ed25519-pubkey",
    "ephemeral_public_key": "base64-x25519-pubkey"
  },
  "destination_device": {
    "user_id": "usr_alice_001",
    "device_id": 2,
    "identity_key": "base64-ed25519-pubkey"
  },
  "challenge": "base64-random-32-bytes",
  "expires_at": "ISO8601-timestamp",
  "policy": {
    "include_groups": true,
    "include_direct": true,
    "date_range": null
  }
}
```

**Destination Authorization Response** (Destination → Server → Source):
```json
{
  "type": "history_transfer_auth_response",
  "version": 1,
  "transfer_id": "uuid-v4",
  "destination_device": {
    "user_id": "usr_alice_001",
    "device_id": 2,
    "identity_key": "base64-ed25519-pubkey"
  },
  "challenge_response": "base64-ed25519-signature",
  "approved_at": "ISO8601-timestamp"
}
```

**Transfer Session Key Derivation** (both devices):
```
shared_secret = X25519(source_ephemeral_priv, dest_identity_pub)
               || X25519(dest_ephemeral_priv, source_identity_pub)
transfer_key = HKDF-SHA256(
  salt = TransferID,
  IKM = shared_secret,
  info = "history-transfer-v1",
  length = 64 bytes  // 32 enc + 32 auth
)
```

**History Batch Envelope** (Source → Destination via Server):
```json
{
  "type": "history_transfer_batch",
  "version": 1,
  "transfer_id": "uuid-v4",
  "batch_seq": 0,
  "total_batches": 5,
  "messages": [
    {
      "message_id": "msg_abc123",
      "chat_id": "chat_123",
      "sender_id": "usr_bob_002",
      "type": "TEXT",
      "content": "Hello Alice",
      "timestamp": "2024-01-15T10:30:00Z",
      "reply_to": null,
      "forwarded_from": null
    }
  ],
  "mac": "base64-aes256-gcm-tag"
}
```

**Batch Acknowledgment** (Destination → Source):
```json
{
  "type": "history_transfer_ack",
  "version": 1,
  "transfer_id": "uuid-v4",
  "batch_seq": 0,
  "status": "success" | "error",
  "error": null | "string"
}
```

### 5. Transfer Protocol Details

#### Phase 1: Authorization
1. Source device generates Transfer ID, ephemeral X25519 key pair
2. Source creates challenge with both devices' identity keys, policy
2. Challenge displayed as QR code or numeric code
3. User scans/enters on destination device
4. Destination signs challenge with its identity key
5. Response sent via server (device registration webhook or dedicated endpoint)
6. Source verifies signature, confirms destination device ID matches registered device
6. Both devices derive transfer session key

#### Phase 2: History Selection & Encryption
1. Source queries local history for all chats (direct + groups)
2. Filters by policy (date range, chat types)
3. For each message:
   - Decrypts locally using existing Signal sessions
   - Re-encrypts for transfer using AES-256-GCM under transfer key
   - Preserves metadata: message_id, chat_id, sender_id, type, timestamp, reply_to, forwarded_from
4. Batches messages (e.g., 100 messages per batch)
5. Each batch authenticated with AES-256-GCM tag

#### Phase 3: Transfer
1. Source sends batches sequentially via WebSocket/REST
2. Server relays to destination device (no decryption)
3. Destination decrypts, validates MAC, re-encrypts for local storage
5. Destination imports messages into local IndexedDB
6. Destination sends ACK per batch
7. On ACK, source marks batch complete; on error, retries (max 3)
7. Transfer ends when all batches ACKed

#### Phase 4: Completion
1. Source sends final "transfer_complete" message
2. Destination verifies all batches received, no gaps in sequence
3. Destination sends final acknowledgment
3. Both devices mark transfer complete, cleanup ephemeral keys

### 6. Integrity & Replay Protection

- **Batch Sequencing**: Strict monotonic sequence numbers (0..N-1)
- **Gap Detection**: Destination rejects out-of-order or missing batches
- **Replay Protection**: Transfer ID unique per authorization; server rejects duplicate Transfer IDs
- **Truncation Detection**: Destination verifies `total_batches` matches received count
- **Tamper Detection**: AES-256-GCM authentication tag per batch

### 7. Revocation & Expiration Handling

- **Authorization Expiry**: 10 minutes from challenge creation
- **Transfer Expiry**: 1 hour from first batch; incomplete transfers abandoned
- **Revocation During Transfer**:
  - If source device revoked: server rejects further batches
  - If destination device revoked: server rejects further batches; destination aborts
  - If source revokes destination during transfer: destination key wiped, transfer aborted
- **Idempotent Retries**: Batch sequence numbers ensure idempotent retries

### 8. Server-Visible Metadata

The backend observes (cannot be hidden without major architecture changes):
- Transfer initiation (WebSocket frame type)
- Transfer ID (opaque UUID)
- Batch count and timing
- Source/destination user IDs (for routing)
- Batch sizes (byte counts)
- Transfer duration

The backend CANNOT observe:
- Message plaintext
- Message metadata (chat IDs, sender IDs, timestamps)
- Transfer session keys
- Identity private keys

### 9. Database Schema Additions

**Backend** (new tables):
```sql
-- Transfer authorizations
CREATE TABLE history_transfer_auth (
  transfer_id TEXT PRIMARY KEY,
  source_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_device_id INTEGER NOT NULL,
  dest_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dest_device_id INTEGER NOT NULL,
  challenge BLOB NOT NULL,
  challenge_signature BLOB,
  ephemeral_pubkey BLOB NOT NULL,  -- source X25519
  dest_ephemeral_pubkey BLOB,       -- dest X25519 (optional, for mutual auth)
  policy TEXT NOT NULL,              -- JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/approved/expired/revoked
  created_at TEXT DEFAULT (datetime('now')),
  approved_at TEXT,
  expires_at TEXT NOT NULL
);

-- Transfer sessions (ephemeral, cleaned up after completion)
CREATE TABLE history_transfer_sessions (
  transfer_id TEXT PRIMARY KEY REFERENCES history_transfer_auth(transfer_id) ON DELETE CASCADE,
  session_enc_key BLOB NOT NULL,      -- 32 bytes, encrypted at rest with server key
  session_auth_key BLOB NOT NULL,     -- 32 bytes
  total_batches INTEGER NOT NULL,
  next_batch_seq INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active/completed/failed/expired
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Transfer batch tracking (for resumption)
CREATE TABLE history_transfer_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id TEXT NOT NULL REFERENCES history_transfer_sessions(transfer_id) ON DELETE CASCADE,
  batch_seq INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/acknowledged/failed
  sent_at TEXT,
  acked_at TEXT,
  UNIQUE(transfer_id, batch_seq)
);
```

**Client IndexedDB Additions** (storage.ts version 6):
```javascript
// 11. History Transfer State
if (!db.objectStoreNames.contains('history_transfers')) {
  const store = db.createObjectStore('history_transfers', { keyPath: 'transferId' });
  store.createIndex('userId', 'userId', { unique: false });
  store.createIndex('status', 'status', { unique: false });
}
```

### 10. API Endpoints

```
POST   /history-transfer/initiate          // Source initiates, returns challenge
POST   /history-transfer/authorize         // Destination approves, submits signature
GET    /history-transfer/status/:transferId // Poll status
WS     /ws/history-transfer/:transferId     // Bidirectional batch transfer
POST   /history-transfer/batch/:transferId  // Source sends batch
POST   /history-transfer/ack/:transferId    // Destination ACKs batch
POST   /history-transfer/complete/:transferId // Finalize
POST   /history-transfer/cancel/:transferId   // Cancel/abort
```

### 11. Client UI Flow

1. **Source Device**: Settings → Devices → "Transfer History to New Device"
   - Shows QR code with challenge
   - "Waiting for authorization..." screen

2. **Destination Device**: First launch → "Import History from Existing Device"
   - Camera/scanner for QR code
   - "Authorize this device?" prompt with fingerprint comparison
   - "Approving..." → "Transfer in progress..." → "Complete!"

3. **Progress UI**: Real-time batch progress, estimated time remaining, cancel button

### 12. Security Considerations

- **No live session state export**: Transfer uses fresh ephemeral keys, never exports Signal session records
- **No server-side decryption**: All encryption/decryption client-side
- **Explicit user approval**: Required on both devices
- **Device identity verification**: Safety number comparison during authorization
- **Revocation integration**: Checks device revocation status at each step
- **No fallback to plaintext**: Any failure aborts transfer
- **No history transfer for groups by default**: Opt-in only (groups have different security properties)

### 13. Limitations & Future Work

- **History transfer for groups**: Requires sender key redistribution (future)
- **Cross-platform (iOS/Android/Web)**: QR code works; consider Bluetooth/NFC
- **Large histories**: Streaming/chunking for >10k messages
- **Conflict resolution**: Source wins on duplicates (same message_id)
- **Deleted messages**: Only transfers messages still in source's local DB
- **Disappearing messages**: Respects expiration; expired messages not transferred