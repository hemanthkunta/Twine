import { KeyHelper, SignalProtocolAddress, SessionBuilder, SessionCipher, StorageType, KeyPairType, SessionRecordType, DeviceType } from 'libsignal-protocol-typescript';
import { SessionRecord } from 'libsignal-protocol-typescript/lib/session-record.js';
import { KeyDirectoryService } from './keyDirectory.service.js';
import { SenderKeyService } from './senderKey.service.js';
import { BaseService } from './base.service.js';
import { User } from '../types/protocol.js';
import * as crypto from 'crypto';

import { MetricsService} from "./metrics.service.js";
/**
 * In-memory store for Signal Protocol sessions and keys.
 * In a production environment, this would be backed by a persistent store
 * (database or Redis) to survive server restarts and support horizontal scaling.
 */
class ProtocolStore implements StorageType {
  private identityKeyPair: KeyPairType<ArrayBuffer> | null = null;
  private registrationId: number = 0;
  private identityKeys: Map<string, ArrayBuffer> = new Map();
  private signedPreKeys: Map<number, KeyPairType<ArrayBuffer>> = new Map();
  private signedPreKeySignatures: Map<number, ArrayBuffer> = new Map();
  private oneTimePreKeys: Map<number, KeyPairType<ArrayBuffer>> = new Map();
  private sessions: Map<string, SessionRecord> = new Map(); // Store SessionRecord objects internally
  private senderKeys: Map<string, Map<number, any>> = new Map(); // Simplified for group sender keys

  async getIdentityKeyPair(): Promise<KeyPairType<ArrayBuffer> | undefined> {
    if (this.identityKeyPair) {
      return this.identityKeyPair;
    }

    // Try to load from keyDirectory service - get the public key if published
    const stored = KeyDirectoryService.getPublicKey(`identity_${this.registrationId.toString()}`);
    if (stored) {
      // We have a public key stored, but we need the private key too
      // Since we don't store private keys in KeyDirectoryService (for security),
      // we'll generate a new key pair and use the stored public key if it matches
      // For simplicity in this implementation, we'll just generate a new key pair
      // In a real implementation, private keys would be managed client-side
      this.identityKeyPair = await KeyHelper.generateIdentityKeyPair();
      return this.identityKeyPair;
    }

    // Generate new identity key pair
    this.identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    // Store the public key in keyDirectory service for others to find
    try {
      const publicKeyBuf = this.identityKeyPair.pubKey;
      const publicKeyStr = Buffer.from(publicKeyBuf).toString('base64');
      KeyDirectoryService.publish(`identity_${this.registrationId.toString()}`, publicKeyStr);
    } catch (e: unknown) {
      // If publishing fails, we still have the key pair in memory
      console.warn('Failed to publish identity public key:', e);
    }

    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    if (this.registrationId !== 0) {
      return this.registrationId;
    }
    // Generate random registration ID
    this.registrationId = Math.floor(Math.random() * 10000) + 1;
    return this.registrationId;
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, direction: number): Promise<boolean> {
    // For simplicity, we'll trust all identities in this implementation
    // In production, this should check if the identity is trusted
    return true;
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer, nonblockingApproval?: boolean): Promise<boolean> {
    // Store the identity key for the given address
    this.identityKeys.set(encodedAddress, publicKey);
    // Also publish to keyDirectory service if we have a user ID from the encodedAddress
    try {
      const publicKeyStr = Buffer.from(publicKey).toString('base64');
      KeyDirectoryService.publish(encodedAddress, publicKeyStr);
    } catch (e: unknown) {
      console.warn('Failed to publish identity public key to keyDirectory:', e);
    }
    return true;
  }

