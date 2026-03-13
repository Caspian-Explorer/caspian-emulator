/**
 * ADB QR Code pairing server.
 * Implements the full ADB wireless debugging pairing protocol:
 * mDNS advertisement → TLS → SPAKE2 key exchange → encrypted peer info exchange.
 *
 * Reference: AOSP pairing_connection.cpp, pairing_auth.cpp, aes_128_gcm.cpp
 */

import * as tls from 'tls';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { Spake2Context, Spake2Role } from './Spake2';
import { Logger } from '../utils/Logger';

// ── Protocol constants ──

const HEADER_VERSION = 1;
const PAIRING_PACKET_HEADER_SIZE = 6; // 1 (version) + 1 (type) + 4 (payload size)
const MAX_PEER_INFO_SIZE = 1 << 13; // 8192 bytes
const MAX_PAYLOAD_SIZE = MAX_PEER_INFO_SIZE * 2;
const TLS_EXPORTED_KEY_SIZE = 64;
const TLS_EXPORTED_KEY_LABEL = 'adb-label\0';
const AES_128_GCM_KEY_SIZE = 16;
const AES_128_GCM_IV_SIZE = 12;
const AES_128_GCM_TAG_SIZE = 16;
const HKDF_INFO = 'adb pairing_auth aes-128-gcm key';
const CLIENT_NAME = 'adb pair client\0';
const SERVER_NAME = 'adb pair server\0';

const enum PacketType {
  Spake2Msg = 0,
  PeerInfo = 1,
}

const enum PeerInfoType {
  AdbRsaPubKey = 0,
  AdbDeviceGuid = 1,
}

// ── Events ──

export interface QrPairingEvents {
  status: (status: PairingStatus) => void;
  error: (error: Error) => void;
  paired: (deviceAddress: string) => void;
}

export type PairingStatus =
  | 'starting'
  | 'advertising'
  | 'waiting'
  | 'tls_connected'
  | 'exchanging_keys'
  | 'exchanging_peer_info'
  | 'paired'
  | 'failed';

export interface QrPairingInfo {
  serviceName: string;
  password: string;
  port: number;
  qrPayload: string;
}

// ── AES-128-GCM cipher matching AOSP's Aes128Gcm class ──

class Aes128Gcm {
  private key: Buffer;
  private encSeq = 0n;
  private decSeq = 0n;

  constructor(keyMaterial: Uint8Array) {
    // Derive 16-byte key via HKDF-SHA256
    this.key = crypto.hkdfSync('sha256', keyMaterial, Buffer.alloc(0), HKDF_INFO, AES_128_GCM_KEY_SIZE) as unknown as Buffer;
    this.key = Buffer.from(this.key);
  }

