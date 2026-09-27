/**
 * Credential-driven provider selection (owner requirement 2026-09-27,
 * docs/KEYS_SETUP.md): "когда появятся реальные ключи, я вставлю их по
 * одному, и всё должно сразу заработать".
 *
 * SMS_PROVIDER / EMAIL_PROVIDER accept `auto` (default), `mock` or the
 * real provider name:
 * - `auto`: the real provider as soon as ALL of its credentials are
 *   present, otherwise mock — but only outside deployed environments.
 * - In deployed environments (NODE_ENV=staging|production) mock is never
 *   allowed, explicitly or via `auto`: missing credentials fail boot
 *   (env.schema.ts turns `missing` into zod issues). Never a silent mock
 *   in prod.
 *
 * Pure functions (no Nest/ConfigService) so env.schema.ts's superRefine
 * and AuthModule's provider factories share one source of truth, and the
 * logic is unit-testable without booting the app.
 */

export type SmsProviderName = 'mock' | 'twilio';
export type EmailProviderName = 'mock' | 'ses';
export type ProviderMode<T extends string> = 'auto' | T;

export interface ProviderSelection<T extends string> {
  /** Provider AuthModule should instantiate. */
  provider: T;
  /** Credential env vars the real provider still needs (empty = complete). */
  missing: string[];
  /**
   * True when this selection must stop boot: a deployed environment would
   * otherwise run on mock, or a real provider was forced without creds.
   */
  fatal: boolean;
}

export interface SmsSelectionInput {
  NODE_ENV: string;
  SMS_PROVIDER: ProviderMode<SmsProviderName>;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
}

export interface EmailSelectionInput {
  NODE_ENV: string;
  EMAIL_PROVIDER: ProviderMode<EmailProviderName>;
  SES_REGION?: string;
  SES_FROM_ADDRESS?: string;
}

export function isDeployedEnv(nodeEnv: string): boolean {
  return nodeEnv === 'staging' || nodeEnv === 'production';
}

function isSet(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function missingTwilioVars(input: SmsSelectionInput): string[] {
  const missing: string[] = [];
  if (!isSet(input.TWILIO_ACCOUNT_SID)) missing.push('TWILIO_ACCOUNT_SID');
  if (!isSet(input.TWILIO_AUTH_TOKEN)) missing.push('TWILIO_AUTH_TOKEN');
  // Either a sender number or a Messaging Service (sender pool) is enough.
  if (
    !isSet(input.TWILIO_FROM_NUMBER) &&
    !isSet(input.TWILIO_MESSAGING_SERVICE_SID)
  ) {
    missing.push('TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID');
  }
  return missing;
}

export function missingSesVars(input: EmailSelectionInput): string[] {
  const missing: string[] = [];
  if (!isSet(input.SES_REGION)) missing.push('SES_REGION');
  if (!isSet(input.SES_FROM_ADDRESS)) missing.push('SES_FROM_ADDRESS');
  return missing;
}

function select<T extends string>(
  mode: ProviderMode<T | 'mock'>,
  realName: T,
  missing: string[],
  nodeEnv: string,
): ProviderSelection<T | 'mock'> {
  const deployed = isDeployedEnv(nodeEnv);
  const complete = missing.length === 0;
  if (mode === 'mock') {
    return { provider: 'mock', missing, fatal: deployed };
  }
  if (mode === realName) {
    return { provider: realName, missing, fatal: !complete };
  }
  // auto
  if (complete) return { provider: realName, missing, fatal: false };
  return { provider: 'mock', missing, fatal: deployed };
}

export function resolveSmsProvider(
  input: SmsSelectionInput,
): ProviderSelection<SmsProviderName> {
  return select<'twilio'>(
    input.SMS_PROVIDER,
    'twilio',
    missingTwilioVars(input),
    input.NODE_ENV,
  );
}

export function resolveEmailProvider(
  input: EmailSelectionInput,
): ProviderSelection<EmailProviderName> {
  return select<'ses'>(
    input.EMAIL_PROVIDER,
    'ses',
    missingSesVars(input),
    input.NODE_ENV,
  );
}
