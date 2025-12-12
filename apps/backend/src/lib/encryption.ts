/**
 * Copyright 2025 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Encryption utilities for securing credentials and secrets at rest.
 * Implements PBKDF2-HMAC-SHA512 for password hashing and AES-256-GCM for
 * reversible secret encryption (tokens, usernames, API keys).
 *
 * Master Key Strategy:
 * 1. Check NODEREF_MASTER_KEY environment variable (for advanced deployments)
 * 2. If not set, auto-generate and store in {dataDir}/.runtime/master.key
 * 3. Key file has restrictive permissions (0600 on POSIX)
 *
 * Security Model:
 * - Protects against casual database file inspection
 * - Makes database backups non-human-readable
 * - Prevents accidental credential exposure in exports
 * - Similar to how password managers (1Password, KeePass) work
 *
 * IMPORTANT: Backup both database AND key file together!
 */

import {
  createCipheriv,
  createDecipheriv,
  pbkdf2 as pbkdf2Callback,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getDataDirFromArgsOrEnv } from './paths.js';

const pbkdf2 = promisify(pbkdf2Callback);

const MASTER_KEY_ENV_VAR = 'NODEREF_MASTER_KEY';
const MASTER_KEY_FILENAME = 'master.key';
const ENCRYPTION_VERSION = 'enc.v1';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY_BYTES = 32; // 256-bit key
const ENCRYPTION_SALT_BYTES = 16;
const ENCRYPTION_IV_BYTES = 12; // GCM recommended IV size
const PBKDF2_ITERATIONS = 100_000;

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const PASSWORD_HASH_PREFIX = 'pbkdf2-sha512';

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

let cachedMasterKey: Buffer | null = null;
let keySourceInfo: string = 'uninitialized';

/**
 * Attempt to decode the master key assuming hex, base64, or utf-8.
 */
function decodeMasterKey(raw: string): Buffer {
  const normalized = raw.trim();
  if (!normalized) {
    throw new EncryptionError(`${MASTER_KEY_ENV_VAR} must not be empty`);
  }

  const isHex = /^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0;
  if (isHex) {
    return Buffer.from(normalized, 'hex');
  }

  const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(normalized) && normalized.length % 4 === 0;
  if (isBase64) {
    try {
      return Buffer.from(normalized, 'base64');
    } catch {
      // Fall back to utf-8 if base64 decoding fails
    }
  }

  return Buffer.from(normalized, 'utf-8');
}

/**
 * Get the runtime directory where encryption key is stored.
 * Uses the same data directory logic as the database.
 */
function getRuntimeDir(): string {
  const dataDir = getDataDirFromArgsOrEnv();
  return path.join(dataDir, '.runtime');
}

/**
 * Load master key from file, or generate and save if it doesn't exist.
 * Returns the key buffer and sets restrictive permissions.
 */
function loadOrGenerateMasterKeyFile(): Buffer {
  const runtimeDir = getRuntimeDir();
  const keyPath = path.join(runtimeDir, MASTER_KEY_FILENAME);

  // Ensure runtime directory exists
  if (!existsSync(runtimeDir)) {
    mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  }

  // If key file exists, read it
  if (existsSync(keyPath)) {
    try {
      const keyHex = readFileSync(keyPath, 'utf-8').trim();
      const key = Buffer.from(keyHex, 'hex');

      if (key.length < ENCRYPTION_KEY_BYTES) {
        throw new EncryptionError(
          `Existing key file is too short (${key.length} bytes, need ${ENCRYPTION_KEY_BYTES})`
        );
      }

      keySourceInfo = `file:${keyPath}`;
      return key;
    } catch (err) {
      if (err instanceof EncryptionError) {
        throw err;
      }
      throw new EncryptionError(`Failed to read master key from ${keyPath}: ${err}`);
    }
  }

  // Generate new key
  const newKey = randomBytes(ENCRYPTION_KEY_BYTES);

  try {
    // Write key as hex-encoded string for easy inspection/backup
    writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 });

    // Best-effort chmod on POSIX (redundant but explicit)
    if (process.platform !== 'win32') {
      try {
        chmodSync(keyPath, 0o600);
        chmodSync(runtimeDir, 0o700);
      } catch {
        // Ignore chmod errors - writeFileSync mode should have worked
      }
    }

    keySourceInfo = `generated:${keyPath}`;
    return newKey;
  } catch (err) {
    throw new EncryptionError(`Failed to write master key to ${keyPath}: ${err}`);
  }
}

