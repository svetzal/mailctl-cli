/**
 * Content sanitization for prompt injection defense.
 * Pure functions — no I/O, no side effects.
 *
 * Email content is untrusted data from the internet. These functions detect,
 * score, and neutralize prompt injection patterns before content reaches
 * LLMs or agent-consumed output.
 */

/**
 * @typedef {object} InjectionMatch
 * @property {string} name - pattern category name
 * @property {string} matched - the text that triggered the match
 */

/**
 * @typedef {object} RiskScore
 * @property {number} score - 0.0–1.0 injection risk score
 * @property {string[]} flags - matched pattern category names
 */

/**
 * @typedef {object} ContentAssessment
 * @property {number} riskScore - 0.0–1.0 injection risk score
 * @property {string[]} flags - matched pattern category names
 * @property {boolean} suspicious - true when riskScore >= threshold
 */

// ── Injection pattern definitions ────────────────────────────────────────────

/** @type {Array<{ name: string, pattern: RegExp, weight: number }>} */
const INJECTION_PATTERNS = [
  // Instruction override attempts
  {
    name: "ignore-instructions",
    pattern:
      /ignore\s+(previous|prior|above|all|earlier|my|these|the)\s+(instructions?|rules?|directives?|prompts?|guidelines?)/i,
    weight: 0.4,
  },
  {
    name: "new-instructions",
    pattern: /\b(new|updated|revised|real|actual)\s+instructions?\s*:/i,
    weight: 0.4,
  },
  {
    name: "system-override",
    pattern: /\bsystem\s*prompt\s*:/i,
    weight: 0.4,
  },
  {
    name: "you-are-now",
    pattern: /\byou\s+are\s+now\s+(a\s+)?\w/i,
    weight: 0.4,
  },
  {
    name: "act-as",
    pattern: /\bact\s+as\s+(a\s+|an\s+)?\w/i,
    weight: 0.3,
  },
  {
    name: "pretend-to-be",
    pattern: /\bpretend\s+(to\s+be|you\s+are)\b/i,
    weight: 0.3,
  },
  {
    name: "disregard",
    pattern: /\bdisregard\s+(all|previous|prior|above|earlier|any)\b/i,
    weight: 0.4,
  },
  {
    name: "forget-instructions",
    pattern: /\bforget\s+(all|your|previous|prior|everything)\b/i,
    weight: 0.3,
  },
  {
    name: "do-not-follow",
    pattern: /\bdo\s+not\s+follow\s+(your|the|any|previous)\b/i,
    weight: 0.4,
  },

  // XML delimiter mimicry (attempting to break out of data context)
  {
    name: "xml-system-tag",
    pattern: /<\/?system(?:\s[^>]*)?>|<\/?system-reminder>/i,
    weight: 0.3,
  },
  {
    name: "xml-instructions-tag",
    pattern: /<\/?instructions?(?:\s[^>]*)?>/i,
    weight: 0.3,
  },
  {
    name: "xml-tool-call",
    pattern: /<\/?tool_call\b|<\/?function_call\b|<\/?tool_use\b/i,
    weight: 0.3,
  },
  {
    name: "xml-human-assistant",
    pattern: /<\/?(?:human|assistant|user)(?:\s[^>]*)?>/i,
    weight: 0.3,
  },
  {
    name: "xml-antml-tag",
    pattern: /<\/?antml_\w+/i,
    weight: 0.4,
  },

  // Markdown structural injection
  {
    name: "heading-injection",
    pattern: /^#{1,3}\s+(system|instructions?|prompt|rules?|directive)\s*$/im,
    weight: 0.2,
  },

  // Role hijacking
  {
    name: "role-hijack",
    pattern: /\b(jailbreak|DAN\b|do\s+anything\s+now)\b/i,
    weight: 0.5,
  },

  // Unicode steganography
  {
    name: "zero-width-chars",
    pattern: /[\u200B-\u200D\uFEFF\u2060]/,
    weight: 0.5,
  },
  {
    name: "rtl-override",
    pattern: /[\u202A-\u202E\u2066-\u2069]/,
    weight: 0.5,
  },
];

/** Suspicious threshold — content at or above this score is flagged */
const SUSPICIOUS_THRESHOLD = 0.6;

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strips raw control characters from email data
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

const INVISIBLE_CHAR_REGEX = /[\u200B-\u200D\uFEFF\u2060\u202A-\u202E\u2066-\u2069]/g;

