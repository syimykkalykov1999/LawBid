/** A fully rendered message — templates live in
 * modules/auth/notifications/email-templates.ts, providers only deliver. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Owner 2026-10-02: which built-in email this is and its variables, so
   * the provider can apply an admin override (`email_templates`) before
   * delivery. subject/text/html above stay the built-in fallback.
   */
  template?: {
    key: string;
    vars: Record<string, string>;
    locale?: string;
  };
  /**
   * Owner 2026-10-05 (legal): extra RFC 5322 headers, e.g.
   * `List-Unsubscribe` / `List-Unsubscribe-Post` on cold emails (RFC 8058
   * one-click unsubscribe, required by Gmail/Yahoo for bulk senders).
   * Providers that cannot set headers ignore them.
   */
  headers?: Record<string, string>;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<void>;
}