/**
 * Load and cache the master key.
 * Priority: 1) NODEREF_MASTER_KEY env var, 2) Auto-generated file
 *
 * Call this during server startup to ensure encryption is available.
 */
export function getMasterKey(): Buffer {
  if (cachedMasterKey) {
    return cachedMasterKey;
  }

  // Priority 1: Environment variable (for advanced deployments)
  const envKey = process.env[MASTER_KEY_ENV_VAR];
  if (envKey) {
    const decoded = decodeMasterKey(envKey);
    if (decoded.length < ENCRYPTION_KEY_BYTES) {
      throw new EncryptionError(
        `Master encryption key must be at least ${ENCRYPTION_KEY_BYTES} bytes`
      );
    }
    cachedMasterKey = decoded;
    keySourceInfo = 'env:NODEREF_MASTER_KEY';
    return cachedMasterKey;
  }

  // Priority 2: Auto-generated file
  cachedMasterKey = loadOrGenerateMasterKeyFile();
  return cachedMasterKey;
}

/**
 * Get information about where the master key was loaded from.
 * Useful for logging during startup.
 */
export function getMasterKeySource(): string {
  return keySourceInfo;
}

/**
 * PBKDF2-based key derivation tied to the master key.
 */
async function deriveEncryptionKey(salt: Buffer): Promise<Buffer> {
  const masterKey = getMasterKey();
  return pbkdf2(masterKey, salt, PBKDF2_ITERATIONS, ENCRYPTION_KEY_BYTES, 'sha512');
}

/**
 * Hash a password using PBKDF2-HMAC-SHA512.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new EncryptionError('Password must be provided for hashing');
  }

  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const derived = await pbkdf2(
    Buffer.from(password, 'utf-8'),
    salt,
    PBKDF2_ITERATIONS,
    PASSWORD_HASH_BYTES,
    'sha512'
  );

  return [
    PASSWORD_HASH_PREFIX,
    PBKDF2_ITERATIONS,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join(':');
}

/**
 * Verify a password against a stored PBKDF2 hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [prefix, iterationStr, saltB64, derivedB64] = storedHash.split(':');
    if (prefix !== PASSWORD_HASH_PREFIX) {
      throw new EncryptionError('Unsupported password hash format');
    }

    const iterations = Number.parseInt(iterationStr, 10);
    if (!Number.isFinite(iterations) || iterations <= 0) {
      throw new EncryptionError('Invalid password hash iterations');
    }

    const salt = Buffer.from(saltB64, 'base64');
    const stored = Buffer.from(derivedB64, 'base64');
    const computed = await pbkdf2(
      Buffer.from(password, 'utf-8'),
      salt,
      iterations,
      stored.length,
      'sha512'
    );

    if (stored.length !== computed.length) {
      return false;
    }

    return timingSafeEqual(stored, computed);
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    throw new EncryptionError('Failed to verify password');
  }
}

/**
 * Encrypt a secret string using AES-256-GCM.
 * Returns an encoded payload safe for storage in TEXT columns.
 */
export async function encryptSecret(value: string): Promise<string> {
  try {
    const salt = randomBytes(ENCRYPTION_SALT_BYTES);
    const iv = randomBytes(ENCRYPTION_IV_BYTES);
    const key = await deriveEncryptionKey(salt);

    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      ENCRYPTION_VERSION,
      salt.toString('base64'),
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  } catch {
    throw new EncryptionError('Failed to encrypt secret');
  }
}

/**
 * Decrypt a secret string that was produced by encryptSecret.
 * Returns the plaintext or the original value if it is not encrypted.
 */
export async function decryptSecret(value: string): Promise<string> {
  if (!value || !value.startsWith(`${ENCRYPTION_VERSION}:`)) {
    return value;
  }

  const parts = value.split(':');
  if (parts.length !== 5) {
    throw new EncryptionError('Invalid encrypted payload format');
  }

  const [, saltB64, ivB64, tagB64, cipherB64] = parts;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(cipherB64, 'base64');

    const key = await deriveEncryptionKey(salt);
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf-8');
  } catch {
    throw new EncryptionError('Failed to decrypt secret');
  }
}
