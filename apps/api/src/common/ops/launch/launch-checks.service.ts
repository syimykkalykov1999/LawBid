import { promises as dns } from 'node:dns';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretsService } from '../../secrets/secrets.service';
import {
  AwsBudgetsAdminService,
  AwsCostService,
  PagerDutySnsService,
} from './aws-launch.service';

export type LaunchStatus = 'green' | 'yellow' | 'red' | 'manual';

export interface LaunchItem {
  id: string;
  group:
    'release' | 'calls' | 'media' | 'alerts' | 'money' | 'safety' | 'servers';
  title: string;
  status: LaunchStatus;
  /** One plain Russian sentence: what we see now. */
  detail: string;
  /** What to do when it is not green. */
  hint: string | null;
  runbook: string | null;
  /** The owner may tick it by hand (nothing detects it). */
  manualTick: boolean;
  /** Ticked by hand (status is then green). */
  ticked: boolean;
  /** A button on the row: only the restore drill uses it. */
  action: 'restore_drill' | null;
}

export interface LaunchReport {
  generatedAt: string;
  items: LaunchItem[];
  greenCount: number;
  total: number;
}

export const MANUAL_KEY = 'ops.launch_manual';
export const DRILL_KEY = 'ops.restore_drill';
export const DRILL_MAX_DAYS = 90;
/** Everything that asks AWS or the Internet is read at most this often. */
export const CHECKS_TTL_MS = 5 * 60_000;

type Draft = Omit<LaunchItem, 'manualTick' | 'ticked' | 'action'> &
  Partial<Pick<LaunchItem, 'manualTick' | 'action'>>;

const RU_DATE = (iso: string) => iso.slice(0, 10);

/**
 * Owner 2026-10-24: «Запуск» — the owner's launch steps with a live light
 * each. Everything is read-only and cheap: secrets state and settings come
 * from our own DB, AWS answers (budgets, cost tags, SNS) and DNS are cached
 * for five minutes, and one failing probe turns only its own row into
 * «не удалось проверить».
 */
@Injectable()
export class LaunchChecksService {
  private auto?: { at: number; items: Draft[] };
  /** Replaceable in tests. */
  resolveNs: (domain: string) => Promise<string[]> = (d) => dns.resolveNs(d);

  constructor(
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
    private readonly settings: AppSettingsService,
    private readonly prisma: PrismaService,
    private readonly paging: PagerDutySnsService,
    private readonly budgets: AwsBudgetsAdminService,
    private readonly cost: AwsCostService,
  ) {}

  invalidate(): void {
    this.auto = undefined;
  }

