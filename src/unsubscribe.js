/** Keywords indicating unsubscribe-related URLs. */
const UNSUB_URL_KEYWORDS = [
  "unsubscribe", "unsub", "opt-out", "optout",
  "manage-preferences", "email-preferences", "manage-subscriptions",
];

/** Keywords to match in anchor text (case-insensitive). */
const UNSUB_TEXT_KEYWORDS = [
  "unsubscribe", "manage preferences", "opt out", "email preferences",
  "update your preferences",
];

/** CSS class substrings indicating unsubscribe links (case-insensitive). */
const UNSUB_CLASS_KEYWORDS = [
  "unsubscribe", "unsub", "manage-preferences", "opt-out",
];

/**
 * Clean a URL by stripping trailing punctuation, removing QP soft line breaks,
 * and decoding common HTML entities.
 * Does NOT decode =XX hex sequences — mailparser already handles QP content
 * decoding, and blindly decoding =XX corrupts query parameter values.
 * @param {string} url
 * @returns {string}
 */
function cleanUrl(url) {
  return url.replace(/=\r?\n/g, "").replace(/[)\]>]+$/, "").replace(/&amp;/g, "&");
}

/**
 * Validate that a URL is not a broken QP artifact.
 * Rejects URLs ending with = or == and URLs with empty/broken query values.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (url.endsWith("=") || url.endsWith("==")) return false;
  // Reject query params with broken values like ?a== or &foo=3D=
  if (/[?&][^=]+=={1,2}(&|$)/.test(url)) return false;
  if (/[?&][^=]+=3D/i.test(url)) return false;
  return true;
}

/**
 * Extract the text value from a mailparser List-Unsubscribe header.
 * mailparser may return a string, an object with .text or .value,
 * or a structured object. This function normalizes to a string.
 * @param {*} headerValue
 * @returns {string}
 */
function listUnsubscribeToString(headerValue) {
  if (typeof headerValue === "string") return headerValue;
  if (headerValue?.text) return headerValue.text;
  if (headerValue?.value) {
    // value can be an array of objects with .url
    if (Array.isArray(headerValue.value)) {
      return headerValue.value
        .map((v) => (typeof v === "string" ? v : v?.url || v?.text || String(v)))
        .join(", ");
    }
    if (typeof headerValue.value === "string") return headerValue.value;
  }
  // Last resort: check for params or html property
  if (headerValue?.html) return headerValue.html;
  // If it's an object with entries we can iterate
  if (typeof headerValue === "object" && headerValue !== null) {
    // Try to find any string-like data
    const str = JSON.stringify(headerValue);
    // Extract URLs from the JSON representation
    const urls = str.match(/https?:\/\/[^\s"'\\,]+/g);
    if (urls?.length) return urls.map((u) => `<${u}>`).join(", ");
  }
  return String(headerValue);
}

/**
 * Extract unsubscribe links from a parsed email.
 * Checks List-Unsubscribe header, HTML body links (by href, class, and text),
 * and plain text URLs.
 * @param {object} parsed - mailparser result
 * @returns {string[]} deduplicated unsubscribe URLs
 */
function extractUnsubscribeLinks(parsed) {
  const links = new Set();

  // 1. List-Unsubscribe header (RFC 2369)
  const listUnsub = parsed.headers?.get("list-unsubscribe");
  if (listUnsub) {
    const headerStr = listUnsubscribeToString(listUnsub);
    const angleMatches = headerStr.match(/<([^>]+)>/g);
    if (angleMatches) {
      for (const m of angleMatches) {
        const url = cleanUrl(m.slice(1, -1).trim());
        if (url.startsWith("http") && isValidUrl(url)) {
          links.add(url);
        }
      }
    }
    // Also check for bare URLs not in angle brackets
    const bareUrls = headerStr.match(/https?:\/\/[^\s<>,]+/g);
    if (bareUrls) {
      for (const url of bareUrls) {
        const cleaned = cleanUrl(url);
        if (isValidUrl(cleaned)) {
          links.add(cleaned);
        }
      }
    }
  }

  // 2. HTML body: match <a> tags by href keywords, class, and inner text
  if (parsed.html) {
    // Parse full <a> tags to check href, class, and inner text
    const anchorPattern = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;
    let anchorMatch;
    while ((anchorMatch = anchorPattern.exec(parsed.html)) !== null) {
      const attrs = anchorMatch[1];
      const innerText = anchorMatch[2].replace(/<[^>]*>/g, "").trim();

      // Extract href
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];

      const hrefLower = href.toLowerCase();
      const textLower = innerText.toLowerCase();
      const classMatch = attrs.match(/class\s*=\s*["']([^"']+)["']/i);
      const classValue = classMatch ? classMatch[1].toLowerCase() : "";

      const matchesHref = UNSUB_URL_KEYWORDS.some((kw) => hrefLower.includes(kw));
      const matchesText = UNSUB_TEXT_KEYWORDS.some((kw) => textLower.includes(kw));
      const matchesClass = UNSUB_CLASS_KEYWORDS.some((kw) => classValue.includes(kw));

      if (matchesHref || matchesText || matchesClass) {
        const cleaned = cleanUrl(href);
        if (isValidUrl(cleaned)) {
          links.add(cleaned);
        }
      }
    }
  }

  // 3. Plain text body: URLs containing unsubscribe keywords
  const textBody = parsed.text || "";
  const urlPattern = /https?:\/\/[^\s<>")\]]+/gi;
  let textMatch;
  while ((textMatch = urlPattern.exec(textBody)) !== null) {
    const url = textMatch[0];
    const lower = url.toLowerCase();
    if (UNSUB_URL_KEYWORDS.some((kw) => lower.includes(kw))) {
      const cleaned = cleanUrl(url);
      if (isValidUrl(cleaned)) {
        links.add(cleaned);
      }
    }
  }

  return [...links];
}

export { extractUnsubscribeLinks, cleanUrl, isValidUrl, listUnsubscribeToString };
