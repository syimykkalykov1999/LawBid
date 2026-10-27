'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Scales } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { isOwner, staffPost, useAppeal, useAppeals, useRetaliationFlags, type AppealDetail, type RetaliationFlag } from '@/lib/staff-data';
import { APPEAL_DECISION, APPEAL_KIND, APPEAL_STATUS } from '@/lib/staff-labels';
import { formatDateTime } from '@/lib/utils';

const DECISIONS: { value: 'fire_head' | 'fire_worker' | 'nothing'; label: string; hint: string; danger?: boolean }[] = [
  { value: 'nothing', label: 'Ничего не делать', hint: 'Жалоба прочитана, последствий нет.' },
  { value: 'fire_worker', label: 'Закончить работу с исполнителем', hint: 'Доступ автора жалобы закрывается.', danger: true },
  { value: 'fire_head', label: 'Закончить работу с главным', hint: 'Доступ главного закрывается.', danger: true },
];

function AppealDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useAppeal(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const d: AppealDetail | null = q.data?.ok ? q.data.data : null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['staff-appeals'] });
    void qc.invalidateQueries({ queryKey: ['staff-appeal', id] });
    void qc.invalidateQueries({ queryKey: ['staff-flags'] });
    void qc.invalidateQueries({ queryKey: ['staff-today'] });
  };
  const decide = useMutation({
    mutationFn: (decision: string) =>
      staffPost<{ followUp: { applied: boolean; call: string } | null }>(`/admin/appeals/${id}/decide`, { decision, note: note.trim() || undefined }),
    onSuccess: (r) => {
      toast.success(r.followUp && !r.followUp.applied ? `Решение записано. Выполните вручную: ${r.followUp.call}` : 'Решение записано.');
      refresh();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const reveal = useMutation({
    mutationFn: () => staffPost<{ name: string; revealsLeftToday: number }>(`/admin/appeals/${id}/reveal`),
    onSuccess: (r) => {
      setRevealed(r.name);
      toast.info(`Имя раскрыто. Остаток раскрытий на сегодня: ${r.revealsLeftToday}.`);
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog open onClose={onClose} title={d ? `Жалоба №${d.number}` : 'Жалоба'} description={d ? `${APPEAL_KIND[d.kind] ?? d.kind} · на ${d.head.name}` : undefined} wide>
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !d ? (
        <p className="text-sm text-muted">Жалоба не найдена.</p>
      ) : (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-ink">{d.text}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Автор:</span>
            <span className="font-medium text-heading">{revealed ?? d.author.label}</span>
            {d.author.anonymous && !revealed ? (
              <Button size="sm" variant="outline" loading={reveal.isPending} onClick={() => reveal.mutate()}>
                Раскрыть имя
              </Button>
            ) : null}
            {d.revealCount > 0 ? <span className="text-xs text-faint">раскрывали раз: {d.revealCount}</span> : null}
          </div>
          {d.redFlag ? (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              Красная пометка: главный уже действовал против автора этой жалобы. Сначала посмотрите вкладку «Красные пометки».
            </p>
          ) : null}
          {d.status === 'resolved' ? (
            <p className="text-sm text-muted">
              Решено {formatDateTime(d.decidedAt)}: {APPEAL_DECISION[d.ownerDecision] ?? d.ownerDecision}
              {d.ownerNote ? ` · ${d.ownerNote}` : ''}
            </p>
          ) : (
            <div className="space-y-3">
              <Textarea rows={2} maxLength={2000} placeholder="Заметка к решению (по желанию)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((x) => (
                  <Button key={x.value} variant={x.danger ? 'danger-soft' : 'outline'} loading={decide.isPending && decide.variables === x.value} onClick={() => decide.mutate(x.value)} title={x.hint}>
                    {x.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-faint">Решение требует код из приложения-аутентификатора. Второго утверждающего нет.</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function FlagRow({ f }: { f: RetaliationFlag }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const act = useMutation({
    mutationFn: (which: 'reverse' | 'uphold') => staffPost(`/admin/appeals/flags/${f.id}/${which}`, { note: note.trim() || undefined }),
    onSuccess: (_r, which) => {
      toast.success(which === 'reverse' ? 'Человек возвращён к работе.' : 'Снятие остаётся.');
      void qc.invalidateQueries({ queryKey: ['staff-flags'] });
      void qc.invalidateQueries({ queryKey: ['staff-today'] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="space-y-2 p-4" data-testid="flag-row">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={f.state === 'open' ? 'danger' : 'neutral'}>{f.state === 'open' ? 'Открыта' : f.state === 'cleared' ? 'Снята' : 'Подтверждена'}</Badge>
        <span className="font-medium text-heading">{f.subject.label}</span>
        <span className="text-xs text-faint">жалоба №{f.appealNumber} · пометка с {formatDateTime(f.createdAt)}</span>
      </div>
      <p className="text-sm text-muted">
        Главный снял человека в защитный срок после жалобы.{f.holdActive ? ` Удержание до ${formatDateTime(f.holdUntil)}.` : ''}
      </p>
      {f.state === 'open' ? (
        <>
          <Textarea rows={1} maxLength={500} placeholder="Заметка (по желанию)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" loading={act.isPending} onClick={() => act.mutate('reverse')}>
              Вернуть к работе
            </Button>
            <Button size="sm" variant="outline" loading={act.isPending} onClick={() => act.mutate('uphold')}>
              Согласен с главным
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** «Жалобы на главных»: the owner's inbox (anonymous authors masked). */
export function AppealsInbox() {
  const { data: me } = useMe();
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') === 'flags' ? 'flags' : 'open');
  const [openId, setOpenId] = useState<string | null>(null);
  const owner = isOwner(me);
  const open = useAppeals('open', owner && tab === 'open');
  const decided = useAppeals('decided', owner && tab === 'decided');
  const flags = useRetaliationFlags('open', owner && tab === 'flags');
  const list = tab === 'open' ? open : decided;
  const missing = list.data && !list.data.ok;
  const items = list.data?.ok ? list.data.data.items : [];

  return (
    <>
      <PageHeader eyebrow="Команда и контроль" title="Жалобы на главных" subtitle="Сотрудники жалуются сюда, минуя главного. Видите только вы. У анонимной жалобы автор скрыт: имя можно раскрыть, это записывается в журнал." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'open', label: 'Ждут ответа' },
          { value: 'flags', label: 'Красные пометки' },
          { value: 'decided', label: 'Решённые' },
        ]}
      />
      <div className="mt-4 space-y-3">
        <ErrorNote text={list.error ? errorText(list.error) : flags.error ? errorText(flags.error) : null} />
        {tab === 'flags' ? (
          flags.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : !flags.data?.ok ? (
            <EmptyState icon={Scales} title="Защита от мести выключена" text="Включите переключатель «Жалоба на главного и защита от мести» в «Настройки»." />
          ) : flags.data.data.items.length === 0 ? (
            <Card className="p-5 text-sm text-muted">Открытых красных пометок нет.</Card>
          ) : (
            flags.data.data.items.map((f) => <FlagRow key={f.id} f={f} />)
          )
        ) : list.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : missing ? (
          <EmptyState icon={Scales} title="Жалобы на главных выключены" text="Включите переключатель «Жалоба на главного (только владельцу) и защита от мести» в «Настройки»." />
        ) : items.length === 0 ? (
          <Card className="p-5 text-sm text-muted">{tab === 'open' ? 'Новых жалоб нет.' : 'Решённых жалоб пока нет.'}</Card>
        ) : (
          items.map((a) => {
            const s = APPEAL_STATUS[a.status] ?? APPEAL_STATUS.new;
            return (
              <Card key={a.id} className="space-y-1.5 p-4" data-testid="appeal-row">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {a.redFlag ? <Badge tone="danger">Красная пометка</Badge> : null}
                  <span className="font-medium text-heading">№{a.number} · на {a.head.name}</span>
                  <span className="text-xs text-faint">
                    {APPEAL_KIND[a.kind] ?? a.kind} · {a.author.label} · {formatDateTime(a.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted">{a.excerpt}</p>
                <Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>
                  {a.status === 'resolved' ? 'Открыть' : 'Прочитать и решить'}
                </Button>
              </Card>
            );
          })
        )}
      </div>
      {openId ? <AppealDialog id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
