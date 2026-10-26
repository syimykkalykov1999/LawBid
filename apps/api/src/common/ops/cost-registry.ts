/**
 * COST REGISTRY (owner 2026-10-25, package 1q): ONE catalog of everything
 * that can bill money, with what it is, what it costs now / at 100k / at 1M
 * users, how the owner switches it (Выкл / Вкл / Авто) and where the alarm is.
 *
 * Source of truth for:
 *   - the admin «Расходы» registry table and «Лестница расходов»
 *     (GET /admin/spend/registry, cost-registry.service.ts);
 *   - docs/runbooks/COST_LADDER.md and apps/admin/content/guides/
 *     cost-ladder.md (generated: `node apps/api/scripts/cost-ladder.mjs`);
 *   - the CI gate (cost-registry.spec.ts): every `aws_*` resource type in
 *     infra/** and every provider in secrets/provider-registry.ts must be
 *     claimed by an entry here, otherwise the test fails.
 *
 * This file must stay SELF-CONTAINED and use only erasable TypeScript
 * (no enums, no imports): the generator script loads it with Node's native
 * type stripping.
 *
 * Prices: list prices, us-east-1, checked 2026-10-25 (`verified: false` =
 * the number still has to be confirmed in the vendor account). Money in
 * US dollars per month. «≈» figures are the scout's arithmetic (730 h/month).
 */

export type CostKind = 'aws' | 'vendor' | 'sdk' | 'ci';
/** off = Выкл, on = Вкл, auto = Авто (по сигналу, не выше потолка). */
export type CostState = 'off' | 'on' | 'auto';
export type Range = readonly [number, number];

/** Where the owner's switch lives. */
export type CostControl =
  /**
   * An app setting (admin «Настройки» / this page). `map` says which stored
   * value means which state; the string 'default' means "delete the stored
   * value, fall back to the built-in default" (used for cost-guard caps).
   */
  | {
      type: 'app-setting';
      key: string;
      map: Partial<Record<CostState, string | number | boolean>>;
    }
  /**
   * The database / Redis autoscaler Lambda switch in AWS SSM
   * (`on` | `dry-run` | `off`). Выкл = off, Вкл = dry-run (the Lambda only
   * e-mails what it would do), Авто = on.
   */
  | { type: 'ssm-mode'; target: 'db' | 'redis' }
  /** Infra-only: a Terraform variable. Read-only here; steps are shown. */
  | {
      type: 'tfvars';
      vars: string[];
      lines: Partial<Record<CostState, string>>;
    }
  /** Always on, cannot be switched without losing a safety net. */
  | { type: 'fixed'; reason: string };

export interface CostPrice {
  /** fixed = a monthly fee; unit = unit price x usage. */
  model: 'fixed' | 'unit' | 'mixed' | 'free';
  /** Plain words: "$0.0225 в час + LCU", "$0.05 за ГБ после 1 ТБ". */
  text: string;
  sourceUrl: string;
  checkedAt: string;
  verified: boolean;
}

export interface CostEntry {
  /** Stable id, `group.thing`. */
  id: string;
  name: string;
  /** Plain Russian: what it does for the app. */
  purpose: string;
  kind: CostKind;
  control: CostControl;
  /** The positions the owner may pick for this item. */
  states: CostState[];
  defaultState: CostState;
  /** The ceiling: an app setting or a tfvars variable, or null. */
  ceiling: {
    key: string;
    label: string;
    where: 'app-setting' | 'tfvars';
  } | null;
  price: CostPrice;
  /** $/month by size of the user base (a range when the scout gave one). */
  usd: { launch: Range; k100: Range; m1: Range };
  /** Extra $/month when an OFF-by-default item is switched on. */
  ifOnUsd?: Range;
  /** Is it useful on day 1 with an empty app? */
  needed: 'yes' | 'auto' | 'later' | 'no';
  neededNote: string;
  /** Name of the alarm / cap that watches it, or null when none. */
  alarm: string | null;
  /** Cost Explorer SERVICE name whose bill belongs to this entry. */
  ceService?: string;
  /** Spend vendor reader (spend.service.ts) and an optional line text. */
  spendVendor?: {
    id: 'twilio' | 'bunny' | 'cloudflare' | 'stripe';
    line?: string;
  };
  /** Terraform resource types this entry covers (the CI gate). */
  awsTypes?: string[];
  /** provider-registry.ts ids this entry covers (the CI gate). */
  providers?: string[];
  /** Extra steps (plain Russian) after the generated ones. */
  extraSteps?: string[];
  /** The scout violation this entry resolves, for the changelog. */
  note?: string;
}

const R = (a: number, b: number = a): Range => [a, b];

const U = {
  fargate: 'https://aws.amazon.com/fargate/pricing/',
  elb: 'https://aws.amazon.com/elasticloadbalancing/pricing/',
  vpc: 'https://aws.amazon.com/vpc/pricing/',
  rds: 'https://aws.amazon.com/rds/postgresql/pricing/',
  cache: 'https://aws.amazon.com/elasticache/pricing/',
  waf: 'https://aws.amazon.com/waf/pricing/',
  cf: 'https://aws.amazon.com/cloudfront/pricing/',
  cw: 'https://aws.amazon.com/cloudwatch/pricing/',
  r53: 'https://aws.amazon.com/route53/pricing/',
  sm: 'https://aws.amazon.com/secrets-manager/pricing/',
  kms: 'https://aws.amazon.com/kms/pricing/',
  gd: 'https://aws.amazon.com/guardduty/pricing/',
  ct: 'https://aws.amazon.com/cloudtrail/pricing/',
  athena: 'https://aws.amazon.com/athena/pricing/',
  backup: 'https://aws.amazon.com/backup/pricing/',
  s3: 'https://aws.amazon.com/s3/pricing/',
  ecr: 'https://aws.amazon.com/ecr/pricing/',
  ses: 'https://aws.amazon.com/ses/pricing/',
  lambda: 'https://aws.amazon.com/lambda/pricing/',
  ec2: 'https://aws.amazon.com/ec2/pricing/on-demand/',
  os: 'https://aws.amazon.com/opensearch-service/pricing/',
  sec: 'https://aws.amazon.com/security-hub/pricing/',
  cfg: 'https://aws.amazon.com/config/pricing/',
  macie: 'https://aws.amazon.com/macie/pricing/',
  insp: 'https://aws.amazon.com/inspector/pricing/',
  fis: 'https://aws.amazon.com/fis/pricing/',
  budgets: 'https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/',
  ddb: 'https://aws.amazon.com/dynamodb/pricing/on-demand/',
  rek: 'https://aws.amazon.com/rekognition/pricing/',
  twilio: 'https://www.twilio.com/en-us/sms/pricing/us',
  stripe: 'https://stripe.com/pricing',
  bunny: 'https://bunny.net/pricing/stream/',
  cft: 'https://developers.cloudflare.com/realtime/turn/faq/',
  r2: 'https://developers.cloudflare.com/r2/pricing/',
  gtr: 'https://cloud.google.com/translate/pricing',
  persona: 'https://withpersona.com/pricing',
  sentry: 'https://sentry.io/pricing/',
  gcal: 'https://developers.google.com/workspace/calendar/api/guides/quota',
  pd: 'https://www.pagerduty.com/pricing/',
  fb: 'https://firebase.google.com/pricing',
  recaptcha: 'https://cloud.google.com/recaptcha/pricing',
  apple: 'https://developer.apple.com/support/compare-memberships/',
  play: 'https://support.google.com/googleplay/android-developer/answer/6112435',
  ns: 'https://www.namecheap.com/domains/registration/gtld/dev/',
  gh: 'https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions',
  livekit: 'https://livekit.io/pricing',
} as const;

const D = '2026-10-25';
const price = (
  model: CostPrice['model'],
  text: string,
  sourceUrl: string,
  verified = true,
): CostPrice => ({ model, text, sourceUrl, checkedAt: D, verified });

/** Terraform item whose switch is a tfvars line (and sometimes a ceiling). */
const tf = (
  vars: string[],
  lines: Partial<Record<CostState, string>>,
): CostControl => ({ type: 'tfvars', vars, lines });

const fixed = (reason: string): CostControl => ({ type: 'fixed', reason });

const tfCeil = (key: string, label: string) =>
  ({ key, label, where: 'tfvars' }) as const;
const setCeil = (key: string, label: string) =>
  ({ key, label, where: 'app-setting' }) as const;

/** Cost-guard provider cap: Выкл = cap 0 (provider refuses), Авто = the
 * automatic caps (cost-autoscale), the owner edits numbers on the budgets page. */
const capControl = (provider: string): CostControl => ({
  type: 'app-setting',
  key: `budget.${provider}.monthly_max`,
  map: { off: 0, auto: 'default' },
});

/**
 * Every billable thing. Order = the order on the «Лестница расходов» page:
 * day-1 lines first (default ON), then the things the owner may switch on
 * (default OFF), then outside vendors, then apps / accounts / CI.
 */
