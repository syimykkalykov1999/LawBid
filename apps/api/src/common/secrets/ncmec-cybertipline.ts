/**
 * NCMEC CyberTipline Reporting API (18 U.S.C. §2258A), written against
 * NCMEC's public documentation (https://report.cybertip.org/ispws/documentation,
 * read 2026-11-08):
 *
 *   GET  /status    credentials check («Remote User : …»)
 *   POST /submit    one <report> XML → reportResponse{responseCode, reportId}
 *   POST /upload    multipart id + file → reportResponse{fileId, hash (MD5)}
 *   POST /fileinfo  one <fileDetails> XML → reportResponse
 *   POST /finish    form id → reportDoneResponse{responseCode, reportId, files}
 *   POST /retract   form id (only before /finish)
 *
 * Production https://report.cybertip.org/ispws, test
 * https://exttest.cybertip.org/ispws, HTTPS + Basic auth with the ESP
 * account NCMEC issues. responseCode 0 = success. An unfinished report is
 * deleted by NCMEC 24 h after it was opened (1 h after the last change).
 *
 * Privacy: only what the report needs leaves the server (the platform user
 * id, the file and its upload time); nothing here logs file bytes or
 * credentials. The element order follows the documented schema order.
 */

export const NCMEC_BASE_URL = {
  production: 'https://report.cybertip.org/ispws',
  test: 'https://exttest.cybertip.org/ispws',
} as const;

export type NcmecEnvironment = keyof typeof NCMEC_BASE_URL;

export const NCMEC_INCIDENT_TYPE =
  'Child Pornography (possession, manufacture, and distribution)';

const TIMEOUT_MS = 30_000;

export interface NcmecCredentials {
  username: string;
  password: string;
  environment: NcmecEnvironment;
}

export function ncmecCredentials(
  f: Record<string, string | undefined>,
): NcmecCredentials | null {
  if (!f.username || !f.password) return null;
  return {
    username: f.username,
    password: f.password,
    // Default test: a first run must never file a real report by accident.
    environment: f.environment === 'production' ? 'production' : 'test',
  };
}

export interface NcmecResponse {
  responseCode: number;
  responseDescription: string;
  reportId: string | null;
  fileId: string | null;
  hash: string | null;
  files: string[];
}

export class NcmecError extends Error {
  constructor(
    message: string,
    readonly responseCode: number | null = null,
  ) {
    super(message);
    this.name = 'NcmecError';
  }
}

export function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const el = (name: string, value: string | null | undefined) =>
  value === null || value === undefined || value === ''
    ? ''
    : `<${name}>${xmlEscape(value)}</${name}>`;

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://report.cybertip.org/ispws/xsd">';

export interface NcmecReportInput {
  /** When the content was uploaded (must be in the past, with a zone). */
  incidentAt: Date;
  /** Our reporter (the ESP's contact). email is required by NCMEC. */
  reporter: { email: string; firstName?: string; lastName?: string };
  /** The account that uploaded it. */
  reportedUser: { espIdentifier: string; screenName?: string | null };
  /** The public page where it was, when there is one. */
  url?: string | null;
  /** Where on the platform (purpose, ids) — never the content itself. */
  additionalInfo?: string;
  /** Our name of the service in the report («LawBid»). */
  espService?: string;
}

/** ISO 8601 with a zone and no milliseconds (`2026-11-08T06:10:00Z`). */
export function ncmecDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildReportXml(r: NcmecReportInput): string {
  const internet = r.url
    ? `<internetDetails><webPageIncident>${el('url', r.url)}</webPageIncident></internetDetails>`
    : '';
  const reporter =
    '<reporter><reportingPerson>' +
    el('firstName', r.reporter.firstName) +
    el('lastName', r.reporter.lastName) +
    el('email', r.reporter.email) +
    '</reportingPerson></reporter>';
  const reported =
    '<personOrUserReported>' +
    el('espIdentifier', r.reportedUser.espIdentifier) +
    el('espService', r.espService ?? 'LawBid') +
    el('screenName', r.reportedUser.screenName ?? null) +
    '</personOrUserReported>';
  return (
    HEADER +
    '<incidentSummary>' +
    el('incidentType', NCMEC_INCIDENT_TYPE) +
    el('incidentDateTime', ncmecDateTime(r.incidentAt)) +
    '</incidentSummary>' +
    internet +
    reporter +
    reported +
    el('additionalInfo', r.additionalInfo) +
    '</report>'
  );
}

export interface NcmecFileDetailsInput {
  reportId: string;
  fileId: string;
  originalFileName?: string | null;
  /** When the user uploaded it to us. */
  uploadedAt?: Date | null;
  /** Our SHA-256 of the bytes, so NCMEC can match the copy. */
  sha256?: string | null;
  additionalInfo?: string;
}

