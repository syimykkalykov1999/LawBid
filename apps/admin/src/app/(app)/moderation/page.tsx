"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MotionRow } from "@/components/legacy/fade-in";
import { MoreButton } from "@/components/legacy/more-button";
import { ErrorNote, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { api, errorText } from "@/lib/api/client";
import { useMe } from "@/lib/hooks";
import {
  MODERATION_TARGET_TYPES,
  type ModerationTargetType,
  REPORT_REASON,
  REPORT_STATUS,
  StatusPill,
  TARGET_STATUS,
  TARGET_TYPE,
} from "@/lib/labels";
import { canOpen } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";

type QStatus = "open" | "actioned" | "dismissed";

/** docs/06 §3.2: reports grouped by object, oldest first. */
export default function ModerationQueuePage() {
  const router = useRouter();
  const { data: me } = useMe();
  const canSeeUsers = canOpen(me, "/users");
  const [status, setStatus] = useState<QStatus>("open");
  const [targetType, setTargetType] = useState<ModerationTargetType | "">("");
  const filters = { status, targetType };
  const q = useInfiniteQuery({
    queryKey: ["moderation-queue", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET("/admin/moderation/queue", {
          params: {
            query: {
              status: filters.status,
              targetType: filters.targetType || undefined,
              cursor: pageParam,
              limit: 30,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Жалобы"
        subtitle="Жалобы, сгруппированные по объекту; старые сверху."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<QStatus>
          value={status}
          onChange={setStatus}
          items={[
            { value: "open", label: "Открытые" },
            { value: "actioned", label: "Приняты меры" },
            { value: "dismissed", label: "Отклонённые" },
          ]}
        />
        <Select
          aria-label="Объект"
          className="w-56"
          value={targetType}
          onChange={(e) =>
            setTargetType(e.target.value as ModerationTargetType | "")
          }
        >
          <option value="">Любой объект</option>
          {MODERATION_TARGET_TYPES.map((v) => (
            <option key={v} value={v}>
              {TARGET_TYPE[v] ?? v}
            </option>
          ))}
        </Select>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.error && rows.length === 0 ? null : (
        <Table>
          <thead>
            <tr>
              <Th>Объект</Th>
              <Th>Жалоб</Th>
              <Th>Причины</Th>
              <Th>Автор</Th>
              <Th>Статус объекта</Th>
              <Th>Первая жалоба</Th>
            </tr>
          </thead>
          <tbody>
            {q.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : rows.length === 0 ? (
              <TableEmpty colSpan={6}>
                {status === "open"
                  ? "Очередь пуста — новых жалоб нет."
                  : `Нет жалоб со статусом «${REPORT_STATUS[status]}».`}
              </TableEmpty>
            ) : (
              rows.map((r, i) => {
                const href = `/moderation/${r.targetType}/${r.targetId}`;
                return (
                  <MotionRow
                    key={`${r.targetType}:${r.targetId}`}
                    i={i}
                    className="cursor-pointer"
                    onClick={() => router.push(href)}
                  >
                    <Td className="max-w-md">
                      <Link
                        href={href}
                        className="font-medium text-heading hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {TARGET_TYPE[r.targetType] ?? r.targetType}
                      </Link>
                      {r.excerpt ? (
                        <div className="line-clamp-2 text-xs text-muted">
                          {r.excerpt}
                        </div>
                      ) : null}
                      <div className="font-mono text-[10px] text-faint">
                        {r.targetId}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={r.reporters >= 3 ? "danger" : "neutral"}>
                        {r.reports}
                        {r.reporters !== r.reports
                          ? ` (${r.reporters} чел.)`
                          : ""}
                      </Badge>
                    </Td>
                    <Td className="text-xs">
                      {r.reasons.map((x) => REPORT_REASON[x] ?? x).join(", ")}
                    </Td>
                    <Td className="text-xs">
                      {r.author ? (
                        <>
                          {canSeeUsers ? (
                            <Link
                              href={`/users/${r.author.id}`}
                              className="text-gold-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {[r.author.firstName, r.author.lastName]
                                .filter(Boolean)
                                .join(" ") ||
                                r.author.username ||
                                r.author.id.slice(0, 8)}
                            </Link>
                          ) : (
                            <span>
                              {[r.author.firstName, r.author.lastName]
                                .filter(Boolean)
                                .join(" ") ||
                                r.author.username ||
                                r.author.id.slice(0, 8)}
                            </span>
                          )}
                          {r.author.warnings ? (
                            <div className="text-muted">
                              предупреждений: {r.author.warnings}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {r.targetStatus ? (
                        <StatusPill
                          map={TARGET_STATUS}
                          value={r.targetStatus}
                        />
                      ) : (
                        <Badge tone="danger">не найден</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDateTime(r.firstReportedAt)}
                    </Td>
                  </MotionRow>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      <MoreButton
        show={q.hasNextPage}
        loading={q.isFetchingNextPage}
        onClick={() => void q.fetchNextPage()}
      />
    </>
  );
}
