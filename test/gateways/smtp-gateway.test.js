import { afterEach, describe, expect, it, mock } from "bun:test";

// ── helpers ───────────────────────────────────────────────────────────────────

/** @param {{ sendMailFn?: Function }} [opts] */
function makeSmtp({ sendMailFn } = {}) {
  const transportConfig = { captured: null };
  const closedTransport = { closed: false };
  const resolvedSendMail = sendMailFn ?? (async () => ({ messageId: "test-id", accepted: ["to@test.com"] }));

  mock.module("nodemailer", () => ({
    createTransport: (config) => {
      transportConfig.captured = config;
      closedTransport.closed = false;
      return {
        sendMail: resolvedSendMail,
        close: () => {
          closedTransport.closed = true;
        },
      };
    },
  }));

  const { SmtpGateway } = require("../../src/gateways/smtp-gateway.js");
  return { gateway: new SmtpGateway(), transportConfig, closedTransport };
}

function baseAccount(smtpOverrides = {}) {
  return {
    user: "sender@test.com",
    pass: "password",
    smtp: { host: "smtp.test.com", port: 587, ...smtpOverrides },
  };
}

const baseMessage = {
  from: "f@test.com",
  to: "t@test.com",
  cc: null,
  subject: "Test",
  text: "Hello",
  inReplyTo: null,
  references: null,
};

afterEach(() => {
  mock.restore();
});

// ── send ──────────────────────────────────────────────────────────────────────

describe("SmtpGateway send", () => {
  it("defaults secure to false when account.smtp.secure is undefined", async () => {
    const { gateway, transportConfig } = makeSmtp();

    await gateway.send(baseAccount(), baseMessage);

    expect(/** @type {any} */ (transportConfig.captured).secure).toBe(false);
  });

  it("normalizes undefined accepted to empty array", async () => {
    const { gateway } = makeSmtp({
      sendMailFn: async () => ({ messageId: "id", accepted: undefined }),
    });

    const result = await gateway.send(baseAccount(), baseMessage);

    expect(result.accepted).toEqual([]);
  });

  it("throws when sendMail throws", async () => {
    const { gateway } = makeSmtp({
      sendMailFn: async () => {
        throw new Error("SMTP failure");
      },
    });

    await expect(gateway.send(baseAccount(), baseMessage)).rejects.toThrow("SMTP failure");
  });

  it("closes transport even when sendMail throws", async () => {
    const { gateway, closedTransport } = makeSmtp({
      sendMailFn: async () => {
        throw new Error("SMTP failure");
      },
    });

    await gateway.send(baseAccount(), baseMessage).catch(() => {});

    expect(closedTransport.closed).toBe(true);
  });
});
