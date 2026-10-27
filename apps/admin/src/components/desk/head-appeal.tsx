'use client';

import { Scales } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { deskPost, useMyAppeals } from '@/lib/desk-data';
import { formatDateTime } from '@/lib/utils';

const KINDS = [
  { value: 'unfair_pull', label: 'Меня несправедливо сняли с работы или с очереди' },
  { value: 'pressure', label: 'Давление или неуместные требования' },
  { value: 'insult', label: 'Оскорбления или неуважение' },
  { value: 'rules', label: 'Нарушение правил или договорённостей' },
  { value: 'other', label: 'Другое' },
];

const STATUS: Record<string, string> = { received: 'получено', in_review: 'рассматривается', decided: 'рассмотрено' };

/**
 * «Обжаловать главного»: goes to the owner only (the head never sees it or
 * that it exists). Drawn only when the server has the route (T6) and the
 * switch is on: the first read of «мои обращения» decides; a 404 hides it.
 */
export function HeadAppealButton({ enabled }: { enabled: boolean }) {
  const mine = useMyAppeals(enabled);
  const [open, setOpen] = useState(false);
  if (!enabled || !mine.data || !mine.data.ok) return null;
  const list = mine.data.data;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Scales size={14} />
        Обжаловать главного
      </Button>
      <AppealDialog open={open} onClose={() => setOpen(false)} list={list} />
    </>
  );
}

function AppealDialog({
  open,
  onClose,
  list,
}: {
  open: boolean;
  onClose: () => void;
  list: { id: string; number: number; status: string; createdAt: string; anonymous: boolean }[];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState('other');
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const send = useMutation({
    mutationFn: async () => {
      const r = await deskPost('/admin/workspace/appeals', { kind, text: text.trim(), anonymous });
      if (!r.ok) throw new Error('Жалобы сейчас не принимаются.');
    },
    onSuccess: () => {
      toast.success('Жалоба отправлена владельцу. В течение недели вам придёт ответ о статусе.');
      setText('');
      void qc.invalidateQueries({ queryKey: ['desk-my-appeals'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Только владелец"
      title="Обжаловать главного"
      description="Жалобу читает только владелец. Главный её не видит и не узнает, что она была."
    >
      <div className="space-y-4">
        <Field label="О чём жалоба" htmlFor="appeal-kind">
          <Select id="appeal-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Что произошло" htmlFor="appeal-text" hint="От 10 до 2000 знаков. Пишите по фактам: когда, что, кто видел.">
          <Textarea id="appeal-text" rows={6} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span>
            Отправить анонимно
            <span className="block text-xs text-muted">Владелец увидит «автор №…» вместо имени. Имя раскрывается только отдельным действием владельца с записью в журнале.</span>
          </span>
        </label>
        {list.length > 0 ? (
          <div className="rounded-xl border border-line p-3 text-sm">
            <div className="mb-1.5 font-medium text-heading">Ваши прошлые жалобы</div>
            {list.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 py-0.5 text-muted">
                <span>№{a.number}</span>
                <span>{formatDateTime(a.createdAt)}</span>
                <Badge tone={a.status === 'decided' ? 'success' : 'neutral'}>{STATUS[a.status] ?? a.status}</Badge>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="gold" loading={send.isPending} disabled={text.trim().length < 10} onClick={() => send.mutate()}>
            Отправить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
