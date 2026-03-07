/**
 * Parse a human-friendly date string into a Date object at midnight local time.
 * For IMAP SINCE/BEFORE, only the date portion matters.
 *
 * @param {string} input
 * @returns {Date}
 * @throws {Error} on unparseable input
 */
export function parseDate(input) {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) {
    throw new Error(`Cannot parse empty date string.`);
  }

  // "today"
  if (trimmed === "today") {
    return startOfDay(new Date());
  }

  // "yesterday"
  if (trimmed === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return startOfDay(d);
  }

  // "last week" / "last month" / "last year"
  if (trimmed === "last week") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return startOfDay(d);
  }
  if (trimmed === "last month") {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return startOfDay(d);
  }
  if (trimmed === "last year") {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return startOfDay(d);
  }

  // Relative: 3d, 2w, 1m, 6m
  const relMatch = trimmed.match(/^(\d+)([dwm])$/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const d = new Date();
    if (unit === "d") d.setDate(d.getDate() - n);
    else if (unit === "w") d.setDate(d.getDate() - n * 7);
    else if (unit === "m") d.setMonth(d.getMonth() - n);
    return startOfDay(d);
  }

  // ISO date: 2026-01-15 or 2026-01-15T14:00
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
    return startOfDay(d);
  }

  // Month name (with optional year): "january", "jan", "jan 2026", "january 2026"
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const monthAbbr = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  const monthYearMatch = trimmed.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
  if (monthYearMatch) {
    const name = monthYearMatch[1];
    const yearStr = monthYearMatch[2];

    let monthIndex = monthNames.indexOf(name);
    if (monthIndex === -1) monthIndex = monthAbbr.indexOf(name);

    if (monthIndex !== -1) {
      if (yearStr) {
        return startOfDay(new Date(parseInt(yearStr, 10), monthIndex, 1));
      }
      // No year — use current year, or previous year if the month hasn't happened yet
      const now = new Date();
      let year = now.getFullYear();
      if (monthIndex > now.getMonth()) {
        year--;
      }
      return startOfDay(new Date(year, monthIndex, 1));
    }
  }

  throw new Error(`Cannot parse date: "${input}". Try formats like: 2026-01-15, 3d, 2w, 1m, jan, january 2026, today, yesterday, last month`);
}

/**
 * @param {Date} d
 * @returns {Date}
 */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
