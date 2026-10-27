import { createSign, generateKeyPairSync } from 'node:crypto';
import { SesWebhookService } from './ses-webhook.service';
import {
  isTrustedSnsUrl,
  parseSnsMessage,
  stringToSign,
  suppressionsFromSesEvent,
  verifySnsSignature,
  type SnsMessage,
} from './ses-sns';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const TOPIC = 'arn:aws:sns:us-east-1:123456789012:ses-events';
const CERT =
  'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem';

function signed(
  over: Partial<SnsMessage> & { event?: unknown } = {},
): SnsMessage {
  const { event, ...rest } = over;
  const msg: SnsMessage = {
    Type: 'Notification',
    MessageId: 'm-1',
    TopicArn: TOPIC,
    Message: JSON.stringify(
      event ?? {
        eventType: 'Bounce',
        mail: { messageId: 'ses-1' },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [{ emailAddress: 'Gone@Example.com' }],
        },
      },
    ),
    Timestamp: '2026-10-25T10:00:00.000Z',
    SignatureVersion: '2',
    Signature: '',
    SigningCertURL: CERT,
    ...rest,
  };
  const s = createSign('RSA-SHA256');
  s.update(stringToSign(msg), 'utf8');
  msg.Signature = s.sign(privateKey, 'base64');
  return msg;
}

class TestService extends SesWebhookService {
  fetched: string[] = [];
  protected override fetchText(url: string): Promise<string> {
    this.fetched.push(url);
    return Promise.resolve(url === CERT ? pem : 'ok');
  }
}

function build(topics = TOPIC) {
  const add = jest.fn().mockResolvedValue(true);
  const settings = { string: jest.fn().mockResolvedValue(topics) };
  return { svc: new TestService(settings as never, { add } as never), add };
}

describe('SNS verification', () => {
  it('trusts only https sns.<region>.amazonaws.com', () => {
    expect(isTrustedSnsUrl(CERT)).toBe(true);
    expect(isTrustedSnsUrl('http://sns.us-east-1.amazonaws.com/x.pem')).toBe(
      false,
    );
    expect(
      isTrustedSnsUrl('https://sns.us-east-1.amazonaws.com.evil.com/x.pem'),
    ).toBe(false);
    expect(
      isTrustedSnsUrl('https://evil.com/sns.us-east-1.amazonaws.com'),
    ).toBe(false);
    expect(isTrustedSnsUrl('https://user@sns.us-east-1.amazonaws.com/x')).toBe(
      false,
    );
    expect(isTrustedSnsUrl(undefined)).toBe(false);
  });

  it('accepts a good signature and rejects a tampered message', () => {
    const m = signed();
    expect(verifySnsSignature(m, pem)).toBe(true);
    expect(verifySnsSignature({ ...m, Message: '{}' }, pem)).toBe(false);
    expect(verifySnsSignature({ ...m, SignatureVersion: '9' }, pem)).toBe(
      false,
    );
  });

  it('parses only well-formed SNS JSON', () => {
    expect(parseSnsMessage('nope')).toBeNull();
    expect(parseSnsMessage('{"Type":"Notification"}')).toBeNull();
    expect(parseSnsMessage(JSON.stringify(signed()))).not.toBeNull();
  });
});

describe('SES events', () => {
  it('permanent bounces and complaints suppress; soft bounces do not', () => {
    expect(
      suppressionsFromSesEvent({
        notificationType: 'Bounce',
        bounce: {
          bounceType: 'Transient',
          bouncedRecipients: [{ emailAddress: 'a@b.co' }],
        },
      }),
    ).toEqual([]);
    const c = suppressionsFromSesEvent({
      eventType: 'Complaint',
      mail: { messageId: 'x' },
      complaint: {
        complainedRecipients: [{ emailAddress: 'a@b.co' }],
        complaintFeedbackType: 'abuse',
      },
    });
    expect(c).toEqual([
      { kind: 'complaint', email: 'a@b.co', detail: 'abuse', messageId: 'x' },
    ]);
    expect(suppressionsFromSesEvent({ eventType: 'Delivery' })).toEqual([]);
    expect(suppressionsFromSesEvent(null)).toEqual([]);
  });
});

describe('SesWebhookService', () => {
  it('adds a permanent bounce to the suppression list', async () => {
    const { svc, add } = build();
    expect(await svc.receive(JSON.stringify(signed()))).toBe('processed');
    expect(add).toHaveBeenCalledWith('Gone@Example.com', 'bounce', {
      detail: 'Permanent/General',
      messageId: 'ses-1',
    });
  });

  it('adds a complaint', async () => {
    const { svc, add } = build();
    const m = signed({
      event: {
        eventType: 'Complaint',
        complaint: { complainedRecipients: [{ emailAddress: 'x@y.co' }] },
      },
    });
    expect(await svc.receive(JSON.stringify(m))).toBe('processed');
    expect(add).toHaveBeenCalledWith('x@y.co', 'complaint', expect.anything());
  });

  it('is off while no topic is listed', async () => {
    const { svc, add } = build('');
    expect(await svc.receive(JSON.stringify(signed()))).toBe('rejected');
    expect(add).not.toHaveBeenCalled();
  });

  it('rejects a topic that is not on the list', async () => {
    const { svc, add } = build('arn:aws:sns:us-east-1:1:other');
    expect(await svc.receive(JSON.stringify(signed()))).toBe('rejected');
    expect(add).not.toHaveBeenCalled();
  });

  it('rejects a forged signature and an untrusted certificate host', async () => {
    const { svc, add } = build();
    const forged = {
      ...signed(),
      Message: JSON.stringify({ eventType: 'Complaint' }),
    };
    expect(await svc.receive(JSON.stringify(forged))).toBe('rejected');
    const evil = signed({
      SigningCertURL: 'https://evil.example.com/cert.pem',
    });
    expect(await svc.receive(JSON.stringify(evil))).toBe('rejected');
    expect(svc.fetched).not.toContain('https://evil.example.com/cert.pem');
    expect(add).not.toHaveBeenCalled();
  });

  it('confirms a subscription only at an Amazon URL', async () => {
    const { svc } = build();
    const url =
      'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=t';
    const ok = signed({
      Type: 'SubscriptionConfirmation',
      Token: 't',
      SubscribeURL: url,
      Message: 'confirm',
    });
    expect(await svc.receive(JSON.stringify(ok))).toBe('confirmed');
    expect(svc.fetched).toContain(url);
    const bad = signed({
      Type: 'SubscriptionConfirmation',
      Token: 't',
      SubscribeURL: 'https://evil.example.com/confirm',
      Message: 'confirm',
    });
    expect(await svc.receive(JSON.stringify(bad))).toBe('rejected');
  });

  it('ignores an event with nothing to suppress', async () => {
    const { svc, add } = build();
    const m = signed({ event: { eventType: 'Delivery' } });
    expect(await svc.receive(JSON.stringify(m))).toBe('ignored');
    expect(add).not.toHaveBeenCalled();
  });
});
