/**
 * Client for hexatech-platform's `POST /api/messaging/whatsapp/send`: sends a
 * pre-approved WhatsApp template message through the shared Hexatech
 * WhatsApp Business account.
 *
 * **Server-only.** This module has no Node-only imports (just `fetch`), but
 * it carries the shared `MESSAGING_API_KEY`, so never construct a client in
 * browser code. Call it from a product's backend.
 *
 * Same safe-fail semantics as `./email`: `sendTemplate` never throws. It
 * resolves to `{ ok: false, error, retryable }` instead, so a caller can
 * decide whether a failed notification should block anything.
 */

export interface CreateWhatsAppClientOptions {
  /** hexatech-platform origin, e.g. `https://platform.hexatech.dev` (no trailing `/api`). */
  baseUrl: string;
  /** The platform's shared `MESSAGING_API_KEY`. */
  apiKey: string;
  /** Calling product (`"sportik"`, `"jalkhata"`, …), used in platform logs only. */
  app: string;
  /** Per-request timeout. Defaults to 15s (the platform's own Meta call times out at 10s). */
  timeoutMs?: number;
}

export interface SendWhatsAppTemplateOptions {
  /** Recipient phone in E.164, with or without a leading `+`. */
  to: string;
  /** Approved Meta template name (lowercase letters, digits, underscores). */
  templateName: string;
  /** Language the template was approved in. The platform defaults to `"en_US"`. */
  languageCode?: string;
  /** The template body's `{{1}}…{{n}}` text variables, in order. */
  bodyParams?: string[];
  /**
   * Raw Meta `template.components` entries (header media, URL/quick-reply
   * buttons, …), passed through to Meta untouched and appended after the
   * `bodyParams` body. Don't also include a `body` component when passing
   * `bodyParams`.
   */
  components?: Array<Record<string, unknown>>;
}

export type SendWhatsAppTemplateResult =
  | { ok: true; messageId: string | null }
  | {
      ok: false;
      error: string;
      /** HTTP status from the platform, or `null` for a network failure or timeout. */
      status: number | null;
      /** True for platform 503s (Meta rate limit or outage) and network failures, where a later retry may succeed. */
      retryable: boolean;
    };

const DEFAULT_TIMEOUT_MS = 15_000;

export function createWhatsAppClient(options: CreateWhatsAppClientOptions) {
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/api/messaging/whatsapp/send`;

  async function sendTemplate(
    message: SendWhatsAppTemplateOptions,
  ): Promise<SendWhatsAppTemplateResult> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ app: options.app, ...message }),
        signal: controller.signal,
      });
    } catch (err) {
      const error = `WhatsApp send request failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[whatsapp]", error);
      return { ok: false, error, status: null, retryable: true };
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json().catch(() => undefined)) as
      | { data?: { messageId?: string | null }; message?: string }
      | undefined;

    if (!response.ok) {
      const error = body?.message ?? `WhatsApp send failed (HTTP ${response.status})`;
      console.error("[whatsapp] failed to send", { status: response.status, error });
      return {
        ok: false,
        error,
        status: response.status,
        retryable: response.status === 503,
      };
    }

    return { ok: true, messageId: body?.data?.messageId ?? null };
  }

  return { sendTemplate };
}
