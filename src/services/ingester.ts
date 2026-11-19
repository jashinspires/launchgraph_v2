import crypto from "node:crypto";
import { persistStore, store } from "../store.js";
import { SecretScrubber } from "../security/scrubber.js";
import { Connection, SourceEvent, TrustLabel, WebhookInboxEntry } from "../types.js";

export interface IngestionResult {
  is_duplicate: boolean;
  source_event_id: string | null;
  message: string;
}

export class EventProcessor {
  static processIncomingWebhook(params: {
    connection: Connection;
    event_type: string;
    idempotency_key: string;
    external_id: string;
    raw_payload: Record<string, unknown>;
    trust_label?: TrustLabel;
  }): IngestionResult {
    const {
      connection,
      event_type,
      idempotency_key,
      external_id,
      raw_payload,
      trust_label = "INTERNAL",
    } = params;

    const dedupeKey = `${connection.id}:${idempotency_key}`;
    if (store.webhookInbox.has(dedupeKey)) {
      return {
        is_duplicate: true,
        source_event_id: null,
        message: `Event already processed with idempotency key: ${idempotency_key}`,
      };
    }

    const now = new Date().toISOString();
    const inboxEntry: WebhookInboxEntry = {
      id: crypto.randomUUID(),
      connection_id: connection.id,
      idempotency_key,
      event_type,
      payload: raw_payload,
      status: "processed",
      received_at: now,
    };
    store.webhookInbox.set(dedupeKey, inboxEntry);

    const scrubbedPayload = SecretScrubber.scrubPayload(raw_payload);
    const sourceEventId = crypto.randomUUID();
    const sourceEvent: SourceEvent = {
      id: sourceEventId,
      workspace_id: connection.workspace_id,
      connection_id: connection.id,
      source_type: connection.source_type,
      external_id,
      trust_label,
      raw_payload: scrubbedPayload,
      is_processed: false,
      created_at: now,
    };
    store.sourceEvents.set(sourceEventId, sourceEvent);
    persistStore();

    return {
      is_duplicate: false,
      source_event_id: sourceEventId,
      message: "Event successfully ingested and scrubbed.",
    };
  }
}
