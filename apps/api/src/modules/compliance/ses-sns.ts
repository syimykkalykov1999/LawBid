import { createPublicKey, createVerify } from 'node:crypto';

/**
 * 2026-10-25: Amazon SNS message authenticity (docs.aws.amazon.com/sns/
 * latest/dg/sns-verify-signature-of-message.html) and the SES bounce /
 * complaint event shapes. Pure functions, the certificate fetch is
 * injected so the whole thing is unit-tested.
 */
export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
}

const NOTIFICATION_FIELDS = [
  'Message',
  'MessageId',
  'Subject',
  'Timestamp',
  'TopicArn',
  'Type',
] as const;
const SUBSCRIBE_FIELDS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type',
] as const;

/** https://sns.<region>.amazonaws.com[.cn]/…pem, nothing else. */
export function isTrustedSnsUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return (
      u.protocol === 'https:' &&
      u.port === '' &&
      !u.username &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname)
    );
  } catch {
    return false;
  }
}

export function parseSnsMessage(raw: string): SnsMessage | null {
  try {
    const m = JSON.parse(raw) as Partial<SnsMessage>;
    if (
      typeof m.Type !== 'string' ||
      typeof m.MessageId !== 'string' ||
      typeof m.TopicArn !== 'string' ||
      typeof m.Message !== 'string' ||
      typeof m.Signature !== 'string' ||
      typeof m.SigningCertURL !== 'string'
    )
      return null;
    if (
      m.Type !== 'Notification' &&
      m.Type !== 'SubscriptionConfirmation' &&
      m.Type !== 'UnsubscribeConfirmation'
    )
      return null;
    return m as SnsMessage;
  } catch {
    return null;
  }
}

export function stringToSign(m: SnsMessage): string {
  const fields =
    m.Type === 'Notification' ? NOTIFICATION_FIELDS : SUBSCRIBE_FIELDS;
  let out = '';
  for (const f of fields) {
    const v = (m as unknown as Record<string, string | undefined>)[f];
    if (v === undefined) {
      if (f === 'Subject') continue; // optional
      return '';
    }
    out += `${f}\n${v}\n`;
  }
  return out;
}

/** Verifies the signature with the certificate/public key [certPem]
 * (fetched from `SigningCertURL`). */
export function verifySnsSignature(m: SnsMessage, certPem: string): boolean {
  const data = stringToSign(m);
  if (!data) return false;
  const algo =
    m.SignatureVersion === '1'
      ? 'RSA-SHA1'
      : m.SignatureVersion === '2'
        ? 'RSA-SHA256'
        : null;
  if (!algo) return false;
  try {
    const v = createVerify(algo);
    v.update(data, 'utf8');
    return v.verify(createPublicKey(certPem), m.Signature, 'base64');
  } catch {
    return false;
  }
}

// ---- SES events -----------------------------------------------------------

export interface SesRecipientEvent {
  kind: 'bounce' | 'complaint';
  email: string;
  detail: string;
  messageId?: string;
}

/**
 * Pulls the addresses to suppress out of an SES event (configuration-set
 * event publishing: `eventType`; identity notifications: `notificationType`).
 * Only PERMANENT bounces suppress (a full mailbox or a temporary failure
 * does not make the address invalid); every complaint does. Suppressed-by-
 * SES bounces (`Suppressed`) are permanent too.
 */
export function suppressionsFromSesEvent(event: unknown): SesRecipientEvent[] {
  const e = event as {
    eventType?: string;
    notificationType?: string;
    mail?: { messageId?: string };
    bounce?: {
      bounceType?: string;
      bounceSubType?: string;
      bouncedRecipients?: { emailAddress?: string }[];
    };
    complaint?: {
      complaintFeedbackType?: string;
      complainedRecipients?: { emailAddress?: string }[];
    };
  };
  const type = e?.eventType ?? e?.notificationType;
  const messageId = e?.mail?.messageId;
  const out: SesRecipientEvent[] = [];
  if (type === 'Bounce' && e.bounce?.bounceType === 'Permanent') {
    for (const r of e.bounce.bouncedRecipients ?? []) {
      if (r.emailAddress)
        out.push({
          kind: 'bounce',
          email: r.emailAddress,
          detail: `${e.bounce.bounceType}/${e.bounce.bounceSubType ?? ''}`,
          messageId,
        });
    }
  } else if (type === 'Complaint') {
    for (const r of e.complaint?.complainedRecipients ?? []) {
      if (r.emailAddress)
        out.push({
          kind: 'complaint',
          email: r.emailAddress,
          detail: e.complaint?.complaintFeedbackType ?? 'complaint',
          messageId,
        });
    }
  }
  return out;
}
