export interface EmailProvider {
  send(toEmail: string, code: string): Promise<void>;
}
