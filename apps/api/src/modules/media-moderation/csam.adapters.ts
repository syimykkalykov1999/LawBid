import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  buildFileDetailsXml,
  buildReportXml,
  NcmecClient,
  ncmecCredentials,
} from '../../common/secrets/ncmec-cybertipline';
import { SecretsService } from '../../common/secrets/secrets.service';

/**
 * Owner 2026-10-22 (audit #4 §5, 18 U.S.C. §2258A): known-CSAM detection
 * and the report to NCMEC. Both are adapters behind interfaces so the
 * vetted services plug in without touching the pipeline; the owner's
 * steps to obtain the keys are in docs/SECURITY_TODO.md.
 */

export interface CsamMatchResult {
  /** not_configured: no keys — the image was NOT hash-checked. */
  status: 'not_configured' | 'no_match' | 'match';
  /** The provider's tracking id of the match (kept for the report). */
  trackingId?: string;
}

/** Hash matching against known child-abuse imagery. */
export interface CsamHashMatcher {
  readonly name: string;
  match(jpeg: Buffer): Promise<CsamMatchResult>;
}

export const CSAM_HASH_MATCHER = Symbol('CSAM_HASH_MATCHER');

const DEFAULT_PHOTODNA_ENDPOINT =
  'https://api.microsoftmoderator.com/photodna/v1.0/Match';
const PHOTODNA_TIMEOUT_MS = 10_000;

/**
 * Microsoft PhotoDNA Cloud Service `Match` (inline base64 image →
 * `IsMatch`). Written against the public API reference; it has never run
 * against the real service because the keys are granted only after
 * Microsoft vets the company — until then every check is
 * `not_configured` and the pipeline relies on Rekognition plus manual
 * review. Treat the first live run as a test (docs/SECURITY_TODO.md).
 */
@Injectable()
export class PhotoDnaMatcher implements CsamHashMatcher {
  readonly name = 'photodna';

  constructor(private readonly secrets: SecretsService) {}

  async match(jpeg: Buffer): Promise<CsamMatchResult> {
    const c = await this.secrets.get('photodna');
    const key = c?.fields.subscriptionKey;
    if (!key) return { status: 'not_configured' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PHOTODNA_TIMEOUT_MS);
    try {
      const res = await fetch(c.fields.endpoint || DEFAULT_PHOTODNA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': key,
        },
        body: JSON.stringify({
          DataRepresentation: 'inline',
          Value: jpeg.toString('base64'),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`PhotoDNA answered HTTP ${res.status}`);
      const body = (await res.json()) as {
        IsMatch?: boolean;
        TrackingId?: string;
      };
      return body.IsMatch
        ? { status: 'match', trackingId: body.TrackingId }
        : { status: 'no_match' };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** One file attached to the report (the preserved evidence). */
export interface CsamEvidence {
  bytes: Buffer;
  fileName: string;
  uploadedAt: Date | null;
  sha256: string | null;
}

export interface CsamReportInput {
  reportId: string;
  checkId: string;
  ownerUserId: string;
  /** Where the content was (purpose + ids), never the image itself. */
  context: Record<string, unknown>;
  /** When the content reached us (the incident time; default now). */
  incidentAt?: Date;
  /** The uploader's @username, when there is one. */
  screenName?: string | null;
  /** The files to attach (none for a video: its ids go in the text). */
  evidence?: CsamEvidence[];
}

export interface CsamReportResult {
  /** manual_required: no NCMEC account — the owner files it by hand. */
  status: 'submitted' | 'manual_required';
  externalReportId?: string;
}

/** Files a CyberTipline report. */
export interface CsamReporter {
  readonly name: string;
  submit(input: CsamReportInput): Promise<CsamReportResult>;
}

export const CSAM_REPORTER = Symbol('CSAM_REPORTER');

/**
 * NCMEC CyberTipline reporting API (common/secrets/ncmec-cybertipline.ts:
 * submit → upload each file → fileinfo → finish). The ESP account is the
 * admin card «NCMEC CyberTipline» (Ключи и сервисы, «Проверить» = GET
 * /status); environment `test` until the owner switches it to
 * `production`. Without the card every report is `manual_required`: it
 * waits in Модерация → Медиа and is filed by hand on report.cybertip.org
 * (docs/SECURITY_TODO.md). A failure after the report was opened retracts
 * it (no half report at NCMEC) and throws, so the report shows `failed`
 * with the reason and the admin can send it again.
 */
@Injectable()
export class NcmecReporter implements CsamReporter {
  readonly name = 'ncmec';

  /** Tests point this at a fake CyberTipline. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly secrets: SecretsService,
    @Optional() private readonly logger?: PinoLogger,
  ) {
    this.logger?.setContext(NcmecReporter.name);
  }

  async submit(input: CsamReportInput): Promise<CsamReportResult> {
    const fields = (await this.secrets.get('ncmec'))?.fields ?? {};
    const creds = ncmecCredentials(fields);
    if (!creds) return { status: 'manual_required' };
    if (!fields.reporterEmail) {
      throw new Error(
        'NCMEC card has no reporter e-mail (Ключи и сервисы → NCMEC CyberTipline); file this report by hand',
      );
    }
    const client = new NcmecClient(creds, this.fetchImpl);
    const ctx = input.context;
    const xml = buildReportXml({
      incidentAt: input.incidentAt ?? new Date(),
      reporter: {
        email: fields.reporterEmail,
        firstName: fields.reporterFirstName,
        lastName: fields.reporterLastName,
      },
      reportedUser: {
        espIdentifier: input.ownerUserId,
        screenName: input.screenName ?? null,
      },
      additionalInfo: [
        `LawBid report ${input.reportId}, moderation check ${input.checkId}`,
        typeof ctx.purpose === 'string' ? `content type: ${ctx.purpose}` : null,
        typeof ctx.videoAssetId === 'string'
          ? `video asset ${ctx.videoAssetId}`
          : null,
      ]
        .filter(Boolean)
        .join('; '),
    });
    const ncmecId = await client.submit(xml);
    try {
      for (const ev of input.evidence ?? []) {
        const { fileId } = await client.upload(ncmecId, ev.bytes, ev.fileName);
        await client.fileInfo(
          buildFileDetailsXml({
            reportId: ncmecId,
            fileId,
            originalFileName: ev.fileName,
            uploadedAt: ev.uploadedAt,
            sha256: ev.sha256,
          }),
        );
      }
      await client.finish(ncmecId);
    } catch (err) {
      await client
        .retract(ncmecId)
        .catch((e: unknown) =>
          this.logger?.warn(
            { reportId: input.reportId, err: String(e) },
            'NCMEC retract failed (NCMEC drops an unfinished report in 24 h)',
          ),
        );
      throw err;
    }
    this.logger?.info(
      {
        reportId: input.reportId,
        ncmecReportId: ncmecId,
        files: input.evidence?.length ?? 0,
        environment: creds.environment,
      },
      'CSAM report filed with NCMEC',
    );
    return { status: 'submitted', externalReportId: ncmecId };
  }
}

/** The name the module used while the adapter was a stub. */
export const NcmecReporterStub = NcmecReporter;