/** XML-like tags that mimic known system delimiters — escaped to prevent structural interpretation */
const SYSTEM_TAG_REGEX =
  /<(\/?(?:system(?:-reminder)?|instructions?|tool_call|function_call|tool_use|human|assistant|user|antml_\w+))(\s[^>]*)?>/gi;

// ── Public functions ─────────────────────────────────────────────────────────

/**
 * Detect prompt injection patterns in text.
 * Returns an array of match descriptors for each pattern found.
 *
 * @param {string} text - text to scan
 * @returns {InjectionMatch[]}
 */
export function detectInjectionPatterns(text) {
  if (typeof text !== "string" || text.length === 0) return [];

  /** @type {InjectionMatch[]} */
  const matches = [];

  for (const { name, pattern } of INJECTION_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      matches.push({ name, matched: m[0] });
    }
  }

  return matches;
}

/**
 * Score text for injection risk.
 * Returns a weighted score (0.0–1.0) and the list of matched pattern names.
 *
 * @param {string} text - text to score
 * @returns {RiskScore}
 */
export function scoreInjectionRisk(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { score: 0, flags: [] };
  }

  const matches = detectInjectionPatterns(text);
  if (matches.length === 0) return { score: 0, flags: [] };

  const flags = matches.map((m) => m.name);
  const rawScore = matches.reduce((sum, m) => {
    const def = INJECTION_PATTERNS.find((p) => p.name === m.name);
    return sum + (def?.weight ?? 0);
  }, 0);

  return { score: Math.min(rawScore, 1.0), flags };
}

/**
 * Neutralize content for safe agent consumption.
 * Strips invisible characters, control chars, and escapes XML-like system
 * delimiter tags. Preserves readability — agents still need to extract
 * information from the content.
 *
 * @param {*} text - untrusted text to neutralize (non-strings pass through unchanged)
 * @returns {*}
 */
export function neutralizeContent(text) {
  if (typeof text !== "string") return text;

  let result = text;

  // 1. Strip zero-width chars and RTL overrides (no legitimate purpose in email text)
  result = result.replace(INVISIBLE_CHAR_REGEX, "");

  // 2. Strip raw control chars (subsumes sanitizeString behavior)
  result = result.replace(CONTROL_CHAR_REGEX, "");

  // 3. Escape XML-like tags matching system delimiter patterns
  result = result.replace(SYSTEM_TAG_REGEX, (_match, tag, attrs) => {
    const safeAttrs = attrs || "";
    return `&lt;${tag}${safeAttrs}&gt;`;
  });

  return result;
}

/**
 * Sanitize a value for safe agent-consumed JSON output.
 * Drop-in complement for sanitizeString — applies neutralizeContent to strings,
 * passes non-string values through unchanged.
 *
 * @param {*} value - value to sanitize
 * @returns {*}
 */
export function sanitizeForAgentOutput(value) {
  if (typeof value !== "string") return value;
  return neutralizeContent(value);
}

/**
 * Assess content for injection risk.
 * Returns a structured assessment with risk score, flags, and suspicious boolean.
 *
 * @param {string} text - text to assess
 * @returns {ContentAssessment}
 */
export function assessContent(text) {
  const { score, flags } = scoreInjectionRisk(text);
  return {
    riskScore: score,
    flags,
    suspicious: score >= SUSPICIOUS_THRESHOLD,
  };
}

/**
 * Build an XML-delimited email context string for safe LLM prompt construction.
 * Uses CDATA sections to structurally separate untrusted email data from
 * LLM instructions.
 *
 * @param {object} fields
 * @param {string} fields.from - sender display name
 * @param {string} fields.fromAddress - sender email address
 * @param {string} fields.subject - email subject
 * @param {string} fields.date - email date (ISO string or similar)
 * @param {string} fields.body - email body text
 * @returns {string}
 */
export function buildLlmEmailContext({ from, fromAddress, subject, date, body }) {
  // Strip CDATA close sequences from content to prevent CDATA breakout
  const safeCdata = (/** @type {string} */ s) => (s || "").replace(/]]>/g, "]]&gt;");

  return `<email-context>
<from><![CDATA[${safeCdata(from)} <${safeCdata(fromAddress)}>]]></from>
<subject><![CDATA[${safeCdata(subject)}]]></subject>
<date>${date || ""}</date>
<body><![CDATA[
${safeCdata(body)}
]]></body>
</email-context>`;
}
