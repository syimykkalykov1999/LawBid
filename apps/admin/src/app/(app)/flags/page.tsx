'use client';

import { Flask, Key, LockSimple, Percent } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

/** Russian names for the flags the app knows (the seed descriptions are English). */
const FLAG_TEXT: Record<string, [string, string]> = {
  video_posts: ['Рилсы (видео-посты)', 'Загрузка и лента коротких видео через Bunny Stream. Включается, когда все 5 ключей Bunny сохранены в «Ключи и сервисы».'],
  profile_promotion: ['Продвижение профиля адвоката', 'Платное поднятие профиля в поиске.'],
  stripe_identity: ['Проверка документов (Stripe Identity)', 'Автоматическая проверка удостоверения личности при верификации.'],
  persona_verification: ['Проверка документов (Persona)', 'Альтернативный провайдер проверки личности.'],
  auto_bar_check: ['Автопроверка лицензии в реестре', 'Сверка номера лицензии адвоката с реестром штата.'],
  device_attestation: ['Проверка подлинности устройства', 'App Attest / Play Integrity для защиты от ботов.'],
  phone_login: ['Вход по телефону', 'Код по SMS.'],
  email_login: ['Вход по email', 'Код на почту.'],
  apple_login: ['Вход через Apple', 'Sign in with Apple.'],
  google_login: ['Вход через Google', 'Google Sign-In.'],
};

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

/** docs/06 §2.3 item 7: switches + rollout percent; paid flags need provider keys,
 * unbuilt ones are locked by the server (409). */
export default function FlagsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Flag[],
  });
  const update = useMutation({
    mutationFn: async (v: { key: string; enabled?: boolean; rolloutPercent?: number }) => {
      const r = await api.PATCH('/admin/feature-flags/{key}', {
        params: { path: { key: v.key } },
        body: {
          ...(v.enabled !== undefined ? { enabled: v.enabled } : {}),
          ...(v.rolloutPercent !== undefined ? { rolloutPercent: v.rolloutPercent } : {}),
        },
      });
      return { v, r };
    },
    onSuccess: ({ v }) => {
      toast.success(
        v.enabled === undefined
          ? `Раскрытие: ${v.rolloutPercent}%`
          : `${FLAG_TEXT[v.key]?.[0] ?? v.key}: ${v.enabled ? 'включено' : 'выключено'}`,
      );
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
        subtitle="Включайте и скрывайте функции приложения без релиза. Изменение доходит до приложений за минуту и пишется в журнал аудита."
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
  onChange: (v: { enabled?: boolean; rolloutPercent?: number }) => void;
}) {
  const [title, text] = FLAG_TEXT[f.key] ?? [f.key, f.description ?? ''];
  const [rollout, setRollout] = useState(f.rolloutPercent);
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
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            <div className="mt-1 font-mono text-[11px] text-faint">{f.key}</div>
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
            <span>Нет ключей: {f.missingKeys.join(', ')}</span>
            <Link href="/integrations" className="font-medium underline-offset-2 hover:underline">
              Добавить ключи →
            </Link>
          </div>
        ) : null}
        {!f.notBuilt ? (
          <form
            className="mt-4 flex items-center gap-3 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ rolloutPercent: rollout });
            }}
          >
            <Percent size={15} className="text-faint" />
            <span className="text-xs text-muted">Раскрытие</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={rollout}
              onChange={(e) => setRollout(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-[#c9a24a]"
              aria-label="Процент пользователей"
            />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-ink">{rollout}%</span>
            <Button size="sm" variant="outline" type="submit" disabled={busy || rollout === f.rolloutPercent}>
              Сохранить
            </Button>
          </form>
        ) : (
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-faint">
            <Flask size={14} /> Сервер не даст включить, пока функция не готова в приложении.
          </div>
        )}
        <div className="mt-2 text-[11px] text-faint">Изменён {formatDateTime(f.updatedAt)}</div>
      </Card>
    </motion.div>
  );
}
