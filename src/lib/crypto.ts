// CodeInsight AI — Encryption utility for API keys (AES-256-GCM)
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || "codeinsight_super_secret_key_12345";
  // Derive a 32-byte key from the secret using scrypt
  return crypto.scryptSync(secret, "codeinsight-salt", KEY_LENGTH);
}

/**
 * Encrypt a string (API key) — returns base64-encoded ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: iv + tag + encrypted (all base64)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt an encrypted string — returns original plaintext.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Mask an API key for display (show first 4 + last 4 chars).
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 24))}${key.slice(-4)}`;
}
