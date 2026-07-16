const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** @type {Array<(trimmed: string) => Date | null>} */
const MATCHERS = [
  (t) => (t === "today" ? startOfDay(new Date()) : null),
  (t) => {
    if (t !== "yesterday") return null;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return startOfDay(d);
  },
  (t) => {
    if (t !== "last week") return null;
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return startOfDay(d);
  },
  (t) => {
    if (t !== "last month") return null;
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return startOfDay(d);
  },
  (t) => {
    if (t !== "last year") return null;
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return startOfDay(d);
  },
  (t) => {
    const m = t.match(/^(\d+)([dwm])$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const d = new Date();
    if (unit === "d") d.setDate(d.getDate() - n);
    else if (unit === "w") d.setDate(d.getDate() - n * 7);
    else d.setMonth(d.getMonth() - n);
    return startOfDay(d);
  },
  (t) => {
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return startOfDay(new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  },
  (t) => {
    const m = t.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
    if (!m) return null;
    const name = m[1];
    let idx = MONTH_NAMES.indexOf(name);
    if (idx === -1) idx = MONTH_ABBR.indexOf(name);
    if (idx === -1) return null;
    if (m[2]) return startOfDay(new Date(parseInt(m[2], 10), idx, 1));
    const now = new Date();
    const year = idx > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    return startOfDay(new Date(year, idx, 1));
  },
];

/**
 * For IMAP SINCE/BEFORE, only the date portion matters — result is normalized to midnight local time.
 *
 * @param {string} input
 * @returns {Date}
 * @throws {Error} on unparseable input
 */
export function parseDate(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) throw new Error(`Cannot parse empty date string.`);
  for (const match of MATCHERS) {
    const result = match(trimmed);
    if (result !== null) return result;
  }
  throw new Error(
    `Cannot parse date: "${input}". Try formats like: 2026-01-15, 3d, 2w, 1m, jan, january 2026, today, yesterday, last month`,
  );
}

/**
 * Returns a Date set `months` months before now, normalized to midnight local time.
 * @param {number} months
 * @returns {Date}
 */
export function monthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return startOfDay(d);
}

/**
 * @param {Date} d
 * @returns {Date}
 */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
