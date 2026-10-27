import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from './env.schema';

/**
 * Deploy safety audit 2026-10-27 (docs/dev/DEPLOY_SAFETY_AUDIT_2026-10-27.md):
 * the env CONTRACT between this code and the production task definition.
 *
 * CI runs with apps/api/.env.test; production runs with what Terraform puts
 * into the api/worker task definition (infra/modules/stack/main.tf
 * `api_env` + `secret_names` + REDIS_URL, infra/modules/ecs/main.tf PORT /
 * JOBS_ENABLED / NODE_OPTIONS). A variable that becomes required in
 * production but is not in the task definition only showed up as a crash
 * loop of the new tasks on the server. This test builds a production env
 * from exactly those NAMES (Terraform literals as written, every other
 * value a well-formed stand-in) and runs this image's env rules on it.
 *
 * Red here means: add the variable to infra (api_env / secret_names) or
 * make it optional with a safe default — never both missing.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const STACK = readFileSync(join(REPO, 'infra/modules/stack/main.tf'), 'utf8');
const ECS = readFileSync(join(REPO, 'infra/modules/ecs/main.tf'), 'utf8');

/** `  api_env = {` … `  }`: key → literal value (null = computed in HCL). */
function apiEnv(): Map<string, string | null> {
  const start = STACK.indexOf('\n  api_env = {\n');
  expect(start).toBeGreaterThan(0);
  const end = STACK.indexOf('\n  }\n', start);
  const out = new Map<string, string | null>();
  for (const line of STACK.slice(start, end).split('\n')) {
    const m = /^ {4}([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const lit = /^"([^"$]*)"\s*(#.*)?$/.exec(m[2]);
    out.set(m[1], lit ? lit[1] : null);
  }
  return out;
}

/** `secret_names = concat([ "A", "B", … ], var.extra_secrets)`. */
function secretNames(): string[] {
  const start = STACK.indexOf('secret_names = concat([');
  expect(start).toBeGreaterThan(0);
  const end = STACK.indexOf('], var.extra_secrets)', start);
  return [...STACK.slice(start, end).matchAll(/^\s*"([A-Z][A-Z0-9_]*)"/gm)].map(
    (m) => m[1],
  );
}

// 32 random-looking bytes (passes key-strength.ts: not a word, not a repeat).
const KEY = 'q7Vw2Lr9Xk4Tz8Bn1Hc6Jm3Pf5Gd0Sa7Ye2Ui9Ok4Rl=';
const HEX = 'a3f19c0e7b5d2846f1e09c3b7a5d2e48c6f0193b7e5a2d48f6c0e193b7a5d2e4';

/** Valid stand-ins for the secrets (Secrets Manager values in prod). */
const SECRET_VALUES: Record<string, string> = {
  DATABASE_URL:
    'postgresql://lawbid_app:pw@db.internal:5432/lawbid?sslmode=verify-full',
  RETENTION_DATABASE_URL:
    'postgresql://lawbid_retention:pw@db.internal:5432/lawbid?sslmode=verify-full',
  DEMO_DATABASE_URL:
    'postgresql://lawbid_demo:pw@db.internal:5432/lawbid_demo?sslmode=verify-full',
  REDIS_URL: 'rediss://:pw@redis.internal:6379',
  JWT_KEYS: `j1:${KEY}`,
  OTP_CODE_SECRET: KEY,
  OTP_KEY_PEPPER: HEX,
  AUTH_EVENT_PEPPER: KEY.split('').reverse().join(''),
  ADMIN_TOTP_ENC_KEY: HEX,
  SECRETS_MASTER_KEYS: `k1:${KEY}`,
  MESSAGE_ENC_KEYS: `m1:${KEY}`,
  SEARCH_INDEX_KEY: KEY,
};

/** A well-formed value for a name Terraform computes (bucket, ARN, URL…). */
const FORMATTED: Record<string, string> = {
  REDIS_CLUSTER: 'false',
  GOOGLE_CLIENT_IDS: '123456789012-abc123def456.apps.googleusercontent.com',
  APPLE_BUNDLE_IDS: 'com.lawbid.lawbid',
  STRIPE_PRICE_ID: 'price_1AbCdEfGhIjKlMn',
  CLOUDFRONT_PRIVATE_DOMAIN: 'files.lawbid.dev',
  CLOUDFRONT_PRIVATE_KEY_ID: 'K2JCJMDEHXQW5F',
  CLOUDFRONT_MEDIA_DISTRIBUTION_ID: 'E2QWRUHAPOMQZL',
  CLOUDFRONT_PRIVATE_DISTRIBUTION_ID: 'E3ABCDEFGHIJKL',
  FCM_CLIENT_EMAIL: 'firebase-adminsdk@lawbid.iam.gserviceaccount.com',
};

function standIn(name: string): string {
  if (FORMATTED[name] !== undefined) return FORMATTED[name];
  if (/_URLS?$|_ORIGINS$|_BASE_URL$/.test(name))
    return 'https://example.lawbid.dev';
  if (/_ARN$/.test(name)) return 'arn:aws:kms:us-east-1:123456789012:key/abc';
  if (/^(OPS_)?.*(_TASKS|_MIN|_MAX|_USD|_SIZE|_REPLICAS)$/.test(name))
    return '2';
  if (/REGION$/.test(name)) return 'us-east-1';
  if (/_EMAIL$|_ADDRESS$/.test(name)) return 'no-reply@lawbid.dev';
  if (name === 'ROTATION_STATUS_SECRETS') return '[]';
  if (name === 'APPLE_TEAM_ID') return 'ABCDE12345';
  if (name === 'OPS_AWS_ACCOUNT_ID') return '123456789012';
  return 'stand-in';
}

