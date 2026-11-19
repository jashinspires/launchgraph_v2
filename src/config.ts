import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

export const settings = {
  ENV: process.env.ENV || "development",
  DEBUG: process.env.DEBUG === "true",
  LOG_LEVEL: process.env.LOG_LEVEL || "INFO",
  PORT: parseInt(process.env.PORT || "3000", 10),
  HOST: "0.0.0.0",

  // Database Configuration (in-memory store active in Node.js migration)
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql+asyncpg://postgres:postgres@localhost:5432/launchgraph",

  // Security & Cryptography
  SECRET_KEY:
    process.env.SECRET_KEY ||
    "insecure-development-secret-key-change-in-production-min-32-chars",
  DATA_RETENTION_DAYS: parseInt(process.env.DATA_RETENTION_DAYS || "30", 10),

  // Webhook Verification Defaults
  GITHUB_WEBHOOK_SECRET:
    process.env.GITHUB_WEBHOOK_SECRET || "test-github-secret",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
  GITHUB_REPO: process.env.GITHUB_REPO || "jashinspires/LaunchGraph",
  SLACK_SIGNING_SECRET:
    process.env.SLACK_SIGNING_SECRET || "test-slack-secret",
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || undefined,
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN || undefined,
  JIRA_WEBHOOK_SECRET: process.env.JIRA_WEBHOOK_SECRET || "test-jira-secret",
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || undefined,
  JIRA_EMAIL: process.env.JIRA_EMAIL || undefined,
  JIRA_DOMAIN: process.env.JIRA_DOMAIN || "launchgraph.atlassian.net",

  // Decisioner Settings
  JUDGMENT_BACKEND: process.env.JUDGMENT_BACKEND || "deterministic",
  MODEL_NAME: process.env.MODEL_NAME || "claude-opus-5",
  K_SAMPLES: parseInt(process.env.K_SAMPLES || "3", 10),
  MAX_EVIDENCE_TOKENS: parseInt(process.env.MAX_EVIDENCE_TOKENS || "12000", 10),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
};
