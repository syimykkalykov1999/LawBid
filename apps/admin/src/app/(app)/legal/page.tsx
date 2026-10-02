'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

const DOC_TYPES = [
  ['terms', 'Terms of Service'],
  ['privacy', 'Privacy Policy'],
  ['disclaimer', 'Disclaimer'],
  ['client_contact_sharing', 'Client contact sharing'],
] as const;
type DocType = (typeof DOC_TYPES)[number][0];

/** docs/06 §2.3 item 10: versions per type and locale; publishing makes a
 * version current and users re-accept on their next sign-in. */
export default function LegalPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
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
  const refresh = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ['legal'] });
  };
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
      setForm({ ...form, version: '', contentMd: '', contentUrl: '' });
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });
  const publish = useMutation({
    mutationFn: (id: string) => api.POST('/admin/legal-documents/{id}/publish', { params: { path: { id } } }),
    onSuccess: refresh,
    onError: (e) => setError(errorText(e)),
  });

  return (
    <>
      <PageHeader title="Юридические документы" subtitle="Версии по языкам. Публикация новой версии обязательного документа требует повторного принятия при следующем входе." />
      <ErrorNote text={error ?? (q.error ? errorText(q.error) : null)} />
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
              {(q.data ?? []).map((d) => (
                <tr key={d.id} className={d.isCurrent ? 'bg-success-soft' : ''}>
                  <Td>{DOC_TYPES.find(([v]) => v === d.docType)?.[1] ?? d.docType}</Td>
                  <Td className="font-mono">{d.locale}</Td>
                  <Td className="font-mono">{d.version}</Td>
                  <Td>
                    {d.isCurrent ? <Badge tone="success">текущая</Badge> : d.publishedAt ? <Badge>архив</Badge> : <Badge tone="gold">черновик</Badge>}
                    {d.publishedAt ? <div className="text-xs text-muted">{formatDateTime(d.publishedAt)}</div> : null}
                  </Td>
                  <Td>{d.consents}</Td>
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
                          onClick={() => {
                            if (confirm(`Опубликовать ${d.docType} ${d.version} (${d.locale})? Пользователи примут документ заново при следующем входе.`)) publish.mutate(d.id);
                          }}
                        >
                          Опубликовать
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {openId && detail.data ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>
                  {detail.data.docType} {detail.data.version} · {detail.data.locale}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.data.contentUrl ? (
                  <a className="text-sm text-navy underline" href={detail.data.contentUrl} target="_blank" rel="noreferrer">
                    {detail.data.contentUrl}
                  </a>
                ) : null}
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans text-sm">{detail.data.contentMd ?? ''}</pre>
              </CardContent>
            </Card>
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
                  {DOC_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
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
                <textarea id="md" rows={8} className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm" value={form.contentMd} onChange={(e) => setForm({ ...form, contentMd: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="url">или ссылка</Label>
                <Input id="url" type="url" value={form.contentUrl} onChange={(e) => setForm({ ...form, contentUrl: e.target.value })} />
              </div>
              <Button type="submit" disabled={create.isPending || (!form.contentMd && !form.contentUrl)} className="w-full">
                Создать черновик
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
