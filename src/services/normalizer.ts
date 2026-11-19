import crypto from "node:crypto";
import { persistStore, store } from "../store.js";
import {
  ChangeEvent,
  ChangeMembership,
  LinkSuggestion,
  LinkType,
  SourceEvent,
} from "../types.js";

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]{1,9}-[0-9]+)(?![0-9-])\b/g;
const NON_JIRA_PREFIXES = new Set([
  "CVE",
  "ISO",
  "SHA",
  "UTF",
  "TLS",
  "SSL",
  "HTTP",
  "RFC",
  "PR",
  "REL",
  "AES",
  "RSA",
  "SOC",
  "PCI",
  "SAML",
]);
const GITHUB_PR_SHORT_PATTERN = /(?:^|[\s(,])#([0-9]+)\b/g;
const GITHUB_PR_URL_PATTERN =
  /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/([0-9]+)/g;
const COMMIT_SHA_PATTERN = /\b([a-f0-9]{7,40})\b/g;

const CLOSING_KEYWORDS_PATTERN =
  /\b(fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+(?:#\d+|[A-Z][A-Z0-9]+-\d+)/i;
const REVERT_PATTERN =
  /\b(revert|reverting|reverted|rollback)\b|\bRevert\s+"[^"]+"/i;

export interface ExtractedReferences {
  jira_keys: string[];
  pr_numbers: number[];
  commit_shas: string[];
}

export class ReferenceExtractor {
  static extractFromText(text: string): ExtractedReferences {
    if (!text || typeof text !== "string") {
      return { jira_keys: [], pr_numbers: [], commit_shas: [] };
    }

    const jiraKeys = new Set<string>();
    for (const match of text.matchAll(JIRA_KEY_PATTERN)) {
      if (match[1]) {
        const prefix = match[1].split("-")[0];
        if (!NON_JIRA_PREFIXES.has(prefix)) {
          jiraKeys.add(match[1]);
        }
      }
    }

    const prNumbers = new Set<number>();
    for (const match of text.matchAll(GITHUB_PR_SHORT_PATTERN)) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n)) prNumbers.add(n);
    }
    for (const match of text.matchAll(GITHUB_PR_URL_PATTERN)) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n)) prNumbers.add(n);
    }

    const commitShas = new Set<string>();
    for (const match of text.matchAll(COMMIT_SHA_PATTERN)) {
      const sha = match[1];
      if (sha && !/^\d+$/.test(sha)) {
        commitShas.add(sha);
      }
    }

    return {
      jira_keys: Array.from(jiraKeys).sort(),
      pr_numbers: Array.from(prNumbers).sort((a, b) => a - b),
      commit_shas: Array.from(commitShas).sort(),
    };
  }
}

export class LinkTypingEngine {
  static determineLinkType(params: {
    title: string;
    body?: string | null;
    branch_name?: string | null;
    jira_link_type?: string | null;
    is_revert?: boolean;
  }): LinkType {
    const {
      title,
      body = null,
      branch_name = null,
      jira_link_type = null,
      is_revert = false,
    } = params;
    const combinedText = `${title || ""} ${body || ""}`;

    if (is_revert || REVERT_PATTERN.test(title || "")) {
      return LinkType.L4_REVERTS;
    }

    if (jira_link_type) {
      const jLower = jira_link_type.toLowerCase();
      if (jLower.includes("block")) return LinkType.L8_BLOCKS;
      if (jLower.includes("duplicate")) return LinkType.L7_DUPLICATE_OF;
      if (jLower.includes("relate")) return LinkType.L6_RELATES_TO;
      if (jLower.includes("contain") || jLower.includes("epic")) {
        return LinkType.L5_CONTAINS;
      }
    }

    if (branch_name && /[A-Z][A-Z0-9]+-[0-9]+/.test(branch_name)) {
      return LinkType.L1_IMPLEMENTS;
    }
    if (title && /^[A-Z][A-Z0-9]+-[0-9]+/.test(title.trim())) {
      return LinkType.L1_IMPLEMENTS;
    }

    if (CLOSING_KEYWORDS_PATTERN.test(combinedText)) {
      return LinkType.L3_FIXES;
    }

    return LinkType.L2_MENTIONS;
  }
}