export function buildFileDetailsXml(f: NcmecFileDetailsInput): string {
  // The SHA-256 goes into additionalInfo: the attributes of the schema's
  // originalFileHash are not in the public documentation, and a schema
  // error (4100) would stop the whole report.
  const info = [
    f.sha256 ? `SHA-256 ${f.sha256}` : null,
    f.additionalInfo ?? null,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<fileDetails xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://report.cybertip.org/ispws/xsd">' +
    el('reportId', f.reportId) +
    el('fileId', f.fileId) +
    el('originalFileName', f.originalFileName) +
    el(
      'uploadedToEspTimestamp',
      f.uploadedAt ? ncmecDateTime(f.uploadedAt) : null,
    ) +
    el('additionalInfo', info) +
    '</fileDetails>'
  );
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].trim() : null;
};

/** reportResponse / reportDoneResponse → plain fields. */
export function parseNcmecResponse(xml: string): NcmecResponse {
  const code = tag(xml, 'responseCode');
  const filesBlock = tag(xml, 'files') ?? '';
  return {
    responseCode: code === null ? NaN : Number(code),
    responseDescription: tag(xml, 'responseDescription') ?? '',
    reportId: tag(xml, 'reportId'),
    fileId: filesBlock ? null : tag(xml, 'fileId'),
    hash: tag(xml, 'hash'),
    files: [...filesBlock.matchAll(/<fileId>([\s\S]*?)<\/fileId>/g)].map((m) =>
      m[1].trim(),
    ),
  };
}

type Fetch = typeof fetch;

/** One CyberTipline account, test or production. */
export class NcmecClient {
  private readonly base: string;
  private readonly auth: string;

  constructor(
    creds: NcmecCredentials,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.base = NCMEC_BASE_URL[creds.environment];
    this.auth =
      'Basic ' +
      Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  }

  private async call(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string | FormData; xml?: boolean },
  ): Promise<NcmecResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method: init.method,
        headers: {
          Authorization: this.auth,
          ...(init.xml ? { 'Content-Type': 'text/xml; charset=utf-8' } : {}),
        },
        body: init.body,
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new NcmecError(`NCMEC ${path}: no answer in 30 s`);
      }
      throw new NcmecError(
        `NCMEC ${path}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new NcmecError(
        `NCMEC ${path}: rejected (HTTP ${res.status}) — wrong ESP username or password?`,
        2000,
      );
    }
    const r = parseNcmecResponse(text);
    if (!Number.isFinite(r.responseCode)) {
      throw new NcmecError(
        `NCMEC ${path}: unexpected answer (HTTP ${res.status}${res.headers?.get?.('Request-ID') ? `, Request-ID ${res.headers.get('Request-ID')}` : ''})`,
      );
    }
    if (r.responseCode !== 0) {
      throw new NcmecError(
        `NCMEC ${path}: ${r.responseCode} ${r.responseDescription}`.trim(),
        r.responseCode,
      );
    }
    return r;
  }

  status(): Promise<NcmecResponse> {
    return this.call('/status', { method: 'GET' });
  }

  async submit(xml: string): Promise<string> {
    const r = await this.call('/submit', {
      method: 'POST',
      body: xml,
      xml: true,
    });
    if (!r.reportId) throw new NcmecError('NCMEC /submit: no reportId');
    return r.reportId;
  }

  async upload(
    reportId: string,
    bytes: Buffer,
    fileName: string,
  ): Promise<{ fileId: string; md5: string | null }> {
    const form = new FormData();
    form.append('id', reportId);
    form.append('file', new Blob([new Uint8Array(bytes)]), fileName);
    const r = await this.call('/upload', { method: 'POST', body: form });
    if (!r.fileId) throw new NcmecError('NCMEC /upload: no fileId');
    return { fileId: r.fileId, md5: r.hash };
  }

  async fileInfo(xml: string): Promise<void> {
    await this.call('/fileinfo', { method: 'POST', body: xml, xml: true });
  }

  async finish(reportId: string): Promise<string[]> {
    const form = new FormData();
    form.append('id', reportId);
    const r = await this.call('/finish', { method: 'POST', body: form });
    return r.files;
  }

  async retract(reportId: string): Promise<void> {
    const form = new FormData();
    form.append('id', reportId);
    await this.call('/retract', { method: 'POST', body: form });
  }
}

/** «Проверить» on the admin card: GET /status with the saved account. */
export async function ncmecStatusTest(
  f: Record<string, string>,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const creds = ncmecCredentials(f);
  if (!creds) throw new Error('ESP username and password are required');
  if (!f.reporterEmail) {
    throw new Error(
      'Reporter e-mail is required (NCMEC needs a contact on every report)',
    );
  }
  await new NcmecClient(creds, fetchImpl).status();
}
