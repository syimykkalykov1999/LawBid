"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { MotionRow } from "@/components/legacy/fade-in";
import { MoreButton } from "@/components/legacy/more-button";
import { ErrorNote, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { api, errorText } from "@/lib/api/client";
import { useMe } from "@/lib/hooks";
import { AUDIT_TARGET, auditActionLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

interface Filters {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = {
  adminId: "",
  action: "",
  targetType: "",
  targetId: "",
  from: "",
  to: "",
};

/** docs/06 §2.3 item 12: filters by admin, action, object, dates; every
 * role but super_admin sees only its own rows (enforced server-side). */
export default function AuditLogPage() {
  const { data: me } = useMe();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const q = useInfiniteQuery({
    queryKey: ["audit-log", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.GET("/admin/audit-log", {
        params: {
          query: {
            cursor: pageParam,
            limit: 50,
            adminId: filters.adminId || undefined,
            action: filters.action || undefined,
            targetType: filters.targetType || undefined,
            targetId: filters.targetId || undefined,
            from: filters.from
              ? new Date(`${filters.from}T00:00:00`).toISOString()
              : undefined,
            to: filters.to
              ? new Date(`${filters.to}T23:59:59.999`).toISOString()
              : undefined,
          },
        },
      });
      return res.data!;
    },
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const field = (k: keyof Filters, label: string) => (
    <div className="min-w-40 flex-1 space-y-1">
      <Label htmlFor={`f-${k}`} className="block whitespace-nowrap">
        {label}
      </Label>
      <Input
        id={`f-${k}`}
        className="h-9"
        value={draft[k]}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      />
    </div>
  );
  const dateField = (k: "from" | "to", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`f-${k}`} className="block whitespace-nowrap">
        {label}
      </Label>
      <DateField
        id={`f-${k}`}
        className="h-9 w-40 [&_input]:h-9"
        value={draft[k]}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Журнал аудита"
        subtitle={
          me?.role === "super_admin"
            ? "Все действия администраторов."
            : "Ваши действия (полный журнал видит супер-админ)."
        }
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        {me?.role === "super_admin"
          ? field("adminId", "Администратор (id)")
          : null}
        {field("action", "Действие (код, префикс)")}
        {field("targetType", "Тип объекта (код)")}
        {field("targetId", "Объект (id)")}
        <div className="flex flex-wrap items-end gap-3">
          {dateField("from", "С")}
          {dateField("to", "По")}
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Применить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setFilters(EMPTY);
              }}
            >
              Сброс
            </Button>
          </div>
        </div>
      </form>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Когда</Th>
            <Th>Кто</Th>
            <Th>Действие</Th>
            <Th>Объект</Th>
            <Th>Причина</Th>
            <Th>До / после</Th>
            <Th>IP</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={7} loading /> : null}
          {rows.map((r, i) => {
            const failed =
              !!r.after &&
              typeof r.after === "object" &&
              (r.after as { outcome?: unknown }).outcome === "failed";
            return (
              <MotionRow key={r.id} i={i}>
                <Td className="whitespace-nowrap text-muted">
                  {formatDateTime(r.createdAt)}
                </Td>
                <Td className="max-w-48 truncate text-ink" title={r.adminId}>
                  {r.adminEmail ?? r.adminId}
                </Td>
                <Td className="text-sm">
                  <span
                    className="cursor-help text-ink underline decoration-line-strong decoration-dotted underline-offset-4"
                    title={r.action}
                  >
                    {auditActionLabel(r.action)}
                  </span>
                  {failed ? (
                    <div className="mt-1">
                      <Badge tone="danger">не выполнено</Badge>
                    </div>
                  ) : null}
                </Td>
                <Td className="text-xs">
                  <span title={r.targetType}>
                    {AUDIT_TARGET[r.targetType] ?? r.targetType}
                  </span>
                  {r.targetId ? (
                    <div className="font-mono text-faint">{r.targetId}</div>
                  ) : null}
                </Td>
                <Td className="max-w-64 text-xs">{r.justification ?? ""}</Td>
                <Td className="max-w-80">
                  <Json label="до" value={r.before} />
                  <Json label="после" value={r.after} />
                </Td>
                <Td className="font-mono text-xs text-muted">{r.ip ?? ""}</Td>
              </MotionRow>
            );
          })}
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={7}>Записей нет под эти фильтры</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <MoreButton
        show={q.hasNextPage}
        loading={q.isFetchingNextPage}
        onClick={() => void q.fetchNextPage()}
      />
    </>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted">{label}</summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
