/**
 * SMTP Gateway — thin wrapper around nodemailer.
 * All SMTP I/O is isolated here so tests can inject a mock instead.
 * Contains no logic to test.
 */
import { createTransport } from "nodemailer";

export class SmtpGateway {
  /**
   * Send an email via SMTP.
   * @param {object} account - { user, pass, smtp: { host, port, secure } }
   * @param {object} message - { from, to, cc, subject, text, inReplyTo, references }
   * @returns {Promise<{ messageId: string, accepted: string[] }>}
   */
  async send(account, message) {
    const transport = createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure ?? false,
      auth: {
        user: account.user,
        pass: account.pass,
      },
    });

    try {
      const info = await transport.sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        text: message.text,
        inReplyTo: message.inReplyTo,
        references: message.references,
      });
      return { messageId: info.messageId, accepted: info.accepted || [] };
    } finally {
      transport.close();
    }
  }
}
