import { createHmac } from 'node:crypto';
import type { SecretsService } from '../../../common/secrets/secrets.service';
import {
  hostedFlowUrl,
  PersonaClient,
  personaSignatureValid,
} from './persona.client';

const SECRET = 'test-persona-webhook-secret';
const body = Buffer.from('{"data":{"id":"evt_1"}}');
const sign = (t: string, secret = SECRET) =>
  createHmac('sha256', secret).update(`${t}.${body.toString()}`).digest('hex');

describe('personaSignatureValid (docs.withpersona.com webhooks best practices)', () => {
  it('accepts t=…,v1=… over the raw body', () => {
    expect(personaSignatureValid(body, `t=123,v1=${sign('123')}`, SECRET)).toBe(
      true,
    );
  });

  it('accepts any matching set while a secret rotates', () => {
    const header = `t=9,v1=${sign('9', 'test-old-secret-xxxxxxxx')} t=9,v1=${sign('9')}`;
    expect(personaSignatureValid(body, header, SECRET)).toBe(true);
  });

  it('rejects a wrong secret, a changed body, a changed timestamp or no header', () => {
    expect(
      personaSignatureValid(
        body,
        `t=1,v1=${sign('1', 'test-other-secret-xx')}`,
        SECRET,
      ),
    ).toBe(false);
    expect(
      personaSignatureValid(Buffer.from('{}'), `t=1,v1=${sign('1')}`, SECRET),
    ).toBe(false);
    expect(personaSignatureValid(body, `t=2,v1=${sign('1')}`, SECRET)).toBe(
      false,
    );
    expect(personaSignatureValid(body, undefined, SECRET)).toBe(false);
    expect(personaSignatureValid(body, 'garbage', SECRET)).toBe(false);
  });
});

describe('PersonaClient.config', () => {
  const client = (fields: Record<string, string> | null) =>
    new PersonaClient({
      get: jest.fn().mockResolvedValue(fields ? { fields } : null),
    } as unknown as SecretsService);

  it('is null without a key set (manual review, as before)', async () => {
    await expect(client(null).config()).resolves.toBeNull();
  });

  it('is null while any of key / template / webhook secret is missing', async () => {
    await expect(
      client({
        apiKey: 'persona_sandbox_test-token',
        templateId: 'itmpl_a',
      }).config(),
    ).resolves.toBeNull();
  });

  it('returns all three when saved', async () => {
    const fields = {
      apiKey: 'persona_sandbox_test-token',
      templateId: 'itmpl_a',
      webhookSecret: SECRET,
    };
    await expect(client(fields).config()).resolves.toEqual(fields);
  });
});

describe('PersonaClient.createInquiry', () => {
  afterEach(() => jest.restoreAllMocks());

  it('POSTs the template + reference id and builds the hosted-flow link', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'inq_ABC123' } }), {
        status: 201,
      }),
    );
    const c = new PersonaClient({} as SecretsService);
    const link = await c.createInquiry(
      {
        apiKey: 'persona_sandbox_test-token',
        templateId: 'itmpl_T1',
        webhookSecret: SECRET,
      },
      'req-1',
    );
    expect(link).toEqual({
      inquiryId: 'inq_ABC123',
      url: hostedFlowUrl('inq_ABC123'),
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.withpersona.com/api/v1/inquiries');
    expect(JSON.parse(init?.body as string)).toEqual({
      data: {
        attributes: {
          'inquiry-template-id': 'itmpl_T1',
          'reference-id': 'req-1',
        },
      },
    });
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer persona_sandbox_test-token',
    );
  });

  it('throws on an error answer (the caller falls back to manual)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    const c = new PersonaClient({} as SecretsService);
    await expect(
      c.createInquiry(
        {
          apiKey: 'persona_sandbox_test-token',
          templateId: 'itmpl_T1',
          webhookSecret: SECRET,
        },
        'r',
      ),
    ).rejects.toThrow('HTTP 401');
  });
});

it('hosted flow link (docs.withpersona.com/docs/hosted-flow)', () => {
  expect(hostedFlowUrl('inq_1', 'tok')).toBe(
    'https://inquiry.withpersona.com/verify?inquiry-id=inq_1&session-token=tok',
  );
});
