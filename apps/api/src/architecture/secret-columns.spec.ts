import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { datamodel } from '../generated/prisma-dmmf';
import { SECRET_COLUMNS_OMIT } from '../prisma/secret-columns';

/**
 * STAGE2_SECURITY S10 (#17, ASVS V8.2.3 / V15.3.1): every column whose name
 * looks like a secret is either left out of every Prisma result by default
 * (SECRET_COLUMNS_OMIT in prisma/secret-columns.ts) or listed below with the
 * reason it is not a secret. A new `*_hash`, `*_enc`, `*token*`, `*secret*`,
 * `*key*` ... column fails this test until somebody decides which it is.
 */
const SECRET_LOOKING =
  /hash|secret|token|totp|recovery|key|password|_enc$|cipher|salt|otp/i;

/** `Model.column` → why it may come back in a plain read. */
const NOT_SECRET_COLUMNS: Readonly<Record<string, string>> = {
  'AdminAppeal.file_key':
    'object storage key of an uploaded file, not a secret',
  'AdminApproval.payload_hash':
    'sha256 of the approved request body, compared on replay; not a credential',
  'AdminCredential.password_changed_at': 'a time, not a secret',
  'AdminCredential.totp_enabled_at': 'a time, not a secret',
  'AppConfig.key': 'name of a setting',
  'AttorneyAdArchive.content_hash': 'fingerprint of a public ad text',
  'AuditLog.prev_hash': 'tamper-evident chain link, verifiable by design',
  'AuditLog.row_hash': 'tamper-evident chain link, verifiable by design',
  'AuditLogChainHead.last_hash':
    'tamper-evident chain head, verifiable by design',
  'AuthEvent.identifier_hash':
    'keyed hash of a login identifier for rate limits; the key is not in the database',
  'BarNumberBlock.bar_key': 'normalised public bar number',
  'CalendarEventLink.content_hash':
    'change detector of a synced calendar event',
  'Case.cover_key': 'object storage key of a cover image, not a secret',
  'CaseJournal.prev_hash': 'tamper-evident chain link, verifiable by design',
  'CaseJournal.row_hash': 'tamper-evident chain link, verifiable by design',
  'CaseSignature.image_key': 'object storage key (private bucket, signed URLs)',
  'ChannelPost.forward_key': 'dedupe key of a forwarded post',
  'ContactBookHash.phone_hash':
    'contact matching key, read only by the contact sync of its own owner',
  'ContactSyncSetting.book_hash': 'change detector of an uploaded address book',
  'CounterFlushBatch.token': 'idempotency id of a counter flush batch',
  'CrashReport.device_key': 'anonymous install id for crash grouping',
  'CrossFamilyInbox.idempotency_key': 'idempotency id of an outbox message',
  'CrossFamilyOutbox.idempotency_key': 'idempotency id of an outbox message',
  'DomainEvent.idempotency_key': 'idempotency id of a domain event',
  'E2eeBackup.key_id':
    'HMAC id of the backup key (the key itself stays on the phone); sent back to its owner',
  'EmailTemplate.key': 'name of an e-mail template',
  'Experiment.hash_version': 'bucketing version number',
  'Experiment.key': 'name of an experiment',
  'FeatureFlag.hash_version': 'bucketing version number',
  'FeatureFlag.key': 'name of a feature flag',
  'File.blurhash': 'image placeholder shown to every viewer',
  'File.s3_key': 'object storage key (private files are served by signed URLs)',
  'I18nKey.key': 'name of a translation string',
  'I18nTranslation.key_id': 'foreign key',
  'IdentityFingerprint.hash':
    'device fingerprint for abuse checks, compared by the admin anti-fraud views',
  'LedgerAccount.owner_key': 'ledger account owner id',
  'LegalAnswer.content_hash': 'duplicate detector of a public answer',
  'LegalExport.file_key': 'object storage key (private bucket, signed URLs)',
  'LegalQuestion.content_hash': 'duplicate detector of a public question',
  'Message.ciphertext':
    'end-to-end encrypted payload, delivered to the members by design (MLS)',
  'MessageSearchToken.token':
    'blind-index keyed hash for message search; the key is not in the database',
  'MlsDevice.signature_key': 'public MLS signature key, published by design',
  'Notification.dedupe_key': 'dedupe id of a notification',
  'OutreachLead.unsubscribe_token':
    'legacy link value printed into every cold email by design (R2B-14 expand/contract); retention clears it once signed links run',
  'OutreachLead.unsubscribe_token_hashed_at': 'timestamp of the hash migration',
  'PracticeArea.i18n_key': 'name of a translation string',
  'PromotionDaily.day_key': 'calendar day bucket',
  'PromotionView.day_key': 'calendar day bucket',
  'PushToken.fcm_token':
    'push address of a device; sending needs our server credentials, read by every push',
  'PushToken.token_kind': 'kind of push address',
  'RankingEvent.experiment_key': 'name of an experiment',
  'RecoQaSnapshot.key': 'name of a QA snapshot',
  'SearchIndexState.key': 'name of a search index',
  'SearchSynonymGroup.key': 'name of a synonym group',
  'SmsConsent.disclosure_hash': 'fingerprint of the consent text the user saw',
  'SmsSuppression.last_keyword': 'last STOP/START keyword received',
  'StarLedger.idem_key': 'idempotency id of a ledger entry',
  'StateBarRegistry.secret_masked':
    'masked display form (last characters only)',
  'TreasuryPayout.key': 'idempotency id of a payout',
  'User.password_set_at': 'a time, not a secret',
  'VoipToken.token':
    'VoIP push address of a device; sending needs our APNs key, read by every call push',
  'WebauthnCredential.public_key': 'public key of a passkey, public by design',
};

