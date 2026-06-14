import { defineEventTable } from "./event-table.js";
import { renderSharedEvent } from "./shared-event-factories.js";

/**
 * Like defineEventTable but falls back to renderSharedEvent for unknown event types.
 * Use for command-level event tables that share IMAP progress events (mailbox-lock-failed,
 * search-failed, etc.). For command tables with no shared fallback, use defineEventTable directly.
 *
 * @param {Record<string, { params?: string[], severity?: string, render?: (e: any) => string, type?: string }>} descriptors
 * @returns {{ factories: Record<string, any>, renderEvent: (event: object) => string | null }}
 */
export function defineCommandEventTable(descriptors) {
  return defineEventTable(descriptors, { fallbackRenderer: renderSharedEvent });
}
