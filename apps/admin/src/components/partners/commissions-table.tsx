"use client";

import {
  ArrowCounterClockwise,
  CheckCircle,
  Coins,
  PauseCircle,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useReason } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { growthError } from "@/components/growth/errors";
import { api } from "@/lib/api/client";
import { COMMISSION_KIND, COMMISSION_STATUS, StatusPill, usd } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { PersonCell, type Commission } from "./shared";

type Action = "approve" | "hold" | "reverse" | "pay";

/** Accruals with approve / hold / reverse / pay. `showPartner` for the
 * cross-partner list; the partner page hides that column. */
export function CommissionsTable({
  rows,
  loading,
  canWrite,
  canOpenUsers,
  showPartner,
  onChanged,
}: {
  rows: Commission[];
  loading: boolean;
  canWrite: boolean;
  canOpenUsers: boolean;
  showPartner: boolean;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();

  const act = useMutation({
    mutationFn: async ({ c, action }: { c: Commission; action: Action }) => {
      const text = {
        approve: {
          title: "Снять с проверки",
          description: "Начисление станет доступно к выплате сразу.",
          confirm: "Одобрить",
        },
        hold: {
          title: "Поставить на проверку",
          description:
            "Начисление не уйдёт в выплату, пока вы его не одобрите вручную.",
          confirm: "На проверку",
        },
        reverse: {
          title: "Отменить начисление",
          description:
            "Например, накрутка или возврат платежа. Если уже выплачено — появится удержание на ту же сумму.",
          confirm: "Отменить",
          danger: true,
        },
        pay: {
          title: "Отметить выплаченным",
          description:
            "Укажите, как и когда перевели деньги (номер перевода или ведомости) — это пойдёт в журнал.",
          confirm: "Выплачено",
        },
      }[action];
      const a = await ask({ ...text, label: "Причина / комментарий" });
      if (!a) return null;
      const opts = { params: { path: { id: c.id } } };
      if (action === "approve")
        await api.POST("/admin/partners/commissions/{id}/approve", {
          ...opts,
          body: { reason: a.text },
        });
      else if (action === "hold")
        await api.POST("/admin/partners/commissions/{id}/hold", {
          ...opts,
          body: { reason: a.text },
        });
      else if (action === "reverse")
        await api.POST("/admin/partners/commissions/{id}/reverse", {
          ...opts,
          body: { reason: a.text },
        });
      else
        await api.POST("/admin/partners/commissions/{id}/pay", {
          ...opts,
          body: { reason: a.text, payoutRef: a.text.slice(0, 120) },
        });
      return action;
    },
    onSuccess: (action) => {
      if (!action) return;
      toast.success(
        {
          approve: "Начисление одобрено",
          hold: "Начисление на проверке",
          reverse: "Начисление отменено",
          pay: "Отмечено выплаченным",
        }[action],
      );
      void qc.invalidateQueries({ queryKey: ["partners"] });
      void qc.invalidateQueries({ queryKey: ["partner-commissions"] });
      void qc.invalidateQueries({ queryKey: ["partner"] });
      void qc.invalidateQueries({ queryKey: ["partners-stats"] });
      onChanged?.();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const cols = (showPartner ? 6 : 5) + (canWrite ? 1 : 0);

  return (
    <>
      {dialog}
      <Table>
        <thead>
          <tr>
            {showPartner ? <Th>Партнёр</Th> : null}
            <Th>За что</Th>
            <Th>Сумма</Th>
            <Th>Статус</Th>
            <Th>Период</Th>
            <Th>Даты</Th>
            {canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableEmpty colSpan={cols} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={cols}>Начислений нет</TableEmpty>
          ) : (
            rows.map((c) => (
              <tr key={c.id}>
                {showPartner ? (
                  <Td>
                    <PersonCell u={c.partner} link={canOpenUsers} />
                  </Td>
                ) : null}
                <Td>
                  <div className="text-ink">{COMMISSION_KIND[c.kind] ?? c.kind}</div>
                  {c.referredUser ? (
                    <div className="mt-0.5 text-xs text-faint">
                      <PersonCell
                        u={c.referredUser}
                        role={c.referredUser.role}
                        link={canOpenUsers}
                      />
                    </div>
                  ) : null}
                  {c.note ? (
                    <div className="mt-0.5 max-w-[240px] text-xs text-faint">
                      {c.note}
                    </div>
                  ) : null}
                </Td>
                <Td
                  className={`font-mono tabular-nums ${c.amountCents < 0 ? "text-danger" : "text-ink"}`}
                >
                  {c.amountCents < 0 ? "−" : ""}
                  {usd(Math.abs(c.amountCents), 2)}
                </Td>
                <Td>
                  <StatusPill map={COMMISSION_STATUS} value={c.status} />
                  {c.status === "held" ? (
                    <div className="mt-1 text-xs text-faint">
                      {c.holdUntil
                        ? `до ${formatDateTime(c.holdUntil)}`
                        : "вручную"}
                    </div>
                  ) : null}
                  {c.reversedReason ? (
                    <div className="mt-1 max-w-[200px] text-xs text-faint">
                      {c.reversedReason}
                    </div>
                  ) : null}
                  {c.payoutRef ? (
                    <div className="mt-1 max-w-[200px] truncate text-xs text-faint" title={c.payoutRef}>
                      {c.payoutRef}
                    </div>
                  ) : null}
                </Td>
                <Td className="font-mono text-xs text-muted">{c.period}</Td>
                <Td className="text-xs text-muted">
                  {formatDateTime(c.createdAt)}
                  {c.paidAt ? (
                    <>
                      <br />
                      выплачено {formatDateTime(c.paidAt)}
                    </>
                  ) : null}
                </Td>
                {canWrite ? (
                  <Td className="text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      {c.status === "held" ? (
                        <Button
                          size="sm"
                          variant="soft"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ c, action: "approve" })}
                        >
                          <CheckCircle size={14} /> Одобрить
                        </Button>
                      ) : null}
                      {c.status === "approved" ? (
                        <>
                          <Button
                            size="sm"
                            variant="soft"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ c, action: "pay" })}
                          >
                            <Coins size={14} /> Выплачено
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ c, action: "hold" })}
                          >
                            <PauseCircle size={14} /> На проверку
                          </Button>
                        </>
                      ) : null}
                      {c.status !== "reversed" && c.kind !== "adjustment" ? (
                        <Button
                          size="sm"
                          variant="danger-soft"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ c, action: "reverse" })}
                        >
                          <ArrowCounterClockwise size={14} /> Отменить
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}