export const COST_REGISTRY: readonly CostEntry[] = [
  // ======================= A. AWS, default ON ===========================
  {
    id: 'aws.fargate_api',
    name: 'Серверы API',
    purpose:
      'Отвечают приложению и сайту. Копий столько, сколько нужно по нагрузке.',
    kind: 'aws',
    control: tf(['min_tasks', 'api_max_tasks'], {
      auto: 'min_tasks = 1\napi_max_tasks = 50',
    }),
    states: ['auto'],
    defaultState: 'auto',
    ceiling: tfCeil(
      'api_max_tasks',
      'Жёсткий потолок копий API (по умолчанию 50)',
    ),
    price: price(
      'unit',
      '0,5 vCPU + 1 ГБ ≈ $18 в месяц за копию (Fargate: $0,04048 за vCPU-час и $0,004445 за ГБ-час)',
      U.fargate,
    ),
    usd: { launch: R(18), k100: R(110), m1: R(500, 900) },
    needed: 'auto',
    neededNote:
      'Нужна минимум одна копия. Остальные добавляются сами по нагрузке; потолок задаёт правило «Экономика».',
    alarm: 'потолок 50 копий + правило «Экономика» (админка → Экономика)',
    ceService: 'Amazon Elastic Container Service',
    awsTypes: [
      'aws_ecs_service',
      'aws_appautoscaling_target',
      'aws_appautoscaling_policy',
      'aws_appautoscaling_scheduled_action',
    ],
  },
  {
    id: 'aws.fargate_worker',
    name: 'Серверы фоновых задач (с антивирусом)',
    purpose: 'Письма, пуши, проверка файлов антивирусом, ночные работы.',
    kind: 'aws',
    control: tf(['min_tasks', 'worker_max_tasks'], {
      auto: 'min_tasks = 1\nworker_max_tasks = 20',
    }),
    states: ['auto'],
    defaultState: 'auto',
    ceiling: tfCeil(
      'worker_max_tasks',
      'Жёсткий потолок копий воркера (по умолчанию 20)',
    ),
    price: price('unit', '0,5 vCPU + 4 ГБ ≈ $28 в месяц за копию', U.fargate),
    usd: { launch: R(28), k100: R(85), m1: R(300, 550) },
    needed: 'auto',
    neededNote:
      'Нужна минимум одна копия (антивирус файлов). Остальные растут по длине очереди.',
    alarm: 'потолок 20 копий; тревога «очередь растёт» (queue-backlog)',
    ceService: 'Amazon Elastic Container Service',
  },
  {
    id: 'aws.fargate_admin',
    name: 'Сервер админки',
    purpose: 'Ваша админка (сайт управления). Содержит и @sentry/browser.',
    kind: 'aws',
    control: tf(['admin_tasks'], { auto: 'admin_tasks = 1' }),
    states: ['auto'],
    defaultState: 'auto',
    ceiling: null,
    price: price('unit', '0,25 vCPU + 0,5 ГБ ≈ $9 в месяц', U.fargate),
    usd: { launch: R(9), k100: R(9), m1: R(18) },
    needed: 'yes',
    neededNote: 'Нужен: без него нет админки.',
    alarm: null,
    ceService: 'Amazon Elastic Container Service',
  },
  {
    id: 'aws.alb',
    name: 'Балансировщик нагрузки (ALB)',
    purpose:
      'Раздаёт запросы по серверам, держит адрес api.lawbid.dev и admin.lawbid.dev.',
    kind: 'aws',
    control: fixed(
      'Без него приложение не открывается: адрес и сертификат живут на нём.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'mixed',
      '$0,0225 в час (≈ $16) + LCU по трафику; ≈ $22 при пустом приложении',
      U.elb,
    ),
    usd: { launch: R(22), k100: R(40), m1: R(250) },
    needed: 'yes',
    neededNote: 'Нужен.',
    alarm: 'тревога доли ошибок 5xx (alb-5xx-ratio)',
    ceService: 'Amazon Elastic Load Balancing',
    awsTypes: [
      'aws_lb',
      'aws_lb_listener',
      'aws_lb_listener_rule',
      'aws_lb_target_group',
    ],
  },
  {
    id: 'aws.nat',
    name: 'Выход в интернет для серверов (NAT)',
    purpose: 'Серверы ходят к Stripe, Twilio, Bunny и т.д. Один на все зоны.',
    kind: 'aws',
    control: tf(['nat_per_az'], {
      on: 'nat_per_az = false  # один NAT',
      auto: 'nat_per_az = true  # по одному на зону (+$33 и +$29 за «двери»)',
    }),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'mixed',
      '$0,045 в час (≈ $33) + $0,045 за каждый ГБ трафика через него',
      U.vpc,
    ),
    usd: { launch: R(34), k100: R(70), m1: R(1500) },
    needed: 'yes',
    neededNote:
      'Нужен, пока серверы стоят в закрытой сети. Растёт только с трафиком; крупные загрузки идут напрямую в S3.',
    alarm: 'тревога «NAT за сутки больше 100 ГБ» (nat-bytes)',
    ceService: 'Amazon Virtual Private Cloud',
    awsTypes: ['aws_nat_gateway', 'aws_eip', 'aws_eip_association'],
  },
  {
    id: 'aws.vpc_endpoints',
    name: 'Закрытые «двери» к AWS (4 endpoint)',
    purpose:
      'ecr.api, ecr.dkr, logs, secretsmanager: серверы берут образы и секреты не через интернет, трафик дешевле.',
    kind: 'aws',
    control: tf(['interface_endpoints', 'interface_endpoint_azs'], {
      off: 'interface_endpoints = false',
      on: 'interface_endpoints = true',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'fixed',
      '$0,01 в час за штуку в каждой зоне ≈ $7,3; четыре штуки ≈ $29',
      U.vpc,
    ),
    usd: { launch: R(29), k100: R(35), m1: R(60) },
    needed: 'later',
    neededNote:
      'На пустом приложении почти не нужны (экономят трафик NAT). Можно выключить и вернуть позже.',
    alarm: null,
    ceService: 'Amazon Virtual Private Cloud',
    awsTypes: ['aws_vpc_endpoint'],
  },
  {
    id: 'aws.public_ipv4',
    name: 'Публичные адреса IPv4 (3 шт.)',
    purpose:
      'AWS берёт плату за каждый публичный адрес: два у балансировщика, один у NAT.',
    kind: 'aws',
    control: fixed(
      'Следуют за балансировщиком и NAT: отдельного выключателя нет.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('fixed', '$0,005 в час за адрес ≈ $3,65; три ≈ $11', U.vpc),
    usd: { launch: R(11), k100: R(11), m1: R(15) },
    needed: 'yes',
    neededNote: 'Нужны, пока есть ALB и NAT.',
    alarm: null,
    ceService: 'Amazon Virtual Private Cloud',
  },
  {
    id: 'aws.rds',
    name: 'База данных (RDS PostgreSQL, две копии в разных зонах)',
    purpose:
      'Все данные приложения: люди, дела, переписка. Вторая копия включается сама при сбое зоны.',
    kind: 'aws',
    control: tf(['existing_database_identifier', 'database_multi_az'], {
      on: 'database_multi_az = true',
    }),
    states: ['on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'db_autoscale_max_class',
      'Абсолютный потолок размера базы (по умолчанию db.r7g.xlarge)',
    ),
    price: price(
      'mixed',
      't4g.micro Multi-AZ ≈ $28 вместе с диском; ступени ≈ $47, $94, $188, $349, $698; реплики чтения +$190 за штуку',
      U.rds,
    ),
    usd: { launch: R(28), k100: R(190), m1: R(700, 1400) },
    needed: 'yes',
    neededNote:
      'Нужна. Размер меняется автомасштабом (следующая строка) в пределах потолка по деньгам.',
    alarm: 'тревоги базы: соединения, процессор, место, бэкап',
    ceService: 'Amazon Relational Database Service',
    awsTypes: [
      'aws_db_instance',
      'aws_db_subnet_group',
      'aws_db_parameter_group',
    ],
  },
  {
    id: 'aws.db_autoscale',
    name: 'Автомасштаб размера базы',
    purpose:
      'Каждые 5 минут смотрит на нагрузку базы и поднимает размер на ступень; ночью после трёх спокойных дней опускает.',
    kind: 'aws',
    control: { type: 'ssm-mode', target: 'db' },
    states: ['off', 'on', 'auto'],
    defaultState: 'auto',
    ceiling: tfCeil(
      'db_autoscale_max_class',
      'Абсолютный потолок (tfvars) и потолок «по деньгам» (строка ниже)',
    ),
    price: price(
      'free',
      'Сама функция стоит копейки; платите за выбранный размер базы',
      U.lambda,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'auto',
    neededNote:
      'Авто: база растёт только когда её процессор или соединения упираются в предел, и не выше потолка по деньгам.',
    alarm:
      'письмо при каждой смене размера; потолок по деньгам (aws.capacity_ceiling)',
    note: 'V4',
  },
  {
    id: 'aws.redis',
    name: 'Redis (2 узла: основной и запасной)',
    purpose: 'Быстрая память: очереди, чаты в реальном времени, кэш.',
    kind: 'aws',
    control: tf(['redis_node_type', 'redis_replicas'], {
      on: 'redis_replicas = 1',
    }),
    states: ['on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'redis_autoscale_max_class',
      'Абсолютный потолок типа узла (по умолчанию cache.r7g.large)',
    ),
    price: price(
      'fixed',
      't4g.micro ×2 ≈ $23; ступени ≈ $47, $95, $320, $638 за пару',
      U.cache,
    ),
    usd: { launch: R(23), k100: R(95), m1: R(320, 640) },
    needed: 'yes',
    neededNote: 'Нужен. Размер меняет автомасштаб Redis (следующая строка).',
    alarm: 'тревога памяти Redis 70 % (redis-memory)',
    ceService: 'Amazon ElastiCache',
    awsTypes: [
      'aws_elasticache_replication_group',
      'aws_elasticache_subnet_group',
      'aws_elasticache_parameter_group',
    ],
  },
  {
    id: 'aws.redis_autoscale',
    name: 'Автомасштаб размера Redis',
    purpose:
      'Как у базы: поднимает тип узла при нехватке памяти, ночью опускает.',
    kind: 'aws',
    control: { type: 'ssm-mode', target: 'redis' },
    states: ['off', 'on', 'auto'],
    defaultState: 'auto',
    ceiling: tfCeil(
      'redis_autoscale_max_class',
      'Абсолютный потолок (tfvars) и потолок «по деньгам» (строка ниже)',
    ),
    price: price(
      'free',
      'Сама функция стоит копейки; платите за выбранный размер Redis',
      U.lambda,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'auto',
    neededNote:
      'Авто: Redis растёт только при нехватке памяти и не выше потолка по деньгам.',
    alarm: 'письмо при каждой смене; потолок по деньгам (aws.capacity_ceiling)',
    note: 'V4',
  },
  {
    id: 'aws.capacity_ceiling',
    name: 'Потолок размера базы и Redis «по деньгам»',
    purpose:
      'Автомасштабы не растут дороже, чем позволяет допустимый расход месяца (правило «Экономика»): база до 35 % и Redis до 15 % допустимой суммы.',
    kind: 'aws',
    control: {
      type: 'app-setting',
      key: 'scale.capacity_ceiling.mode',
      map: { off: 'off', auto: 'auto' },
    },
    states: ['off', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'economy.max_spend_percent',
      'Допустимый расход: процент выручки и минимум в долларах (Экономика)',
    ),
    price: price(
      'free',
      'Бесплатно: пишет один параметр в AWS SSM раз в 5 минут',
      U.lambda,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Авто держит базу и Redis в рамках бюджета. «Выкл» = потолок только из Terraform (дороже).',
    alarm: 'правило «Экономика»; бюджетные письма AWS',
    note: 'V4',
  },
  {
    id: 'aws.waf_alb',
    name: 'Фильтр атак WAF перед сервером (6 правил)',
    purpose:
      'Режет ботов, подборы кодов, слишком большие запросы; пускает в админку только с вашего адреса.',
    kind: 'aws',
    control: tf(['waf_enabled'], {
      on: 'waf_enabled = true',
      off: 'waf_enabled = false  # без фильтра не работает белый список админки и лимит кодов',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'waf_requests_alarm_per_day',
      'Порог письма: запросов за сутки (по умолчанию 3 млн)',
    ),
    price: price(
      'mixed',
      '$5 за фильтр + $1 за правило + $0,60 за миллион запросов',
      U.waf,
    ),
    usd: { launch: R(11), k100: R(30), m1: R(300) },
    needed: 'yes',
    neededNote:
      'Нужен: защита от ботов и подбора SMS-кодов. Выключать не советуем.',
    alarm:
      'тревога «WAF проверил слишком много запросов» (waf-alb-requests) + бюджет «AWS WAF» $50',
    ceService: 'AWS WAF',
    awsTypes: [
      'aws_wafv2_web_acl',
      'aws_wafv2_ip_set',
      'aws_wafv2_web_acl_association',
    ],
    note: 'V2',
  },
  {
    id: 'aws.waf_cdn',
    name: 'Фильтр атак WAF на раздаче файлов (3 правила)',
    purpose:
      'Не даёт скачивать файлы тысячи раз с одного адреса и режет известных плохих.',
    kind: 'aws',
    control: tf(['cdn_waf_enabled'], {
      on: 'cdn_waf_enabled = true',
      off: 'cdn_waf_enabled = false',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'cdn_waf_rate_limit_per_5m',
      'Запросов с одного адреса за 5 минут (по умолчанию 2000)',
    ),
    price: price(
      'mixed',
      '$5 за фильтр + $1 за правило + $0,60 за миллион запросов',
      U.waf,
    ),
    usd: { launch: R(8), k100: R(25), m1: R(250) },
    needed: 'yes',
    neededNote: 'Нужен: защищает платный трафик раздачи файлов от выкачивания.',
    alarm:
      'тревога «WAF CloudFront проверил слишком много запросов» (waf-cdn-requests)',
    ceService: 'AWS WAF',
    note: 'V2',
  },
  {
    id: 'aws.cloudfront',
    name: 'Раздача файлов и сайта (CloudFront ×3)',
    purpose:
      'Сайт lawbid.dev, фото и видео-превью, закрытые документы по временным ссылкам.',
    kind: 'aws',
    control: tf(['cdn_waf_rate_limit_per_5m', 'cloudfront_gb_alarm_per_day'], {
      auto: 'growth = { cdn_images_provider = "bunny", cdn_images_base_url = "https://<pull-zone>" }  # фото через Bunny, дешевле',
    }),
    states: ['on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'cloudfront_gb_alarm_per_day',
      'Порог письма: ГБ за сутки на одну раздачу (по умолчанию 60)',
    ),
    price: price(
      'unit',
      'Первый 1 ТБ и 10 млн запросов в месяц бесплатно, дальше ≈ $0,085 за ГБ',
      U.cf,
    ),
    usd: { launch: R(0), k100: R(170, 2000), m1: R(10000, 20000) },
    needed: 'yes',
    neededNote:
      'Нужна. Самая большая переменная статья при росте: смотрите письмо о ГБ за сутки. Жёсткая остановка: правило WAF по частоте или подписанные ссылки (см. шаги).',
    alarm:
      'тревога «CloudFront отдал больше N ГБ за сутки» по каждой раздаче (cloudfront-bytes-*) + бюджет «Amazon CloudFront» $60',
    ceService: 'Amazon CloudFront',
    awsTypes: [
      'aws_cloudfront_distribution',
      'aws_cloudfront_cache_policy',
      'aws_cloudfront_origin_access_control',
      'aws_cloudfront_response_headers_policy',
      'aws_cloudfront_key_group',
      'aws_cloudfront_public_key',
    ],
    extraSteps: [
      'Жёсткий потолок трафика: снизьте `cdn_waf_rate_limit_per_5m` (запросов с одного адреса за 5 минут) в terraform.tfvars; это режет выкачивание сразу, как только применён Terraform.',
      'Фото и видео-превью можно перевести на дешёвые источники: Cloudflare R2 (настройка `media.public_store = r2`) или Bunny (`growth.cdn_images_provider = "bunny"`).',
    ],
    note: 'V6',
  },
  {
    id: 'aws.cloudwatch',
    name: 'Тревоги, графики и журналы (CloudWatch)',
    purpose:
      'Письмо вам при беде: около 75 тревог, 6 составных, фильтры журналов, сами журналы.',
    kind: 'aws',
    control: fixed(
      'Это ваши глаза на проде: без тревог о поломке вы узнаете из жалоб.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'mixed',
      '$0,10 за тревогу в месяц, $0,50 за составную; журналы $0,50 за ГБ приёма',
      U.cw,
    ),
    usd: { launch: R(18), k100: R(25), m1: R(60) },
    needed: 'yes',
    neededNote:
      'Нужны. Отладочные журналы, оставленные включёнными, раздувают эту строку.',
    alarm: 'сами тревоги; бюджет месяца',
    ceService: 'AmazonCloudWatch',
    awsTypes: [
      'aws_cloudwatch_metric_alarm',
      'aws_cloudwatch_composite_alarm',
      'aws_cloudwatch_log_group',
      'aws_cloudwatch_log_metric_filter',
    ],
  },
  {
    id: 'aws.route53_check',
    name: 'Проверка «жив ли сайт» (Route 53)',
    purpose: 'Снаружи раз в минуту стучится на сайт и сообщает, если он лёг.',
    kind: 'aws',
    control: tf(['uptime_check'], {
      off: 'uptime_check = "off"',
      on: 'uptime_check = "route53"',
      auto: 'uptime_check = "synthetics"  # +$8, подробнее',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'fixed',
      '$0,50 за проверку + $1 за дополнительные опции ≈ $2',
      U.r53,
    ),
    usd: { launch: R(2), k100: R(2), m1: R(2) },
    needed: 'yes',
    neededNote: 'Нужна: единственная проверка не изнутри AWS.',
    alarm: 'сама проверка шлёт письмо и PagerDuty',
    ceService: 'Amazon Route 53',
    awsTypes: ['aws_route53_health_check', 'aws_route53_record'],
  },
  {
    id: 'aws.secrets',
    name: 'Хранилище секретов (Secrets Manager, 6 секретов)',
    purpose:
      'Пароли и ключи сервера хранятся шифрованно и подаются серверам при старте.',
    kind: 'aws',
    control: fixed('Серверы берут ключи именно оттуда.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('fixed', '$0,40 за секрет в месяц', U.sm),
    usd: { launch: R(3), k100: R(3), m1: R(3) },
    needed: 'yes',
    neededNote: 'Нужно.',
    alarm: null,
    ceService: 'AWS Secrets Manager',
    awsTypes: [
      'aws_secretsmanager_secret_rotation',
      'aws_secretsmanager_secret',
      'aws_secretsmanager_secret_version',
    ],
  },
  {
    id: 'aws.kms',
    name: 'Ключи шифрования (KMS)',
    purpose:
      'Главный ключ, ключ копии в другом регионе, ключи данных и журнала действий.',
    kind: 'aws',
    control: fixed(
      'Шифрование базы, файлов, секретов и журнала держится на них.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'fixed',
      '$1 за ключ в месяц + $0,03 за 10 тыс. запросов',
      U.kms,
    ),
    usd: { launch: R(5), k100: R(5), m1: R(10) },
    needed: 'yes',
    neededNote: 'Нужны.',
    alarm: null,
    ceService: 'AWS Key Management Service',
    awsTypes: ['aws_kms_key', 'aws_kms_alias'],
  },
  {
    id: 'aws.guardduty',
    name: 'Охрана аккаунта (GuardDuty)',
    purpose:
      'Следит за журналами AWS и сетью, пишет вам при подозрительном: украденный ключ, майнер, странный вход.',
    kind: 'aws',
    control: tf(
      ['guardduty_enabled', 'guardduty_s3_events', 'guardduty_rds_login'],
      {
        on: 'guardduty_enabled = true',
        off: 'guardduty_enabled = false',
        auto: 'guardduty_s3_events = false  # оставить охрану, выключить дорогую часть про S3',
      },
    ),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'service_budgets',
      'Бюджет «Amazon GuardDuty» $25 в месяц (письмо при превышении)',
    ),
    price: price(
      'mixed',
      'От $1 за млн событий журнала + защита S3 $0,80 за млн событий + вход в базу по vCPU; на тихом аккаунте ≈ $4',
      U.gd,
      false,
    ),
    usd: { launch: R(4), k100: R(20), m1: R(300) },
    needed: 'yes',
    neededNote:
      'Оставлена ВКЛ по вашему решению о безопасности. При росте счёта первой выключайте часть про S3 (guardduty_s3_events).',
    alarm: 'бюджет «Amazon GuardDuty» $25 + Cost Anomaly',
    ceService: 'Amazon GuardDuty',
    awsTypes: ['aws_guardduty_detector', 'aws_guardduty_detector_feature'],
    note: 'V1',
  },
  {
    id: 'aws.cloudtrail',
    name: 'Журнал действий в аккаунте (CloudTrail)',
    purpose:
      'Кто и что менял в AWS. Первая копия бесплатна, хранится в закрытом хранилище.',
    kind: 'aws',
    control: fixed('Нужен для расследований и для GuardDuty.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'mixed',
      'Первая копия событий управления бесплатно; события данных $0,10 за 100 тыс.',
      U.ct,
    ),
    usd: { launch: R(0.5), k100: R(1), m1: R(5) },
    needed: 'yes',
    neededNote: 'Нужен.',
    alarm: null,
    ceService: 'AWS CloudTrail',
    awsTypes: ['aws_cloudtrail'],
  },
  {
    id: 'aws.athena',
    name: 'Поиск по журналу действий (Athena и Glue)',
    purpose:
      'Позволяет запросом найти, кто что сделал. Платите только за запросы.',
    kind: 'aws',
    control: tf(['cloudtrail_athena_enabled'], {
      off: 'cloudtrail_athena_enabled = false',
      on: 'cloudtrail_athena_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: null,
    price: price('unit', '$5 за ТБ просканированных данных', U.athena),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'later',
    neededNote:
      'Удобство для расследований, не обязательно. Бесплатна, пока вы не делаете запросов.',
    alarm: null,
    ceService: 'Amazon Athena',
    awsTypes: [
      'aws_athena_workgroup',
      'aws_athena_named_query',
      'aws_glue_catalog_database',
      'aws_glue_catalog_table',
    ],
  },
  {
    id: 'aws.backup',
    name: 'Резервные копии (AWS Backup + копия в другом регионе)',
    purpose:
      'Вернуть базу и файлы, если что-то сломается; копия лежит в us-west-2 на случай аварии региона.',
    kind: 'aws',
    control: tf(['backup_enabled', 'backup_retention_days'], {
      on: 'backup_enabled = true',
      off: 'backup_enabled = false',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: tfCeil('backup_retention_days', 'Сколько дней хранить копии'),
    price: price(
      'unit',
      '$0,05 за ГБ в месяц хранения + копия между регионами $0,02 за ГБ',
      U.backup,
    ),
    usd: { launch: R(3), k100: R(20), m1: R(60, 150) },
    needed: 'yes',
    neededNote: 'Нужны: без них потеря базы необратима.',
    alarm: 'тревога «копия слишком старая» (backup-stale)',
    ceService: 'AWS Backup',
    awsTypes: [
      'aws_backup_plan',
      'aws_backup_selection',
      'aws_backup_vault',
      'aws_backup_vault_lock_configuration',
      'aws_db_instance_automated_backups_replication',
    ],
  },
  {
    id: 'aws.s3',
    name: 'Файлы (S3): фото, документы, журналы, копия фото в другом регионе',
    purpose:
      'Все загруженные файлы. Фото копируются в другой регион на случай аварии.',
    kind: 'aws',
    control: tf(['replicate_media'], {
      on: 'replicate_media = true',
      off: 'replicate_media = false  # не копировать новые фото в другой регион',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      '$0,023 за ГБ в месяц + копия в другом регионе ещё столько же и $0,02 за ГБ пересылки',
      U.s3,
    ),
    usd: { launch: R(2), k100: R(40), m1: R(400) },
    needed: 'yes',
    neededNote:
      'Нужны. Копия фото (replicate_media, по умолчанию Вкл) растёт ровно вместе с оригиналом, поэтому отдельная тревога на размер копии не нужна: следите за тревогой роста хранилища.',
    alarm:
      'тревога роста хранилища за сутки (storage-growth); копия растёт один к одному с оригиналом (V12)',
    ceService: 'Amazon Simple Storage Service',
    awsTypes: [
      'aws_s3_bucket',
      'aws_s3_bucket_server_side_encryption_configuration',
      'aws_s3_bucket_public_access_block',
      'aws_s3_bucket_lifecycle_configuration',
      'aws_s3_bucket_versioning',
      'aws_s3_bucket_policy',
      'aws_s3_bucket_ownership_controls',
      'aws_s3_bucket_cors_configuration',
      'aws_s3_bucket_replication_configuration',
      'aws_s3_bucket_object_lock_configuration',
      'aws_s3_bucket_logging',
      'aws_s3_account_public_access_block',
    ],
    note: 'V12',
  },
  {
    id: 'aws.ecr',
    name: 'Хранилище образов серверов (ECR ×4)',
    purpose: 'Готовые образы API, админки, антивируса и пулера соединений.',
    kind: 'aws',
    control: fixed('Серверы запускаются из этих образов.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      '$0,10 за ГБ в месяц; старые образы стирает правило очистки',
      U.ecr,
    ),
    usd: { launch: R(1.5), k100: R(2), m1: R(3) },
    needed: 'yes',
    neededNote: 'Нужно.',
    alarm: null,
    ceService: 'Amazon EC2 Container Registry (ECR)',
    awsTypes: ['aws_ecr_repository', 'aws_ecr_lifecycle_policy'],
  },
  {
    id: 'aws.ses',
    name: 'Почта (Amazon SES)',
    purpose: 'Письма входа, чеки, уведомления.',
    kind: 'aws',
    control: capControl('email'),
    states: ['off', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'budget.email.monthly_max',
      'Лимит писем в месяц (админка → Лимиты)',
    ),
    price: price('unit', '$0,10 за 1000 писем', U.ses),
    usd: { launch: R(0.5), k100: R(30), m1: R(300) },
    needed: 'yes',
    neededNote:
      'Нужна для писем. Выкл останавливает все письма, включая вход по почте.',
    alarm: 'лимит расходов на письма (cost-guard, BUDGET_EMAIL_*)',
    ceService: 'Amazon Simple Email Service',
    awsTypes: [
      'aws_ses_domain_identity',
      'aws_ses_domain_dkim',
      'aws_ses_domain_mail_from',
      'aws_ses_configuration_set',
      'aws_sesv2_account_suppression_attributes',
    ],
    providers: ['ses'],
  },
  {
    id: 'aws.small_services',
    name: 'Мелочь AWS: планировщик, реестр имён, параметры, функции Lambda',
    purpose:
      'Запускает автомасштабы и ночные работы, хранит их настройки. Копейки.',
    kind: 'aws',
    control: fixed('Работают автомасштабы и ротация ключей.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      'Lambda первый 1 млн вызовов в месяц бесплатно; Cloud Map $0,10 за имя',
      U.lambda,
    ),
    usd: { launch: R(0.5), k100: R(1), m1: R(1) },
    needed: 'yes',
    neededNote: 'Нужна.',
    alarm: null,
    ceService: 'AWS Lambda',
    awsTypes: [
      'aws_lambda_function',
      'aws_lambda_permission',
      'aws_scheduler_schedule',
      'aws_ssm_parameter',
      'aws_service_discovery_service',
      'aws_service_discovery_private_dns_namespace',
      'aws_cloudformation_stack',
    ],
  },
  {
    id: 'aws.data_transfer',
    name: 'Исходящий трафик не через CloudFront',
    purpose: 'Ответы API, пуши, письма: первые 100 ГБ в месяц бесплатно.',
    kind: 'aws',
    control: fixed('Следует за использованием; видно по тревоге NAT.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      '$0,09 за ГБ после 100 ГБ в месяц',
      'https://aws.amazon.com/ec2/pricing/on-demand/#Data_Transfer',
    ),
    usd: { launch: R(1), k100: R(50), m1: R(500) },
    needed: 'yes',
    neededNote: 'Растёт только с использованием.',
    alarm: 'тревога NAT за сутки (nat-bytes)',
  },
  {
    id: 'aws.plumbing',
    name: 'Бесплатная «сантехника» AWS (права, сети, группы доступа, события)',
    purpose:
      'Роли IAM, подсети, группы безопасности, правила событий, оповещения, сертификаты. Сами по себе денег не берут.',
    kind: 'aws',
    control: fixed('Без них ничего из остального не соединить.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'free',
      'Бесплатно (оплата идёт за ресурсы, которые они соединяют)',
      U.vpc,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote: 'Нужна.',
    alarm: null,
    awsTypes: [
      'aws_iam_role',
      'aws_iam_role_policy',
      'aws_iam_role_policy_attachment',
      'aws_iam_policy',
      'aws_iam_instance_profile',
      'aws_iam_openid_connect_provider',
      'aws_iam_account_password_policy',
      'aws_security_group',
      'aws_security_group_rule',
      'aws_vpc_security_group_ingress_rule',
      'aws_vpc_security_group_egress_rule',
      'aws_vpc',
      'aws_subnet',
      'aws_route_table',
      'aws_route_table_association',
      'aws_internet_gateway',
      'aws_ecs_cluster',
      'aws_ecs_cluster_capacity_providers',
      'aws_ecs_task_definition',
      'aws_cloudwatch_event_rule',
      'aws_cloudwatch_event_target',
      'aws_sns_topic',
      'aws_sns_topic_policy',
      'aws_sns_topic_subscription',
      'aws_acm_certificate',
      'aws_acm_certificate_validation',
      'aws_accessanalyzer_analyzer',
      'aws_organizations_policy',
      'aws_organizations_policy_attachment',
    ],
  },
  {
    id: 'aws.budgets_anomaly',
    name: 'Бюджеты и «Охотник за аномалиями» расходов (Budgets, Cost Anomaly)',
    purpose:
      'Письма при 50/80/100 % месячного бюджета, при прогнозе выше бюджета и при внезапном росте любой службы; отдельные потолки на GuardDuty, WAF и CloudFront.',
    kind: 'aws',
    control: tf(['monthly_budget_usd', 'service_budgets'], {
      on: 'monthly_budget_usd = 350',
    }),
    states: ['on'],
    defaultState: 'on',
    ceiling: tfCeil(
      'monthly_budget_usd',
      'Месячный бюджет AWS (меняется и в админке «Масштаб»)',
    ),
    price: price(
      'mixed',
      'Два бюджета бесплатно, каждый следующий ≈ $0,60 в месяц; Cost Anomaly бесплатно',
      U.budgets,
    ),
    usd: { launch: R(1.2), k100: R(1.2), m1: R(1.2) },
    needed: 'yes',
    neededNote:
      'Нужны: это и есть ваша защита от сюрприза в счёте. Письма настроены на реальный день-1 ≈ $277–287, поправьте monthly_budget_usd под таблицу «Лестницы».',
    alarm: 'письма AWS Budgets (50/80/100 %) и Cost Anomaly',
    ceService: 'AWS Budgets',
    awsTypes: [
      'aws_budgets_budget',
      'aws_ce_anomaly_monitor',
      'aws_ce_anomaly_subscription',
    ],
    note: 'V3',
  },
  {
    id: 'aws.tf_state_lock',
    name: 'Замок и хранилище состояния Terraform',
    purpose:
      'Таблица блокировки Terraform, чтобы два человека не применили изменения одновременно.',
    kind: 'aws',
    control: fixed('Без замка опасно применять изменения.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('unit', 'DynamoDB по запросам: копейки', U.ddb),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote: 'Нужен.',
    alarm: null,
    awsTypes: ['aws_dynamodb_table'],
  },

  // =================== B. AWS, default OFF (owner may turn on) ===========
  {
    id: 'aws.container_insights',
    name: 'Подробные графики серверов (Container Insights)',
    purpose:
      'Детальные метрики по каждой копии сервера. Нужны только на время расследования.',
    kind: 'aws',
    control: tf(['container_insights'], {
      off: 'container_insights = false',
      on: 'container_insights = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'mixed',
      'Платные метрики и журналы CloudWatch ≈ $30 в месяц при нашем размере',
      U.cw,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(30),
    needed: 'later',
    neededNote:
      'Не нужно на старте. Включайте на время поиска причины тормозов, потом выключайте.',
    alarm: null,
  },
  {
    id: 'aws.turn_own',
    name: 'Свой сервер звонков (coturn, 2 штуки)',
    purpose:
      'Свои «ретрансляторы» для звонков вместо Cloudflare. Сейчас звонки идут через Cloudflare, свой сервер убран.',
    kind: 'aws',
    control: tf(['turn_enabled', 'turn_second_enabled'], {
      off: 'turn_enabled = false\nturn_second_enabled = false',
      on: 'turn_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'mixed',
      'Машина ≈ $12 в месяц каждая + исходящий трафик $0,09 за ГБ',
      U.ec2,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(12, 24),
    needed: 'no',
    neededNote:
      'Не нужен: звонки обслуживает Cloudflare TURN. Вернуть свой — docs/runbooks/TURN.md.',
    alarm: 'тревога трафика серверов звонков (traffic_alarm_gb_per_day)',
    ceService: 'Amazon Elastic Compute Cloud - Compute',
    awsTypes: ['aws_instance'],
    providers: ['turn'],
  },
  {
    id: 'aws.livekit',
    name: 'Свой сервер групповых видеозвонков (LiveKit)',
    purpose:
      'Видеозвонки на много людей через свою машину вместо Cloudflare SFU.',
    kind: 'aws',
    control: tf(['livekit_enabled'], {
      off: 'livekit_enabled = false',
      on: 'livekit_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'mixed',
      'Машина ≈ $32 в месяц + исходящий трафик $0,09 за ГБ',
      U.livekit,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(32),
    needed: 'later',
    neededNote: 'Если Cloudflare не хватит для групповых звонков.',
    alarm: 'тревога исходящего трафика LiveKit (livekit-egress)',
    providers: ['livekit'],
  },
  {
    id: 'aws.rds_proxy',
    name: 'Пул соединений базы (RDS Proxy)',
    purpose:
      'Не даёт базе захлебнуться от числа подключений, когда серверов много.',
    kind: 'aws',
    control: tf(['growth.db_proxy_enabled', 'growth.db_proxy_secret_arn'], {
      off: 'growth = { db_proxy_enabled = false }',
      on: 'growth = { db_proxy_enabled = true, db_proxy_secret_arn = "arn:aws:secretsmanager:…" }',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'fixed',
      '$0,015 за vCPU базы в час, минимум 2 vCPU ≈ $22 и выше',
      U.rds,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(25, 90),
    needed: 'later',
    neededNote:
      'Нужен раньше, чем серверов станет больше 16 (иначе не хватит соединений базы).',
    alarm: 'тревога соединений базы (db-connections)',
    awsTypes: [
      'aws_db_proxy',
      'aws_db_proxy_target',
      'aws_db_proxy_default_target_group',
    ],
  },
  {
    id: 'aws.rds_replicas',
    name: 'Копии базы только для чтения',
    purpose:
      'Поиск и ленты читают с копий, запись не мешает чтению. Включаются при росте.',
    kind: 'aws',
    control: tf(['growth.rds_read_replicas'], {
      off: 'growth = { rds_read_replicas = 0 }',
      on: 'growth = { rds_read_replicas = 1 }',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: tfCeil('growth.rds_read_replicas', 'Сколько копий (0–5)'),
    price: price(
      'fixed',
      'Как основная база того же размера, ≈ $190 за штуку для среднего размера',
      U.rds,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(200, 400) },
    ifOnUsd: R(190),
    needed: 'later',
    neededNote:
      'Около 100 тысяч человек. Автомасштаб базы на это время паузится (сам пришлёт письмо).',
    alarm: 'тревога соединений базы (db-connections)',
  },
  {
    id: 'aws.opensearch',
    name: 'Поисковый движок (OpenSearch)',
    purpose:
      'Быстрый поиск людей, дел и публикаций, когда поиск в базе замедлится.',
    kind: 'aws',
    control: tf(['growth.opensearch_enabled'], {
      off: 'growth = { opensearch_enabled = false }',
      on: 'growth = { opensearch_enabled = true }',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'fixed',
      't3.small ≈ $28 в месяц; три узла m6g.large ≈ $280',
      U.os,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(28, 280),
    needed: 'later',
    neededNote:
      'Когда поиск в базе тормозит. Включается в два шага: движок, затем настройка search.engine.',
    alarm: null,
    awsTypes: ['aws_opensearch_domain'],
    providers: ['opensearch'],
  },
  {
    id: 'aws.pgbouncer',
    name: 'Свой пул соединений базы (PgBouncer на Fargate)',
    purpose: 'Своя замена RDS Proxy: один «привратник» соединений перед базой.',
    kind: 'aws',
    control: tf(['db_pooler_enabled', 'pgbouncer_image'], {
      off: 'db_pooler_enabled = false',
      on: 'db_pooler_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: tfCeil('pgbouncer_max_tasks', 'Сколько копий привратника'),
    price: price('unit', '≈ $18 за копию в месяц', U.fargate),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(18, 70),
    needed: 'later',
    neededNote:
      'Вместо RDS Proxy, дешевле. Нужен раньше, чем серверов станет больше 16.',
    alarm: null,
  },
  {
    id: 'aws.security_hub',
    name: 'Проверки безопасности (Security Hub)',
    purpose: 'Каждые 12 часов сверяет аккаунт со стандартами CIS и AWS.',
    kind: 'aws',
    control: tf(['security_hub_enabled', 'securityhub_fsbp_enabled'], {
      off: 'security_hub_enabled = false',
      on: 'security_hub_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      '≈ $0,001 за проверку, несколько долларов в месяц',
      U.sec,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(5, 15),
    needed: 'later',
    neededNote: 'Перед аудитом безопасности или крупным клиентом.',
    alarm: null,
    awsTypes: [
      'aws_securityhub_account',
      'aws_securityhub_standards_subscription',
    ],
  },
  {
    id: 'aws.inspector',
    name: 'Поиск уязвимостей в образах (Inspector)',
    purpose: 'Сканирует образы серверов на известные дыры.',
    kind: 'aws',
    control: tf(['inspector_enabled'], {
      off: 'inspector_enabled = false',
      on: 'inspector_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      '$0,09 за образ при первом скане, дальше копейки',
      U.insp,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(1, 5),
    needed: 'later',
    neededNote:
      'Перед аудитом. Сканы образов уже есть в нашей проверке при сборке.',
    alarm: null,
    awsTypes: ['aws_inspector2_enabler'],
  },
  {
    id: 'aws.aws_config',
    name: 'Журнал настроек и правила соответствия (AWS Config)',
    purpose:
      'Записывает каждое изменение настроек и проверяет 11 правил (например, шифрование включено).',
    kind: 'aws',
    control: tf(['config_enabled'], {
      off: 'config_enabled = false',
      on: 'config_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      '$0,003 за запись об изменении + $0,001 за проверку правила',
      U.cfg,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(1, 4),
    needed: 'later',
    neededNote: 'Перед аудитом или крупным клиентом.',
    alarm: null,
    awsTypes: [
      'aws_config_configuration_recorder',
      'aws_config_configuration_recorder_status',
      'aws_config_delivery_channel',
      'aws_config_config_rule',
    ],
  },
  {
    id: 'aws.macie',
    name: 'Поиск личных данных в файлах (Macie)',
    purpose:
      'Сканирует хранилище документов и ищет номера и другие личные данные.',
    kind: 'aws',
    control: tf(['macie_enabled', 'macie_sampling_percentage'], {
      off: 'macie_enabled = false',
      on: 'macie_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: tfCeil(
      'macie_sampling_percentage',
      'Какой процент файлов сканировать',
    ),
    price: price('unit', '≈ $1 за ГБ просканированных данных', U.macie, false),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(1, 30),
    needed: 'later',
    neededNote: 'Только по требованию юристов или клиента.',
    alarm: null,
    awsTypes: ['aws_macie2_account', 'aws_macie2_classification_job'],
  },
  {
    id: 'aws.audit_logs',
    name: 'Журналы доступа и сетевые журналы (VPC flow logs, журналы балансировщика)',
    purpose:
      'Подробный след: кто куда ходил по сети. Лежат в закрытом хранилище с блокировкой.',
    kind: 'aws',
    control: tf(['audit_logs_enabled', 'vpc_flow_logs_traffic'], {
      off: 'audit_logs_enabled = false',
      on: 'audit_logs_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      'Приём $0,25 за ГБ + хранение S3; при traffic=ALL заметно больше',
      U.cw,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(2, 30),
    needed: 'later',
    neededNote: 'Для расследований и аудита.',
    alarm: null,
    awsTypes: ['aws_flow_log'],
  },
  {
    id: 'aws.waf_extra_rules',
    name: 'Дополнительные правила WAF (по устройству, подбор входа)',
    purpose:
      'Правила по заголовку устройства и по частоте попыток входа. Сначала только считают, потом блокируют.',
    kind: 'aws',
    control: tf(
      ['waf_device_header', 'waf_auth_rules_enabled', 'waf_auth_rate_action'],
      {
        off: 'waf_device_header = ""\nwaf_auth_rules_enabled = false',
        on: 'waf_device_header = "x-device-id"\nwaf_auth_rules_enabled = true\nwaf_auth_rate_action = "count"',
      },
    ),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'mixed',
      '$1 за правило в месяц + $0,60 за миллион проверенных запросов',
      U.waf,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(2, 5),
    needed: 'later',
    neededNote:
      'Когда начнутся подборы кодов и накрутка. Сначала режим count: правила только считают.',
    alarm: 'тревога WAF (waf-alb-requests)',
    ceService: 'AWS WAF',
    note: 'V2',
  },
  {
    id: 'aws.waf_bot_control',
    name: 'Фильтр ботов WAF Bot Control',
    purpose:
      'Платное правило, которое отличает ботов от людей. Сначала только считает.',
    kind: 'aws',
    control: tf(['waf_bot_control_enabled', 'waf_bot_control_block'], {
      off: 'waf_bot_control_enabled = false',
      on: 'waf_bot_control_enabled = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price('mixed', '$10 в месяц + $1 за миллион запросов', U.waf),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(10, 40),
    needed: 'later',
    neededNote: 'При подозрении на накрутку ботами.',
    alarm: 'тревога WAF (waf-alb-requests)',
    ceService: 'AWS WAF',
  },
  {
    id: 'aws.ha_extras',
    name: 'Запас на отказ зоны (второй NAT, двери во вторую зону, 2 копии API, копии базы в другом регионе)',
    purpose: 'Сайт переживает падение целой зоны AWS.',
    kind: 'aws',
    control: tf(
      [
        'nat_per_az',
        'interface_endpoint_azs',
        'api_min_tasks',
        'rds_cross_region_backups',
      ],
      {
        off: 'nat_per_az = false\napi_min_tasks = 1\nrds_cross_region_backups = false',
        on: 'nat_per_az = true\napi_min_tasks = 2\nrds_cross_region_backups = true',
      },
    ),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'fixed',
      'Второй NAT ≈ $33, вторая зона для дверей ≈ $29, вторая копия API ≈ $18, копии базы в другом регионе ≈ $2',
      U.vpc,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(82),
    needed: 'later',
    neededNote: 'Когда простой дороже $82 в месяц.',
    alarm: null,
  },
  {
    id: 'aws.graviton_spot',
    name: 'Дешёвые серверы (Graviton ARM и Spot)',
    purpose:
      'Те же серверы дешевле: ARM −20 %, Spot до −70 % на добавленных копиях.',
    kind: 'aws',
    control: tf(['cpu_architecture', 'api_spot', 'worker_spot'], {
      off: 'cpu_architecture = "X86_64"\napi_spot = false\nworker_spot = false',
      on: 'cpu_architecture = "ARM64"\napi_spot = true\nworker_spot = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'free',
      'Экономия, а не расход: −20 % на ARM, до −70 % на Spot',
      U.fargate,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'later',
    neededNote:
      'После сборки образов под ARM: см. docs/runbooks/ARM64_SPOT.md.',
    alarm: null,
  },
  {
    id: 'aws.guardduty_extras',
    name: 'GuardDuty: проверка дисков на вирусы и защита работающих серверов',
    purpose: 'Платные добавки к охране аккаунта; для Fargate почти не нужны.',
    kind: 'aws',
    control: tf(['guardduty_ebs_malware', 'guardduty_runtime_monitoring'], {
      off: 'guardduty_ebs_malware = false\nguardduty_runtime_monitoring = false',
      on: 'guardduty_runtime_monitoring = true',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      'Диски $0,03 за ГБ после находки; серверы $1,50 за vCPU в месяц',
      U.gd,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(5, 50),
    needed: 'no',
    neededNote: 'Не нужно: при включении ещё и меняет запуск серверов.',
    alarm: 'бюджет «Amazon GuardDuty» $25',
    ceService: 'Amazon GuardDuty',
    note: 'V1',
  },
  {
    id: 'aws.synthetics',
    name: 'Проверка сайта «как человек» (Synthetics canary)',
    purpose: 'Робот открывает страницы и проверяет вход.',
    kind: 'aws',
    control: tf(['uptime_check'], {
      off: 'uptime_check = "route53"',
      on: 'uptime_check = "synthetics"',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      '$0,0012 за запуск, раз в 5 минут ≈ $10 в месяц',
      'https://aws.amazon.com/cloudwatch/pricing/',
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(8),
    needed: 'later',
    neededNote: 'Route 53 уже сообщает, жив ли сайт.',
    alarm: null,
    awsTypes: ['aws_synthetics_canary'],
  },
  {
    id: 'aws.fis',
    name: 'Учения на отказ (AWS Fault Injection)',
    purpose:
      'Шаблоны «остановить серверы» и «отказ базы» для репетиции аварии. Деньги только в минуты запуска.',
    kind: 'aws',
    control: fixed('Только шаблоны: без запуска вручную ничего не стоят.'),
    states: ['off'],
    defaultState: 'off',
    ceiling: null,
    price: price('unit', '$0,10 за минуту действия при запуске', U.fis),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'no',
    neededNote:
      'Запускается вручную во время учений (docs/runbooks/GAMEDAY.md).',
    alarm: null,
    awsTypes: ['aws_fis_experiment_template'],
  },

  // ====================== C. Outside vendors ===========================
  {
    id: 'vendor.twilio',
    name: 'SMS-коды входа (Twilio)',
    purpose: 'Код подтверждения телефона при регистрации и сбросе пароля.',
    kind: 'vendor',
    control: capControl('sms'),
    states: ['off', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'budget.sms.monthly_max',
      'Лимит SMS в месяц (админка → Лимиты)',
    ),
    price: price(
      'mixed',
      'Номер $1,15 в месяц + регистрация SMS (10DLC) + США ≈ $0,0115 за SMS с налогами операторов',
      U.twilio,
      false,
    ),
    usd: { launch: R(2, 12), k100: R(1150), m1: R(10000) },
    needed: 'yes',
    neededNote:
      'Нужен для регистрации. Рост — главная переменная статья на 10 тысячах человек; вход по паролю (PR #162) режет её. Выкл останавливает все SMS.',
    alarm: 'лимит SMS в деньгах (cost-guard, BUDGET_SMS_*) + тревога sms-spend',
    spendVendor: { id: 'twilio' },
    providers: ['twilio'],
    note: 'V11',
  },
  {
    id: 'vendor.stripe',
    name: 'Платежи (Stripe: 2,9 % + 30 ц, Tax, Connect)',
    purpose: 'Приём подписок и платежей от клиентов юристам.',
    kind: 'vendor',
    control: fixed(
      'Деньги от клиентов идут через него; комиссию Stripe удерживает сам из платежей.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      '2,9 % + $0,30 с платежа; Tax и Connect — отдельные тарифы',
      U.stripe,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Нужен. Это процент от выручки, а не счёт: в «держать на счету» не входит.',
    alarm: 'тревоги платежей (payments-failed, stripe-webhooks)',
    spendVendor: { id: 'stripe' },
    providers: ['stripe'],
  },
  {
    id: 'vendor.bunny',
    name: 'Видео (Bunny Stream)',
    purpose: 'Загрузка видео с телефона, кодирование, раздача.',
    kind: 'vendor',
    control: {
      type: 'app-setting',
      key: 'scale.bunny_hardstop.mode',
      map: { off: 'off', on: 'on', auto: 'auto' },
    },
    states: ['off', 'on', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'budget.video.monthly_max',
      'Лимит минут видео в месяц (админка → Лимиты); порог паузы: usage.bunny_bandwidth_crit_gb и usage.bunny_storage_crit_gb (админка → Настройки)',
    ),
    price: price(
      'mixed',
      'Хранение $0,01 за ГБ, раздача $0,005 за ГБ, минимум $1 в месяц',
      U.bunny,
    ),
    usd: { launch: R(1), k100: R(100, 400), m1: R(3000, 8000) },
    needed: 'yes',
    neededNote:
      'Авто: новые загрузки видео ставятся на паузу, когда трафик или хранилище Bunny дошли до срочного порога. Вкл = пауза сейчас. Выкл = не останавливать никогда. Просмотр уже загруженного не трогается.',
    alarm:
      'тревоги трафика и хранилища Bunny (usage-bunny-*) + лимит минут видео в деньгах (BUDGET_VIDEO_*)',
    spendVendor: { id: 'bunny' },
    providers: ['bunny_stream'],
    note: 'V7',
  },
  {
    id: 'vendor.cloudflare_calls',
    name: 'Звонки и видеозвонки (Cloudflare TURN и SFU)',
    purpose:
      'Ретранслятор звонков и сервер групповых видеозвонков. Первый 1 ТБ в месяц бесплатно.',
    kind: 'vendor',
    control: {
      type: 'app-setting',
      key: 'scale.cloudflare_hardstop.mode',
      map: { off: 'off', on: 'on', auto: 'auto' },
    },
    states: ['off', 'on', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'usage.cloudflare_egress_crit_gb',
      'Срочный порог трафика звонков в ГБ в месяц (по умолчанию 950 из 1000 бесплатных)',
    ),
    price: price(
      'unit',
      'Бесплатно до 1 ТБ в месяц, дальше $0,05 за ГБ',
      U.cft,
    ),
    usd: { launch: R(0), k100: R(0, 100), m1: R(2000, 5000) },
    needed: 'yes',
    neededNote:
      'Авто: когда бесплатный терабайт почти исчерпан, групповые звонки возвращаются на «устройство-устройство» (на видео до 4 человек, остальным только звук), чтобы не платить сверх. Вкл = вернуть сейчас. Звонки не отключаются.',
    alarm: 'тревоги трафика звонков (usage-cf-warn / usage-cf-crit)',
    spendVendor: { id: 'cloudflare', line: 'Звонки' },
    providers: ['cloudflare_turn', 'cloudflare_sfu'],
    note: 'V7',
  },
  {
    id: 'vendor.cloudflare_r2',
    name: 'Публичные фото в Cloudflare R2 вместо S3',
    purpose:
      'Хранит публичные фото; раздача без платы за трафик. Сейчас выключено, фото лежат в S3.',
    kind: 'vendor',
    control: {
      type: 'app-setting',
      key: 'media.public_store',
      map: { off: 'aws', on: 'r2' },
    },
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      '10 ГБ бесплатно, затем $0,015 за ГБ; раздача бесплатна',
      U.r2,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'later',
    neededNote:
      'Дешевле CloudFront, когда фото-трафик превысит 1 ТБ в месяц. Нужны ключи в «Ключи и сервисы».',
    alarm: 'тревоги r2 (r2-storage-high)',
    spendVendor: { id: 'cloudflare', line: 'Фото и медиа' },
    providers: ['cloudflare_r2', 'storage'],
  },
  {
    id: 'vendor.google_translate',
    name: 'Перевод (Google Translate)',
    purpose: 'Перевод постов, чата, дел и профилей.',
    kind: 'vendor',
    control: capControl('translate'),
    states: ['off', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'budget.translate.monthly_max',
      'Лимит знаков перевода в месяц (админка → Лимиты)',
    ),
    price: price('unit', '$20 за миллион знаков', U.gtr),
    usd: { launch: R(0), k100: R(50, 500), m1: R(5000) },
    needed: 'later',
    neededNote:
      'Платит только при наличии ключа. Выкл останавливает перевод у всех.',
    alarm:
      'лимит перевода в деньгах (BUDGET_TRANSLATE_*, лимит на человека в день $5)',
    providers: ['google_translate'],
  },
  {
    id: 'vendor.rekognition',
    name: 'Проверка картинок на запрещённое (AWS Rekognition)',
    purpose:
      'Смотрит загруженные фото на запрещённое содержимое (требование магазинов приложений).',
    kind: 'vendor',
    control: {
      type: 'app-setting',
      key: 'moderation.image.enabled',
      map: { off: false, on: true },
    },
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: setCeil(
      'budget.image_moderation.monthly_max',
      'Лимит проверок в месяц (админка → Лимиты)',
    ),
    price: price('unit', '$0,001 за картинку', U.rek),
    usd: { launch: R(0), k100: R(50, 100), m1: R(1000) },
    needed: 'yes',
    neededNote: 'Нужна для магазинов (пункт 1.2 Apple). Копейки.',
    alarm: 'лимит проверок картинок в деньгах (BUDGET_IMAGE_MODERATION_*)',
    ceService: 'Amazon Rekognition',
    providers: ['aws_rekognition', 'photodna', 'ncmec'],
  },
  {
    id: 'vendor.persona',
    name: 'Проверка личности юриста (Persona)',
    purpose: 'Подтверждает документ и лицо юриста. Платите за каждую проверку.',
    kind: 'vendor',
    control: capControl('id_check'),
    states: ['off', 'auto'],
    defaultState: 'auto',
    ceiling: setCeil(
      'budget.id_check.monthly_max',
      'Лимит проверок в месяц (админка → Лимиты)',
    ),
    price: price(
      'unit',
      '≈ $1,50 за проверку (уточнить в кабинете)',
      U.persona,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'later',
    neededNote: 'По мере заявок юристов. Платит только при наличии ключа.',
    alarm: 'лимит проверок личности в деньгах (BUDGET_ID_CHECK_*)',
    providers: ['persona'],
    note: 'V11',
  },
  {
    id: 'vendor.push',
    name: 'Пуши (Firebase FCM и Apple APNs)',
    purpose: 'Уведомления на телефон.',
    kind: 'vendor',
    control: fixed('Без них нет уведомлений о сообщениях и звонках.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('free', 'Бесплатно', U.fb),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote: 'Нужны.',
    alarm: 'тревога сбоев пушей (push-failed)',
    providers: ['fcm', 'apns'],
  },
  {
    id: 'vendor.calendar',
    name: 'Календари юристов (Google Calendar, Microsoft 365)',
    purpose:
      'Синхронизация консультаций с календарём, который юрист сам подключил (#395).',
    kind: 'vendor',
    control: fixed(
      'Работает только у юриста, который подключил свой календарь; без подключения запросов нет.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'free',
      'Бесплатно: Google Calendar API и Microsoft Graph не берут денег, есть только лимиты запросов',
      U.gcal,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'later',
    neededNote: 'Удобство для юристов; не нужно для запуска.',
    alarm: null,
    providers: ['google_calendar', 'microsoft_calendar'],
  },
  {
    id: 'vendor.sentry',
    name: 'Учёт ошибок (Sentry)',
    purpose: 'Сообщает о сбоях в API, воркере, админке и приложении.',
    kind: 'vendor',
    control: fixed(
      'Включается, если задан SENTRY_DSN (Ключи и сервисы). Режет шум: sampleRate и пропуск повторов.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'mixed',
      'Бесплатный тариф с лимитом событий; дальше от $26 за месяц',
      U.sentry,
      false,
    ),
    usd: { launch: R(0), k100: R(26, 80), m1: R(89) },
    needed: 'yes',
    neededNote:
      'Нужен. Зациклившийся сбой может съесть месячную квоту за час: в коде одна и та же ошибка уходит не чаще 5 раз в минуту, всего не больше 120 событий в минуту с процесса; в самом Sentry поставьте «Spike protection» и лимит на проект (шаги в таблице).',
    alarm: null,
    providers: ['sentry'],
    extraSteps: [
      'В Sentry (sentry.io) → Settings → Projects → выберите проект → Client Keys (DSN) → Rate Limits: поставьте, например, 500 событий в час.',
      'В Sentry → Settings → Subscription → включите Spend Allocation / On-Demand Budget = 0, чтобы сверх квоты ничего не списывалось.',
    ],
    note: 'V9',
  },
  {
    id: 'vendor.pagerduty',
    name: 'Звонок вам при серьёзной беде (PagerDuty)',
    purpose: 'Срочные тревоги приходят звонком и SMS.',
    kind: 'vendor',
    control: fixed('Подключается ссылкой в «Ключи и сервисы».'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'free',
      'Бесплатный тариф: 100 звонков и SMS в месяц',
      U.pd,
      false,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(21) },
    needed: 'yes',
    neededNote: 'Нужен.',
    alarm: null,
    providers: ['pagerduty'],
  },
  {
    id: 'vendor.app_check',
    name: 'Проверка «настоящее ли приложение» (Firebase App Check, reCAPTCHA Enterprise)',
    purpose:
      'Отсекает ботов и накрутку SMS. Приложения проверяются бесплатно; для сайта нужна reCAPTCHA Enterprise.',
    kind: 'vendor',
    control: {
      type: 'app-setting',
      key: 'security.app_check.mode',
      map: { off: 'off', on: 'monitor', auto: 'enforce' },
    },
    states: ['off', 'on', 'auto'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'mixed',
      'App Attest и Play Integrity бесплатно; reCAPTCHA Enterprise бесплатно до 10 тысяч проверок в месяц, дальше платно (цену уточнить)',
      U.recaptcha,
      false,
    ),
    usd: { launch: R(0), k100: R(0, 100), m1: R(1000) },
    needed: 'yes',
    neededNote:
      'Нужна против накрутки SMS. Вкл = только наблюдать (monitor), Авто = блокировать чужих (enforce). Выкл отключает проверку на сервере, но сайт продолжает запрашивать токен у Google: чтобы остановить и это, уберите ключ reCAPTCHA в Firebase.',
    alarm: null,
    note: 'V8',
  },
  {
    id: 'vendor.turnstile',
    name: 'Проверка «человек ли» (Cloudflare Turnstile)',
    purpose: 'Бесплатная капча на форме входа.',
    kind: 'vendor',
    control: {
      type: 'app-setting',
      key: 'security.turnstile.mode',
      map: { off: 'off', on: 'monitor', auto: 'enforce' },
    },
    states: ['off', 'on', 'auto'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'free',
      'Бесплатно',
      'https://www.cloudflare.com/application-services/products/turnstile/',
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'later',
    neededNote: 'Включайте при волне накрутки.',
    alarm: null,
    providers: ['turnstile'],
  },
  {
    id: 'vendor.registry_only',
    name: 'Остальные ключи в «Ключи и сервисы» без расходов',
    purpose:
      'Вход через Google/Apple, реестр юристов штата, проверка бэкапа внешней базы, GitHub. Своих счетов нет.',
    kind: 'vendor',
    control: fixed('Только ключи и проверки; денег не берут.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('free', 'Бесплатно', U.fb),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'no',
    neededNote:
      'cockroach_cloud — устаревшее имя проверки бэкапа, расходов нет.',
    alarm: null,
    providers: [
      'google_signin',
      'apple_signin',
      'ny_registry',
      'cockroach_cloud',
      'github',
    ],
  },
  {
    id: 'vendor.otel',
    name: 'Экспорт трассировок (OpenTelemetry)',
    purpose:
      'Отправка трассировок во внешнюю систему наблюдения. Сейчас выключено.',
    kind: 'vendor',
    control: fixed(
      'Включается, только если задан OTEL_EXPORTER_OTLP_ENDPOINT.',
    ),
    states: ['off'],
    defaultState: 'off',
    ceiling: null,
    price: price('free', 'Нет конечной точки — нет расхода', U.sentry, false),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'no',
    neededNote: 'Не нужен.',
    alarm: null,
  },

  // ============ H. Hidden costs and load (owner rule 2026-10-26) =======
  // Things that charge, load or slow us just by running. Ids start with
  // `hidden.`; the admin and the ladder show them in their own section.
  {
    id: 'hidden.cost_explorer_reads',
    name: 'Чтение счёта AWS (Cost Explorer) для страницы «Расходы»',
    purpose:
      'Каждое чтение стоит $0,01. Страница берёт данные из снимка и просит AWS не чаще раза в 6 часов.',
    kind: 'aws',
    control: fixed(
      'Не чаще 4 запросов в сутки (код spend.service.ts, AWS_MIN_INTERVAL_MS); кнопка «Обновить» тоже ограничена.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      '$0,01 за запрос Cost Explorer ≈ $1,2 в месяц при 4 запросах в сутки',
      'https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/',
    ),
    usd: { launch: R(1.2), k100: R(1.2), m1: R(1.2) },
    needed: 'yes',
    neededNote:
      'Нагрузка: 4 запроса в сутки к AWS. Нужно, это глаза на расходы.',
    alarm: null,
  },
  {
    id: 'hidden.economy_tick',
    name: 'Проверка «Экономики» каждые 5 минут (задача economy.guard)',
    purpose:
      'Читает нагрузку базы и Redis в CloudWatch, считает допустимый расход, ставит потолки серверов и размера базы.',
    kind: 'aws',
    control: fixed(
      'Выключается флагом economy_guard (админка → Флаги): тогда потолки не пересчитываются и снимаются.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      'Запросы метрик CloudWatch $0,01 за 1000: ≈ 600 запросов в сутки ≈ $0,2 в месяц',
      U.cw,
    ),
    usd: { launch: R(0.2), k100: R(0.2), m1: R(0.2) },
    needed: 'auto',
    neededNote:
      'Нагрузка: 288 запусков в сутки, несколько запросов к CloudWatch и Redis каждый. Копейки.',
    alarm: null,
  },
  {
    id: 'hidden.autoscale_lambdas',
    name: 'Запуски автомасштабов базы и Redis каждые 5 минут',
    purpose:
      'Две функции Lambda смотрят нагрузку; ночью проверяют, можно ли уменьшить.',
    kind: 'aws',
    control: { type: 'ssm-mode', target: 'db' },
    states: ['off', 'on', 'auto'],
    defaultState: 'auto',
    ceiling: null,
    price: price(
      'free',
      'Lambda: первый миллион запусков в месяц бесплатно (у нас ≈ 17 тысяч)',
      U.lambda,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'auto',
    neededNote:
      'Нагрузка: 576 запусков в сутки на двоих. Те же переключатели, что у строк «Автомасштаб базы / Redis» выше (здесь показан переключатель базы).',
    alarm: null,
  },
  {
    id: 'hidden.cron_jobs',
    name: 'Периодические фоновые задачи (рекомендации, теги, пересчёты, очистки)',
    purpose:
      'Рекомендации и теги каждые 10 минут, пересчёты счётчиков, ночные очистки. Дают нагрузку на базу и Redis.',
    kind: 'aws',
    control: {
      type: 'app-setting',
      key: 'ops.auto_pause_heavy_jobs',
      map: { off: false, on: true },
    },
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: setCeil(
      'ops.db_slow_ms',
      'Сколько миллисекунд ответа базы считается «тормозит»',
    ),
    price: price(
      'free',
      'Своих денег не берут: нагрузка на базу и воркер',
      U.fargate,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Нагрузка: тяжёлые задачи сами встают на паузу на 15 минут, когда база тормозит (положение Вкл = Авто по сигналу). Выкл = не ставить на паузу.',
    alarm: 'тревога «база медленная» (db-slow)',
  },
  {
    id: 'hidden.logs_metrics',
    name: 'Объём журналов и метрик на каждый запрос',
    purpose:
      'Каждый запрос пишет строку журнала; фильтры превращают строки в метрики; отладочный уровень журнала увеличивает счёт в разы.',
    kind: 'aws',
    control: fixed(
      'Уровень журнала задаёт LOG_LEVEL сервера (по умолчанию info); срок хранения журналов задан в Terraform.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      'Приём журналов $0,50 за ГБ, хранение $0,03 за ГБ в месяц',
      U.cw,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Нагрузка: растёт с числом запросов; уже учтено в строке «Тревоги, графики и журналы». Не оставляйте LOG_LEVEL=debug на проде.',
    alarm: 'бюджет месяца; Cost Anomaly',
  },
  {
    id: 'hidden.health_checks',
    name: 'Проверки «жив ли сайт» каждые 30–60 секунд',
    purpose:
      'Route 53 стучится на сайт снаружи; /health/ready проверяет базу и Redis на каждый такой стук.',
    kind: 'aws',
    control: tf(['uptime_check'], {
      off: 'uptime_check = "off"',
      on: 'uptime_check = "route53"',
    }),
    states: ['off', 'on'],
    defaultState: 'on',
    ceiling: null,
    price: price('fixed', 'Уже в строке «Проверка жив ли сайт» ≈ $2', U.r53),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Нагрузка: около 2 880 запросов в сутки к одному адресу. Нужна, отключать не советуем.',
    alarm: null,
  },
  {
    id: 'hidden.usage_poll',
    name: 'Ежедневный опрос Cloudflare и Bunny (usage-poll) и сторонних счетов',
    purpose:
      'Раз в сутки читает трафик звонков и видео, счета Twilio, Stripe, Bunny, Cloudflare для страницы «Расходы» и порогов.',
    kind: 'vendor',
    control: fixed(
      'Раз в сутки; каждый сервис не чаще раза в 15 минут при нажатии «Обновить». API читают бесплатно.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('free', 'Чтение статистики у поставщиков бесплатно', U.cft),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Нагрузка: пять коротких запросов в сутки. Питает паузы Bunny и Cloudflare.',
    alarm: 'тревога «опрос расхода не удался» (usage-poll-failed)',
  },
  {
    id: 'hidden.cdn_invalidations',
    name: 'Сброс кэша CloudFront при выкладке сайта',
    purpose:
      'После каждой выкладки сайта (web-deploy) кэш сбрасывается, чтобы люди видели новую версию.',
    kind: 'aws',
    control: fixed(
      'Переменная репозитория WEB_DEPLOY_ENABLED=false останавливает выкладку сайта вместе со сбросом кэша.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      'Первые 1000 путей в месяц бесплатно, дальше $0,005 за путь',
      U.cf,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Нагрузка: пара сбросов на выкладку, до 8 путей на выкладку. Расход только при сотнях выкладок в месяц.',
    alarm: null,
  },
  {
    id: 'hidden.canary',
    name: 'Проверки-роботы (Synthetics) и нагрузочные прогоны',
    purpose:
      'Робот каждые 5 минут проходит сайт (выключен); нагрузочные тесты поднимают временный стенд.',
    kind: 'aws',
    control: tf(['uptime_check'], {
      off: 'uptime_check = "route53"',
      on: 'uptime_check = "synthetics"',
    }),
    states: ['off', 'on'],
    defaultState: 'off',
    ceiling: null,
    price: price('unit', '≈ $8–10 в месяц, если включить', U.cw),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    ifOnUsd: R(8),
    needed: 'later',
    neededNote:
      'Нагрузка: 8 640 запусков в месяц робота. Выключено; стенд нагрузочных тестов сам гасится через 4 часа.',
    alarm: 'сторож load-test-watchdog',
  },

  // ============ D. Apps, admin, web, CI, accounts ======================
  {
    id: 'sdk.apple_developer',
    name: 'Аккаунт Apple Developer ($99 в год)',
    purpose: 'Публикация приложения в App Store.',
    kind: 'sdk',
    control: fixed('Без него нет приложения для iPhone.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('fixed', '$99 в год', U.apple),
    usd: { launch: R(8.25), k100: R(8.25), m1: R(8.25) },
    needed: 'yes',
    neededNote: 'Нужен. Платите раз в год.',
    alarm: null,
  },
  {
    id: 'sdk.google_play',
    name: 'Аккаунт Google Play ($25 один раз)',
    purpose: 'Публикация приложения для Android.',
    kind: 'sdk',
    control: fixed('Без него нет приложения для Android.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('fixed', '$25 один раз', U.play),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote: 'Нужен; уже оплачен.',
    alarm: null,
  },
  {
    id: 'sdk.domain',
    name: 'Домен lawbid.dev (Namecheap)',
    purpose: 'Адрес сайта, почты и API.',
    kind: 'sdk',
    control: fixed('Без домена всё перестанет открываться.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price('fixed', '≈ $14 в год', U.ns, false),
    usd: { launch: R(1.2), k100: R(1.2), m1: R(1.2) },
    needed: 'yes',
    neededNote: 'Нужен.',
    alarm: null,
  },
  {
    id: 'sdk.maps_analytics',
    name: 'Карты, аналитика, платные ML и подобные пакеты в приложениях',
    purpose:
      'В коде приложения, админки и API платных пакетов (Google Maps, Mapbox, аналитика, Agora) не найдено. Перевод и язык на устройстве бесплатны (Google ML Kit).',
    kind: 'sdk',
    control: fixed('Нечего выключать: платных SDK нет.'),
    states: ['off'],
    defaultState: 'off',
    ceiling: null,
    price: price('free', 'Бесплатно', U.fb),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'no',
    neededNote:
      'Если такой пакет когда-нибудь появится, он обязан получить строку здесь.',
    alarm: null,
  },
  {
    id: 'ci.github_actions',
    name: 'Проверки и выкладка (GitHub Actions)',
    purpose:
      'Автоматические проверки кода, сборка, ночные тесты, еженедельный CodeQL.',
    kind: 'ci',
    control: fixed(
      'Репозиторий публичный, поэтому минуты бесплатны (включая macOS). Выключатели: переменные репозитория DEPLOY_ENABLED и WEB_DEPLOY_ENABLED.',
    ),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'free',
      'Бесплатно, пока репозиторий публичный; иначе $0,008 за минуту Linux и $0,08 за минуту macOS',
      U.gh,
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'yes',
    neededNote:
      'Если репозиторий станет приватным, расход появится сразу: ≈ $50-200 в месяц. Не делайте его приватным, не прочитав эту строку.',
    alarm: null,
    note: 'V13',
  },
  {
    id: 'ci.load_test',
    name: 'Стенд нагрузочных тестов в AWS',
    purpose:
      'Временный стенд для проверки нагрузки: поднимается кнопкой, сам удаляется через 4 часа.',
    kind: 'ci',
    control: fixed(
      'Запускается вручную кнопкой в GitHub Actions; сторож гасит через 4 часа.',
    ),
    states: ['off'],
    defaultState: 'off',
    ceiling: null,
    price: price(
      'unit',
      'Один прогон: $1,3 (дым), $7-10 (средний), $20-30 (большой), звонки $1,4-4,6',
      'https://aws.amazon.com/fargate/pricing/',
    ),
    usd: { launch: R(0), k100: R(0), m1: R(0) },
    needed: 'no',
    neededNote: 'Деньги только во время прогона.',
    alarm: 'сторож load-test-watchdog гасит стенд старше 4 часов',
  },
  {
    id: 'sdk.web_edge',
    name: 'Функция сайта на краю CloudFront (KeyValueStore и viewer-request)',
    purpose:
      'Подсказывает, какую страницу отдавать; 2-3 чтения справочника на запрос.',
    kind: 'sdk',
    control: fixed('Часть сайта.'),
    states: ['on'],
    defaultState: 'on',
    ceiling: null,
    price: price(
      'unit',
      '$0,03 за миллион чтений + $0,10 за миллион вызовов функции',
      U.cf,
    ),
    usd: { launch: R(0), k100: R(5, 30), m1: R(30, 150) },
    needed: 'yes',
    neededNote: 'Растёт только с посещаемостью сайта.',
    alarm: null,
    awsTypes: ['aws_cloudfront_function', 'aws_cloudfront_key_value_store'],
  },
];

// ---------------------------------------------------------------------------
// Pure helpers (also used by the generator script and the admin page).
// ---------------------------------------------------------------------------

export type Scenario = 'launch' | 'k100' | 'm1';

export const mid = (r: Range): number => (r[0] + r[1]) / 2;

export const SCENARIO_USERS: Record<Scenario, number> = {
  launch: 0,
  k100: 100_000,
  m1: 1_000_000,
};

/** Plain-Russian label of a state. */
export const STATE_LABEL: Record<CostState, string> = {
  off: 'Выкл',
  on: 'Вкл',
  auto: 'Авто',
};

/** Entries on the day-1 bill: everything that is not switched off by default. */
export function dayOneEntries(): CostEntry[] {
  return COST_REGISTRY.filter(
    (e) => e.defaultState !== 'off' && mid(e.usd.launch) > 0,
  );
}

/** Total $/month of the day-1 lines, by group. */
export function dayOneTotals(): {
  aws: Range;
  vendors: Range;
  all: Range;
} {
  const sum = (kind: (e: CostEntry) => boolean): Range => {
    let lo = 0;
    let hi = 0;
    for (const e of COST_REGISTRY) {
      if (e.defaultState === 'off' || !kind(e)) continue;
      lo += e.usd.launch[0];
      hi += e.usd.launch[1];
    }
    return [Math.round(lo), Math.round(hi)];
  };
  const aws = sum((e) => e.kind === 'aws');
  const vendors = sum((e) => e.kind !== 'aws');
  return {
    aws,
    vendors,
    all: [aws[0] + vendors[0], aws[1] + vendors[1]],
  };
}

/** Total $/month at a user count, switched-on defaults only. */
export function totalAt(s: Scenario): Range {
  let lo = 0;
  let hi = 0;
  for (const e of COST_REGISTRY) {
    if (e.defaultState === 'off') continue;
    lo += e.usd[s][0];
    hi += e.usd[s][1];
  }
  return [Math.round(lo), Math.round(hi)];
}

/** The user counts the «Лестница расходов» shows. */
export const LADDER_USERS = [1_000, 10_000, 100_000, 1_000_000] as const;

/**
 * Total $/month at [users], switched-on defaults only. 100k and 1M are the
 * registry's own columns; below 100k the bill is the launch bill plus the
 * same share of the growth to 100k as the share of users (a rough straight
 * line; the page says so).
 */
export function totalAtUsers(users: number): Range {
  if (users >= 1_000_000) return totalAt('m1');
  if (users >= 100_000) return totalAt('k100');
  const l = totalAt('launch');
  const k = totalAt('k100');
  const f = Math.max(0, users) / 100_000;
  return [
    Math.round(l[0] + (k[0] - l[0]) * f),
    Math.round(l[1] + (k[1] - l[1]) * f),
  ];
}

export function entryById(id: string): CostEntry | undefined {
  return COST_REGISTRY.find((e) => e.id === id);
}

/** Terraform / SSM / app steps (plain Russian) to put [entry] in [state]. */
export function stepsFor(entry: CostEntry, state: CostState): string[] {
  const c = entry.control;
  const label = STATE_LABEL[state];
  if (c.type === 'app-setting') {
    return [
      `Админка → «Расходы» → строка «${entry.name}» → выберите «${label}» → подтвердите кодом 2FA.`,
      `Это меняет настройку ${c.key}; изменение сразу попадает в журнал действий.`,
      ...(entry.extraSteps ?? []),
    ];
  }
  if (c.type === 'ssm-mode') {
    return [
      `Админка → «Расходы» → строка «${entry.name}» → выберите «${label}» → подтвердите кодом 2FA.`,
      'Переключатель лежит в AWS Systems Manager (Parameter Store) и действует на следующем запуске (до 5 минут).',
      ...(entry.extraSteps ?? []),
    ];
  }
  if (c.type === 'tfvars') {
    const line = c.lines[state];
    if (!line) {
      return [
        `Положение «${label}» для этой строки не предусмотрено: смотрите, какие положения доступны, в таблице.`,
      ];
    }
    return [
      'Откройте файл infra/envs/prod/terraform.tfvars (его нет в репозитории, он только у вас на Mac).',
      `Впишите или замените строку: ${line.replace(/\n/g, ' ; ')}`,
      'Попросите Claude: «примени Terraform» (он выполнит terraform plan, прогонит plan-guard.sh и покажет вам итог).',
      'Прочитайте итог плана (строку Plan: X to add, Y to change, Z to destroy) и скажите «да».',
      ...(entry.extraSteps ?? []),
    ];
  }
  return [c.reason, ...(entry.extraSteps ?? [])];
}
