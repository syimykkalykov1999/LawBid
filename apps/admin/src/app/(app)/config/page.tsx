'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { CONFIG_TYPE, label } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** Russian explanations for the known keys (most server descriptions are null or English). */
const KEY_TEXT: Record<string, string> = {
  'billing.max_assistant_seats': 'Сколько помощников может добавить адвокат (годовой тариф включает все).',
  'cases.urgency_days_very_urgent': 'Дело с датой считается «очень срочным», если до даты осталось не больше стольких дней.',
  'cases.urgency_days_urgent': 'Дело с датой считается «срочным», если до даты осталось не больше стольких дней.',
  'cases.urgency_days_soon': 'Дело с датой считается «на этой неделе», если до даты осталось не больше стольких дней.',
  'cases.urgency_days_within_month': 'Дело с датой считается «в течение месяца», если до даты осталось не больше стольких дней (дальше — «не срочно»).',
  'cases.deadline_reminder_days': 'За сколько дней до даты по делу (суд, срок подачи) напоминать клиенту и нанятому адвокату; 0 — в сам день.',
  'cases.deadline_reminders_auto': 'Автоматические напоминания о датах по делам (выкл. — не отправлять).',
  'invites.expiry_days': 'Через сколько дней истекает приглашение клиента («Предложить дело»), если адвокат не ответил.',
  'invites.max_pending_per_case': 'Сколько адвокатов одновременно могут ждать ответа по одному делу.',
  'invites.max_per_day': 'Сколько приглашений клиент может отправить за день.',
  'verification.max_submissions_30d': 'Сколько заявок на верификацию адвокат может подать за 30 дней.',
  'verification.signed_url_ttl_sec': 'Сколько секунд живёт ссылка на документ верификации.',
  'verification.license_expiry_notify_days': 'За сколько дней напоминать об окончании лицензии.',
  // Owner 2026-10-05: «Борьба с мошенниками» — what to require of an attorney; удобнее править в «Верификация → Борьба с мошенниками».
  'trust.enabled': 'Главный выключатель защиты от мошенников. Выключено — адвокаты с присягой получают галочку и приём оплат сразу, холды ничего не закрывают, очередь пуста.',
  'trust.manual_review': 'Ручная проверка сотрудниками. Выключено — только автоматические проверки: очередь на паузе (записи сохраняются), требование документов не действует.',
  'trust.require_registry': 'Требовать, чтобы номер лицензии совпал с реестром штата (или подтвердил сотрудник) — для галочки и приёма денег.',
  'trust.require_identity': 'Требовать Stripe KYC на самого адвоката (имя совпало) или подтверждённую связь с фирмой — для галочки и приёма денег.',
  'trust.require_documents': 'Требовать проверку документов сотрудником (удостоверение, селфи, карточка адвоката) — для галочки и приёма денег.',
  'trust.bids_require_cleared': 'Ставки и чат с клиентом тоже ждут, пока адвокат пройдёт требования; выключено — открыты сразу.',
  'security.admin_rate_limit_per_minute': 'Сколько запросов в минуту может сделать один вошедший админ (от 100 до 10 000; у пользователей приложения всегда 100). Если в админке появляется «Слишком много запросов», поднимите это число.',
  'trust.payout_delay_days': 'Задержка выплат Stripe в днях, пока адвокат не подтверждён; 0 — стандартный график Stripe.',
  'trust.auto_hold_on_complaint': 'Жалоба клиента «мошенничество» или «самозванец» сразу ставит холд на платежи и ставки и отправляет адвоката в очередь.',
  'trust.complaints_to_suspend': 'Столько разных клиентов пожаловались за окно — профиль адвоката приостанавливается до разбора.',
  'trust.complaint_window_days': 'Окно в днях, за которое считаются жалобы для автоприостановки.',
  'trust.auto_hold_on_name_mismatch': 'Имя из Stripe KYC не совпало с профилем и реестром — платежи на холд, адвокат в очереди.',
  'trust.flag_duplicate_claims': 'Кто-то регистрируется с уже занятым номером лицензии — владелец номера попадает в очередь на сверку с реестром.',
  'trust.firm_link_auto_registry': 'Stripe-аккаунт компании: связь адвоката с фирмой засчитывается сама, если фирма в реестре штата совпала с названием компании в Stripe.',
  'trust.firm_link_auto_email': 'Stripe-аккаунт компании: связь с фирмой засчитывается сама после подтверждения e-mail на домене сайта компании.',
  'trust.block_on_reject': 'Отклонение или приостановка адвоката блокирует его номер лицензии: этот номер нельзя зарегистрировать снова под другим именем или новым аккаунтом (вкладка «Заблокированные номера»).',
  'trust.block_contacts': 'Вместе с номером лицензии в блок-лист попадают e-mail и телефон отклонённого аккаунта — с них тоже не зарегистрироваться.',
  'profile.username_change_cooldown_days': 'Как часто можно менять @username (дней).',
  'profile.reserved_usernames': 'Запрещённые @username.',
  'review.edit_window_days': 'Сколько дней отзыв можно редактировать.',
  'review.reminder_after_days': 'Через сколько дней напомнить оставить отзыв.',
  'files.max_size_mb': 'Максимальный размер файла, МБ.',
  'files.avatar_max_size_mb': 'Максимальный размер аватара, МБ.',
  'files.chat_max_size_mb': 'Максимальный размер файла в чате, МБ.',
  'files.sticker_max_size_mb': 'Максимальный размер стикера, МБ.',
  'files.post_attachment_max_size_mb': 'Максимальный размер документа в посте или рилсе (PDF, Word, текст), МБ.',
  'posts.attachments_max_total_mb': 'Все документы одного поста вместе, МБ.',
  'video.max_source_duration_sec': 'Длина исходного видео, из которого автор вырезает рилс, сек.',
  'media.photo_max_px': 'Фото (посты, рилсы, дела, отзывы): длинная сторона после сжатия на телефоне, px',
  'media.photo_quality': 'Фото: качество JPEG после сжатия на телефоне (50–100)',
  'media.video_max_height': 'Видео (рилсы): высота кадра после сжатия на телефоне, px (1080 = Full HD; 0 = без сжатия)',
  'media.video_frame_rate': 'Видео: кадров в секунду после сжатия (24–60)',
  'files.document_template_max_size_mb': 'Максимальный размер шаблона документа (PDF, Word), МБ.',
  'media.avatar_max_px': 'Фото профиля: длинная сторона после сжатия, px',
  'translate.scope': 'Где работает переводчик: all = везде, zones = только в разделах ниже, где стоит true. Удобнее менять в «Ключи и сервисы» → Google Translate.',
  'translate.chat': 'Перевод в чатах (при «только выбранные»).',
  'translate.posts': 'Перевод постов и комментариев в ленте (при «только выбранные»).',
  'translate.cases': 'Перевод описания кейса и текста ставки (при «только выбранные»).',
  'translate.reviews': 'Перевод отзывов (при «только выбранные»).',
  'translate.profiles': 'Перевод «О себе» в профиле адвоката (при «только выбранные»).',
  'payroll.stripe_fee_percent':
    'Зарплаты через Stripe: процент Stripe с каждой выплаты. Вычитается из выплаты сотрудника, не с вашего счёта.',
  'payroll.stripe_fee_fixed_cents':
    'Зарплаты через Stripe: фиксированная часть комиссии за выплату, в центах (25 = $0.25). Платит сотрудник.',
  'payroll.stripe_monthly_fee_cents':
    'Зарплаты через Stripe: плата Stripe за активный счёт в месяц, в центах (200 = $2). Вычитается из первой выплаты месяца.',
  'contacts.suspend_after_confirmed_reports': 'После скольких подтверждённых «Не могу связаться» клиент приостанавливается.',
  'rate_limit.post_create_per_day': 'Публикаций в день на пользователя.',
  'rate_limit.comment_per_hour': 'Комментариев в час.',
  'rate_limit.like_per_hour': 'Лайков в час.',
  'rate_limit.follow_per_day': 'Подписок в день.',
  'rate_limit.message_per_minute': 'Сообщений в минуту.',
  'rate_limit.search_per_minute': 'Поисковых запросов в минуту.',
  'rate_limit.report_per_day': 'Жалоб в день.',
  'rate_limit.video_upload_per_day': 'Загрузок видео в день.',
  'rate_limit.sticker_pack_create_per_day': 'Новых наборов стикеров в день.',
  'rate_limit.sticker_add_per_hour': 'Добавлений стикеров в час.',
  'rate_limit.support_ticket_per_hour': 'Обращений в поддержку в час.',
  'rate_limit.support_message_per_hour': 'Сообщений в поддержку в час.',
  'notifications.retention_days': 'Сколько дней хранить уведомления.',
  'subscription.past_due_grace_days': 'Льготный период после неудачной оплаты, дней.',
  'moderation.blocked_terms': 'Слова, с которыми публикация отклоняется.',
  'moderation.hold_terms': 'Слова, с которыми публикация уходит на проверку.',
  'moderation.auto_hide_reports': 'После скольких жалоб объект скрывается автоматически.',
  'moderation.max_links': 'Больше стольких ссылок — публикация на проверку.',
  'moderation.duplicate_window_hours': 'Окно поиска повторяющегося текста, часов.',
  'video.max_duration_sec': 'Максимальная длина рилса, секунд.',
  'video.max_size_mb': 'Максимальный размер видео, МБ.',
  'video.upload_ttl_min': 'Сколько минут действует ссылка загрузки видео.',
  'video.playback_ttl_sec': 'Сколько секунд действует ссылка воспроизведения.',
  'video.max_pending_per_user': 'Сколько видео пользователь может обрабатывать одновременно.',
  'stickers.max_own_packs': 'Своих наборов стикеров на пользователя.',
  'stickers.max_per_pack': 'Стикеров в наборе.',
  'stickers.max_installed': 'Установленных наборов на пользователя.',
  'stickers.recent_max': 'Сколько недавних стикеров помнить.',
  'tasks.archive_retention_days':
    'Сколько дней хранить выполненные задачи в архиве (вместе с файлами). За 30 и 7 дней до удаления владельцу приходит уведомление; задачи «Сохранить навсегда» не удаляются.',
  'tasks.archive_auto_purge': 'Автоматически очищать архив задач по сроку (выключено — архив хранится всегда).',
  'sms.allowed_country_codes': 'Страны (ISO, 2 буквы), куда можно слать SMS-коды.',
  min_app_version_ios: 'Минимальная версия iOS-приложения; старее — обязательное обновление.',
  min_app_version_android: 'Минимальная версия Android-приложения; старее — обязательное обновление.',
  soft_update_version_ios: 'Рекомендуемая версия iOS; старее — мягкое предложение обновиться.',
  soft_update_version_android: 'Рекомендуемая версия Android; старее — мягкое предложение обновиться.',
};

