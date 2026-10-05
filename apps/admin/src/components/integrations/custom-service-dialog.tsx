'use client';

import { Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api/client';
import type { Guarded } from './integration-card';

type FieldRow = { name: string; label: string; secret: boolean; required: boolean };

const FIRST: FieldRow = { name: 'apiKey', label: 'API key', secret: true, required: true };

/** "Client ID" → "clientId": a field name the API accepts ('' if none). */
export function fieldNameFrom(label: string): string {
  const words = label
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const name = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  return /^[a-zA-Z]/.test(name) ? name.slice(0, 40) : '';
}

/**
 * Owner 2026-10-05: a service the code doesn't know yet (a free registry
 * API, a second translator…) — added here with its own key fields, then
 * filled like any other. Code that wants it reads `custom_<id>`.
 */
export function CustomServiceDialog({ open, onClose, guarded }: { open: boolean; onClose: () => void; guarded: Guarded }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FieldRow[]>([FIRST]);
  const setField = (i: number, patch: Partial<FieldRow>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const valid =
    /^[a-z0-9_]{2,40}$/.test(id) &&
    label.trim().length >= 2 &&
    fields.length > 0 &&
    fields.every((f) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(f.name) && f.label.trim()) &&
    new Set(fields.map((f) => f.name)).size === fields.length;

  const submit = () =>
    guarded(
      async () => {
        await api.POST('/admin/integrations/custom', {
          body: { id, label: label.trim(), description: description.trim(), fields },
        });
        setId('');
        setLabel('');
        setDescription('');
        setFields([FIRST]);
        onClose();
      },
      { success: `Сервис «${label.trim()}» добавлен — теперь добавьте его ключи` },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      eyebrow="Ключи и сервисы"
      title="Новый сервис"
      description="Для сервиса, которого ещё нет в списке. Его ключи хранятся так же: зашифрованы, видны только последние 4 символа."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название" hint="Как сервис называется в админке.">
            <Input
              value={label}
              maxLength={80}
              placeholder="CourtListener"
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (!id) setId(fieldNameFrom(label).toLowerCase());
              }}
            />
          </Field>
          <Field label="Код" hint="Латиница, цифры и _ ; по нему сервис находит код приложения.">
            <Input
              className="font-mono"
              value={id}
              maxLength={40}
              placeholder="courtlistener"
              onChange={(e) => setId(e.target.value.toLowerCase())}
            />
          </Field>
        </div>
        <Field label="Описание (необязательно)">
          <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="space-y-2">
          <div className="text-sm font-medium text-heading">Поля ключа</div>
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
              <Input
                className="w-48"
                value={f.label}
                placeholder="Подпись, например API key"
                onChange={(e) => setField(i, { label: e.target.value, name: fieldNameFrom(e.target.value) || f.name })}
              />
              <Input
                className="w-36 font-mono text-xs"
                value={f.name}
                placeholder="apiKey"
                aria-label="Имя поля"
                onChange={(e) => setField(i, { name: e.target.value })}
              />
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Switch checked={f.secret} onChange={(v) => setField(i, { secret: v })} label="Секретное" /> секретное
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Switch checked={f.required} onChange={(v) => setField(i, { required: v })} label="Обязательное" /> обязательное
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Убрать поле"
                disabled={fields.length === 1}
                onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
              >
                <Trash size={14} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={fields.length >= 10}
            onClick={() => setFields((fs) => [...fs, { name: '', label: '', secret: false, required: false }])}
          >
            <Plus size={14} /> Поле
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!valid}>
            Добавить сервис
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
