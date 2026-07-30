import { Resend } from "resend";

/** Derived from the SDK's own overloads so this always matches whatever
 * version of `resend` the consumer has installed, instead of hand-rolling a
 * shape that can drift out of sync with it. */
export type SendEmailOptions = Parameters<Resend["emails"]["send"]>[0];

export type SendEmailResult = { ok: true } | { ok: false; error: unknown };

export interface CreateEmailClientOptions {
  apiKey: string;
}

/**
 * Thin Resend wrapper with safe-fail semantics: `send` never throws, so a
 * form handler can always show the visitor a friendly message instead of a
 * 500, whether Resend rejected the request or the network call itself
 * failed. Validation/templating/recipient-routing stays app-specific — this
 * is just "make the API call and report what happened."
 */
export function createEmailClient(options: CreateEmailClientOptions) {
  const resend = new Resend(options.apiKey);

  async function send(email: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const { error } = await resend.emails.send(email);
      if (error) {
        console.error("[email] failed to send", error);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (error) {
      console.error("[email] failed to send", error);
      return { ok: false, error };
    }
  }

  return { send };
}