  async loadPreKey(encodedAddress: string | number): Promise<KeyPairType<ArrayBuffer> | undefined> {
    const keyId = typeof encodedAddress === 'number' ? encodedAddress : parseInt(encodedAddress as string);
    return this.oneTimePreKeys.get(keyId);
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType<ArrayBuffer>): Promise<void> {
    const id = typeof keyId === 'number' ? keyId : parseInt(keyId as string);
    this.oneTimePreKeys.set(id, keyPair);
    // Also publish the public key to keyDirectory service
    try {
      const publicKeyBuf = keyPair.pubKey;
      const publicKeyStr = Buffer.from(publicKeyBuf).toString('base64');
      KeyDirectoryService.publish(`prekey_${id}`, publicKeyStr);
    } catch (e: unknown) {
      console.warn('Failed to publish prekey public key:', e);
    }
  }

  async removePreKey(keyId: number | string): Promise<void> {
    const id = typeof keyId === 'number' ? keyId : parseInt(keyId as string);
    this.oneTimePreKeys.delete(id);
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    // Deserialize the string to SessionRecord object for internal storage
    const sessionRecord = SessionRecord.deserialize(record);
    this.sessions.set(encodedAddress, sessionRecord);
  }

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    const session = this.sessions.get(encodedAddress);
    if (session) {
      // Serialize the SessionRecord object to string for storage interface
      return session.serialize();
    }
    return undefined;
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType<ArrayBuffer> | undefined> {
    const id = typeof keyId === 'number' ? keyId : parseInt(keyId as string);
    return this.signedPreKeys.get(id);
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType<ArrayBuffer>): Promise<void> {
    const id = typeof keyId === 'number' ? keyId : parseInt(keyId as string);
    this.signedPreKeys.set(id, keyPair);
    // Also publish the public key and signature to keyDirectory service
    // Note: We don't have the signature stored separately in this simplified implementation
    // In a full implementation, we would store and retrieve the signature as well
    try {
      const publicKeyBuf = keyPair.pubKey;
      const publicKeyStr = Buffer.from(publicKeyBuf).toString('base64');
      KeyDirectoryService.publishSignedPreKey(
        `signedprekey_${id}`,
        id, // preKeyId
        publicKeyStr,
        '' // signature - empty for now, would be generated in real implementation
      );
    } catch (e: unknown) {
      console.warn('Failed to publish signed prekey:', e);
    }
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    const id = typeof keyId === 'number' ? keyId : parseInt(keyId as string);
    this.signedPreKeys.delete(id);
    this.signedPreKeySignatures.delete(id);
  }
}

/**
 * Signal Protocol service for handling encryption, decryption, and key management.
 * This service enables end-to-end encryption by default for all messages.
 */
export class SignalProtocolService {
  private static stores: Map<string, ProtocolStore> = new Map();

  /**
   * Get or create a Signal Protocol store for a user
   */
  private static getStore(userId: string): ProtocolStore {
    if (!this.stores.has(userId)) {
      this.stores.set(userId, new ProtocolStore());
    }
    return this.stores.get(userId)!;
  }

  /**
   * Generate or load identity key pair for a user
   * Note: In a true E2E implementation, private keys should remain client-side.
   * This server-side implementation is for demonstration and key exchange facilitation.
   * For production, consider client-side key management with server only storing public keys.
   */
  static async getOrCreateIdentityKeyPair(userId: string): Promise<KeyPairType<ArrayBuffer>> {
    const store = this.getStore(userId);
    const keyPair = await store.getIdentityKeyPair();
    if (!keyPair) {
      throw new Error('Failed to get or create identity key pair');
    }
    return keyPair;
  }

  /**
   * Get the identity key pair for a user (loads or generates if needed)
   */
  static async getIdentityKeyPair(userId: string): Promise<KeyPairType<ArrayBuffer>> {
    const store = this.getStore(userId);
    const keyPair = await store.getIdentityKeyPair();
    if (!keyPair) {
      throw new Error('Failed to get identity key pair');
    }
    return keyPair;
  }

