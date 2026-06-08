import { describe, expect, it } from "bun:test";
import { defineEventTable } from "../src/event-table.js";

describe("defineEventTable", () => {
  it("derives kebab-case type from camelCase key", () => {
    const { factories } = defineEventTable({ messageStart: { params: ["index", "total"] } });
    expect(/** @type {any} */ (factories.messageStart).type).toBe("message-start");
  });

  it("derives multi-segment kebab type for usingPdfContent pattern", () => {
    const { factories } = defineEventTable({ usingPdfContent: { params: ["uid"] } });
    expect(/** @type {any} */ (factories.usingPdfContent).type).toBe("using-pdf-content");
  });

  it("uses explicit type override when provided", () => {
    const { factories } = defineEventTable({ myEvent: { type: "custom-type", params: ["x"] } });
    expect(/** @type {any} */ (factories.myEvent).type).toBe("custom-type");
  });

  it("builds a regular factory that produces the correct event", () => {
    const { factories } = defineEventTable({ messageStart: { params: ["index", "total"] } });
    expect(factories.messageStart(1, 5)).toEqual({ type: "message-start", index: 1, total: 5 });
  });

  it("builds an error factory when severity is provided", () => {
    const { factories } = defineEventTable({ doclingFailed: { severity: "warning", params: ["uid"] } });
    const err = new Error("not found");
    expect(factories.doclingFailed(err, 42)).toEqual({
      type: "docling-failed",
      severity: "warning",
      error: err,
      uid: 42,
    });
  });

  it("renderEvent dispatches to the correct render function", () => {
    const { factories, renderEvent } = defineEventTable({
      messageStart: {
        params: ["index", "total"],
        render: (e) => `[${e.index}/${e.total}]`,
      },
    });
    expect(renderEvent(factories.messageStart(1, 5))).toBe("[1/5]");
  });

  it("renderEvent returns null for unknown event types", () => {
    const { renderEvent } = defineEventTable({ messageStart: { params: ["index"] } });
    expect(renderEvent({ type: "unknown-event" })).toBeNull();
  });

  it("renderEvent returns null for unknown types when fallback is disabled", () => {
    const { renderEvent } = defineEventTable({ foo: { render: () => "foo" } }, { fallback: false });
    expect(renderEvent({ type: "unknown" })).toBeNull();
  });
});
