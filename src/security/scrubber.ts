export const REDACTION_MARKER = "[REDACTED_SECRET]";

const DIRECT_PATTERNS: RegExp[] = [
  // AWS Access Keys
  /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
  // GitHub Tokens
  /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  // Slack Tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // JSON Web Tokens (JWT)
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
  // RSA / EC Private Keys
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
];

const GENERIC_SECRET_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi;

const SENSITIVE_KEY_FRAGMENTS = [
  "secret",
  "password",
  "token",
  "api_key",
  "auth",
  "private_key",
];

export class SecretScrubber {
  static scrubText(text: string): string {
    if (!text || typeof text !== "string") {
      return text;
    }

    let scrubbed = text;
    for (const pattern of DIRECT_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, REDACTION_MARKER);
    }
    scrubbed = scrubbed.replace(
      GENERIC_SECRET_PATTERN,
      (_match, keyName: string) => `${keyName}: ${REDACTION_MARKER}`
    );

    return scrubbed;
  }

  static scrubPayload<T>(data: T): T {
    if (Array.isArray(data)) {
      return data.map((item) => this.scrubPayload(item)) as unknown as T;
    }
    if (data !== null && typeof data === "object") {
      const scrubbedObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        const lowerKey = k.toLowerCase();
        if (SENSITIVE_KEY_FRAGMENTS.some((sec) => lowerKey.includes(sec))) {
          scrubbedObj[k] = REDACTION_MARKER;
        } else {
          scrubbedObj[k] = this.scrubPayload(v);
        }
      }
      return scrubbedObj as T;
    }
    if (typeof data === "string") {
      return this.scrubText(data) as unknown as T;
    }
    return data;
  }
}
