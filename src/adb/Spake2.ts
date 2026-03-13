/**
 * SPAKE2 implementation compatible with BoringSSL's Ed25519 variant.
 * Used for Android wireless debugging QR code pairing (Android 11+).
 *
 * Reference: BoringSSL crypto/curve25519/spake25519.c
 * Reference: MuntashirAkon/spake2-java (MIT license)
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import * as crypto from 'crypto';

type EdPoint = InstanceType<typeof ed25519.Point>;

/** Ed25519 group order: l = 2^252 + 27742317777372353535851937790883648493 */
const L = 2n ** 252n + 27742317777372353535851937790883648493n;

/**
 * M and N generator points for SPAKE2.
 * Generated from SHA-256 hashes of fixed seed strings, decoded as compressed Ed25519 points.
 * These match BoringSSL's kSpakeMSmallPrecomp / kSpakeNSmallPrecomp.
 */
const M_SEED = 'edwards25519 point generation seed (M)';
const N_SEED = 'edwards25519 point generation seed (N)';

function computeGeneratorPoint(seed: string): EdPoint {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return ed25519.Point.fromHex(Buffer.from(hash).toString('hex'));
}

const POINT_M = computeGeneratorPoint(M_SEED);
const POINT_N = computeGeneratorPoint(N_SEED);

// ── Scalar and byte utilities ──

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const result = new Uint8Array(length);
  let val = n;
  for (let i = 0; i < length; i++) {
    result[i] = Number(val & 0xFFn);
    val >>= 8n;
  }
  return result;
}

/** Reduce a 64-byte (512-bit) value modulo the group order l. */
function scalarReduce(input: Uint8Array): Uint8Array {
  return bigIntToBytes(bytesToBigInt(input) % L, 32);
}

/** Multiply a 32-byte scalar by 8 (cofactor clearing via left-shift by 3). */
function leftShift3(scalar: Uint8Array): Uint8Array {
  const result = new Uint8Array(32);
  let carry = 0;
  for (let i = 0; i < 32; i++) {
    const nextCarry = scalar[i] >>> 5;
    result[i] = ((scalar[i] << 3) | carry) & 0xFF;
    carry = nextCarry;
  }
  return result;
}

/**
 * Scalar multiplication that handles scalars > group order.
 * Required for the password scalar which may be up to ~8*l after the
 * cofactor-clearing hack. Standard library multiply() rejects n >= l.
 */
function scalarMultFull(point: EdPoint, scalar: bigint): EdPoint {
  if (scalar === 0n) { return ed25519.Point.ZERO; }
  let result = ed25519.Point.ZERO;
  let temp = point;
  let n = scalar;
  while (n > 0n) {
    if (n & 1n) { result = result.add(temp); }
    temp = temp.double();
    n >>= 1n;
  }
  return result;
}

/** Append length-prefixed data to a hash (8-byte LE length + data). */
function updateWithLengthPrefix(hash: crypto.Hash, data: Uint8Array): void {
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeUInt32LE(data.length, 0);
  lenBuf.writeUInt32LE(0, 4);
  hash.update(lenBuf);
  hash.update(data);
}

// ── SPAKE2 Context ──

export enum Spake2Role {
  Alice = 'alice',
  Bob = 'bob',
}

export class Spake2Context {
  static readonly MAX_MSG_SIZE = 32;
  static readonly MAX_KEY_SIZE = 64;

  private myName: Uint8Array;
  private theirName: Uint8Array;
  private role: Spake2Role;
  private privateKey = new Uint8Array(32);
  private myMsg = new Uint8Array(32);
  private passwordScalar = 0n;
  private passwordHash = new Uint8Array(64);
  private state: 'init' | 'msg_generated' | 'key_generated' = 'init';

  constructor(role: Spake2Role, myName: Uint8Array, theirName: Uint8Array) {
    this.role = role;
    this.myName = new Uint8Array(myName);
    this.theirName = new Uint8Array(theirName);
  }