/**
 * Terraform values that are EMPTY until the owner fills a tfvars entry, and
 * the extra secret (`extra_secrets`) the app then needs as well — the env
 * rules accept these credentials only as a whole set ("all or none").
 * Example: setting `fcm_project_id` + `fcm_client_email` without adding
 * FCM_PRIVATE_KEY to extra_secrets makes every new api task refuse to boot.
 */
const OPTIONAL_SETS = {
  fcm: {
    env: ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL'],
    extraSecret: 'FCM_PRIVATE_KEY',
    value:
      '-----BEGIN PRIVATE KEY-----\\nMIIstand-in\\n-----END PRIVATE KEY-----\\n',
  },
  cloudfrontSigned: {
    env: ['CLOUDFRONT_PRIVATE_DOMAIN', 'CLOUDFRONT_PRIVATE_KEY_ID'],
    extraSecret: 'CLOUDFRONT_PRIVATE_KEY_PEM',
    value:
      '-----BEGIN PRIVATE KEY-----\nMIIstand-in\n-----END PRIVATE KEY-----\n',
  },
} as const;

function productionEnv(
  on: (keyof typeof OPTIONAL_SETS)[] = [],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of apiEnv()) env[k] = v ?? standIn(k);
  for (const k of secretNames()) {
    expect(SECRET_VALUES[k]).toBeDefined(); // a new secret: add a stand-in above
    env[k] = SECRET_VALUES[k];
  }
  env.REDIS_URL = SECRET_VALUES.REDIS_URL;
  // infra/modules/ecs/main.tf adds these to the api container.
  env.PORT = '3000';
  env.JOBS_ENABLED = 'false';
  env.NODE_OPTIONS = '--max-old-space-size=1536';
  for (const [name, set] of Object.entries(OPTIONAL_SETS)) {
    const isOn = on.includes(name as keyof typeof OPTIONAL_SETS);
    // Off: Terraform writes "" (the tfvars entry is empty), the app reads unset.
    for (const k of set.env) env[k] = isOn ? env[k] : '';
    if (isOn) env[set.extraSecret] = set.value;
  }
  return env;
}

function problemsOf(env: Record<string, string>): string[] {
  const parsed = envSchema.safeParse(env);
  return parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('env contract: production task definition ↔ env.schema.ts', () => {
  it('reads the task definition names from Terraform', () => {
    const names = [...apiEnv().keys()];
    expect(names).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'TRUST_PROXY_HOPS',
        'JWT_ACTIVE_KID',
      ]),
    );
    expect(apiEnv().get('NODE_ENV')).toBe('production');
    expect(secretNames()).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'JWT_KEYS', 'MESSAGE_ENC_KEYS']),
    );
    // REDIS_URL always reaches the tasks as a secret (app_secret_arns).
    expect(STACK).toMatch(/\{ REDIS_URL = local\.redis_cluster_on/);
    // The ecs module puts PORT / JOBS_ENABLED on the api container.
    expect(ECS).toMatch(/name = "JOBS_ENABLED", value = "false"/);
  });

  it('the production env the task definition provides passes this image’s env rules', () => {
    expect(problemsOf(productionEnv())).toEqual([]);
  });

  it('…also with every optional credential set on (with its extra secret)', () => {
    const all = Object.keys(OPTIONAL_SETS) as (keyof typeof OPTIONAL_SETS)[];
    expect(problemsOf(productionEnv(all))).toEqual([]);
  });

  it.each(Object.entries(OPTIONAL_SETS))(
    'a half-filled set refuses to boot: %s without its extra secret',
    (name, set) => {
      const env = productionEnv([name as keyof typeof OPTIONAL_SETS]);
      delete env[set.extraSecret];
      expect(problemsOf(env).join('\n')).toContain(set.extraSecret);
    },
  );

  it('the optional sets are what Terraform really computes from tfvars', () => {
    // FCM_* straight from tfvars (default ""), CLOUDFRONT_PRIVATE_* empty
    // until documents_cdn_public_key_pem is set: both stay off by default.
    expect(STACK).toMatch(/FCM_PROJECT_ID\s+= var\.fcm_project_id/);
    expect(STACK).toMatch(
      /CLOUDFRONT_PRIVATE_DOMAIN = module\.s3\.documents_cdn_domain == null \? ""/,
    );
  });

  it.each([
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_KEYS',
    'MESSAGE_ENC_KEYS',
    'OTP_CODE_SECRET',
  ])('is sensitive: without %s the same env is refused', (name) => {
    const env = productionEnv();
    delete env[name];
    expect(envSchema.safeParse(env).success).toBe(false);
  });

  it('the key ids named in env exist inside the key secrets', () => {
    const env = apiEnv();
    expect(
      SECRET_VALUES.JWT_KEYS.startsWith(`${env.get('JWT_ACTIVE_KID')}:`),
    ).toBe(true);
    expect(
      SECRET_VALUES.SECRETS_MASTER_KEYS.startsWith(
        `${env.get('SECRETS_ACTIVE_KID')}:`,
      ),
    ).toBe(true);
    expect(
      SECRET_VALUES.MESSAGE_ENC_KEYS.startsWith(
        `${env.get('MESSAGE_ENC_ACTIVE_KID')}:`,
      ),
    ).toBe(true);
  });
});
