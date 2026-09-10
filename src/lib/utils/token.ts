import crypto from "crypto";

/**
 * Cryptographic token and hashing utilities for secure signup invitations
 */

export function generateSecureToken(length: number = 32): string {
  if (typeof crypto !== "undefined" && crypto.randomBytes) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
  }
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, length);
  }
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * SHA-256 hash computation for token storage and lookup in database
 */
export function hashToken(token: string): string {
  if (typeof crypto !== "undefined" && crypto.createHash) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
  // fallback if crypto is not available
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, "0");
}
