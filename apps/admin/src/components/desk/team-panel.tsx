'use client';

import { UsersThree } from '@phosphor-icons/react';
import { Badge, Card, type Tone } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { useDeskTeam, type TeamTile } from '@/lib/desk-data';
import { KIND_LABEL, type DeskRole, type LeaseKind } from '@/lib/desk';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  online: { label: 'на связи', tone: 'success' },
  away: { label: 'отошёл', tone: 'warning' },
  offline: { label: 'нет на связи', tone: 'neutral' },
};

/** Tiles of the people of one desk, read only («в работе у X»): the head's and the owner's look. */
export function TeamPanel({ role, enabled }: { role: DeskRole; enabled: boolean }) {
  const q = useDeskTeam(enabled);
  if (!enabled) {
    return <EmptyState icon={UsersThree} title="Раздача выключена" text="Когда владелец включит раздачу работы, здесь будет видно, кто на связи и что у кого в руках." />;
  }
  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  if (!q.data || !q.data.ok) {
    return <EmptyState icon={UsersThree} title="Команда пока не видна" text="Раздача работы ещё не подключена на сервере." />;
  }
  const tiles = q.data.data.tiles.filter((t) => t.role === role);
  if (tiles.length === 0) return <EmptyState icon={UsersThree} title="На этом столе пока никого нет" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="team-tiles">
      {tiles.map((t) => (
        <Tile key={t.adminId} t={t} />
      ))}
    </div>
  );
}

function Tile({ t }: { t: TeamTile }) {
  const st = STATUS[t.status] ?? STATUS.offline;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-heading">{t.name ?? 'Без имени'}</span>
        <Badge tone={st.tone} dot>
          {st.label}
        </Badge>
      </div>
      <div className="mt-2 text-sm text-muted">
        {t.items.length === 0 ? (
          'Сейчас ничего не держит'
        ) : (
          t.items.map((i) => (
            <div key={`${i.kind}:${i.itemId}`}>
              в работе у {t.name ?? 'сотрудника'}: {KIND_LABEL[i.kind as LeaseKind] ?? i.kind}, {i.heldMinutes} мин
            </div>
          ))
        )}
      </div>
      <div className="mt-1 text-xs text-faint">Закрыто сегодня: {t.doneToday}</div>
    </Card>
  );
}