/**
 * Files that may build a client WITHOUT the omit, and why. Every other
 * client of the application comes from PrismaService or
 * newSecretOmittingClient (prisma/secret-columns.ts).
 */
const RAW_CLIENT_FILES: Readonly<Record<string, string>> = {
  'src/prisma/secret-columns.ts': 'newSecretOmittingClient itself',
  'src/sharding/move/move-db.ts':
    'shard move copies whole rows between databases with raw SQL; an omit there would drop the password hashes it copies',
  'src/cli/purge-test-data.ts':
    'operator CLI on raw SQL, typed without the omit',
  'src/cli/backfill-runner.ts':
    'operator CLI on raw SQL, typed without the omit',
  'src/cli/check-config.ts': 'operator CLI, reads app_config only',
  'src/partitioning/sql.ts': 'DDL connection (raw SQL only)',
};

const SRC = join(__dirname, '..');
const API = join(SRC, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'generated' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** The code without comments, so a doc line naming a call does not count. */
const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const delegateOf = (model: string): string =>
  model.charAt(0).toLowerCase() + model.slice(1);

const omitted = SECRET_COLUMNS_OMIT as unknown as Record<
  string,
  Record<string, boolean>
>;

const scalarColumns = (): Array<{ model: string; field: string }> =>
  datamodel.models.flatMap((m) =>
    m.fields
      .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
      .map((f) => ({ model: m.name, field: f.name })),
  );

describe('secret columns never leave Prisma by default (S10, #17)', () => {
  it('every secret-looking column is omitted or has a written reason', () => {
    const undecided = scalarColumns()
      .filter(({ field }) => SECRET_LOOKING.test(field))
      .map(({ model, field }) => `${model}.${field}`)
      .filter((name) => {
        const [model, field] = name.split('.');
        return (
          omitted[delegateOf(model)]?.[field] !== true &&
          !(name in NOT_SECRET_COLUMNS)
        );
      });
    expect(undecided).toEqual([]);
  });

  it('every omitted column exists in schema.prisma', () => {
    const known = new Set(
      scalarColumns().map(
        ({ model, field }) => `${delegateOf(model)}.${field}`,
      ),
    );
    const stale = Object.entries(omitted).flatMap(([model, fields]) =>
      Object.keys(fields)
        .map((f) => `${model}.${f}`)
        .filter((name) => !known.has(name)),
    );
    expect(stale).toEqual([]);
  });

  it('no column is both omitted and allowed, and every allowance is real', () => {
    const known = new Set(
      scalarColumns().map(({ model, field }) => `${model}.${field}`),
    );
    const problems = Object.keys(NOT_SECRET_COLUMNS).filter((name) => {
      const [model, field] = name.split('.');
      return (
        !known.has(name) ||
        !SECRET_LOOKING.test(field) ||
        omitted[delegateOf(model)]?.[field] === true
      );
    });
    expect(problems).toEqual([]);
  });

  it('no app code builds a Prisma client without the omit', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !f.endsWith('.spec.ts'))
      .map((f) => relative(API, f))
      .filter((f) => /new PrismaClient\(/.test(code(join(API, f))))
      .filter((f) => !(f in RAW_CLIENT_FILES));
    expect(offenders).toEqual([]);
  });

  it("nothing uses Prisma's TransactionClient type, which ignores the omit", () => {
    // Prisma.TransactionClient is generated WITHOUT the global omit: a
    // `tx.user.findFirst()` typed with it would claim a password_hash the
    // result does not have. The application's own type is DbTx.
    const offenders = [...sourceFiles(SRC), ...sourceFiles(join(API, 'test'))]
      .filter((f) => /\bPrisma\.TransactionClient\b/.test(code(f)))
      .map((f) => relative(API, f));
    expect(offenders).toEqual([]);
  });

  it('the credential columns of the auth flows are in the omit list', () => {
    expect(SECRET_COLUMNS_OMIT.user.password_hash).toBe(true);
    expect(SECRET_COLUMNS_OMIT.session.refresh_hash).toBe(true);
    expect(SECRET_COLUMNS_OMIT.adminCredential).toEqual({
      password_hash: true,
      security_answer_hash: true,
      totp_secret_enc: true,
      recovery_codes_hash: true,
    });
  });
});
