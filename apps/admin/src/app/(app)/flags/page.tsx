'use client';

import { Flask, Key, LockSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

/**
 * Owner 2026-10-06: every switch says in plain Russian what it changes for
 * users and what it needs before it can be turned on (with a link to the
 * right place). The server's seed descriptions are English.
 */
type FlagInfo = { title: string; what: string; need?: string; href?: string; hrefLabel?: string };

const KEYS = '/integrations';

const FLAG_INFO: Record<string, FlagInfo> = {
  video_posts: {
    title: 'Рилсы (видео-посты)',
    what: 'Пользователи снимают и выкладывают короткие видео в ленту, как в Instagram.',
    need: 'Все 5 ключей Bunny Stream в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключи Bunny',
  },
  video_calls: {
    title: 'Видеозвонки в чате',
    what: 'Кнопка видеозвонка в чате между клиентом и адвокатом.',
    need: 'Ключи TURN / STUN в «Ключи и сервисы» (сервер для звонков, когда телефоны не соединяются напрямую).',
    href: KEYS,
    hrefLabel: 'Ключи TURN',
  },
  chat_translate: {
    title: 'Переводчик (Google Translate)',
    what: 'Кнопка «Перевести» под сообщениями, постами, делами и отзывами. Где именно — настраивается в карточке Google Translate.',
    need: 'Ключ Google Translate в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключ Google',
  },
  payments_in_app: {
    title: 'Оплата адвокату через приложение',
    what: 'Клиент платит выбранному адвокату прямо в приложении. Деньги идут адвокату, платформа их не держит.',
    need: 'Ключ Stripe в «Ключи и сервисы», а адвокат должен подключить свой счёт Stripe.',
    href: KEYS,
    hrefLabel: 'Ключи Stripe',
  },
  payroll_stripe_payouts: {
    title: 'Выплата зарплат сотрудникам через Stripe',
    what: 'Сотрудники админки привязывают карту или счёт и получают зарплату автоматически в день выплаты.',
    need: 'Ключ Stripe в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключи Stripe',
  },
  bid_packs: {
    title: 'Пакеты откликов',
    what: 'Адвокат докупает отклики разовой оплатой поверх лимита плана (размеры и цены — в разделе «Планы»). Выключено — кнопки покупки нет, лимит плана остаётся единственным.',
  },
  firm_profiles: {
    title: 'Профиль фирмы',
    what: 'Фирма добавляет своих адвокатов; у каждого своя лицензия и проверка, штаты фирмы — объединение их проверенных лицензий. Отклик отправляет адвокат фирмы с подходящей лицензией. Выключено — раздела «Моя фирма» нет.',
  },
  news_posts: {
    title: 'Новости',
    what: 'Раздел «Новости» в приложении: фильтр «Новости» в ленте, выбор «Пост / Новость» при публикации и вкладка новостей в профиле адвоката. Выключено — всё публикуется как обычный пост в общей ленте.',
  },
  document_templates: {
    title: 'Шаблоны документов',
    what: 'Библиотека готовых шаблонов документов в приложении (раздел «Шаблоны»). Сами шаблоны редактируются в разделе контента.',
  },
  web_client: {
    title: 'Вход с сайта (веб-версия)',
    what: 'Пользователи могут входить не только из телефона, но и через браузер на сайте. Выключите — останется только приложение.',
  },
  profile_promotion: {
    title: 'Продвижение профиля адвоката',
    what: 'Платное поднятие профиля адвоката выше в поиске.',
    need: 'Ключи Stripe и ID цены в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключи Stripe',
  },
  stripe_identity: {
    title: 'Проверка документов (Stripe Identity)',
    what: 'Автоматическая проверка удостоверения личности адвоката по фото документа.',
    need: 'Ключ Stripe в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключи Stripe',
  },
  persona_verification: {
    title: 'Проверка документов (Persona)',
    what: 'Другой сервис проверки личности адвоката, вместо Stripe Identity.',
    need: 'Ключ Persona в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключ Persona',
  },
  auto_bar_check: {
    title: 'Автопроверка лицензии (старый переключатель)',
    what: 'Больше не используется. Проверка лицензий теперь включается отдельно для каждого штата.',
    need: 'Настраивается внизу страницы «Ключи и сервисы» → «Реестры адвокатов по штатам».',
    href: KEYS,
    hrefLabel: 'Реестры штатов',
  },
  device_attestation: {
    title: 'Защита от ботов (проверка телефона)',
    what: 'Сервер проверяет, что вход идёт с настоящего iPhone или Android, а не из программы-бота.',
    need: 'Ещё не готово: если включить сейчас, никто не сможет войти. Поэтому кнопка заблокирована.',
  },
  password_login: {
    title: 'Вход по паролю',
    what: 'После регистрации человек задаёт пароль и дальше входит по номеру или почте и паролю, без SMS. Код нужен только при регистрации и если забыл пароль. Если выключить, все входят по коду, как раньше.',
    need: 'Ничего не нужно, работает сразу.',
  },
  demo_code_login: {
    title: 'Демо-код на экране входа',
    what: 'Ссылка «У меня есть демо-код» внизу экрана приветствия. Выключено: ссылки нет, весы занимают её место.',
    need: 'Ничего не нужно, работает сразу.',
  },
  phone_login: {
    title: 'Вход по телефону',
    what: 'Пользователь вводит номер и получает код по SMS.',
    need: 'Ключи Twilio в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключи Twilio',
  },
  email_login: {
    title: 'Вход и письма по почте',
    what:
      'Выключено: в приложении нигде не спрашиваем почту, вход только по телефону, Google и Apple. ' +
      'Скрыты: вход и регистрация по почте, «Добавить / изменить почту», шаг «Почта» у клиента, ' +
      'проверка почты фирмы у адвоката, письма-уведомления и лист ожидания стран. Вход в админку не меняется.',
    need: 'Включить, когда AWS разрешит отправку писем на любые адреса (почта Amazon SES в «Ключи и сервисы»).',
    href: KEYS,
    hrefLabel: 'Почта SES',
  },
  apple_login: {
    title: 'Вход через Apple',
    what: 'Кнопка «Войти через Apple»: вход одним нажатием на iPhone, без кода.',
    need: 'Bundle ID и Team ID в «Ключи и сервисы» → «Вход через Apple».',
    href: KEYS,
    hrefLabel: 'Настройки Apple',
  },
  google_login: {
    title: 'Вход через Google',
    what: 'Кнопка «Войти через Google»: вход одним нажатием через аккаунт Google.',
    need: 'Client ID в «Ключи и сервисы» → «Вход через Google».',
    href: KEYS,
    hrefLabel: 'Настройки Google',
  },
};

/** Unknown (new) flags: their code as a readable name + the server text. */
function infoFor(f: { key: string; description: string | null }): FlagInfo {
  return (
    FLAG_INFO[f.key] ?? {
      title: f.key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      what: f.description ?? '',
    }
  );
}

type Flag = {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  description: string | null;
  paid: boolean;
  missingKeys: string[];
  notBuilt?: boolean;
  updatedAt: string;
};

/** docs/06 §2.3 item 7: on/off switches; paid flags need provider keys,
 * unbuilt ones are locked by the server (409). Owner 2026-10-06: the
 * «Раскрытие %» slider is gone — the server never applied the percent
 * (a flag is on for everyone or no one), so it only confused.
 */
export default function FlagsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Flag[],
  });
  const update = useMutation({
    mutationFn: async (v: { key: string; enabled: boolean }) => {
      await api.PATCH('/admin/feature-flags/{key}', {
        params: { path: { key: v.key } },
        body: { enabled: v.enabled },
      });
      return v;
    },
    onSuccess: (v) => {
      toast.success(`${FLAG_INFO[v.key]?.title ?? v.key}: ${v.enabled ? 'включено' : 'выключено'}`);
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
    onError: (e) => toast.error(e),
  });

  const flags = q.data ?? [];
  const groups: [string, Flag[]][] = [
    ['Функции приложения', flags.filter((f) => !f.key.endsWith('_login'))],
    ['Способы входа', flags.filter((f) => f.key.endsWith('_login'))],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Функции"
        subtitle="Каждый переключатель включает или скрывает функцию в приложении сразу у всех пользователей, без обновления приложения (доходит за минуту). Под каждой функцией написано, что она делает и что нужно, чтобы её включить. Все изменения пишутся в журнал."
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : (
        groups.map(([title, list]) =>
          list.length ? (
            <section key={title} className="mb-8">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{title}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {list.map((f, i) => (
                  <FlagCard key={f.key} f={f} i={i} busy={update.isPending} onChange={(v) => update.mutate({ key: f.key, ...v })} />
                ))}
              </div>
            </section>
          ) : null,
        )
      )}
    </>
  );
}

