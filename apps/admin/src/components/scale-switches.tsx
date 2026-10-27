'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api/client';
import { livePoll } from '@/lib/live';

/**
 * Owner 2026-10-24: two switches on «Масштаб» that are OFF until somebody
 * taps them. Both need a fresh 2FA code and then a second admin's approval
 * («Требуют подтверждения»); the action runs when the second admin approves.
 *   - «Копия базы для чтения»: an RDS read replica, created / deleted by RDS.
 *   - «Разделить таблицу по месяцам»: online conversion in the background.
 */

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

interface Replica {
  state: string;
  lagSeconds: number | null;
  instanceClass: string | null;
  serving: boolean;
  note: string;
}

interface PartCard {
  table: string;
  label: string;
  rows: number;
  bytes: number;
  partitioned: boolean;
  partitions: number;
  state: string;
  blockedBy: string[];
  progress: number | null;
  phase: string | null;
  error: string | null;
  paused: boolean;
  canStart: boolean;
  canUndo: boolean;
  canFinalize: boolean;
  finalizeAfter: string | null;
  overThreshold: boolean;
  runnerConfigured: boolean;
}

type Pending =
  | { kind: 'replica'; enabled: boolean }
  | { kind: 'start' | 'undo' | 'finalize' | 'abort' | 'retry'; table: string }
  | { kind: 'pause'; table: string; paused: boolean };

const REPLICA_BADGE: Record<string, [string, Tone]> = {
  unavailable: ['Недоступно', 'neutral'],
  off: ['Выключено', 'neutral'],
  creating: ['Создаётся', 'warning'],
  on: ['Включено', 'success'],
  lagging: ['Отстаёт', 'warning'],
  deleting: ['Удаляется', 'warning'],
  error: ['Ошибка', 'danger'],
};

function size(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} ГБ`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1e3))} КБ`;
}