function keyText(e: { key: string; description: string | null }): string | null {
  if (KEY_TEXT[e.key]) return KEY_TEXT[e.key];
  const budget = /^budget\.(\w+)\.(per_minute_max|daily_max|monthly_max)$/.exec(e.key);
  if (budget) {
    const what: Record<string, string> = {
      sms: 'SMS',
      email: 'писем',
      id_check: 'проверок документов',
      storage: 'хранилища',
    };
    const per: Record<string, string> = {
      per_minute_max: 'в минуту',
      daily_max: 'в день',
      monthly_max: 'в месяц',
    };
    return `Лимит расходов: ${what[budget[1]] ?? budget[1]} ${per[budget[2]]}; 0 — отключить.`;
  }
  return e.description;
}

type Entry = {
  key: string;
  type: string;
  value: unknown;
  defaultValue: unknown;
  description: string | null;
  min: number | null;
  max: number | null;
  stored: boolean;
  updatedAt: string | null;
};

function parse(type: string, raw: string): { value?: unknown; error?: string } {
  const t = raw.trim();
  try {
    switch (type) {
      case 'integer':
      case 'number': {
        const n = Number(t);
        if (t === '' || !Number.isFinite(n)) return { error: 'нужно число' };
        if (type === 'integer' && !Number.isInteger(n)) return { error: 'нужно целое число' };
        return { value: n };
      }
      case 'boolean':
        if (t === 'true' || t === 'false') return { value: t === 'true' };
        return { error: 'да или нет' };
      case 'string':
        return { value: t };
      case 'string[]':
        return { value: t === '' ? [] : t.split(',').map((x) => x.trim()).filter(Boolean) };
      case 'integer[]':
      {
        const list = t === '' ? [] : t.split(',').map((x) => Number(x.trim()));
        if (list.some((n) => !Number.isInteger(n))) return { error: 'целые числа через запятую' };
        return { value: list };
      }
      default:
        return { value: JSON.parse(t) as unknown };
    }
  } catch {
    return { error: 'неверный формат' };
  }
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v));

