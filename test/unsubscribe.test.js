import { describe, expect, it } from "bun:test";
import { extractUnsubscribeLinks, isValidUrl } from "../src/unsubscribe.js";

/**
 * Helper to create a mock parsed email object similar to mailparser output.
 * @param {object} opts
 * @returns {object}
 */
function mockParsed({ html, text, listUnsubscribe } = {}) {
  const headers = new Map();
  if (listUnsubscribe !== undefined) {
    headers.set("list-unsubscribe", listUnsubscribe);
  }
  return { html: html || null, text: text || "", headers };
}

describe("extractUnsubscribeLinks", () => {
  // Test 1: Klaviyo unsubscribe via class/text (Yarbo email)
  it("extracts links from anchor class and text (Klaviyo/Yarbo)", () => {
    const html = `<a class="unsubscribe-link" style="color:#4E4E4E;" href="https://ctrk.klclick.com/l/01KHXW2RSA8S71EWHHVR77CSXX_14">Unsubscribe</a> | <a class="manage-preferences" style="color:#4E4E4E;" href="https://ctrk.klclick.com/l/01KHXW2RSA8S71EWHHVR77CSXX_15">Manage Preferences</a>`;
    const parsed = mockParsed({ html });
    const links = extractUnsubscribeLinks(parsed);

    expect(links).toContain("https://ctrk.klclick.com/l/01KHXW2RSA8S71EWHHVR77CSXX_14");
    expect(links).toContain("https://ctrk.klclick.com/l/01KHXW2RSA8S71EWHHVR77CSXX_15");
  });

  // Test 2: Eloqua preference center (ESET email)
  it("extracts links from anchor text containing preferences keywords (ESET/Eloqua)", () => {
    const html = `<a href="https://notify.eset.com/business-preference?elq_mid=3776&utm_campaign=test">Update your preferences</a>`;
    const parsed = mockParsed({ html });
    const links = extractUnsubscribeLinks(parsed);

    expect(links).toContain("https://notify.eset.com/business-preference?elq_mid=3776&utm_campaign=test");
  });

  // Test 3: Scaled Agile — URL contains 'unsubscribe' (regression test)
  it("extracts links from plain text URLs containing unsubscribe keyword (Scaled Agile)", () => {
    const text = `you may unsubscribe here: https://go.scaledagile.com/UnsubscribePage.html?mkt_unsubscribe=1&mkt_tok=OTgzLVha`;
    const parsed = mockParsed({ text });
    const links = extractUnsubscribeLinks(parsed);

    expect(links).toContain("https://go.scaledagile.com/UnsubscribePage.html?mkt_unsubscribe=1&mkt_tok=OTgzLVha");
  });

  // Test 4: Broken QP URL rejection
  it("rejects broken QP-mangled URLs", () => {
    expect(isValidUrl("https://manage.kmail-lists.com/subscriptions/unsubscribe?a==")).toBe(false);
    expect(isValidUrl("https://manage.kmail-lists.com/subscriptions/unsubscribe?a=3Dfoo")).toBe(false);
    expect(isValidUrl("https://example.com/unsubscribe?token=abc123")).toBe(true);
  });

  it("does not include broken QP URLs in extraction results", () => {
    const html = `<a href="https://manage.kmail-lists.com/subscriptions/unsubscribe?a=3D=">Unsubscribe</a>`;
    const parsed = mockParsed({ html });
    const links = extractUnsubscribeLinks(parsed);

    expect(links.some((l) => l.includes("kmail-lists.com"))).toBe(false);
  });

  // Test 5: List-Unsubscribe header parsing
  it("extracts URLs from List-Unsubscribe header (structured object)", () => {
    // Simulate mailparser's structured header: an object with .text property
    const listUnsubscribe = {
      text: "<https://manage.kmail-lists.com/subscriptions/unsubscribe?a=YrrctJ&c=01JDW>",
    };
    const parsed = mockParsed({ listUnsubscribe });
    const links = extractUnsubscribeLinks(parsed);

    expect(links).toContain("https://manage.kmail-lists.com/subscriptions/unsubscribe?a=YrrctJ&c=01JDW");
  });

  it("extracts URLs from List-Unsubscribe header (plain string)", () => {
    const listUnsubscribe = "<https://example.com/unsubscribe?id=123>, <mailto:unsub@example.com>";
    const parsed = mockParsed({ listUnsubscribe });
    const links = extractUnsubscribeLinks(parsed);

    expect(links).toContain("https://example.com/unsubscribe?id=123");
    expect(links.some((l) => l.includes("mailto:"))).toBe(false);
  });

  // Regression: href-based URL matching still works
  it("extracts links from href containing unsubscribe keywords", () => {
    const html = `<a href="https://example.com/unsubscribe?token=abc">Click here</a>`;
    const parsed = mockParsed({ html });
    const links = extractUnsubscribeLinks(parsed);

    expect(links).toContain("https://example.com/unsubscribe?token=abc");
  });
});