  encrypt(plaintext: Uint8Array): Buffer {
    const iv = this.makeNonce(this.encSeq++);
    const cipher = crypto.createCipheriv('aes-128-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([encrypted, tag]);
  }

  decrypt(ciphertext: Uint8Array): Buffer {
    const iv = this.makeNonce(this.decSeq++);
    const dataLen = ciphertext.length - AES_128_GCM_TAG_SIZE;
    if (dataLen < 0) { throw new Error('Ciphertext too short'); }
    const data = ciphertext.slice(0, dataLen);
    const tag = ciphertext.slice(dataLen);
    const decipher = crypto.createDecipheriv('aes-128-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  private makeNonce(seq: bigint): Buffer {
    const nonce = Buffer.alloc(AES_128_GCM_IV_SIZE);
    // Copy sequence number into nonce (little-endian)
    let val = seq;
    for (let i = 0; i < 8 && i < AES_128_GCM_IV_SIZE; i++) {
      nonce[i] = Number(val & 0xFFn);
      val >>= 8n;
    }
    return nonce;
  }
}

// ── Packet encode / decode ──

function encodePacket(type: PacketType, payload: Uint8Array): Buffer {
  const buf = Buffer.alloc(PAIRING_PACKET_HEADER_SIZE + payload.length);
  buf.writeUInt8(HEADER_VERSION, 0);
  buf.writeUInt8(type, 1);
  buf.writeUInt32BE(payload.length, 2);
  Buffer.from(payload).copy(buf, PAIRING_PACKET_HEADER_SIZE);
  return buf;
}

function readExactly(socket: tls.TLSSocket, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      received += chunk.length;
      if (received >= size) {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
        const full = Buffer.concat(chunks);
        resolve(full.slice(0, size));
        // If we received extra bytes, push them back
        if (full.length > size) {
          socket.unshift(full.slice(size));
        }
      }
    };

    const onError = (err: Error) => {
      socket.removeListener('data', onData);
      socket.removeListener('close', onClose);
      reject(err);
    };

    const onClose = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      reject(new Error('Connection closed'));
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function readPacket(socket: tls.TLSSocket): Promise<{ type: PacketType; payload: Buffer }> {
  const header = await readExactly(socket, PAIRING_PACKET_HEADER_SIZE);
  const version = header.readUInt8(0);
  if (version !== HEADER_VERSION) {
    throw new Error(`Unsupported pairing protocol version: ${version}`);
  }
  const type = header.readUInt8(1) as PacketType;
  const payloadSize = header.readUInt32BE(2);
  if (payloadSize > MAX_PAYLOAD_SIZE) {
    throw new Error(`Payload too large: ${payloadSize}`);
  }
  const payload = await readExactly(socket, payloadSize);
  return { type, payload };
}

// ── Self-signed certificate generation ──

function generateSelfSignedCert(): { key: string; cert: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // Create a minimal self-signed certificate using OpenSSL-style PEM
  // Node.js 15+ supports X509Certificate, but for broader compatibility
  // we'll generate a self-signed cert using the crypto module
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  // Generate self-signed cert via a CSR-less approach
  // We need to create a self-signed certificate. Node doesn't have a built-in API for this,
  // so we create a minimal certificate using the X509 DER format.
  const cert = createSelfSignedCert(privateKey, publicKey);

  return { key: keyPem, cert };
}

function createSelfSignedCert(
  privateKey: crypto.KeyObject,
  publicKey: crypto.KeyObject
): string {
  // Use Node.js crypto to sign a minimal self-signed certificate
  // For simplicity, use a PEM-encoded approach
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });

  // Build a minimal X.509 v3 certificate in DER
  const serialNumber = crypto.randomBytes(8);
  const notBefore = new Date('2020-01-01T00:00:00Z');
  const notAfter = new Date('2030-01-01T00:00:00Z');

  // Subject/Issuer: CN=adb-pairing
  const cn = Buffer.from('adb-pairing', 'utf8');
  const cnOid = Buffer.from([0x55, 0x04, 0x03]); // OID 2.5.4.3

  // Build the TBS certificate
  const tbs = buildTBSCertificate(serialNumber, cnOid, cn, notBefore, notAfter, pubDer);

  // Sign with SHA-256 RSA
  const sign = crypto.createSign('SHA256');
  sign.update(tbs);
  const signature = sign.sign(privateKey);

  // Build the full certificate
  const cert = buildCertificate(tbs, signature);

