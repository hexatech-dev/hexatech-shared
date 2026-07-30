import { createEmailClient } from "./email.js";

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
  /** Honeypot — real users never fill this in; bots that autofill every
   * field do. A non-empty value here means `sendContactMessage` skips the
   * send and reports success, so the bot gets no signal it was caught. */
  company?: string;
}

export interface ContactMessageResult {
  ok: boolean;
  /** True when the send was skipped because `company` (the honeypot) was
   * filled in — the caller should still show the visitor a success message. */
  skipped?: boolean;
}

export interface SendContactMessageOptions {
  apiKey: string;
  from: string;
  to: string;
  subject?: string;
}

/**
 * Shared "contact us" form handler: honeypot check + Resend send with the
 * conventional Name/Email/message text body. Validation of the raw input
 * stays app-specific (each product already has its own Zod setup) — this
 * only covers the part that was identical across every product.
 */
export async function sendContactMessage(
  contact: ContactMessage,
  options: SendContactMessageOptions,
): Promise<ContactMessageResult> {
  if (contact.company) {
    return { ok: true, skipped: true };
  }

  const emailClient = createEmailClient({ apiKey: options.apiKey });

  const result = await emailClient.send({
    from: options.from,
    to: options.to,
    replyTo: contact.email,
    subject: options.subject ?? `New message from ${contact.name}`,
    text: [
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      "",
      contact.message,
    ].join("\n"),
  });

  return { ok: result.ok };
}