  async report(now: Date = new Date(), fresh = false): Promise<LaunchReport> {
    if (fresh || !this.auto || Date.now() - this.auto.at > CHECKS_TTL_MS) {
      this.auto = { at: Date.now(), items: await this.detect(now) };
    }
    const [manual, drill] = await Promise.all([this.manual(), this.drill()]);
    const items: LaunchItem[] = [
      ...this.auto.items,
      this.drillItem(drill, now),
      ...this.manualItems(),
    ]
      .map((d) => this.finish(d, manual))
      .sort(
        (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
      );
    return {
      generatedAt: now.toISOString(),
      items,
      greenCount: items.filter((i) => i.status === 'green').length,
      total: items.length,
    };
  }

  private finish(d: Draft, manual: Record<string, { at: string }>): LaunchItem {
    const ticked = !!manual[d.id];
    const tickable = d.manualTick ?? d.status === 'manual';
    return {
      ...d,
      manualTick: tickable,
      ticked: tickable && ticked,
      status: tickable && ticked ? 'green' : d.status,
      action: d.action ?? null,
    };
  }

  // --- manual ticks and the restore drill (our DB) -------------------------

  async manual(): Promise<Record<string, { at: string }>> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: MANUAL_KEY },
    });
    return row?.value &&
      typeof row.value === 'object' &&
      !Array.isArray(row.value)
      ? (row.value as Record<string, { at: string }>)
      : {};
  }

  async setTick(id: string, done: boolean, now = new Date()): Promise<void> {
    const cur = await this.manual();
    if (done) cur[id] = { at: now.toISOString() };
    else delete cur[id];
    await this.prisma.appConfig.upsert({
      where: { key: MANUAL_KEY },
      create: { key: MANUAL_KEY, value: cur },
      update: { value: cur },
    });
  }

  async drill(): Promise<{ at: string; note: string | null } | null> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: DRILL_KEY },
    });
    const v = row?.value as { at?: unknown; note?: unknown } | null | undefined;
    return typeof v?.at === 'string'
      ? { at: v.at, note: typeof v.note === 'string' ? v.note : null }
      : null;
  }

  async recordDrill(note: string | null, now = new Date()): Promise<void> {
    const value = { at: now.toISOString(), note: note?.slice(0, 300) ?? null };
    await this.prisma.appConfig.upsert({
      where: { key: DRILL_KEY },
      create: { key: DRILL_KEY, value },
      update: { value },
    });
  }

  private drillItem(
    drill: { at: string; note: string | null } | null,
    now: Date,
  ): Draft {
    const base = {
      id: 'restore_drill',
      group: 'safety' as const,
      title: 'Учебное восстановление базы (раз в 90 дней)',
      runbook: 'docs/runbooks/restore-drill.md',
      manualTick: false,
      action: 'restore_drill' as const,
    };
    if (!drill) {
      return {
        ...base,
        status: 'red',
        detail: 'Ещё ни разу не отмечали.',
        hint: 'Запустите scripts/ops/restore-drill.sh на Mac, затем нажмите «Отметить, что сделал».',
      };
    }
    const days = Math.floor(
      (now.getTime() - Date.parse(drill.at)) / 86_400_000,
    );
    return days <= DRILL_MAX_DAYS
      ? {
          ...base,
          status: 'green',
          detail: `Последний раз ${RU_DATE(drill.at)} (${days} дн. назад).`,
          hint: null,
        }
      : {
          ...base,
          status: 'red',
          detail: `Последний раз ${RU_DATE(drill.at)}: прошло ${days} дн., больше 90.`,
          hint: 'Запустите scripts/ops/restore-drill.sh и отметьте результат.',
        };
  }

  private manualItems(): Draft[] {
    return [
      {
        id: 'sign_required',
        group: 'safety',
        title: 'SIGN_REQUIRED (обязательная подпись запросов)',
        status: 'manual',
        detail: 'Автоматически не проверяется.',
        hint: 'Включите параметр в сборке приложения и поставьте галочку, когда готово.',
        runbook: null,
      },
    ];
  }

  // --- detection ---------------------------------------------------------

  private async detect(now: Date): Promise<Draft[]> {
    const probes: [string, () => Promise<Draft>][] = [
      ['deploy', () => this.deploy()],
      [
        'cloudflare_turn',
        () =>
          this.provider(
            'cloudflare_turn',
            'calls',
            'Звонки: ключи Cloudflare TURN и проверка',
          ),
      ],
      [
        'cloudflare_sfu',
        () =>
          this.provider(
            'cloudflare_sfu',
            'calls',
            'Групповые видео: ключи Cloudflare SFU и проверка',
          ),
      ],
      [
        'turnstile',
        () =>
          this.provider(
            'turnstile',
            'safety',
            'Защита сайта от ботов (Turnstile): ключи и проверка',
          ),
      ],
      [
        'cloudflare_r2',
        () =>
          this.provider(
            'cloudflare_r2',
            'media',
            'Фото и медиа: ключи Cloudflare R2 и проверка',
          ),
      ],
      ['dns', () => this.dnsItem()],
      ['r2_on', () => this.r2On()],
      ['pagerduty', () => this.pagerduty()],
      ['budget', () => this.budget()],
      ['old_budget', () => this.oldBudget()],
      ['cost_tags', () => this.costTags()],
      [
        'twilio',
        () =>
          this.provider('twilio', 'money', 'SMS-коды: ключи Twilio и проверка'),
      ],
      ['stripe', () => this.stripe()],
      ['app_check', () => this.appCheck()],
      ['arm_spot', () => this.armSpot()],
    ];
    const out = await Promise.all(
      probes.map(async ([id, run]): Promise<Draft> => {
        try {
          return await run();
        } catch (e) {
          return {
            id,
            group: 'servers',
            title: TITLES[id] ?? id,
            status: 'manual',
            detail: `Не удалось проверить: ${(e as Error).message.slice(0, 120)}`,
            hint: 'Проверьте вручную и поставьте галочку.',
            runbook: null,
          };
        }
      }),
    );
    void now;
    return out;
  }

  private async deploy(): Promise<Draft> {
    const base = {
      id: 'deploy',
      group: 'release' as const,
      title: 'Запущена последняя версия (main)',
      runbook: 'docs/runbooks/DEPLOY_PROD.md',
    };
    const running = this.config.get<string>('APP_VERSION') ?? '';
    const gh = (await this.secrets.get('github'))?.fields;
    if (!running || running === 'dev' || !gh?.repo) {
      return {
        ...base,
        status: 'manual',
        detail: running
          ? `Работает версия ${running.slice(0, 7)}.`
          : 'Версия сервера неизвестна.',
        hint: gh?.repo
          ? 'Версия не определена: сверьте вручную.'
          : 'Подключите GitHub (только чтение) в «Ключи и сервисы» — тогда проверка станет автоматической.',
      };
    }
    const res = await fetch(
      `https://api.github.com/repos/${gh.repo}/commits/main`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'lawbid-admin',
          ...(gh.token ? { authorization: `Bearer ${gh.token}` } : {}),
        },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
    const head = String(((await res.json()) as { sha?: string }).sha ?? '');
    const same =
      !!head && (head.startsWith(running) || running.startsWith(head));
    return same
      ? {
          ...base,
          status: 'green',
          detail: `Работает ${head.slice(0, 7)} — это последняя версия main.`,
          hint: null,
        }
      : {
          ...base,
          status: 'red',
          detail: `Работает ${running.slice(0, 7)}, а в main уже ${head.slice(0, 7)}.`,
          hint: 'Запустите выкат (Deploy) или скажите Claude «выкати».',
        };
  }

  /** Keys present + the last «Проверить» of the integration card. */
  private async provider(
    id: string,
    group: Draft['group'],
    title: string,
  ): Promise<Draft> {
    const o = (await this.secrets.overview()).find((x) => x.provider === id);
    const base = {
      id,
      group,
      title,
      runbook: 'docs/runbooks/batch-a-owner.md',
    };
    const hint =
      'Ключи и сервисы → карточка → «Сохранить» → «Проверить» → «Включить».';
    if (!o?.configured) {
      return { ...base, status: 'red', detail: 'Ключей нет.', hint };
    }
    if (!o.testable) {
      return {
        ...base,
        status: 'green',
        detail: 'Ключи есть (отдельной проверки у сервиса нет).',
        hint: null,
      };
    }
    const a = o.active;
    if (!a || a.lastTestOk === null) {
      return {
        ...base,
        status: 'yellow',
        detail: 'Ключи есть, но проверку ещё не нажимали.',
        hint: 'Откройте карточку и нажмите «Проверить».',
      };
    }
    return a.lastTestOk
      ? {
          ...base,
          status: 'green',
          detail: `Ключи есть, проверка прошла (${RU_DATE(a.lastTestAt ?? '')}).`,
          hint: null,
        }
      : {
          ...base,
          status: 'red',
          detail: `Проверка не прошла: ${a.lastTestError ?? 'ошибка'}.`.slice(
            0,
            200,
          ),
          hint,
        };
  }

  private async dnsItem(): Promise<Draft> {
    const base = {
      id: 'dns',
      group: 'release' as const,
      title: 'Домен работает через Cloudflare (DNS)',
      runbook: 'docs/runbooks/DNS_TO_CLOUDFLARE.md',
    };
    let host = 'lawbid.dev';
    try {
      host =
        new URL(this.config.get<string>('APP_LINK_BASE_URL') ?? '').hostname ||
        host;
    } catch {
      // keep the default
    }
    const domain = host.split('.').slice(-2).join('.');
    const ns = await Promise.race([
      this.resolveNs(domain),
      new Promise<string[]>((_, rej) =>
        setTimeout(() => rej(new Error('DNS не ответил')), 4000).unref(),
      ),
    ]);
    const cf =
      ns.length > 0 &&
      ns.every((n) => n.toLowerCase().endsWith('.ns.cloudflare.com'));
    return cf
      ? {
          ...base,
          status: 'green',
          detail: `${domain}: серверы имён Cloudflare (${ns.join(', ')}).`,
          hint: null,
        }
      : {
          ...base,
          status: 'red',
          detail: `${domain}: серверы имён ${ns.join(', ') || 'не найдены'}, это не Cloudflare.`,
          hint: 'У регистратора домена замените серверы имён на те, что показал Cloudflare.',
        };
  }

  private async r2On(): Promise<Draft> {
    const base = {
      id: 'r2_on',
      group: 'media' as const,
      title: 'Публичные фото идут через R2 (переключатель включён)',
      runbook: 'docs/runbooks/batch-a-owner.md',
    };
    const store = await this.settings.string('media.public_store');
    const keys = await this.secrets.has('cloudflare_r2');
    if (store === 'r2' && keys)
      return {
        ...base,
        status: 'green',
        detail: 'media.public_store = r2, ключи на месте.',
        hint: null,
      };
    if (store === 'r2')
      return {
        ...base,
        status: 'red',
        detail: 'Переключатель включён, но ключей R2 нет.',
        hint: 'Заполните карточку R2 в «Ключи и сервисы».',
      };
    return {
      ...base,
      status: keys ? 'yellow' : 'red',
      detail: keys
        ? 'Ключи R2 есть, переключатель ещё на AWS.'
        : 'R2 не настроен, фото лежат на AWS.',
      hint: 'Настройки → media.public_store = r2 (после проверки ключей).',
    };
  }

  private async pagerduty(): Promise<Draft> {
    const base = {
      id: 'pagerduty',
      group: 'alerts' as const,
      title: 'Тревоги звонят на телефон (PagerDuty подтверждён)',
      runbook: 'docs/runbooks/paging.md',
    };
    const s = await this.paging.status();
    if (!s.available)
      return {
        ...base,
        status: 'manual',
        detail: 'Работает только на AWS.',
        hint: 'Проверьте подписку в AWS SNS и поставьте галочку.',
      };
    if (!s.configured)
      return {
        ...base,
        status: 'red',
        detail: 'Ссылка PagerDuty не сохранена.',
        hint: 'Ключи и сервисы → PagerDuty → вставьте Integration URL.',
      };
    if (s.state === 'confirmed')
      return {
        ...base,
        status: 'green',
        detail: 'Подписка на топик тревог подтверждена (Confirmed).',
        hint: null,
      };
    if (s.state === 'pending')
      return {
        ...base,
        status: 'yellow',
        detail: 'Подписка ждёт подтверждения (Pending).',
        hint: 'PagerDuty подтверждает сам за минуту; обновите страницу.',
      };
    return {
      ...base,
      status: 'red',
      detail: 'Ссылка сохранена, но подписки на топик нет.',
      hint: 'Нажмите «Подписать» в блоке PagerDuty ниже.',
    };
  }

  private async budget(): Promise<Draft> {
    const base = {
      id: 'budget',
      group: 'money' as const,
      title: 'Потолок расходов AWS задан и не превышен',
      runbook: 'docs/runbooks/cost.md',
    };
    if (!this.budgets.available)
      return {
        ...base,
        status: 'manual',
        detail: 'Работает только на AWS.',
        hint: 'Проверьте бюджет в AWS Billing и поставьте галочку.',
      };
    const rows = await this.budgets.list();
    const prod = rows.find((r) => r.prod);
    if (!prod || !prod.limitUsd)
      return {
        ...base,
        status: 'red',
        detail: 'Бюджет lawbid-prod-monthly не найден.',
        hint: 'Нужен apply Terraform (модуль budget).',
      };
    const used = prod.actualUsd ?? 0;
    const pct = (used / prod.limitUsd) * 100;
    const line = `Потолок ${prod.limitUsd} $, потрачено ${Math.round(used * 100) / 100} $ (${Math.round(pct)}%).`;
    return pct >= 100
      ? {
          ...base,
          status: 'red',
          detail: line,
          hint: 'Потолок исчерпан: сервер держится на минимуме. Поднимите потолок на «Масштаб».',
        }
      : pct >= 80
        ? {
            ...base,
            status: 'yellow',
            detail: line,
            hint: 'Близко к потолку. Поднять можно на «Масштаб».',
          }
        : { ...base, status: 'green', detail: line, hint: null };
  }

  private async oldBudget(): Promise<Draft> {
    const base = {
      id: 'old_budget',
      group: 'money' as const,
      title: 'Старый бюджет «LawBid Monthly» ($50) удалён',
      runbook: null,
    };
    if (!this.budgets.available)
      return {
        ...base,
        status: 'manual',
        detail: 'Работает только на AWS.',
        hint: 'Удалите в AWS Billing → Budgets и поставьте галочку.',
      };
    const old = (await this.budgets.list()).find((r) => r.obsolete);
    return old
      ? {
          ...base,
          status: 'red',
          detail: `Ещё существует (потолок ${old.limitUsd ?? '?'} $).`,
          hint: 'Страница «Масштаб» → «Бюджеты AWS» → «Удалить» (нужен второй админ и код 2FA).',
        }
      : {
          ...base,
          status: 'green',
          detail: 'Старого бюджета нет.',
          hint: null,
        };
  }

  private async costTags(): Promise<Draft> {
    const base = {
      id: 'cost_tags',
      group: 'money' as const,
      title: 'Теги расходов AWS включены (видно, на что уходят деньги)',
      runbook: null,
    };
    const want = (this.config.get<string>('OPS_COST_TAG_KEYS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!this.budgets.available || want.length === 0) {
      return {
        ...base,
        status: 'manual',
        detail: 'Автопроверка работает только на AWS.',
        hint: 'AWS Billing → Cost allocation tags → Activate, затем галочка.',
      };
    }
    const active = await this.cost.activeTagKeys();
    const missing = want.filter((k) => !active.includes(k));
    return missing.length === 0
      ? {
          ...base,
          status: 'green',
          detail: `Включены: ${want.join(', ')}.`,
          hint: null,
        }
      : {
          ...base,
          status: 'red',
          detail: `Не включены: ${missing.join(', ')}.`,
          hint: 'AWS Billing → Cost allocation tags → отметьте и нажмите Activate (до 24 часов).',
        };
  }

  private async stripe(): Promise<Draft> {
    const base = {
      id: 'stripe',
      group: 'money' as const,
      title: 'Платежи: боевой ключ Stripe и цены',
      runbook: 'docs/runbooks/batch-a-owner.md',
    };
    const key = await this.secrets.field('stripe', 'secretKey');
    if (!key)
      return {
        ...base,
        status: 'red',
        detail: 'Ключа Stripe нет.',
        hint: 'Ключи и сервисы → Stripe.',
      };
    const live = /^(sk|rk)_live_/.test(key);
    const ids = await Promise.all(
      ['priceId', 'priceSeatId', 'priceYearlyId'].map((f) =>
        this.secrets.field('stripe', f),
      ),
    );
    const have = ids.filter(Boolean).length;
    if (!live)
      return {
        ...base,
        status: 'red',
        detail: 'Стоит тестовый ключ (sk_test), не боевой.',
        hint: 'Замените на live-ключ в карточке Stripe.',
      };
    if (have === 3)
      return {
        ...base,
        status: 'green',
        detail: 'Боевой ключ и все три цены на месте.',
        hint: null,
      };
    return {
      ...base,
      status: have === 0 ? 'red' : 'yellow',
      detail: `Боевой ключ есть, цен задано ${have} из 3.`,
      hint: 'Добавьте ID цен в карточке Stripe (или создайте цены в Биллинг → Цены).',
    };
  }

  private async appCheck(): Promise<Draft> {
    const base = {
      id: 'app_check',
      group: 'safety' as const,
      title: 'App Check (защита от ботов в приложении)',
      runbook: 'docs/runbooks/APP_CHECK.md',
    };
    const mode = await this.settings.string('security.app_check.mode');
    if (mode === 'enforce')
      return {
        ...base,
        status: 'green',
        detail: 'Режим enforce: приложения без проверки отклоняются.',
        hint: null,
      };
    if (mode === 'monitor')
      return {
        ...base,
        status: 'yellow',
        detail: 'Режим monitor: только наблюдает, ничего не блокирует.',
        hint: 'Когда все приложения обновились — Настройки → security.app_check.mode = enforce.',
      };
    return {
      ...base,
      status: 'red',
      detail: 'Выключен.',
      hint: 'Настройки → security.app_check.mode = monitor, потом enforce.',
    };
  }

  private armSpot(): Promise<Draft> {
    const base = {
      id: 'arm_spot',
      group: 'servers' as const,
      title: 'Серверы дешевле: ARM64 и Spot',
      runbook: 'docs/runbooks/batch-a-owner.md',
    };
    const arm = process.arch === 'arm64';
    const apiSpot = this.config.get<string>('OPS_API_SPOT') === 'on';
    const workerSpot = this.config.get<string>('OPS_WORKER_SPOT') === 'on';
    const parts = `${arm ? 'ARM64' : 'x86 (дороже)'}, Spot: API ${apiSpot ? 'да' : 'нет'}, фоновые задачи ${workerSpot ? 'да' : 'нет'}.`;
    const n = [arm, apiSpot, workerSpot].filter(Boolean).length;
    return Promise.resolve({
      ...base,
      status: n === 3 ? 'green' : n === 0 ? 'red' : 'yellow',
      detail: parts,
      hint:
        n === 3
          ? null
          : 'Включается в Terraform (cpu_architecture, api_spot, worker_spot) — скажите Claude.',
    });
  }
}

const GROUP_ORDER: LaunchItem['group'][] = [
  'release',
  'servers',
  'calls',
  'media',
  'alerts',
  'money',
  'safety',
];

const TITLES: Record<string, string> = {
  deploy: 'Запущена последняя версия (main)',
  cloudflare_turn: 'Звонки: ключи Cloudflare TURN и проверка',
  cloudflare_sfu: 'Групповые видео: ключи Cloudflare SFU и проверка',
  turnstile: 'Защита сайта от ботов (Turnstile): ключи и проверка',
  cloudflare_r2: 'Фото и медиа: ключи Cloudflare R2 и проверка',
  dns: 'Домен работает через Cloudflare (DNS)',
  r2_on: 'Публичные фото идут через R2',
  pagerduty: 'Тревоги звонят на телефон (PagerDuty подтверждён)',
  budget: 'Потолок расходов AWS задан и не превышен',
  old_budget: 'Старый бюджет «LawBid Monthly» ($50) удалён',
  cost_tags: 'Теги расходов AWS включены',
  twilio: 'SMS-коды: ключи Twilio и проверка',
  stripe: 'Платежи: боевой ключ Stripe и цены',
  app_check: 'App Check',
  arm_spot: 'Серверы дешевле: ARM64 и Spot',
};