  return `-----BEGIN CERTIFICATE-----\n${cert.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;
}

// ASN.1 DER encoding helpers
function derLength(len: number): Buffer {
  if (len < 0x80) { return Buffer.from([len]); }
  if (len < 0x100) { return Buffer.from([0x81, len]); }
  return Buffer.from([0x82, (len >> 8) & 0xFF, len & 0xFF]);
}

function derSequence(...items: Buffer[]): Buffer {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x30]), derLength(body.length), body]);
}

function derSet(...items: Buffer[]): Buffer {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x31]), derLength(body.length), body]);
}

function derOid(oid: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x06]), derLength(oid.length), oid]);
}

function derUtf8String(str: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x0C]), derLength(str.length), str]);
}

function derInteger(val: Buffer): Buffer {
  // Ensure positive (prepend 0x00 if MSB is set)
  const padded = val[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), val]) : val;
  return Buffer.concat([Buffer.from([0x02]), derLength(padded.length), padded]);
}

function derBitString(data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from([0x00]), data]); // 0 unused bits
  return Buffer.concat([Buffer.from([0x03]), derLength(body.length), body]);
}

function derExplicit(tag: number, data: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xA0 | tag]), derLength(data.length), data]);
}

function derGeneralizedTime(date: Date): Buffer {
  const s = date.toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z$/, 'Z');
  const buf = Buffer.from(s, 'ascii');
  return Buffer.concat([Buffer.from([0x18]), derLength(buf.length), buf]);
}

function buildTBSCertificate(
  serial: Buffer, cnOid: Buffer, cn: Buffer,
  notBefore: Date, notAfter: Date, pubSpki: Buffer
): Buffer {
  const version = derExplicit(0, derInteger(Buffer.from([0x02]))); // v3
  const serialNum = derInteger(serial);
  // SHA-256 with RSA OID: 1.2.840.113549.1.1.11
  const sha256RsaOid = Buffer.from([0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x0B]);
  const sigAlg = derSequence(derOid(sha256RsaOid), Buffer.from([0x05, 0x00])); // NULL params
  const rdnSeq = derSequence(derSet(derSequence(derOid(cnOid), derUtf8String(cn))));
  const validity = derSequence(derGeneralizedTime(notBefore), derGeneralizedTime(notAfter));
  return derSequence(version, serialNum, sigAlg, rdnSeq, validity, rdnSeq, pubSpki);
}

function buildCertificate(tbs: Buffer, signature: Buffer): Buffer {
  const sha256RsaOid = Buffer.from([0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x0B]);
  const sigAlg = derSequence(derOid(sha256RsaOid), Buffer.from([0x05, 0x00]));
  return derSequence(tbs, sigAlg, derBitString(signature));
}

// ── Get ADB public key ──

function getAdbPublicKey(): Buffer {
  const adbKeyPath = path.join(os.homedir(), '.android', 'adbkey.pub');
  try {
    return fs.readFileSync(adbKeyPath);
  } catch {
    throw new Error(
      `ADB key not found at ${adbKeyPath}. Run "adb start-server" first to generate keys.`
    );
  }
}

function buildPeerInfo(): Buffer {
  const pubKey = getAdbPublicKey();
  const peerInfo = Buffer.alloc(MAX_PEER_INFO_SIZE);
  peerInfo.writeUInt8(PeerInfoType.AdbRsaPubKey, 0);
  pubKey.copy(peerInfo, 1, 0, Math.min(pubKey.length, MAX_PEER_INFO_SIZE - 1));
  return peerInfo;
}

// ── QR Pairing Server ──

export class QrPairingServer extends EventEmitter {
  private serviceName: string;
  private password: string;
  private tlsServer: tls.Server | null = null;
  private mdnsService: { stop: () => void } | null = null;
  private port = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor() {
    super();
    this.serviceName = `adb-${crypto.randomBytes(6).toString('hex')}`;
    this.password = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
  }

  /** Start the pairing server and return info for QR code generation. */
  async start(): Promise<QrPairingInfo> {
    this.emit('status', 'starting' as PairingStatus);

    const { key, cert } = generateSelfSignedCert();

    // Create TLS server
    this.tlsServer = tls.createServer(
      {
        key,
        cert,
        requestCert: false,
        rejectUnauthorized: false,
      },
      (socket) => this.handleConnection(socket)
    );

    // Listen on ephemeral port
    await new Promise<void>((resolve, reject) => {
      this.tlsServer!.listen(0, () => resolve());
      this.tlsServer!.on('error', reject);
    });

    const addr = this.tlsServer.address();
    if (!addr || typeof addr === 'string') { throw new Error('Failed to get server address'); }
    this.port = addr.port;

    // Advertise via mDNS
    await this.advertiseMdns();

    this.emit('status', 'waiting' as PairingStatus);

    // Auto-timeout after 120 seconds
    this.timeout = setTimeout(() => {
      if (!this.disposed) {
        this.emit('error', new Error('Pairing timed out (120s). Scan the QR code with your phone.'));
        this.dispose();
      }
    }, 120_000);

    const qrPayload = `WIFI:T:ADB;S:${this.serviceName};P:${this.password};;`;
    return {
      serviceName: this.serviceName,
      password: this.password,
      port: this.port,
      qrPayload,
    };
  }

  private async advertiseMdns(): Promise<void> {
    try {
      // Dynamic import to handle cases where ciao fails (e.g., no mDNS support)
      const ciao = await import('@homebridge/ciao');
      const responder = ciao.getResponder();
      const service = responder.createService({
        name: this.serviceName,
        type: 'adb-tls-pairing',
        protocol: 'tcp' as unknown as import('@homebridge/ciao').Protocol,
        port: this.port,
      });
      await service.advertise();
      this.mdnsService = {
        stop: () => {
          service.end().catch(() => {});
          responder.shutdown();
        },
      };
      this.emit('status', 'advertising' as PairingStatus);
      Logger.info(`mDNS: advertising ${this.serviceName} on port ${this.port}`);
    } catch (err) {
      Logger.warn(`mDNS advertisement failed: ${err}. Phone must discover the service another way.`);
    }
  }

  private async handleConnection(socket: tls.TLSSocket): Promise<void> {
    if (this.disposed) { socket.destroy(); return; }
    Logger.info('QR pairing: phone connected via TLS');
    this.emit('status', 'tls_connected' as PairingStatus);

    try {
      // Step 1: Export TLS key material and build the SPAKE2 password
      const exportedKey = socket.exportKeyingMaterial(TLS_EXPORTED_KEY_SIZE, TLS_EXPORTED_KEY_LABEL, Buffer.alloc(0));
      const passwordBytes = Buffer.from(this.password, 'utf8');
      const fullPassword = Buffer.concat([passwordBytes, exportedKey]);

      // Step 2: Create SPAKE2 context (we are the server = Bob)
      const serverName = Buffer.from(SERVER_NAME, 'utf8');
      const clientName = Buffer.from(CLIENT_NAME, 'utf8');
      const spake2 = new Spake2Context(Spake2Role.Bob, serverName, clientName);

      // Step 3: Generate our SPAKE2 message
      const ourMsg = spake2.generateMessage(fullPassword);
      this.emit('status', 'exchanging_keys' as PairingStatus);

      // Step 4: Send our SPAKE2 message
      socket.write(encodePacket(PacketType.Spake2Msg, ourMsg));

      // Step 5: Read peer's SPAKE2 message
      const peerPacket = await readPacket(socket);
      if (peerPacket.type !== PacketType.Spake2Msg) {
        throw new Error(`Expected SPAKE2 message, got type ${peerPacket.type}`);
      }

      // Step 6: Process peer's message → derive shared key
      const sharedKey = spake2.processMessage(new Uint8Array(peerPacket.payload));
      Logger.info('QR pairing: SPAKE2 key exchange complete');

      // Step 7: Initialize AES-128-GCM cipher
      const cipher = new Aes128Gcm(sharedKey);

      // Step 8: Exchange encrypted peer info
      this.emit('status', 'exchanging_peer_info' as PairingStatus);
      const ourPeerInfo = buildPeerInfo();
      const encryptedPeerInfo = cipher.encrypt(ourPeerInfo);
      socket.write(encodePacket(PacketType.PeerInfo, encryptedPeerInfo));

      // Step 9: Read peer's encrypted peer info
      const peerInfoPacket = await readPacket(socket);
      if (peerInfoPacket.type !== PacketType.PeerInfo) {
        throw new Error(`Expected PeerInfo, got type ${peerInfoPacket.type}`);
      }

      const decryptedPeerInfo = cipher.decrypt(new Uint8Array(peerInfoPacket.payload));
      Logger.info(`QR pairing: received peer info (${decryptedPeerInfo.length} bytes)`);

      // Step 10: Pairing complete
      const remoteAddr = socket.remoteAddress;
      socket.end();
      this.emit('status', 'paired' as PairingStatus);
      this.emit('paired', remoteAddr || '');
      Logger.info(`QR pairing: successfully paired with ${remoteAddr}`);
    } catch (err) {
      Logger.error(`QR pairing failed: ${err}`);
      this.emit('status', 'failed' as PairingStatus);
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      socket.destroy();
    } finally {
      this.dispose();
    }
  }

  /** Stop the pairing server and clean up resources. */
  dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
    if (this.mdnsService) { this.mdnsService.stop(); this.mdnsService = null; }
    if (this.tlsServer) { this.tlsServer.close(); this.tlsServer = null; }
    Logger.info('QR pairing server stopped');
  }
}