function extractLabelsAndReleaseFlag(payload: Record<string, any>): {
  labels: string[];
  releasePublished: boolean;
} {
  const labels: string[] = [];
  const prLabels = payload?.pull_request?.labels;
  if (Array.isArray(prLabels)) {
    for (const lbl of prLabels) {
      if (typeof lbl === "string") labels.push(lbl);
      else if (lbl && typeof lbl.name === "string") labels.push(lbl.name);
    }
  }
  const issueLabels = payload?.issue?.fields?.labels;
  if (Array.isArray(issueLabels)) {
    for (const lbl of issueLabels) {
      if (typeof lbl === "string") labels.push(lbl);
    }
  }
  const releasePublished = Boolean(
    payload?.release && payload?.action === "published"
  );
  return { labels, releasePublished };
}

export class AnchorResolver {
  static predictAnchorRef(params: {
    source_type: string;
    external_id: string;
    raw_payload?: Record<string, any>;
    title: string;
    description?: string | null;
  }): { anchor_ref: string; is_fallback: boolean } {
    const {
      source_type,
      external_id,
      raw_payload = {},
      title,
      description = null,
    } = params;
    const refs = ReferenceExtractor.extractFromText(
      `${title} ${description || ""}`
    );

    const epicKey =
      raw_payload?.epic_key || raw_payload?.fields?.epic?.key || undefined;

    if (epicKey) {
      return { anchor_ref: `JIRA:${epicKey}`, is_fallback: false };
    }
    if (refs.jira_keys.length > 0) {
      return { anchor_ref: `JIRA:${refs.jira_keys[0]}`, is_fallback: false };
    }
    if (source_type === "JIRA" && external_id.startsWith("JIRA:")) {
      return { anchor_ref: external_id, is_fallback: false };
    }
    if (refs.pr_numbers.length > 0) {
      return { anchor_ref: `GITHUB:PR-${refs.pr_numbers[0]}`, is_fallback: false };
    }
    if (source_type === "GITHUB" && external_id.startsWith("PR-")) {
      return { anchor_ref: `GITHUB:${external_id}`, is_fallback: false };
    }

    return { anchor_ref: external_id, is_fallback: true };
  }

  static resolveOrCreateChangeEvent(params: {
    source_event: SourceEvent;
    title: string;
    description?: string | null;
  }): { changeEvent: ChangeEvent; isFallbackAnchor: boolean } {
    const { source_event, title, description = null } = params;
    const payload = source_event.raw_payload as Record<string, any>;

    const { anchor_ref: anchorRef, is_fallback: isFallbackAnchor } =
      this.predictAnchorRef({
        source_type: source_event.source_type,
        external_id: source_event.external_id,
        raw_payload: payload,
        title,
        description,
      });

    let changeEvent: ChangeEvent | undefined;
    for (const existing of store.changeEvents.values()) {
      if (
        existing.workspace_id === source_event.workspace_id &&
        existing.anchor_ref === anchorRef
      ) {
        changeEvent = existing;
        break;
      }
    }

    const { labels, releasePublished } = extractLabelsAndReleaseFlag(payload);
    const now = new Date().toISOString();

    if (changeEvent) {
      changeEvent.last_activity_at = now;
      if (!changeEvent.description && description) {
        changeEvent.description = description;
      }
      changeEvent.availability = LifecycleTracker.evaluateAvailability(
        changeEvent.availability,
        labels,
        releasePublished
      );
      changeEvent.is_processed = false;
    } else {
      const id = crypto.randomUUID();
      const initialAvailability = LifecycleTracker.evaluateAvailability(
        "unknown",
        labels,
        releasePublished
      );
      changeEvent = {
        id,
        workspace_id: source_event.workspace_id,
        anchor_ref: anchorRef,
        title,
        description,
        state: "discovered",
        availability: initialAvailability,
        last_activity_at: now,
        is_processed: false,
        created_at: now,
      };
      store.changeEvents.set(id, changeEvent);
    }

    return { changeEvent, isFallbackAnchor };
  }
}