function FlagCard({
  f,
  i,
  busy,
  onChange,
}: {
  f: Flag;
  i: number;
  busy: boolean;
  onChange: (v: { enabled: boolean }) => void;
}) {
  const info = infoFor(f);
  const title = info.title;
  const blocked = !f.enabled && (f.notBuilt || (f.paid && f.missingKeys.length > 0));
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card spotlight className="h-full p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-heading">{title}</h3>
              {f.notBuilt ? (
                <Badge tone="neutral">
                  <LockSimple size={11} /> ещё не сделано
                </Badge>
              ) : f.enabled ? (
                <Badge tone="success" dot>
                  включено
                </Badge>
              ) : (
                <Badge tone="neutral">выключено</Badge>
              )}
              {f.paid ? (
                <Badge tone="gold">
                  <Key size={11} /> платный сервис
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 break-words text-sm leading-relaxed text-muted">{info.what}</p>
            {info.need ? (
              <p className="mt-1.5 break-words text-xs leading-relaxed text-ink">
                <span className="font-medium">Что нужно, чтобы включить:</span> {info.need}
              </p>
            ) : null}
          </div>
          <Switch
            checked={f.enabled}
            disabled={busy || blocked}
            label={title}
            onChange={(v) => {
              if (v && f.paid && !window.confirm(`«${title}» использует платный сервис. Включить?`)) return;
              onChange({ enabled: v });
            }}
          />
        </div>
        {f.paid && f.missingKeys.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            <span className="min-w-0 break-words">Нельзя включить: ключи сервиса ещё не добавлены.</span>
            <Link href={info.href ?? KEYS} className="font-medium underline-offset-2 hover:underline">
              Добавить ключи →
            </Link>
          </div>
        ) : info.href && !f.notBuilt ? (
          <Link href={info.href} className="mt-3 inline-block text-xs text-gold-600 underline-offset-2 hover:underline">
            {info.hrefLabel ?? 'Открыть настройки'} →
          </Link>
        ) : null}
        {f.notBuilt ? (
          <div className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-xs text-faint">
            <Flask size={14} className="mt-px shrink-0" />
            <span className="break-words">Функция ещё не готова в приложении — сервер не даст её включить.</span>
          </div>
        ) : null}
        <div className="mt-2 text-[11px] text-faint">Изменён {formatDateTime(f.updatedAt)}</div>
      </Card>
    </motion.div>
  );
}
