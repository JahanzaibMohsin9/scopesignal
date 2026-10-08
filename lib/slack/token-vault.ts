import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function getEncryptionKey(): Uint8Array {
  const secret = process.env.SLACK_TOKEN_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("Missing SLACK_TOKEN_ENCRYPTION_KEY.");
  }

  // createHash().digest() returns a Buffer (subclass of Uint8Array at runtime).
  return createHash("sha256").update(secret).digest() as unknown as Uint8Array;
}

/** Decode a base64url string to a Uint8Array without relying on Buffer.from. */
function fromBase64url(b64url: string): Uint8Array {
  // Convert base64url → base64 then decode via atob (available in Node 16+).
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encryptSlackToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext =
    cipher.update(token, "utf8", "base64url") + cipher.final("base64url");
  const tag = cipher.getAuthTag();

  return [
    "v1",
    // randomBytes / getAuthTag return Buffer which extends Uint8Array.
    // Cast through unknown so we can call .toString without Node types.
    (iv as unknown as { toString(enc: string): string }).toString("base64url"),
    (tag as unknown as { toString(enc: string): string }).toString("base64url"),
    ciphertext,
  ].join(".");
}

/**
 * Decrypts a Slack bot token that was previously encrypted with {@link encryptSlackToken}.
 * Throws if the ciphertext is malformed or the authentication tag does not match.
 */
export function decryptSlackToken(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid ciphertext format — expected v1.<iv>.<tag>.<ct>");
  }

  const [, ivB64, tagB64, ct] = parts;
  const iv = fromBase64url(ivB64);
  const tag = fromBase64url(tagB64);

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag as unknown as Uint8Array);

  return decipher.update(ct, "base64url", "utf8") + decipher.final("utf8");
}