export class LedgerManager {
  static attachReference(params: {
    change_event: ChangeEvent;
    ref_type: string;
    ref_key: string;
    link_type: string;
    role?: string;
    source_event?: SourceEvent | null;
    attached_by?: string;
    reason?: string | null;
  }): ChangeMembership {
    const {
      change_event,
      ref_type,
      ref_key,
      link_type,
      role = "implements",
      source_event = null,
      attached_by = "system",
      reason = null,
    } = params;

    const existing = store.changeMemberships.find(
      (m) =>
        m.change_event_id === change_event.id &&
        m.ref_key === ref_key &&
        m.is_active
    );
    if (existing) {
      return existing;
    }

    const membership: ChangeMembership = {
      id: crypto.randomUUID(),
      change_event_id: change_event.id,
      source_event_id: source_event ? source_event.id : null,
      ref_type,
      ref_key,
      link_type,
      role,
      attached_by,
      reason,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    store.changeMemberships.push(membership);
    return membership;
  }

  static softUnlinkReference(
    membershipId: string,
    unlinkedBy: string,
    unlinkReason: string
  ): boolean {
    if (!unlinkReason || unlinkReason.trim().length < 5) {
      throw new Error(
        "Mandatory audit unlink_reason of at least 5 characters is required."
      );
    }
    const membership = store.changeMemberships.find(
      (m) => m.id === membershipId && m.is_active
    );
    if (!membership) {
      return false;
    }
    membership.is_active = false;
    membership.unlinked_at = new Date().toISOString();
    membership.unlinked_by = unlinkedBy;
    membership.unlink_reason = unlinkReason.trim();
    persistStore();
    return true;
  }
}

export class LifecycleTracker {
  static evaluateState(
    currentState: string,
    sourceType: string,
    eventPayload: Record<string, any>
  ): string {
    if (currentState === "closed") {
      if (eventPayload?.action === "reopened") {
        return "in_progress";
      }
      return "closed";
    }

    if (sourceType === "GITHUB") {
      const pr = eventPayload?.pull_request;
      if (pr) {
        if (
          pr.merged === true ||
          (eventPayload?.action === "closed" && pr.merged_at)
        ) {
          return "merged";
        }
        if (eventPayload?.action === "closed") {
          return "closed";
        }
        if (pr.state === "open") {
          return "in_progress";
        }
      }
    }

    if (sourceType === "JIRA") {
      const statusCategory =
        eventPayload?.issue?.fields?.status?.statusCategory?.key;
      if (statusCategory === "done") return "merged";
      if (statusCategory === "indeterminate") return "in_progress";
    }

    return currentState || "discovered";
  }

  static evaluateAvailability(
    currentAvailability: string,
    labels: string[],
    releasePublished = false
  ): string {
    if (releasePublished) return "ga";
    const labelSet = new Set((labels || []).map((l) => l.toLowerCase()));
    if (labelSet.has("ga") || labelSet.has("general-availability")) return "ga";
    if (labelSet.has("beta") || labelSet.has("public-beta")) return "beta";
    if (labelSet.has("internal") || labelSet.has("dogfood")) return "internal";
    return currentAvailability || "unknown";
  }
}

export class SuggestionRanker {
  static readonly WEIGHT_PERSON = 0.35;
  static readonly WEIGHT_TIME = 0.2;
  static readonly WEIGHT_PATH = 0.25;
  static readonly WEIGHT_TEXT = 0.2;

  static calculateScore(params: {
    same_person: boolean;
    time_delta_hours: number;
    path_match_score: number;
    text_similarity_score: number;
  }): { score: number; feature_breakdown: Record<string, number> } {
    const {
      same_person,
      time_delta_hours,
      path_match_score,
      text_similarity_score,
    } = params;

    const sPerson = same_person ? 1.0 : 0.0;
    let sTime: number;
    if (time_delta_hours <= 0) {
      sTime = 1.0;
    } else if (time_delta_hours < 24) {
      sTime = Math.max(0.0, 1.0 - time_delta_hours / 48.0);
    } else if (time_delta_hours < 168) {
      sTime = Math.max(0.1, 0.5 - (time_delta_hours - 24) / 288.0);
    } else {
      sTime = 0.0;
    }

    const sPath = Math.max(0.0, Math.min(1.0, Number(path_match_score)));
    const sText = Math.max(0.0, Math.min(1.0, Number(text_similarity_score)));

    const total =
      this.WEIGHT_PERSON * sPerson +
      this.WEIGHT_TIME * sTime +
      this.WEIGHT_PATH * sPath +
      this.WEIGHT_TEXT * sText;

    const roundedTotal = Number(Math.max(0.0, Math.min(1.0, total)).toFixed(4));

    return {
      score: roundedTotal,
      feature_breakdown: {
        s_person: sPerson,
        s_time: Number(sTime.toFixed(4)),
        s_path: Number(sPath.toFixed(4)),
        s_text: Number(sText.toFixed(4)),
      },
    };
  }
}

function tokenizeWords(text: string): Set<string> {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "into",
    "team",
    "heads",
  ]);
  const tokens = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractActor(event: SourceEvent): string | null {
  const payload = (event.raw_payload || {}) as Record<string, any>;
  if (event.source_type === "GITHUB") {
    return (
      payload?.pull_request?.user?.login ||
      payload?.sender?.login ||
      payload?.commits?.[0]?.author?.username ||
      payload?.commits?.[0]?.author?.name ||
      null
    );
  }
  if (event.source_type === "JIRA") {
    return (
      payload?.issue?.fields?.assignee?.displayName ||
      payload?.user?.displayName ||
      null
    );
  }
  if (event.source_type === "SLACK") {
    return payload?.event?.user || null;
  }
  return null;
}

