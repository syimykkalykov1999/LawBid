import { createHash } from 'node:crypto';
import {
  buildFileDetailsXml,
  buildReportXml,
  NcmecClient,
  ncmecStatusTest,
  parseNcmecResponse,
  xmlEscape,
} from '../../common/secrets/ncmec-cybertipline';
import { NcmecReporter } from './csam.adapters';

/**
 * Owner 2026-11-08: the CyberTipline adapter works for real once the ESP
 * account is on the admin card. A fake CyberTipline that behaves like the
 * documented API (https://report.cybertip.org/ispws/documentation):
 * /submit → reportId, /upload → fileId + MD5, /fileinfo, /finish,
 * /retract, Basic auth, responseCode 0 = success.
 */
class FakeCyberTipline {
  readonly calls: { path: string; body: string | FormData | undefined }[] = [];
  readonly files = new Map<string, Buffer>();
  finished = false;
  retracted = false;
  failOn: string | null = null;
  constructor(
    private readonly user = 'esp',
    private readonly pass = 'pw',
  ) {}

  private ok(inner: string) {
    return `<?xml version="1.0"?><reportResponse><responseCode>0</responseCode><responseDescription>Success</responseDescription>${inner}</reportResponse>`;
  }

  fetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = url.replace(/^https:\/\/[^/]+\/ispws/, '');
    this.calls.push({ path, body: init?.body as string | FormData });
    const auth = (init?.headers as Record<string, string>).Authorization;
    const want =
      'Basic ' + Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    if (auth !== want) return new Response('', { status: 401 });
    if (this.failOn === path) {
      return new Response(
        '<reportResponse><responseCode>4100</responseCode><responseDescription>Validation failed</responseDescription></reportResponse>',
        { status: 200 },
      );
    }
    switch (path) {
      case '/status':
        return new Response(
          this.ok(
            '<responseDescription>Remote User : esp, Remote Ip : 1.2.3.4</responseDescription>',
          ),
        );
      case '/submit':
        return new Response(this.ok('<reportId>4564654</reportId>'));
      case '/upload': {
        const form = init!.body as FormData;
        const file = form.get('file') as Blob;
        const bytes = Buffer.from(await file.arrayBuffer());
        const id = `f${this.files.size + 1}`;
        this.files.set(id, bytes);
        const md5 = createHash('md5').update(bytes).digest('hex');
        return new Response(
          this.ok(
            `<reportId>${form.get('id') as string}</reportId><fileId>${id}</fileId><hash>${md5}</hash>`,
          ),
        );
      }
      case '/fileinfo':
        return new Response(this.ok('<reportId>4564654</reportId>'));
      case '/finish':
        this.finished = true;
        return new Response(
          `<reportDoneResponse><responseCode>0</responseCode><reportId>4564654</reportId><files>${[
            ...this.files.keys(),
          ]
            .map((f) => `<fileId>${f}</fileId>`)
            .join('')}</files></reportDoneResponse>`,
        );
      case '/retract':
        this.retracted = true;
        return new Response(this.ok('<reportId>4564654</reportId>'));
      default:
        return new Response('', { status: 404 });
    }
  };
}

const CARD = {
  username: 'esp',
  password: 'pw',
  environment: 'test',
  reporterEmail: 'safety@example.test',
  reporterFirstName: 'Trust',
  reporterLastName: 'Safety',
};