  /** Generate our SPAKE2 message (32 bytes). */
  generateMessage(password: Uint8Array): Uint8Array {
    if (this.state !== 'init') { throw new Error(`Invalid SPAKE2 state: ${this.state}`); }

    // Generate random 64-byte private key, reduce mod l, multiply by cofactor
    const privateKeyFull = new Uint8Array(crypto.randomBytes(64));
    const reduced = scalarReduce(privateKeyFull);
    this.privateKey.set(leftShift3(reduced));

    // P = privateKey * B (base point is prime-order, so reduce mod l is safe)
    const privScalar = bytesToBigInt(this.privateKey) % L;
    const P = ed25519.Point.BASE.multiply(privScalar);

    // Hash password → password scalar
    const pwHash = crypto.createHash('sha512').update(password).digest();
    this.passwordHash.set(pwHash);
    const pwScalarBytes = scalarReduce(new Uint8Array(pwHash));
    let pwScalar = bytesToBigInt(pwScalarBytes);

    // Password scalar hack: clear bottom 3 bits by adding multiples of l.
    // This ensures the cofactor component of M/N is cleared during multiplication.
    // See BoringSSL commit 696c13b for context.
    if (Number(pwScalar & 1n) === 1) { pwScalar += L; }
    if (Number(pwScalar & 2n) === 2) { pwScalar += 2n * L; }
    if (Number(pwScalar & 4n) === 4) { pwScalar += 4n * L; }
    this.passwordScalar = pwScalar;

    // mask = passwordScalar * (M for Alice, N for Bob)
    const maskGenerator = this.role === Spake2Role.Alice ? POINT_M : POINT_N;
    const mask = scalarMultFull(maskGenerator, pwScalar);

    // P* = P + mask
    const PStar = P.add(mask);
    this.myMsg.set(PStar.toBytes());

    this.state = 'msg_generated';
    return new Uint8Array(this.myMsg);
  }

  /** Process peer's SPAKE2 message (32 bytes) → shared key (64 bytes). */
  processMessage(theirMsg: Uint8Array): Uint8Array {
    if (this.state !== 'msg_generated') { throw new Error(`Invalid SPAKE2 state: ${this.state}`); }
    if (theirMsg.length !== 32) { throw new Error('Peer message must be 32 bytes'); }

    // Decode peer's point
    const QStar = ed25519.Point.fromHex(Buffer.from(theirMsg).toString('hex'));

    // Unmask: Q = Q* - passwordScalar * (N for Alice, M for Bob)
    const unmaskGenerator = this.role === Spake2Role.Alice ? POINT_N : POINT_M;
    const peersMask = scalarMultFull(unmaskGenerator, this.passwordScalar);
    const Q = QStar.subtract(peersMask);

    // Shared secret K = privateKey * Q (Q is prime-order, so reduce mod l is safe)
    const privScalar = bytesToBigInt(this.privateKey) % L;
    const K = Q.multiply(privScalar);
    const dhShared = K.toBytes();

    // Transcript hash = SHA-512(len‖alice_name, len‖bob_name, len‖alice_msg, len‖bob_msg, len‖K, len‖pw_hash)
    const sha = crypto.createHash('sha512');
    if (this.role === Spake2Role.Alice) {
      updateWithLengthPrefix(sha, this.myName);
      updateWithLengthPrefix(sha, this.theirName);
      updateWithLengthPrefix(sha, this.myMsg);
      updateWithLengthPrefix(sha, theirMsg);
    } else {
      updateWithLengthPrefix(sha, this.theirName);
      updateWithLengthPrefix(sha, this.myName);
      updateWithLengthPrefix(sha, theirMsg);
      updateWithLengthPrefix(sha, this.myMsg);
    }
    updateWithLengthPrefix(sha, dhShared);
    updateWithLengthPrefix(sha, this.passwordHash);

    this.state = 'key_generated';
    return new Uint8Array(sha.digest());
  }
}
