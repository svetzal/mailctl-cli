/**
 * Pure formatting functions for the thread command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * Format thread results as human-readable text.
 *
 * @param {Array} messages
 * @param {object} [opts]
 * @param {boolean} [opts.full=false] - show full bodies
 * @param {boolean} [opts.fallback=false] - indicate subject-match fallback
 * @returns {string}
 */
export function formatThreadText(messages, opts = {}) {
  if (messages.length === 0) return "No thread messages found.";

  const lines = [];
  const threadSubject = messages[messages.length - 1].subject || messages[0].subject || "(no subject)";
  const note = opts.fallback ? " (thread reconstructed by subject match)" : "";
  lines.push(`Thread: ${threadSubject} (${messages.length} message${messages.length === 1 ? "" : "s"})${note}`);
  lines.push("");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateStr = msg.date
      ? new Date(msg.date).toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "unknown";
    const sender = msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from;

    lines.push(`  ${i + 1}. ${dateStr}  ${sender}`);
    lines.push(`     ${msg.subject}`);

    if (opts.full && msg.body) {
      lines.push(`     ${"─".repeat(60)}`);
      lines.push(
        msg.body
          .split("\n")
          .map((l) => `     ${l}`)
          .join("\n"),
      );
      lines.push("");
    } else {
      lines.push(`     ${msg.snippet}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build a JSON-ready object for a thread result.
 *
 * @param {string} acctName - account name
 * @param {number} threadSize - number of messages in the thread
 * @param {boolean} fallback - true if thread was reconstructed by subject match
 * @param {object[]} messages - thread messages
 * @returns {{ account: string, threadSize: number, fallback: boolean, messages: object[] }}
 */
export function buildThreadJson(acctName, threadSize, fallback, messages) {
  return { account: acctName, threadSize, fallback, messages };
}