function maybeGenerateSuggestions(
  sourceEvent: SourceEvent,
  ownChangeEventId: string,
  title: string,
  description: string
): void {
  const candidates = Array.from(store.changeEvents.values()).filter(
    (ch) =>
      ch.workspace_id === sourceEvent.workspace_id && ch.id !== ownChangeEventId
  );
  if (candidates.length === 0) return;

  const eventWords = tokenizeWords(`${title} ${description}`);
  const eventActor = extractActor(sourceEvent);
  const eventTime = Date.parse(sourceEvent.created_at) || Date.now();

  let bestMatch:
    | {
        change: ChangeEvent;
        score: number;
        breakdown: Record<string, number>;
      }
    | undefined;

  for (const ch of candidates) {
    const chWords = tokenizeWords(`${ch.title} ${ch.description || ""}`);
    const textSim = jaccardSimilarity(eventWords, chWords);

    const linkedEvents = store.changeMemberships
      .filter((m) => m.change_event_id === ch.id && m.is_active && m.source_event_id)
      .map((m) => store.sourceEvents.get(m.source_event_id!))
      .filter((se): se is SourceEvent => Boolean(se));

    const samePerson = Boolean(
      eventActor &&
        linkedEvents.some((se) => extractActor(se) === eventActor)
    );

    const chTime = Date.parse(ch.last_activity_at) || eventTime;
    const deltaHours = Math.abs(eventTime - chTime) / (1000 * 60 * 60);
    const pathMatch = textSim > 0.15 ? Math.min(1, textSim * 1.4) : 0.25;

    const ranked = SuggestionRanker.calculateScore({
      same_person: samePerson,
      time_delta_hours: deltaHours,
      path_match_score: pathMatch,
      text_similarity_score: textSim,
    });

    if (
      ranked.score >= 0.25 &&
      (!bestMatch || ranked.score > bestMatch.score)
    ) {
      bestMatch = {
        change: ch,
        score: ranked.score,
        breakdown: ranked.feature_breakdown,
      };
    }
  }

  if (bestMatch) {
    const alreadyExists = store.linkSuggestions.some(
      (ls) =>
        ls.source_event_id === sourceEvent.id &&
        ls.change_event_id === bestMatch!.change.id
    );
    if (!alreadyExists) {
      store.linkSuggestions.push({
        id: crypto.randomUUID(),
        workspace_id: sourceEvent.workspace_id,
        change_event_id: bestMatch.change.id,
        source_event_id: sourceEvent.id,
        score: bestMatch.score,
        feature_breakdown: bestMatch.breakdown,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
      });
    }
  }
}