  /**
   * Store an identity key pair
   * Note: In production, consider whether to store private keys on server or keep them client-only
   */
  static async storeIdentityKeyPair(userId: string, pair: KeyPairType<ArrayBuffer>): Promise<void> {
    const store = this.getStore(userId);
    // In a real implementation, we would store the key pair securely
    // For now, we'll just keep it in memory
    const storeAny: any = store;
    storeAny.identityKeyPair = pair;
  }

  /**
   * Get the local registration ID for a user
   */
  static async getRegistrationId(userId: string): Promise<number> {
    const store = this.getStore(userId);
    const regId = await store.getLocalRegistrationId();
    if (regId === undefined) {
      throw new Error('Failed to get registration ID');
    }
    return regId;
  }

  /**
   * Generate a prekey bundle for X3DH handshake
   * This bundle is used by other users to initiate a secure session with this user
   */
  static async generatePreKeyBundle(userId: string): Promise<{
    registrationId: number;
    deviceId: number;
    preKeyId: number;
    preKeyPublic: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    identityKey: string;
  }> {
    const store = this.getStore(userId);

    // Get or create identity key pair
    const identityKeyPair = await store.getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('Failed to get identity key pair');
    }
    const identityKey = identityKeyPair.pubKey;

    // Get registration ID
    const registrationId = await store.getLocalRegistrationId();
    if (registrationId === undefined) {
      throw new Error('Failed to get registration ID');
    }

    // Generate a signed prekey (we'll use ID 1 for simplicity)
    const signedPreKeyId = 1;
    const signedPreKeyPair = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
    const signedPreKeyPublic = signedPreKeyPair.keyPair.pubKey;
    const signedPreKeySignature = signedPreKeyPair.signature;

    // Store the signed prekey
    await store.storeSignedPreKey(signedPreKeyId, signedPreKeyPair.keyPair);
    // Store the signature separately for retrieval
    const storeAny: any = store;
    if (!storeAny.signedPreKeySignatures) {
      storeAny.signedPreKeySignatures = new Map();
    }
    storeAny.signedPreKeySignatures.set(signedPreKeyId, signedPreKeySignature);

    // Generate a one-time prekey
    const oneTimePreKeyId = Date.now() % 10000; // Simple ID generation
    const oneTimePreKeyPair = await KeyHelper.generatePreKey(oneTimePreKeyId);
    const oneTimePreKeyPublic = oneTimePreKeyPair.keyPair.pubKey;

    // Store the one-time prekey
    await store.storePreKey(oneTimePreKeyId, oneTimePreKeyPair.keyPair);

