/** A fully rendered message — templates live in
 * modules/auth/notifications/email-templates.ts, providers only deliver. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<void>;
}
