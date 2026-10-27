'use client';

import { ArrowRight, CheckCircle, Question, Scales, XCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Table, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  FACT_LABEL,
  NEXT_MESSAGE,
  REVIEW_KIND_LABEL,
  REVIEW_REASONS,
  percent,
  useGolden,
  useMarkGolden,
  useReviewActions,
  useReviewCurrent,
  useReviewStats,
  useReviewTeam,
  type ReviewMe,
  type ReviewSample,
} from '@/lib/desk-review';
import { formatDateTime, formatDuration } from '@/lib/utils';

type Section = 'check' | 'team' | 'golden' | 'numbers';

/**
 * Staff package T9: the «Перепроверка» tab. A reviewer (owner, head or a
 * senior worker) takes one closed decision at a time and says whether it
 * stands. It is a second look AFTER the fact — the worker's decision is
 * already in force, nobody approves anything. The worker's name is never
 * shown (only the owner sees it). The head and the owner also see the
 * returned rate of their people, the golden tasks and the numbers.
 */
export function ReviewTab({ me }: { me: ReviewMe }) {
  const [section, setSection] = useState<Section>('check');
  const items: { value: Section; label: string }[] = [{ value: 'check', label: 'Проверка' }];
  if (me.canManage) {
    items.push(
      { value: 'team', label: 'Возвраты по людям' },
      { value: 'golden', label: 'Эталонные задачи' },
      { value: 'numbers', label: 'Цифры' },
    );
  }
  return (
    <div data-testid="review-tab">
      {items.length > 1 ? <Tabs<Section> size="sm" className="mb-4" value={section} onChange={setSection} items={items} /> : null}
      {section === 'check' ? <CheckSection me={me} /> : null}
      {section === 'team' && me.canManage ? <TeamSection /> : null}
      {section === 'golden' && me.canManage ? <GoldenSection /> : null}
      {section === 'numbers' && me.canManage ? <NumbersSection /> : null}
    </div>
  );
}

// --- the check ----------------------------------------------------------------------

