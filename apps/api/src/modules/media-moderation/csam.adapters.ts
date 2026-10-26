import { Injectable } from '@nestjs/common';
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

export interface CsamReportInput {
  reportId: string;
  checkId: string;
  ownerUserId: string;
  /** Where the content was (purpose + ids), never the image itself. */
  context: Record<string, unknown>;
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
 * NCMEC CyberTipline reporting API adapter — a documented stub. The real
 * API (XML over HTTPS, test and production endpoints, an ESP account
 * issued by NCMEC) needs the account first; until it exists every report
 * is `manual_required`: the admin sees it in Модерация → Медиа and the
 * owner files it on report.cybertip.org within the legal deadline
 * (docs/SECURITY_TODO.md). With the account configured the call is still
 * not wired: it throws, so nobody believes a report went out when it did
 * not.
 */
@Injectable()
export class NcmecReporterStub implements CsamReporter {
  readonly name = 'ncmec';

  constructor(private readonly secrets: SecretsService) {}

  async submit(input: CsamReportInput): Promise<CsamReportResult> {
    if (!(await this.secrets.has('ncmec'))) {
      return { status: 'manual_required' };
    }
    throw new Error(
      `NCMEC API submission is not implemented yet (report ${input.reportId}); file it by hand — docs/SECURITY_TODO.md`,
    );
  }
}
