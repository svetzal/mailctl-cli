/**
 * Pure receipt filtering functions — no I/O, no side effects.
 */

/**
 * Apply vendor and subject-exclusion filters to receipt search results.
 *
 * @param {Array} results - array of receipt search result objects
 * @param {object} opts
 * @param {string | null} [opts.vendor] - vendor substring filter, or omitted for none
 * @param {Function} matchesVendorFn - (vendor, fromAddress, fromName) => boolean
 * @param {Array<RegExp>} subjectExclusions - subject patterns to exclude
 * @returns {{ filtered: Array, vendorExcluded: number, subjectExcluded: number }}
 */
export function applyReceiptFilters(results, opts, matchesVendorFn, subjectExclusions) {
  let filtered = results;
  let vendorExcluded = 0;
  let subjectExcluded = 0;

  if (opts.vendor) {
    const before = filtered.length;
    filtered = filtered.filter((msg) => matchesVendorFn(opts.vendor, msg.fromAddress, msg.fromName));
    vendorExcluded = before - filtered.length;
  }

  const beforeExclusion = filtered.length;
  filtered = filtered.filter((msg) => !subjectExclusions.some((re) => re.test(msg.subject)));
  subjectExcluded = beforeExclusion - filtered.length;

  return { filtered, vendorExcluded, subjectExcluded };
}