function count(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} млн` : n.toLocaleString('ru-RU');
}

function pendingTitle(p: Pending | null): string {
  if (!p) return '';
  switch (p.kind) {
    case 'replica':
      return p.enabled ? 'Включить копию базы для чтения?' : 'Выключить копию базы для чтения?';
    case 'start':
      return `Разделить таблицу ${p.table} по месяцам?`;
    case 'undo':
      return `Вернуть таблицу ${p.table} как было?`;
    case 'finalize':
      return `Завершить разделение ${p.table}?`;
    case 'abort':
      return `Остановить разделение ${p.table}?`;
    default:
      return '';
  }
}

function pendingText(p: Pending | null): string {
  if (!p) return '';
  switch (p.kind) {
    case 'replica':
      return p.enabled
        ? 'AWS создаст вторую копию базы (около 15-30 минут, платная, как основная база по размеру). Читать из неё приложение начнёт само, только когда она готова и почти не отстаёт; если она пропадёт или отстанет, чтения сами вернутся в основную базу. Нужно подтверждение второго админа.'
        : 'Копия будет удалена. Приложение уже читает из основной базы, ничего не ломается. Нужно подтверждение второго админа.';
    case 'start':
      return 'Таблица копируется в новую, разделённую по месяцам, пока приложение работает как обычно. Можно ставить на паузу и продолжать. В конце имена меняются за доли секунды. Нужно подтверждение второго админа.';
    case 'undo':
      return 'Имена таблиц меняются обратно за доли секунды. Это безопасно, пока старая копия не удалена: всё, что записано после разделения, в ней тоже есть.';
    case 'finalize':
      return 'Старая копия таблицы будет удалена НАВСЕГДА. После этого вернуть таблицу как было кнопкой уже нельзя: только отдельной медленной работой (обратное копирование). Нужно подтверждение второго админа.';
    case 'abort':
      return 'Новая разделённая копия будет удалена. Исходная таблица не менялась.';
    default:
      return '';
  }
}

export function ScaleSwitches() {
  const qc = useQueryClient();
  const toast = useToast();
  const replica = useQuery({
    queryKey: ['db-replica'],
    queryFn: async () => (await api.GET('/admin/system-health/db-replica')).data!.data as Replica,
    refetchInterval: livePoll(),
  });
  const parts = useQuery({
    queryKey: ['partitions'],
    queryFn: async () => (await api.GET('/admin/system-health/partitions')).data!.data as PartCard[],
    refetchInterval: livePoll(),
  });
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [stepUp, setStepUp] = useState<Pending | null>(null);

  const run = useMutation({
    mutationFn: async (p: Pending) => {
      switch (p.kind) {
        case 'replica':
          await api.POST('/admin/system-health/db-replica', { body: { enabled: p.enabled } });
          return;
        case 'pause':
          await api.POST('/admin/system-health/partitions/{table}/pause', {
            params: { path: { table: p.table } },
            body: { paused: p.paused },
          });
          return;
        case 'start':
          await api.POST('/admin/system-health/partitions/{table}/start', { params: { path: { table: p.table } } });
          return;
        case 'undo':
          await api.POST('/admin/system-health/partitions/{table}/undo', { params: { path: { table: p.table } } });
          return;
        case 'finalize':
          await api.POST('/admin/system-health/partitions/{table}/finalize', { params: { path: { table: p.table } } });
          return;
        case 'abort':
          await api.POST('/admin/system-health/partitions/{table}/abort', { params: { path: { table: p.table } } });
          return;
        case 'retry':
          await api.POST('/admin/system-health/partitions/{table}/retry', { params: { path: { table: p.table } } });
      }
    },
    onSuccess: async (_r, p) => {
      toast.success(
        p.kind === 'pause' || p.kind === 'retry' || p.kind === 'abort' ? 'Готово' : 'Отправлено на подтверждение второму админу',
      );
      await qc.invalidateQueries({ queryKey: ['partitions'] });
      await qc.invalidateQueries({ queryKey: ['db-replica'] });
    },
    onError: (err, p) => {
      if (err instanceof ApiError && err.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(p);
      else toast.error(err);
    },
  });

  const r = replica.data;
  const rb = r ? (REPLICA_BADGE[r.state] ?? ['—', 'neutral' as Tone]) : null;

  return (
    <>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className="flex min-w-0 flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 text-sm font-medium text-heading">Копия базы для чтения</div>
            {rb ? (
              <Badge tone={rb[1]} dot className="shrink-0">
                {rb[0]}
              </Badge>
            ) : null}
          </div>
          <p className="break-words text-sm text-muted">
            {r ? r.note : 'Загрузка…'}
          </p>
          {r && r.state !== 'unavailable' && r.state !== 'off' ? (
            <div className="text-sm text-muted">
              Отставание: <span className="text-ink">{r.lagSeconds == null ? '—' : `${Math.round(r.lagSeconds)} с`}</span>
              {r.instanceClass ? (
                <>
                  {' '}
                  · размер: <span className="text-ink">{r.instanceClass}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!r || r.state !== 'off'}
              onClick={() => setConfirm({ kind: 'replica', enabled: true })}
            >
              Включить
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!r || ['unavailable', 'off', 'deleting'].includes(r.state)}
              onClick={() => setConfirm({ kind: 'replica', enabled: false })}
            >
              Выключить
            </Button>
          </div>
          <p className="text-xs text-muted">
            Пока копия есть, автоматическое изменение размера базы на паузе: размер основной и копии меняется вручную вместе.
          </p>
        </Card>

        {(parts.data ?? []).map((c) => (
          <PartitionCardView key={c.table} c={c} onAct={(p) => (['pause', 'retry'].includes(p.kind) ? run.mutate(p) : setConfirm(p))} />
        ))}
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={pendingTitle(confirm)}
        description={pendingText(confirm)}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              const p = confirm;
              setConfirm(null);
              if (p) run.mutate(p);
            }}
          >
            Продолжить
          </Button>
        </div>
      </Dialog>

      <StepUpDialog
        open={stepUp !== null}
        description="Это меняет базу данных на AWS. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const p = stepUp;
          setStepUp(null);
          if (p) run.mutate(p);
        }}
      />
    </>
  );
}

function PartitionCardView({ c, onAct }: { c: PartCard; onAct: (p: Pending) => void }) {
  const monthly = c.state === 'monthly';
  const tone: Tone = monthly || c.state === 'swapped' ? 'success' : c.state === 'error' ? 'danger' : c.state === 'blocked' ? 'neutral' : c.state === 'idle' ? (c.overThreshold ? 'warning' : 'neutral') : 'warning';
  const label =
    monthly ? 'По месяцам' : c.state === 'running' ? 'Идёт' : c.state === 'paused' ? 'Пауза' : c.state === 'swapped' ? 'Готово, можно вернуть' : c.state === 'error' ? 'Ошибка' : c.state === 'blocked' ? 'Пока нельзя' : c.overThreshold ? 'Пора' : 'Не разделена';
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-heading">Разделить таблицу по месяцам: {c.label}</div>
        <Badge tone={tone} dot className="shrink-0">
          {label}
        </Badge>
      </div>
      <p className="text-sm text-muted">
        Строк: <span className="text-ink">{count(c.rows)}</span> · размер: <span className="text-ink">{size(c.bytes)}</span> ·
        по месяцам: <span className="text-ink">{c.partitioned ? `да (${c.partitions} кусков)` : 'нет'}</span>
      </p>
      {c.overThreshold ? (
        <p className="text-sm text-ink">Больше 50 млн строк: самое время разделить.</p>
      ) : null}
      {c.progress != null ? (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-gold" style={{ width: `${c.progress}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted">
            {c.progress}% · этап: {c.phase}
            {c.paused ? ' · на паузе' : ''}
          </div>
        </div>
      ) : null}
      {c.error ? <p className="break-words text-sm text-danger">Ошибка: {c.error}</p> : null}
      {c.state === 'blocked' ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
          {c.blockedBy.map((b) => (
            <li key={b} className="break-words">
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      {c.state === 'swapped' ? (
        <p className="text-xs text-muted">
          Старая копия хранится до {c.finalizeAfter ? new Date(c.finalizeAfter).toLocaleDateString('ru-RU') : '—'}. «Вернуть как
          было» работает, пока копия не удалена. После «Завершить» вернуть кнопкой нельзя (только отдельной медленной работой).
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {c.state === 'running' || c.state === 'paused' ? (
          <>
            <Button variant="outline" size="sm" onClick={() => onAct({ kind: 'pause', table: c.table, paused: !c.paused })}>
              {c.paused ? 'Продолжить' : 'Пауза'}
            </Button>
            {c.phase !== 'swap' ? (
              <Button variant="ghost" size="sm" onClick={() => onAct({ kind: 'abort', table: c.table })}>
                Остановить
              </Button>
            ) : null}
          </>
        ) : null}
        {c.state === 'error' ? (
          <Button variant="outline" size="sm" onClick={() => onAct({ kind: 'retry', table: c.table })}>
            Повторить шаг
          </Button>
        ) : null}
        {c.state === 'idle' || c.state === 'blocked' ? (
          <Button variant="outline" size="sm" disabled={!c.canStart} onClick={() => onAct({ kind: 'start', table: c.table })}>
            Запустить
          </Button>
        ) : null}
        {c.state === 'swapped' ? (
          <>
            <Button variant="outline" size="sm" disabled={!c.canUndo} onClick={() => onAct({ kind: 'undo', table: c.table })}>
              Вернуть как было
            </Button>
            <Button variant="ghost" size="sm" disabled={!c.canFinalize} onClick={() => onAct({ kind: 'finalize', table: c.table })}>
              Завершить
            </Button>
          </>
        ) : null}
      </div>
      {!c.runnerConfigured && (c.state === 'idle' || c.state === 'blocked') ? (
        <p className="text-xs text-muted">Кнопка заработает после настройки отдельной роли базы (PARTITION_DATABASE_URL), см. инструкцию.</p>
      ) : null}
    </Card>
  );
}
