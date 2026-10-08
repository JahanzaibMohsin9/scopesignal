const SLACK_SIGNATURE_VERSION = "v0";
const MAX_TIMESTAMP_AGE_SECONDS = 60 * 5;

const textEncoder = new TextEncoder();

export function getSlackSigningSecret(): string {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    throw new Error("Missing SLACK_SIGNING_SECRET.");
  }

  return signingSecret;
}

export function isFreshSlackTimestamp(timestamp: string | null): boolean {
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const requestSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);

  return Math.abs(nowSeconds - requestSeconds) <= MAX_TIMESTAMP_AGE_SECONDS;
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeStringEqual(a: string, b: string) {
  const expectedBuffer = textEncoder.encode(a);
  const actualBuffer = textEncoder.encode(b);
  const length = Math.max(expectedBuffer.length, actualBuffer.length);
  let diff = expectedBuffer.length ^ actualBuffer.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (expectedBuffer[index] ?? 0) ^ (actualBuffer[index] ?? 0);
  }

  return diff === 0;
}

export async function verifySlackSignature({
  body,
  signature,
  signingSecret,
  timestamp,
}: {
  body: string;
  signature: string | null;
  signingSecret: string;
  timestamp: string | null;
}): Promise<boolean> {
  if (!signature || !isFreshSlackTimestamp(timestamp)) {
    return false;
  }

  const baseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(baseString),
  );
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=${toHex(digest)}`;

  return constantTimeStringEqual(expectedSignature, signature);
}