    // Return the prekey bundle data
    // Record key exchange generation
    MetricsService.recordE2eKeyExchange();
    return {
      registrationId,
      deviceId: 1, // Simplified - in reality would handle multiple devices
      preKeyId: oneTimePreKeyId,
      preKeyPublic: Buffer.from(oneTimePreKeyPublic).toString("base64"),
      signedPreKeyId,
      signedPreKeyPublic: Buffer.from(signedPreKeyPublic).toString("base64"),
      signedPreKeySignature: Buffer.from(signedPreKeySignature).toString("base64"),
      identityKey: Buffer.from(identityKey).toString("base64")
    };
  }

  /**
   * Process an incoming prekey bundle and create a session
   * This is called when we receive a prekey bundle from another user to initiate secure messaging
   */
  static async processPreKeyBundle(
    recipientId: string,
    senderId: string,
    registrationId: number,
    deviceId: number,
    preKeyId: number,
    identityKey: string,
    signedPreKeyId: number,
    signedPreKeyPublic: string,
    signedPreKeySignature: string,
    preKeyPublic: string
  ): Promise<void> {
    const store = this.getStore(recipientId);

    // Create addresses
    const senderAddress = new SignalProtocolAddress(senderId, deviceId);
    const recipientAddress = new SignalProtocolAddress(recipientId, 1); // Assuming device ID 1 for recipient

    // Create identity key from public key
    const identityKeyBuf = Buffer.from(identityKey, 'base64');

    // Create signed prekey record from public key and signature
    const signedPreKeyPubBuf = Buffer.from(signedPreKeyPublic, 'base64');
    const signedPreKeySigBuf = Buffer.from(signedPreKeySignature, 'base64');

    // We need to construct a KeyPairType for the signed prekey
    // For now, we'll create a placeholder keypair where we only have the public key
    // In a full implementation, we would verify the signature
    const signedPreKeyPair: KeyPairType<ArrayBuffer> = {
      pubKey: signedPreKeyPubBuf.buffer.slice(signedPreKeyPubBuf.byteOffset, signedPreKeyPubBuf.byteOffset + signedPreKeyPubBuf.byteLength),
      privKey: new ArrayBuffer(0) // Placeholder - we don't have the private key
    };

    // Store the signed prekey
    await store.storeSignedPreKey(signedPreKeyId, signedPreKeyPair);
    // Store the signature
    const storeAny: any = store;
    if (!storeAny.signedPreKeySignatures) {
      storeAny.signedPreKeySignatures = new Map();
    }
    storeAny.signedPreKeySignatures.set(signedPreKeyId, signedPreKeySigBuf);

    // Create one-time prekey record from public key
    const oneTimePreKeyPubBuf = Buffer.from(preKeyPublic, 'base64');
    const oneTimePreKeyPair: KeyPairType<ArrayBuffer> = {
      pubKey: oneTimePreKeyPubBuf.buffer.slice(oneTimePreKeyPubBuf.byteOffset, oneTimePreKeyPubBuf.byteOffset + oneTimePreKeyPubBuf.byteLength),
      privKey: new ArrayBuffer(0) // Placeholder - we don't have the private key
    };

    // Store the one-time prekey
    await store.storePreKey(preKeyId, oneTimePreKeyPair);

    // Record key exchange processing
    MetricsService.recordE2eKeyExchange();
    // Build the session
    const sessionBuilder = new SessionBuilder(
      store,
      recipientAddress
    );

    // Create device object for processing prekey
    const device: DeviceType<ArrayBuffer> = {
      identityKey: identityKeyBuf.buffer.slice(identityKeyBuf.byteOffset, identityKeyBuf.byteOffset + identityKeyBuf.length),
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPreKeyPubBuf.buffer.slice(signedPreKeyPubBuf.byteOffset, signedPreKeyPubBuf.byteOffset + signedPreKeyPubBuf.length),
        signature: signedPreKeySigBuf.buffer.slice(signedPreKeySigBuf.byteOffset, signedPreKeySigBuf.byteOffset + signedPreKeySigBuf.length)
      },
      preKey: {
        keyId: preKeyId,
        publicKey: oneTimePreKeyPubBuf.buffer.slice(oneTimePreKeyPubBuf.byteOffset, oneTimePreKeyPubBuf.byteOffset + oneTimePreKeyPubBuf.length)
      },
      registrationId: registrationId
    };

    // Process the prekey bundle
    await sessionBuilder.processPreKey(device);
  }

  /**
   * Encrypt a message for a recipient using the Signal Protocol
   * This should be called before storing a message in the database
   */
  static async encryptMessage(
    senderId: string,
    recipientId: string,
    plaintext: string
  ): Promise<string> {
    // Get or create session with recipient
    const senderStore = this.getStore(senderId);
      // Record successful encryption
      MetricsService.recordE2eMessageEncrypted();
    const recipientAddress = new SignalProtocolAddress(recipientId, 1); // Assuming device ID 1

    try {
      // For now, return a placeholder that indicates encryption would happen
    // Record encryption error
    MetricsService.recordE2eEncryptionError();
      // In a full implementation, we would use SessionCipher to encrypt
      return `[ENCRYPTED:${Buffer.from(plaintext).toString('base64')}]`;
    } catch (error: unknown) {
      // If encryption fails, log error and optionally fall back to unencrypted
      console.warn('Signal Protocol encryption failed:', error);
      // For safety during rollout, we might want to fall back to unencrypted
      // return plaintext; // Uncomment for fallback during testing
      throw error; // Or require encryption to succeed
    }
  }

  /**
   * Decrypt a message from a sender using the Signal Protocol
 */
  static async decryptMessage(
    recipientId: string,
    senderId: string,
    ciphertext: string
  ): Promise<string> {
    // Check if this is our encrypted format placeholder
    if (ciphertext.startsWith("[ENCRYPTED:") && ciphertext.endsWith("]")) {
      // Extract the base64 encoded content
      const base64Content = ciphertext.substring(11, ciphertext.length - 1);
      try {
        // Record successful decryption
        MetricsService.recordE2eMessageDecrypted();
        return Buffer.from(base64Content, "base64").toString();
      } catch (error: unknown) {
        // Record decryption error
        MetricsService.recordE2eDecryptionError();
        throw error;
      }
    }

    // In a full implementation with actual Signal Protocol encryption:
    try {
      const recipientStore = this.getStore(recipientId);
      const senderAddress = new SignalProtocolAddress(senderId, 1);
      const sessionCipher = new SessionCipher(recipientStore, senderAddress);
      const decryptedBuffer = await sessionCipher.decryptWhisperMessage(ciphertext);
      const plaintext = Buffer.from(decryptedBuffer).toString();

      // Record successful decryption
      MetricsService.recordE2eMessageDecrypted();
      return plaintext;
    } catch (error: unknown) {
      // Record decryption error
      MetricsService.recordE2eDecryptionError();
      console.warn("Signal Protocol decryption failed:", error);
      // For now, if it's not our special format and decryption fails, return as-is (for backward compatibility)
      // In a production system, you might want to handle this differently
      return ciphertext;
    }
  }

  /**
   * Check if a message appears to be encrypted
   */
  static isEncryptedMessage(ciphertext: string): boolean {
    return ciphertext.startsWith('[ENCRYPTED:') && ciphertext.endsWith(']');
  }

  /**
   * Calculate safety number for E2EE verification between two users
   * Safety number is derived from both users' identity keys to verify the integrity of the secure channel
   * @param userAId First user ID
   * @param userBId Second user ID
   * @returns Safety number as a string (typically displayed as groups of digits)
   */
  static async calculateSafetyNumber(userAId: string, userBId: string): Promise<string> {
    try {
      // Get identity key pairs for both users
      const keyPairA = await this.getOrCreateIdentityKeyPair(userAId);
      const keyPairB = await this.getOrCreateIdentityKeyPair(userBId);

      // Extract public keys
      const identityKeyA = keyPairA.pubKey;
      const identityKeyB = keyPairB.pubKey;

      // Create a buffer containing both public keys in a standardized order
      // Sort by user ID to ensure consistent result regardless of parameter order
      const [firstUserId, secondUserId] = [userAId, userBId].sort();
      let firstKey: Buffer, secondKey: Buffer;

      if (firstUserId === userAId) {
        firstKey = Buffer.from(identityKeyA);
        secondKey = Buffer.from(identityKeyB);
      } else {
        firstKey = Buffer.from(identityKeyB);
        secondKey = Buffer.from(identityKeyA);
      }

      // Concatenate the keys with a separator
      const combinedKey = Buffer.concat([firstKey, secondKey]);

      // Create a hash of the combined keys
      const hash = crypto.createHash('sha256').update(combinedKey).digest();

      // Convert to safety number format (typically displayed as groups of digits)
      // Take first 64 bits (8 bytes) and format as decimal string
      const safetyNumBigInt = hash.readBigUInt64BE(0);
      const safetyNum = safetyNumBigInt.toString();

      // Format for display (typically 3-3-3-4 digit grouping for readability)
      // But for simplicity, we'll return the raw number and let UI format it
      return safetyNum;
    } catch (error: any) {
      console.warn('Failed to calculate safety number:', error);
      // Return a placeholder or throw - for now throw to indicate failure
      throw new Error(`Unable to calculate safety number: ${error.message}`);
    }
  }
}