export function extractEventTextFields(event: SourceEvent): {
  title: string;
  description: string;
  branchName: string | null;
  isRevert: boolean;
} {
  const payload = (event.raw_payload || {}) as Record<string, any>;
  let title = "";
  let description = "";
  let branchName: string | null = null;
  let isRevert = false;

  if (event.source_type === "GITHUB") {
    const pr = payload?.pull_request;
    if (pr) {
      title = pr.title || "";
      description = pr.body || "";
      branchName = pr.head?.ref || null;
    } else if (Array.isArray(payload?.commits) && payload.commits.length > 0) {
      const firstCommit = payload.commits[0];
      title = (firstCommit.message || "").split("\n")[0];
      description = firstCommit.message || "";
    } else if (payload?.release) {
      title = payload.release.name || payload.release.tag_name || "";
      description = payload.release.body || "";
    }
  } else if (event.source_type === "JIRA") {
    const fields = payload?.issue?.fields || {};
    title = fields.summary || "";
    const descField = fields.description;
    description =
      typeof descField === "string" ? descField : String(descField || "");
  } else if (event.source_type === "SLACK") {
    const slackEvent = payload?.event || {};
    title = (slackEvent.text || "").split("\n")[0].slice(0, 100);
    description = slackEvent.text || "";
  }

  if (!title) {
    title = `${event.source_type} Event ${event.external_id}`;
  }

  if (REVERT_PATTERN.test(title) || REVERT_PATTERN.test(description)) {
    isRevert = true;
  }

  return { title, description, branchName, isRevert };
}

export function processUnprocessedSourceEvents(limit = 25): number {
  const pending = Array.from(store.sourceEvents.values())
    .filter((se) => !se.is_processed)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, limit);

  if (pending.length === 0) return 0;

  let processedCount = 0;
  for (const event of pending) {
    const payload = (event.raw_payload || {}) as Record<string, any>;
    const { title, description, branchName, isRevert } =
      extractEventTextFields(event);

    const { changeEvent, isFallbackAnchor } =
      AnchorResolver.resolveOrCreateChangeEvent({
        source_event: event,
        title,
        description,
      });

    const linkType = LinkTypingEngine.determineLinkType({
      title,
      body: description,
      branch_name: branchName,
      is_revert: isRevert,
    });

    LedgerManager.attachReference({
      change_event: changeEvent,
      ref_type: `${event.source_type}_${event.external_id.split(":")[0]}`,
      ref_key: event.external_id,
      link_type: linkType,
      role: linkType === LinkType.L1_IMPLEMENTS ? "implements" : "context",
      source_event: event,
      attached_by: "system",
      reason: `Normalized from inbound ${event.source_type} event.`,
    });

    changeEvent.state = LifecycleTracker.evaluateState(
      changeEvent.state,
      event.source_type,
      payload
    );

    if (isFallbackAnchor) {
      maybeGenerateSuggestions(event, changeEvent.id, title, description);
    }

    event.is_processed = true;
    processedCount += 1;
  }

  persistStore();
  return processedCount;
}

export function acceptLinkSuggestion(
  suggestionId: string,
  reviewedBy = "pmm-reviewer"
): { suggestion: LinkSuggestion; membership: ChangeMembership } | null {
  const suggestion = store.linkSuggestions.find(
    (ls) => ls.id === suggestionId && ls.status === "pending"
  );
  if (!suggestion) return null;

  const targetChange = store.changeEvents.get(suggestion.change_event_id);
  const sourceEvent = store.sourceEvents.get(suggestion.source_event_id);
  if (!targetChange || !sourceEvent) return null;

  const { title, description, branchName, isRevert } =
    extractEventTextFields(sourceEvent);
  const linkType = LinkTypingEngine.determineLinkType({
    title,
    body: description,
    branch_name: branchName,
    is_revert: isRevert,
  });

  const membership = LedgerManager.attachReference({
    change_event: targetChange,
    ref_type: `${sourceEvent.source_type}_${sourceEvent.external_id.split(":")[0]}`,
    ref_key: sourceEvent.external_id,
    link_type: linkType,
    role: "context",
    source_event: sourceEvent,
    attached_by: reviewedBy,
    reason: `Accepted triage suggestion (score: ${suggestion.score})`,
  });

  targetChange.last_activity_at = new Date().toISOString();
  targetChange.is_processed = false;

  suggestion.status = "accepted";
  suggestion.reviewed_by = reviewedBy;
  suggestion.reviewed_at = new Date().toISOString();

  persistStore();
  return { suggestion, membership };
}

export function rejectLinkSuggestion(
  suggestionId: string,
  reviewedBy = "pmm-reviewer"
): LinkSuggestion | null {
  const suggestion = store.linkSuggestions.find(
    (ls) => ls.id === suggestionId && ls.status === "pending"
  );
  if (!suggestion) return null;

  suggestion.status = "rejected";
  suggestion.reviewed_by = reviewedBy;
  suggestion.reviewed_at = new Date().toISOString();
  persistStore();
  return suggestion;
}
