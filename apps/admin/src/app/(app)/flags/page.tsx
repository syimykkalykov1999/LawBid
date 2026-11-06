'use client';

import { Key } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'motion/react';
import Link from 'next/link';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import {
  REELS_CLIENT_FLAG,
  REELS_CLIENT_MODES,
  REELS_CLIENT_PAID_FLAG,
  type ReelsClientMode,
  reelsClientMode,
  reelsClientModeWrites,
} from '@/lib/reels-client-mode';
import { formatDateTime } from '@/lib/utils';

/**
 * Owner 2026-10-06: every switch says in plain Russian what it changes for
 * users and what it needs before it can be turned on (with a link to the
 * right place). The server's seed descriptions are English.
 */
type FlagInfo = { title: string; what: string; need?: string; href?: string; hrefLabel?: string };

const KEYS = '/integrations';

const FLAG_INFO: Record<string, FlagInfo> = {
  video_prefetch_smart: {
    title: 'Прогрев видео прямо в кэш',
    what: 'Начало следующих рилсов сохраняется в кэш, из которого читает плеер, и именно тот поток, который он откроет. Пока человек быстро листает, прогревается только следующее видео. Выключено: прогрев как раньше.',
    need: 'Ничего. На телефоне не проверено: полистать рилсы, сравнить начало видео и трафик. Плохо — выключить.',
  },
  video_posts: {
    title: 'Рилсы (видео-посты)',
    what: 'Пользователи снимают и выкладывают короткие вертикальные видео в ленту.',
    need: 'Все 5 ключей Bunny Stream в «Ключи и сервисы».',
    href: KEYS,
    hrefLabel: 'Ключи Bunny',
  },
  reels_client_publish: {
    title: 'Рилсы: публикация клиентами',
    what: 'Кто из клиентов может снимать и выкладывать рилсы: никто, все бесплатно или только клиенты с оплаченной золотой галочкой. Адвокаты публикуют рилсы всегда. Цена галочки — в разделе «Цены».',
    need: 'Ничего, работает сразу (флаг «Рилсы (видео-посты)» должен быть включён)',
  },
  chat_files_from_disk: {
    title: 'Файлы чатов: отправка с диска',
    what: 'Видео и документ в чате не читаются целиком в память телефона (до 100 МБ), а отправляются с диска. Фото работают как раньше: их можно редактировать. На сайте всё как раньше. Выключено — файл читается в память',
    need: 'Ничего. На телефоне не проверено: отправить длинное видео и большой PDF, открыть их',
  },
  files_reuse_own: {
    title: 'Файлы: не загружать свой файл повторно',
    what: 'Человек отправляет файл, который уже есть у него самого: загрузки нет, файл готов сразу. Только свои файлы: чужой файл по хешу получить нельзя. Фото постов, аватары и отзывы идут обычным путём, чтобы пройти свою модерацию. Выключено — каждый раз загрузка',
    need: 'Включённая настройка storage.dedup. На настоящем хранилище не проверено: отправить один документ два раза, открыть оба',
  },
  files_confirm_light: {
    title: 'Файлы: лёгкое подтверждение загрузки',
    what: 'Сервер API больше не читает большой файл (от 8 МБ) целиком в память при подтверждении: сразу проверяется только начало файла, контрольную сумму и содержимое проверяет фоновый обработчик. Выключено — весь файл читается в API, как раньше',
    need: 'Ничего. На настоящем хранилище не проверено: включить, отправить файл больше 8 МБ, убедиться, что он дошёл',
  },
  reels_tus_parallel: {
    title: 'Видео: параллельная загрузка',
    what: 'Рилсы, истории и видео каналов уходят в Bunny несколькими кусками сразу, это быстрее. Если Bunny откажет, видео уйдёт обычным способом. Выключено — один поток, как раньше',
    need: 'Ничего. На настоящем видео ещё не проверено: включить и выложить рилс с телефона, посмотреть, что он открывается',
  },
  chat_upload_parallel: {
    title: 'Файлы чатов: отправка сразу по несколько',
    what: 'Большой файл чата идёт несколькими кусками, пока приложение открыто. Свернули приложение — файл целиком передаётся фоновой отправке телефона. Несколько файлов в группе или задаче уходят вместе. Выключено — как раньше',
    need: 'Включённый флаг «files_multipart». На настоящем хранилище не проверено: отправить видео больше 16 МБ, свернуть приложение на середине, убедиться, что сообщение дошло',
  },
  downloads_parallel: {
    title: 'Документы: скачивание кусками сразу',
    what: 'Файл больше 4 МБ скачивается несколькими кусками одновременно, после обрыва продолжается с того же места. Выключено — один поток, как раньше',
    need: 'Ничего. На настоящем хранилище не проверено: скачать большой документ с телефона, открыть его',
  },
  video_cache_parallel: {
    title: 'Видео: начало ролика кусками сразу',
    what: 'Первые секунды видео, которые телефон хранит в кэше, скачиваются несколькими кусками одновременно. Остальное видео идёт как раньше. Выключено — кусок за куском',
    need: 'Ничего. С настоящим CDN не проверено: включить и посмотреть, быстрее ли стартует видео',
  },
  video_calls: {
    title: 'Видеозвонки в чате',
    what: 'Кнопка видеозвонка в чате между клиентом и адвокатом.',
    need: 'Ключи TURN / STUN в «Ключи и сервисы» (сервер для звонков, когда телефоны не соединяются напрямую).',
    href: KEYS,
    hrefLabel: 'Ключи TURN',
  },
  calls_group: {
    title: 'Групповые звонки',
    what: 'Звонки на троих и больше: кнопка «Добавить участника» в звонке и звонок из группового чата. Выключено — остаются только звонки один на один',
    need: 'Ничего, работает сразу (для стабильности нужен Cloudflare TURN/SFU в «Ключи и сервисы»)',
    href: KEYS,
    hrefLabel: 'Ключи и сервисы',
  },
  chat_translate: {
    title: 'Переводчик (Google Translate)',
    what: 'Перевод в приложении. В чате — пункт «Перевести» в меню сообщения (долгое нажатие), в постах, делах и отзывах — кнопка под текстом. Пока выключено: ничего не показывается и языки не скачиваются.',
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
  stars: {
    title: 'Звёзды',
    what: 'Баланс звёзд: пополняется только на сайте (Stripe), тратится на подарки в чатах и профилях и на платные наборы стикеров. Цены пакетов, подарки и отчёт — в разделе «Звёзды». Выключено — раздела звёзд и подарков в приложении нет, купленные звёзды остаются на балансах.',
  },
  firm_profiles: {
    title: 'Профиль фирмы',
    what: 'Фирма добавляет своих адвокатов; у каждого своя лицензия и проверка, штаты фирмы — объединение их проверенных лицензий. Отклик отправляет адвокат фирмы с подходящей лицензией. Выключено — раздела «Моя фирма» нет.',
  },
  channels: {
    title: 'Сообщества (каналы)',
    what: 'Каналы адвокатов и компаний: посты для подписчиков, вкладка «Сообщества» в «Поделиться», создание и поиск каналов, уведомления о постах каналов. Выключено — сообществ нигде нет (ни в приложении, ни на сайте), сервер отказывает на все запросы каналов.',
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
  auto_bar_check: {
    title: 'Автопроверка лицензии (старый переключатель)',
    what: 'Больше не используется. Проверка лицензий теперь включается отдельно для каждого штата.',
    need: 'Настраивается внизу страницы «Ключи и сервисы» → «Реестры адвокатов по штатам».',
    href: KEYS,
    hrefLabel: 'Реестры штатов',
  },
  role_switch: {
    title: 'Смена профиля адвокат ⇄ клиент',
    what: 'В Настройках → «Аккаунт» появляется пункт «Сменить профиль». Тот же аккаунт, телефон и пароль, без SMS: подтверждение паролем или passkey. Данные обоих профилей сохраняются. Клиент, впервые становящийся адвокатом, проходит обычную проверку адвоката. Смена закрыта при активных кейсах, ставках, спорах и консультациях. Если выключить, пункт исчезает, а уже сменившие профиль остаются в текущем.',
    need: 'Ничего не нужно, работает сразу. Лимит смен в сутки: настройка account.role_switch_per_day.',
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
  spotlight_indexing: {
    title: 'Поиск по iPhone (Spotlight)',
    what: 'Адвокаты и сохранённые посты, которые человек открывал, находятся через поиск самого iPhone. Список хранится только на телефоне. Выключено — телефоны перестают добавлять новое в поиск iPhone.',
  },
  guest_browsing: {
    title: 'Просмотр без регистрации',
    what: 'Ленту, поиск и открытые профили адвокатов можно смотреть без входа; на любое действие приложение просит войти. Выключено — сразу экран входа.',
  },
  in_app_review: {
    title: 'Просьба оценить приложение',
    what: 'После приятного момента магазин (App Store или Google Play) сам показывает окно «Оцените LawBid». Выключено — окно не появляется.',
    need: 'Страницы приложения в магазинах должны быть готовы.',
  },
  google_login: {
    title: 'Вход через Google',
    what: 'Кнопка «Войти через Google»: вход одним нажатием через аккаунт Google.',
    need: 'Client ID в «Ключи и сервисы» → «Вход через Google».',
    href: KEYS,
    hrefLabel: 'Настройки Google',
  },
  passkey_login: {
    title: 'Вход по ключу доступа (Face ID / отпечаток)',
    what: 'Человек входит без кода и пароля: Face ID, Touch ID, Windows Hello или ключ безопасности. Выключено — кнопка скрыта и сервер не принимает такие входы; уже созданные ключи остаются и работают для повторного подтверждения.',
    need: 'Ничего не нужно, работает сразу.',
  },
  economy_guard: {
    title: 'Защита от убытков (экономика)',
    what: 'Если траты на внешние сервисы выше заданного правила, защита сама ставит на паузу загрузку видео, урезает SMS и ограничивает рост серверов. Выключено — защита снимает всё, что поставила, и перестаёт вмешиваться. Правила — в разделе «Экономика».',
    need: 'Ничего не нужно, работает сразу.',
  },
  crash_reports: {
    title: 'Отчёты о вылетах приложения',
    what: 'Приложение само отправляет сообщение, когда падает, и вы видите это в разделе «Вылеты». Выключено — телефоны перестают отправлять, а то, что ещё приходит, сервер отбрасывает.',
    need: 'Ничего не нужно, работает сразу. Платных сервисов нет.',
  },
  app_events: {
    title: 'Счётчики действий в приложении',
    what: 'Приложение считает, сколько людей что открывало (только числа по дням, без личных данных) — это графики в разделе «Аналитика». Выключено — счётчики не собираются.',
    need: 'Ничего не нужно, работает сразу. Платных сервисов нет.',
  },
  hide_counts: {
    title: 'Скрытие счётчиков лайков и просмотров',
    what: 'Автор может скрыть лайки и просмотры у своих постов и рилсов, а зритель — скрыть счётчики лайков у себя (как в Instagram). Отклики и комментарии к делам видны всегда. Выключено — счётчики показываются всем.',
    need: 'Ничего не нужно, работает сразу.',
  },
  stories: {
    title: 'Истории (на 24 часа)',
    what: 'Фото, видео или текст, которые исчезают через сутки, как в Instagram и WhatsApp. Сейчас спрятаны до следующего обновления приложения, код остаётся.',
    need: 'Видео в историях идут через Bunny Stream: ключи в «Ключи и сервисы» (платный сервис, оплата за хранение и просмотры).',
    href: KEYS,
    hrefLabel: 'Ключи Bunny',
  },
  consultations: {
    title: 'Запись на консультацию',
    what: 'Адвокат выставляет свободные окна, клиент записывается из профиля адвоката; заявки и напоминания приходят обеим сторонам. Выключено — кнопки записи нет.',
    need: 'Ничего не нужно, работает сразу.',
  },
  legal_qa: {
    title: 'Вопрос юристу',
    what: 'Раздел публичных вопросов: клиент задаёт вопрос, отвечать могут только проверенные адвокаты. Выключено — вкладки «Вопросы» в приложении нет.',
    need: 'Ничего не нужно, работает сразу.',
  },
  deadline_calculator: {
    title: 'Калькулятор сроков',
    what: 'Считает судебные сроки и сроки давности по правилам из базы. Выключен по умолчанию: неверная дата выглядит как юридический совет. Правила остаются в базе, список — в разделе «Сроки».',
    need: 'Сначала проверьте правила в разделе «Сроки» (юрист-эксперт), потом включайте. Платных сервисов нет.',
  },
  files_multipart: {
    title: 'Загрузка больших файлов частями',
    what: 'Видео и документы больше 16 МБ уходят кусками по 8 МБ и после обрыва связи продолжаются с того же места, а не начинаются заново. Выключено — большие файлы грузятся одним куском.',
    need: 'Ничего не нужно, работает сразу.',
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
  const patch = (v: { key: string; enabled: boolean }) =>
    api.PATCH('/admin/feature-flags/{key}', {
      params: { path: { key: v.key } },
      body: { enabled: v.enabled },
    });
  const update = useMutation({
    mutationFn: async (v: { key: string; enabled: boolean }) => {
      await patch(v);
      return v;
    },
    onSuccess: (v) => {
      toast.success(`${FLAG_INFO[v.key]?.title ?? v.key}: ${v.enabled ? 'включено' : 'выключено'}`);
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
    onError: (e) => toast.error(e),
  });

  const flags = q.data ?? [];
  const enabledByKey = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  // Owner 2026-11-04 (R-398): client reels are ONE three-way choice over
  // two flags; the second flag has no card of its own.
  const reelsMode = useMutation({
    mutationFn: async (mode: ReelsClientMode) => {
      for (const w of reelsClientModeWrites(mode, enabledByKey)) await patch(w);
      return mode;
    },
    onSuccess: (mode) => {
      const label = REELS_CLIENT_MODES.find((m) => m.value === mode)?.label ?? mode;
      toast.success(`${FLAG_INFO[REELS_CLIENT_FLAG]?.title ?? REELS_CLIENT_FLAG}: ${label.toLowerCase()}`);
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
    onError: (e) => {
      toast.error(e);
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
  });
  const shown = flags.filter((f) => f.key !== REELS_CLIENT_PAID_FLAG);
  const groups: [string, Flag[]][] = [
    ['Функции приложения', shown.filter((f) => !f.key.endsWith('_login'))],
    ['Способы входа', shown.filter((f) => f.key.endsWith('_login'))],
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
                {list.map((f, i) =>
                  f.key === REELS_CLIENT_FLAG ? (
                    <FlagCard
                      key={f.key}
                      f={f}
                      i={i}
                      busy={update.isPending || reelsMode.isPending}
                      onChange={(v) => update.mutate({ key: f.key, ...v })}
                      control={
                        <ReelsClientModeControl
                          mode={reelsClientMode(enabledByKey)}
                          busy={reelsMode.isPending}
                          onChange={(m) => reelsMode.mutate(m)}
                        />
                      }
                    />
                  ) : (
                    <FlagCard key={f.key} f={f} i={i} busy={update.isPending} onChange={(v) => update.mutate({ key: f.key, ...v })} />
                  ),
                )}
              </div>
            </section>
          ) : null,
        )
      )}
    </>
  );
}

/** Owner 2026-11-04 (R-398): the three-way choice for client reels — one
 * segmented control (the admin's Tabs), three Russian labels, a line under
 * it saying what the chosen mode does. */
function ReelsClientModeControl({
  mode,
  busy,
  onChange,
}: {
  mode: ReelsClientMode;
  busy: boolean;
  onChange: (m: ReelsClientMode) => void;
}) {
  const hint = REELS_CLIENT_MODES.find((m) => m.value === mode)?.hint;
  return (
    <div className="mt-4" data-testid="reels-client-mode" aria-busy={busy}>
      <Tabs<ReelsClientMode>
        size="sm"
        value={mode}
        onChange={(m) => {
          if (!busy && m !== mode) onChange(m);
        }}
        items={REELS_CLIENT_MODES.map((m) => ({ value: m.value, label: m.label }))}
      />
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

function FlagCard({
  f,
  i,
  busy,
  onChange,
  control,
}: {
  f: Flag;
  i: number;
  busy: boolean;
  onChange: (v: { enabled: boolean }) => void;
  /** Replaces the on/off switch with a richer control (R-398). */
  control?: React.ReactNode;
}) {
  const info = infoFor(f);
  const title = info.title;
  const blocked = !f.enabled && f.paid && f.missingKeys.length > 0;
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card spotlight className="h-full p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-heading">{title}</h3>
              {f.enabled ? (
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
          {control ? null : (
            <Switch
              checked={f.enabled}
              disabled={busy || blocked}
              label={title}
              onChange={(v) => {
                if (v && f.paid && !window.confirm(`«${title}» использует платный сервис. Включить?`)) return;
                onChange({ enabled: v });
              }}
            />
          )}
        </div>
        {control}
        {f.paid && f.missingKeys.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            <span className="min-w-0 break-words">Нельзя включить: ключи сервиса ещё не добавлены.</span>
            <Link href={info.href ?? KEYS} className="font-medium underline-offset-2 hover:underline">
              Добавить ключи →
            </Link>
          </div>
        ) : info.href ? (
          <Link href={info.href} className="mt-3 inline-block text-xs text-gold-600 underline-offset-2 hover:underline">
            {info.hrefLabel ?? 'Открыть настройки'} →
          </Link>
        ) : null}
        <div className="mt-2 text-[11px] text-faint">Изменён {formatDateTime(f.updatedAt)}</div>
      </Card>
    </m.div>
  );
}
