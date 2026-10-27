import { Injectable } from '@nestjs/common';
import {
  cert,
  deleteApp,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { PinoLogger } from 'nestjs-pino';
import { normalizePem } from '../../../common/secrets/provider-registry';
import { SecretsService } from '../../../common/secrets/secrets.service';

/** The request header the app sends (security research #5, A4 / B1):
 * the Firebase App Check token of the device (`firebase_app_check`,
 * `FirebaseAppCheck.instance.getToken()`). docs/runbooks/APP_CHECK.md. */
export const APP_CHECK_HEADER = 'x-firebase-appcheck';

/** What the server concluded about one request's token. */
export type AppCheckVerdict =
  /** A current token signed by Firebase for our project. */
  | 'valid'
  /** A token was sent but it is expired, forged or for another project. */
  | 'invalid'
  /** No token header at all (an old app build, a browser, curl). */
  | 'missing'
  /** No Firebase project configured yet (the FCM keys are empty). */
  | 'unconfigured';

export interface AppCheckResult {
  verdict: AppCheckVerdict;
  /** The Firebase app id of the sender (iOS / Android / web app). */
  appId?: string;
  reason?: string;
}

/**
 * Security research #5 (2026-10-22), A4: tells a request from OUR app
 * (iOS App Attest / Android Play Integrity / web reCAPTCHA Enterprise,
 * exchanged by Firebase for a short-lived App Check token) from a script
 * with the same public API keys — the door SMS pumping comes through.
 *
 * Verification is the official Admin SDK (`firebase-admin/app-check`,
 * `verifyToken`): signature against Firebase's public keys, issuer,
 * audience = our project, expiry. Only the project id is needed for that;
 * the FCM service account (Админка → Интеграции → Firebase Cloud
 * Messaging) already names it, so there is nothing new to configure.
 * The verdict goes back to AppCheckGuard, which decides by
 * `security.app_check.mode` (off / monitor / enforce).
 */
@Injectable()
export class AppCheckService {
  private app?: { fingerprint: string; app: App };

  constructor(
    private readonly secrets: SecretsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AppCheckService.name);
  }

  /**
   * `consume: true` is Firebase's replay protection (Admin SDK 14,
   * `verifyToken(token, { consume: true })`, one more call to the App Check
   * backend): the token is marked used and a second presentation comes back
   * `alreadyConsumed`, which is reported as `invalid`. Only limited-use
   * tokens (client `getLimitedUseToken()`) are meant for it.
   */
  async verify(
    token: string | undefined,
    opts: { consume?: boolean } = {},
  ): Promise<AppCheckResult> {
    const app = await this.current();
    if (!app) return { verdict: 'unconfigured' };
    if (!token) return { verdict: 'missing' };
    try {
      const res = await getAppCheck(app).verifyToken(
        token,
        opts.consume ? { consume: true } : undefined,
      );
      if (res.alreadyConsumed === true) {
        return {
          verdict: 'invalid',
          appId: res.appId,
          reason: 'already-consumed',
        };
      }
      return { verdict: 'valid', appId: res.appId };
    } catch (error: unknown) {
      const e = error as { code?: unknown; message?: unknown };
      return {
        verdict: 'invalid',
        reason:
          typeof e?.code === 'string'
            ? e.code
            : typeof e?.message === 'string'
              ? e.message.slice(0, 120)
              : 'unknown',
      };
    }
  }

  /** The Firebase app for the current FCM keys (rebuilt only when they
   * change), or null while no project id is configured. */
  private async current(): Promise<App | null> {
    const c = await this.secrets.get('fcm');
    const f = c?.fields ?? {};
    if (!c || !f.projectId) return null;
    if (this.app?.fingerprint === c.fingerprint) return this.app.app;
    if (this.app) await deleteApp(this.app.app).catch(() => undefined);
    const name = `app-check-${c.fingerprint.slice(0, 12)}`;
    // The SDK keeps one registry per process (several Nest apps in one
    // test worker share it).
    const existing = getApps().find((a) => a.name === name);
    const app =
      existing ??
      initializeApp(
        f.clientEmail && f.privateKey
          ? {
              projectId: f.projectId,
              credential: cert({
                projectId: f.projectId,
                clientEmail: f.clientEmail,
                privateKey: normalizePem(f.privateKey),
              }),
            }
          : { projectId: f.projectId },
        name,
      );
    this.app = { fingerprint: c.fingerprint, app };
    this.logger.info({ projectId: f.projectId }, 'App Check verifier ready');
    return app;
  }
}
