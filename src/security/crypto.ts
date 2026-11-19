import crypto from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyGithubSignature(
  payloadBytes: Buffer,
  secret: string,
  headerSignature: string
): boolean {
  if (!headerSignature || !secret) {
    return false;
  }
  const mac = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(payloadBytes)
    .digest("hex");
  const expected = `sha256=${mac}`;
  return safeCompare(expected, headerSignature);
}

export function verifySlackSignature(
  payloadBytes: Buffer,
  secret: string,
  timestampStr: string,
  signature: string
): boolean {
  if (!signature || !secret || !timestampStr) {
    return false;
  }

  const ts = Number(timestampStr);
  if (!Number.isFinite(ts) || !Number.isInteger(ts)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestampStr}:${payloadBytes.toString("utf8")}`;
  const mac = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(sigBasestring, "utf8"))
    .digest("hex");
  const expected = `v0=${mac}`;
  return safeCompare(expected, signature);
}

export function verifyJiraSignature(
  payloadBytes: Buffer,
  secret: string,
  signature: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const mac = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(payloadBytes)
    .digest("hex");
  const expected = signature.startsWith("sha256=") ? `sha256=${mac}` : mac;
  return safeCompare(expected, signature);
}

export function generateApiKey(
  prefix = "launchgraph_live_"
): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(32).toString("base64url");
  const rawKey = `${prefix}${randomPart}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = hashApiKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  return safeCompare(hashApiKey(rawKey), storedHash);
}

export function signGithubSha256(payloadBytes: Buffer, secret: string): string {
  const mac = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(payloadBytes)
    .digest("hex");
  return `sha256=${mac}`;
}

export function signSlackRequest(
  payloadBytes: Buffer,
  secret: string,
  timestampStr: string
): string {
  const sigBasestring = `v0:${timestampStr}:${payloadBytes.toString("utf8")}`;
  const mac = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(sigBasestring, "utf8"))
    .digest("hex");
  return `v0=${mac}`;
}