function CheckSection({ me }: { me: ReviewMe }) {
  const toast = useToast();
  const cur = useReviewCurrent(true);
  const { next, verdict, release } = useReviewActions();
  const mark = useMarkGolden();
  const [notice, setNotice] = useState<string | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);

  const held: ReviewSample | null = cur.data && cur.data.ok ? cur.data.data.sample : null;
  const busy = next.isPending || verdict.isPending || release.isPending;

  const take = async () => {
    setNotice(null);
    setLastConfirmed(null);
    const r = await next.mutateAsync();
    if (!r.ok) return setNotice('Перепроверка недоступна');
    if (r.data.status !== 'leased') setNotice(NEXT_MESSAGE[r.data.status as keyof typeof NEXT_MESSAGE] ?? 'Пока ничего нет');
  };

  const answer = async (v: 'confirmed' | 'overturned' | 'unclear') => {
    if (!held) return;
    const r = await verdict.mutateAsync({ id: held.id, verdict: v, reasons: v === 'overturned' ? reasons : undefined });
    setChoosing(false);
    setReasons([]);
    if (!r.ok) {
      setNotice('Эта проверка уже не у вас — возьмите следующую');
      return;
    }
    if (v === 'confirmed') {
      setLastConfirmed(held.id);
      toast.success('Решение подтверждено');
    } else if (v === 'overturned') toast.success('Отмена записана');
    else toast.success('Передано другому проверяющему');
  };

  if (cur.isPending) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Это второй взгляд на уже принятое решение. Решение работника остаётся в силе, пока вы не отмените его; имя работника вам не показывается.
      </p>
      {held ? (
        <SampleCard sample={held}>
          {choosing ? (
            <div className="mt-4 space-y-3" data-testid="review-reasons">
              <div className="text-sm font-medium text-heading">Почему решение неверное?</div>
              <div className="flex flex-wrap gap-2">
                {REVIEW_REASONS.map((r) => {
                  const on = reasons.includes(r.value);
                  return (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setReasons(on ? reasons.filter((x) => x !== r.value) : [...reasons, r.value].slice(0, 5))}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-gold/60 bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink'}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" disabled={reasons.length === 0} loading={busy} onClick={() => void answer('overturned')}>
                  Отменить решение
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
                  Назад
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="gold" size="sm" loading={busy} onClick={() => void answer('confirmed')}>
                <CheckCircle size={15} weight="bold" />
                Решение верное
              </Button>
              <Button variant="danger-soft" size="sm" disabled={busy} onClick={() => setChoosing(true)}>
                <XCircle size={15} weight="bold" />
                Решение неверное
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void answer('unclear')}>
                <Question size={15} />
                Не могу решить
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void release.mutateAsync(held.id)}>
                Отпустить
              </Button>
            </div>
          )}
        </SampleCard>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="gold" size="sm" loading={next.isPending} onClick={() => void take()}>
              {next.isPending ? null : <ArrowRight size={15} weight="bold" />}
              Следующая проверка
            </Button>
            {notice ? <span className="text-sm text-muted">{notice}</span> : null}
          </div>
          {lastConfirmed && me.canManage ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted" data-testid="review-golden-offer">
              Подтверждённое решение можно выдать как эталонную задачу.
              <Button
                variant="soft"
                size="sm"
                loading={mark.isPending}
                onClick={async () => {
                  const r = await mark.mutateAsync(lastConfirmed);
                  if (r.ok) toast.success('Эталонная задача выдана');
                  else toast.error('Не получилось: уже выдавалась или нет подходящего работника');
                  setLastConfirmed(null);
                }}
              >
                <Scales size={14} />
                Сделать эталоном
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      {held && notice ? <div className="text-sm text-muted">{notice}</div> : null}
    </div>
  );
}

function SampleCard({ sample, children }: { sample: ReviewSample; children: React.ReactNode }) {
  return (
    <Card className="p-5" data-testid="review-sample">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-heading">{REVIEW_KIND_LABEL[sample.decisionKind] ?? sample.decisionKind}</span>
        <div className="flex items-center gap-2">
          {sample.stage === 'peer' ? <Badge tone="info">Сверка проверяющих</Badge> : null}
          {sample.stage === 'newcomer' ? <Badge tone="gold">Новичок</Badge> : null}
          <Badge tone="neutral">до {formatDateTime(sample.leasedUntil)}</Badge>
        </div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {sample.outcome ? (
          <div>
            <dt className="text-faint">Что выбрал работник</dt>
            <dd className="font-medium text-heading">{sample.outcome}</dd>
          </div>
        ) : null}
        {sample.decidedAt ? (
          <div>
            <dt className="text-faint">Закрыто</dt>
            <dd>
              {formatDateTime(sample.decidedAt)}
              {sample.handleSec !== null ? `, ${formatDuration(sample.handleSec)}` : ''}
            </dd>
          </div>
        ) : null}
        {sample.facts.map((f) => (
          <div key={f.key}>
            <dt className="text-faint">{FACT_LABEL[f.key] ?? f.key}</dt>
            <dd className="break-words">{f.value}</dd>
          </div>
        ))}
        {sample.worker ? (
          <div>
            <dt className="text-faint">Работник (видно только владельцу)</dt>
            <dd>{sample.worker.name}</dd>
          </div>
        ) : null}
      </dl>
      {children}
    </Card>
  );
}

// --- owner / head ---------------------------------------------------------------------

function TeamSection() {
  const q = useReviewTeam(true);
  if (q.isPending) return <Skeleton className="h-32 w-full" />;
  if (!q.data || !q.data.ok) return <EmptyState icon={Scales} title="Пока нет данных" text="Ночной расчёт рейтинга ещё не включён." />;
  const rows = q.data.data.items;
  if (rows.length === 0) return <EmptyState icon={Scales} title="Пока нет данных" text="Цифры появятся после первого ночного расчёта." />;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Доля закрытых дел, которые вернулись (повторное обращение или жалоба). Данные на {q.data.data.snapshotDate ?? '—'}.</p>
      <Table>
        <thead>
          <tr>
            <Th>Работник</Th>
            <Th>Закрыто</Th>
            <Th>Вернулось</Th>
            <Th>Перепроверено</Th>
            <Th>Отменено</Th>
            <Th>Эталоны: провалено</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.adminId}>
              <Td>{r.name}</Td>
              <Td>{r.decisions}</Td>
              <Td>{percent(r.returnedRate)}</Td>
              <Td>{r.sampled}</Td>
              <Td>{r.overturned}</Td>
              <Td>
                {r.goldenFailed} из {r.goldenTotal}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

const GOLDEN_STATE = { pending: { label: 'ждёт ответа', tone: 'neutral' }, passed: { label: 'верно', tone: 'success' }, failed: { label: 'неверно', tone: 'danger' } } as const;

function GoldenSection() {
  const q = useGolden(true);
  if (q.isPending) return <Skeleton className="h-32 w-full" />;
  if (!q.data || !q.data.ok) return <EmptyState icon={Scales} title="Эталонные задачи не включены" />;
  const rows = q.data.data.items;
  if (rows.length === 0) {
    return <EmptyState icon={Scales} title="Эталонных задач пока нет" text="Подтвердите решение на вкладке «Проверка» и выдайте его как эталон." />;
  }
  return (
    <Table>
      <thead>
        <tr>
          <Th>Работник</Th>
          <Th>Тип</Th>
          <Th>Выдана</Th>
          <Th>Итог</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.id}>
            <Td>{g.worker.name}</Td>
            <Td>{REVIEW_KIND_LABEL[g.decisionKind.replace(/^golden_/, '')] ?? g.decisionKind}</Td>
            <Td>{formatDateTime(g.createdAt)}</Td>
            <Td>
              <Badge tone={GOLDEN_STATE[g.state].tone}>{GOLDEN_STATE[g.state].label}</Badge>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const WS_LABEL: Record<string, string> = { mass: 'Массовая работа', finance: 'Финансы', owner: 'Владелец' };

function NumbersSection() {
  const q = useReviewStats(true);
  if (q.isPending) return <Skeleton className="h-32 w-full" />;
  if (!q.data || !q.data.ok) return <EmptyState icon={Scales} title="Пока нет данных" />;
  const s = q.data.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="review-numbers">
        {s.workspaces.length === 0 ? <EmptyState icon={Scales} title="Пока нет данных" /> : null}
        {s.workspaces.map((w) => (
          <Card key={w.workspace} className="p-4">
            <div className="font-medium text-heading">{WS_LABEL[w.workspace] ?? w.workspace}</div>
            <dl className="mt-2 space-y-1 text-sm">
              <Row k="Перепроверено" v={String(w.sampled)} />
              <Row k="Отменено" v={`${w.overturned} (${percent(w.overturnRate)})`} />
              <Row k="Вернулось дел" v={percent(w.returnedRate)} />
              <Row k="Эталоны: провалено" v={`${w.goldenFailed} из ${w.goldenTotal}`} />
              <Row k="Ждут проверки сейчас" v={String(w.pending)} />
            </dl>
          </Card>
        ))}
      </div>
      <div>
        <div className="mb-2 text-sm font-medium text-heading">Совпадение мнений проверяющих (30 дней)</div>
        {s.calibration.length === 0 ? (
          <p className="text-sm text-muted">Пока нет дел, которые проверили двое.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Тип дела</Th>
                <Th>Пар</Th>
                <Th>Совпало</Th>
              </tr>
            </thead>
            <tbody>
              {s.calibration.map((c) => (
                <tr key={c.decisionKind}>
                  <Td>{REVIEW_KIND_LABEL[c.decisionKind] ?? c.decisionKind}</Td>
                  <Td>{c.pairs}</Td>
                  <Td>{percent(c.agreementPct)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="tabular-nums text-heading">{v}</dd>
    </div>
  );
}