function reporter(
  fields: Record<string, string> | null,
  tip: FakeCyberTipline,
) {
  const secrets = {
    get: jest.fn((id: string) =>
      Promise.resolve(id === 'ncmec' && fields ? { fields } : null),
    ),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const r = new NcmecReporter(secrets as never, logger as never);
  r.fetchImpl = tip.fetch;
  return { r, logger };
}

const INPUT = {
  reportId: 'r-1',
  checkId: 'c-1',
  ownerUserId: 'user-1',
  context: { purpose: 'post_photo' },
  incidentAt: new Date('2026-11-08T06:10:00.123Z'),
  evidence: [
    {
      bytes: Buffer.from('jpeg-bytes'),
      fileName: 'evidence-c-1.jpg',
      uploadedAt: new Date('2026-11-08T06:10:00Z'),
      sha256: 'ab'.repeat(32),
    },
  ],
};

describe('NCMEC CyberTipline adapter', () => {
  it('no card: «не подключено» → manual_required, nothing is sent', async () => {
    const tip = new FakeCyberTipline();
    const { r } = reporter(null, tip);
    await expect(r.submit(INPUT)).resolves.toEqual({
      status: 'manual_required',
    });
    expect(tip.calls).toHaveLength(0);
  });

  it('with the card: report → upload → file details → finish, the NCMEC id kept', async () => {
    const tip = new FakeCyberTipline();
    const { r } = reporter(CARD, tip);
    await expect(r.submit(INPUT)).resolves.toEqual({
      status: 'submitted',
      externalReportId: '4564654',
    });
    expect(tip.calls.map((c) => c.path)).toEqual([
      '/submit',
      '/upload',
      '/fileinfo',
      '/finish',
    ]);
    expect(tip.files.get('f1')?.toString()).toBe('jpeg-bytes');
    expect(tip.finished).toBe(true);
    const report = tip.calls[0].body as string;
    expect(report).toContain(
      '<incidentType>Child Pornography (possession, manufacture, and distribution)</incidentType>',
    );
    expect(report).toContain(
      '<incidentDateTime>2026-11-08T06:10:00Z</incidentDateTime>',
    );
    expect(report).toContain('<email>safety@example.test</email>');
    expect(report).toContain('<espIdentifier>user-1</espIdentifier>');
    const details = tip.calls[2].body as string;
    expect(details).toContain('<reportId>4564654</reportId>');
    expect(details).toContain('<fileId>f1</fileId>');
    expect(details).toContain('SHA-256 ' + 'ab'.repeat(32));
  });

  it('the test account by default, production only when the card says so', async () => {
    const urls: string[] = [];
    const tip = new FakeCyberTipline();
    const spy: typeof fetch = (input, init) => {
      urls.push(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      return tip.fetch(input, init);
    };
    const { r } = reporter({ ...CARD, environment: '' }, tip);
    r.fetchImpl = spy;
    await r.submit({ ...INPUT, evidence: [] });
    expect(urls[0]).toBe('https://exttest.cybertip.org/ispws/submit');
    const prod = reporter({ ...CARD, environment: 'production' }, tip).r;
    prod.fetchImpl = spy;
    await prod.submit({ ...INPUT, evidence: [] });
    expect(urls.at(-2)).toBe('https://report.cybertip.org/ispws/submit');
  });

  it('a failure after the report was opened retracts it and throws (the report shows failed)', async () => {
    const tip = new FakeCyberTipline();
    tip.failOn = '/fileinfo';
    const { r } = reporter(CARD, tip);
    await expect(r.submit(INPUT)).rejects.toThrow(
      'NCMEC /fileinfo: 4100 Validation failed',
    );
    expect(tip.retracted).toBe(true);
    expect(tip.finished).toBe(false);
  });

  it('wrong ESP password: a readable error, nothing finished', async () => {
    const tip = new FakeCyberTipline('esp', 'other');
    const { r } = reporter(CARD, tip);
    await expect(r.submit(INPUT)).rejects.toThrow(
      /wrong ESP username or password/,
    );
  });

  it('a card without the reporter e-mail refuses before any call', async () => {
    const tip = new FakeCyberTipline();
    const { r } = reporter({ ...CARD, reporterEmail: '' }, tip);
    await expect(r.submit(INPUT)).rejects.toThrow(/reporter e-mail/);
    expect(tip.calls).toHaveLength(0);
  });

  it('never logs the file bytes or the password', async () => {
    const tip = new FakeCyberTipline();
    const { r, logger } = reporter(CARD, tip);
    await r.submit(INPUT);
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain('jpeg-bytes');
    expect(logged).not.toContain('"pw"');
    expect(logged).toContain('4564654');
  });
});

describe('NCMEC protocol pieces', () => {
  it('«Проверить» on the card: GET /status with the account', async () => {
    const tip = new FakeCyberTipline();
    await expect(ncmecStatusTest(CARD, tip.fetch)).resolves.toBeUndefined();
    expect(tip.calls[0].path).toBe('/status');
    await expect(
      ncmecStatusTest({ ...CARD, password: 'bad' }, tip.fetch),
    ).rejects.toThrow(/rejected/);
    await expect(
      ncmecStatusTest({ ...CARD, reporterEmail: '' }, tip.fetch),
    ).rejects.toThrow(/Reporter e-mail/);
  });

  it('escapes XML and parses both response kinds', () => {
    expect(xmlEscape(`a<b>&"'`)).toBe('a&lt;b&gt;&amp;&quot;&apos;');
    const xml = buildReportXml({
      incidentAt: new Date('2026-01-01T00:00:00Z'),
      reporter: { email: 'x@y.z' },
      reportedUser: { espIdentifier: 'u<1>' },
      additionalInfo: 'a & b',
    });
    expect(xml).toContain('<espIdentifier>u&lt;1&gt;</espIdentifier>');
    expect(xml).toContain('<additionalInfo>a &amp; b</additionalInfo>');
    expect(xml.indexOf('<incidentSummary>')).toBeLessThan(
      xml.indexOf('<reporter>'),
    );
    expect(
      buildFileDetailsXml({ reportId: '1', fileId: 'f' }).startsWith('<?xml'),
    ).toBe(true);
    expect(
      parseNcmecResponse(
        '<reportDoneResponse><responseCode>0</responseCode><reportId>7</reportId><files><fileId>a</fileId><fileId>b</fileId></files></reportDoneResponse>',
      ),
    ).toMatchObject({ responseCode: 0, reportId: '7', files: ['a', 'b'] });
    expect(
      parseNcmecResponse(
        '<reportResponse><responseCode>0</responseCode><reportId>7</reportId><fileId>f9</fileId><hash>m</hash></reportResponse>',
      ),
    ).toMatchObject({ fileId: 'f9', hash: 'm' });
  });

  it('a non-zero responseCode is an error with the code', async () => {
    const client = new NcmecClient(
      { username: 'esp', password: 'pw', environment: 'test' },
      () =>
        Promise.resolve(
          new Response(
            '<reportResponse><responseCode>3100</responseCode><responseDescription>Not authorized to make submissions</responseDescription></reportResponse>',
          ),
        ),
    );
    await expect(client.submit('<report/>')).rejects.toMatchObject({
      responseCode: 3100,
    });
  });
});
