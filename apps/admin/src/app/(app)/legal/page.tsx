'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { label, LEGAL_DOC_TYPE } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';

const DOC_TYPES = ['terms', 'privacy', 'disclaimer', 'client_contact_sharing'] as const;
type DocType = (typeof DOC_TYPES)[number];

/** docs/06 §2.3 item 10: versions per type and locale; publishing makes a
 * version current and users re-accept on their next sign-in. */
export default function LegalPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({ docType: 'terms' as DocType, locale: 'en', version: '', contentMd: '', contentUrl: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['legal'],
    queryFn: async () => (await api.GET('/admin/legal-documents')).data!.data,
  });
  const detail = useQuery({
    queryKey: ['legal', openId],
    enabled: Boolean(openId),
    queryFn: async () => (await api.GET('/admin/legal-documents/{id}', { params: { path: { id: openId! } } })).data!.data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['legal'] });
  const create = useMutation({
    mutationFn: () =>
      api.POST('/admin/legal-documents', {
        body: {
          docType: form.docType,
          locale: form.locale,
          version: form.version,
          ...(form.contentMd ? { contentMd: form.contentMd } : {}),
          ...(form.contentUrl ? { contentUrl: form.contentUrl } : {}),
        },
      }),
    onSuccess: () => {
      toast.success('Черновик создан');
      setForm({ ...form, version: '', contentMd: '', contentUrl: '' });
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const publish = useMutation({
    mutationFn: async (d: { id: string; docType: string; version: string; locale: string }) => {
      const ok = await confirm({
        title: `Опубликовать «${label(LEGAL_DOC_TYPE, d.docType)}» ${d.version} (${d.locale})?`,
        description: 'Версия станет текущей. Пользователи примут документ заново при следующем входе.',
        confirm: 'Опубликовать',
      });
      if (!ok) return null;
      await api.POST('/admin/legal-documents/{id}/publish', { params: { path: { id: d.id } } });
      return d;
    },
    onSuccess: (d) => {
      if (!d) return;
      toast.success('Версия опубликована');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data ?? [];

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система"
        title="Юридические документы"
        subtitle="Версии по языкам. Публикация новой версии обязательного документа требует повторного принятия при следующем входе."
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Документ</Th>
                <Th>Язык</Th>
                <Th>Версия</Th>
                <Th>Статус</Th>
                <Th>Принятий</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
              {!q.isPending && !q.error && rows.length === 0 ? (
                <TableEmpty colSpan={6}>Документов пока нет — создайте первый черновик справа.</TableEmpty>
              ) : null}
              {rows.map((d, i) => (
                <MotionRow key={d.id} i={i} className={cn(openId === d.id && 'bg-accent-soft')}>
                  <Td className="text-ink">
                    <span title={d.docType}>{label(LEGAL_DOC_TYPE, d.docType)}</span>
                  </Td>
                  <Td className="font-mono">{d.locale}</Td>
                  <Td className="font-mono">{d.version}</Td>
                  <Td>
                    {d.isCurrent ? (
                      <Badge tone="success" dot>
                        текущая
                      </Badge>
                    ) : d.publishedAt ? (
                      <Badge>архив</Badge>
                    ) : (
                      <Badge tone="gold">черновик</Badge>
                    )}
                    {d.publishedAt ? <div className="text-xs text-muted">{formatDateTime(d.publishedAt)}</div> : null}
                  </Td>
                  <Td className="tabular-nums">{d.consents}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                        Текст
                      </Button>
                      {!d.isCurrent ? (
                        <Button
                          size="sm"
                          variant="gold"
                          disabled={publish.isPending}
                          onClick={() => publish.mutate({ id: d.id, docType: d.docType, version: d.version, locale: d.locale })}
                        >
                          Опубликовать
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </MotionRow>
              ))}
            </tbody>
          </Table>
          {openId && detail.error ? <ErrorNote text={errorText(detail.error)} /> : null}
          {openId && detail.data ? (
            <FadeIn className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {label(LEGAL_DOC_TYPE, detail.data.docType)} {detail.data.version} · {detail.data.locale}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.data.contentUrl ? (
                  <a className="text-sm text-gold-600 hover:underline" href={detail.data.contentUrl} target="_blank" rel="noreferrer">
                    {detail.data.contentUrl}
                  </a>
                ) : null}
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm text-ink">{detail.data.contentMd ?? ''}</pre>
              </CardContent>
            </Card>
            </FadeIn>
          ) : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Новая версия (черновик)</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="dt">Документ</Label>
                <Select id="dt" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value as DocType })}>
                  {DOC_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {LEGAL_DOC_TYPE[v] ?? v}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="lc">Язык</Label>
                  <Input id="lc" required pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})?" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ver">Версия</Label>
                  <Input id="ver" required placeholder="1.1" pattern="\d+(\.\d+){0,2}" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="md">Текст (Markdown)</Label>
                <Textarea id="md" rows={8} value={form.contentMd} onChange={(e) => setForm({ ...form, contentMd: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="url">или ссылка</Label>
                <Input id="url" type="url" value={form.contentUrl} onChange={(e) => setForm({ ...form, contentUrl: e.target.value })} />
              </div>
              <Button type="submit" loading={create.isPending} disabled={!form.contentMd && !form.contentUrl} className="w-full">
                Создать черновик
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