/** docs/06 §2.3 item 8: schema-validated editor of app_config. */
export default function ConfigPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const q = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data as Entry[],
  });
  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown }) =>
      // The contract types `value` as an opaque object; any JSON value is valid here.
      api.PUT('/admin/config/{key}', {
        params: { path: { key: v.key } },
        body: { value: v.value } as never,
      }),
    onSuccess: (_r, v) => {
      toast.success(`Сохранено: ${v.key}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[v.key];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(e),
  });
  const f = filter.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (e) => !f || e.key.toLowerCase().includes(f) || (keyText(e) ?? '').toLowerCase().includes(f),
  );

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Настройки"
        subtitle="Лимиты, минимальные версии приложения, льготный период, пороги. Значения проверяются схемой ключа."
        actions={
          <div className="relative">
            <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input
              aria-label="Фильтр"
              placeholder="Ключ или описание"
              className="w-64 pl-9"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Ключ</Th>
            <Th>Тип</Th>
            <Th>Значение</Th>
            <Th>По умолчанию</Th>
            <Th>Изменён</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={5} loading /> : null}
          {!q.isPending && !q.error && rows.length === 0 ? (
            <TableEmpty colSpan={5}>{f ? 'Нет ключей под этот фильтр' : 'Настроек нет'}</TableEmpty>
          ) : null}
          {rows.map((e, i) => {
            const draft = drafts[e.key];
            const parsed = draft === undefined ? null : parse(e.type, draft);
            const text = keyText(e);
            return (
              <MotionRow key={e.key} i={i}>
                <Td className="max-w-sm">
                  {text ? <div className="text-sm text-ink">{text}</div> : null}
                  <span className="font-mono text-[11px] text-faint">{e.key}</span>
                </Td>
                <Td className="text-xs whitespace-nowrap">
                  <span title={e.type}>{label(CONFIG_TYPE, e.type)}</span>
                  {e.min !== null || e.max !== null ? <div className="text-muted">{e.min ?? '−∞'} … {e.max ?? '∞'}</div> : null}
                </Td>
                <Td>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      if (parsed && !parsed.error) save.mutate({ key: e.key, value: parsed.value });
                    }}
                  >
                    {e.type === 'boolean' ? (
                      <Select
                        className="h-8 w-28 text-xs"
                        value={draft ?? show(e.value)}
                        onChange={(ev) => setDrafts({ ...drafts, [e.key]: ev.target.value })}
                      >
                        {e.value === null || e.value === undefined ? <option value="">—</option> : null}
                        <option value="true">да</option>
                        <option value="false">нет</option>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 min-w-48 font-mono text-xs"
                        value={draft ?? show(e.value)}
                        onChange={(ev) => setDrafts({ ...drafts, [e.key]: ev.target.value })}
                      />
                    )}
                    {draft !== undefined ? (
                      <Button size="sm" type="submit" disabled={save.isPending || Boolean(parsed?.error)} title={parsed?.error}>
                        Сохранить
                      </Button>
                    ) : null}
                  </form>
                  {parsed?.error ? <div className="mt-1 text-[11px] text-danger">{parsed.error}</div> : null}
                  {!e.stored ? <div className="mt-1 text-[10px] text-faint">по умолчанию (не меняли)</div> : null}
                </Td>
                <Td className="font-mono text-xs text-muted">
                  {e.type === 'boolean' && typeof e.defaultValue === 'boolean' ? (e.defaultValue ? 'да' : 'нет') : show(e.defaultValue) || '—'}
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted">{e.updatedAt ? formatDateTime(e.updatedAt) : <Badge>—</Badge>}</Td>
              </MotionRow>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
