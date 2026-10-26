"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import {
  INFRA_STATUS_WORD,
  costLine,
  infraTone,
  isActive,
  minutesLeft,
  planLine,
  targetWord,
  type InfraOverview,
  type InfraRequest,
  type InfraSuggestion,
} from "@/lib/infra";
import { livePoll } from "@/lib/live";

export const INFRA_KEY = ["admin-infra"];

/**
 * Owner 2026-10-26: one hook for cloud switches. Polls every 5 s while a
 * request is in progress (GitHub is planning / applying), otherwise like the
 * rest of the page. Creating, confirming (2FA: the API client asks for the
 * code by itself), cancelling and rolling back refresh the registry too.
 */
export function useInfra() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: INFRA_KEY,
    queryFn: async () =>
      (await api.GET("/admin/infra")).data!.data as InfraOverview,
    refetchInterval: (query) => {
      const d = query.state.data as InfraOverview | undefined;
      if (d?.requests?.some((r) => isActive(r))) return 5000;
      // livePoll() is the page-wide timer (a function; tests stub it).
      const slow: unknown = livePoll();
      return typeof slow === "function"
        ? (slow as (q: typeof query) => number)(query)
        : (slow as number | false);
    },
  });
  const after = () => {
    void qc.invalidateQueries({ queryKey: INFRA_KEY });
    void qc.invalidateQueries({ queryKey: ["spend-registry"] });
  };
  const create = useMutation({
    mutationFn: async (v: { itemId: string; to: "off" | "on" }) =>
      (await api.POST("/admin/infra/requests", { body: v })).data!
        .data as InfraRequest,
    onSuccess: (r) => {
      after();
      if (r.status === "failed") toast.error(r.error ?? "Не получилось");
      else toast.success("Готовится план. Это 2–5 минут, окно обновится само.");
    },
    onError: (e) => toast.error(e),
  });
  const confirm = useInfraAction("confirm", after);
  const cancel = useInfraAction("cancel", after);
  const rollback = useInfraAction("rollback", after);
  return { q, data: q.data, create, confirm, cancel, rollback };
}

function useInfraAction(
  kind: "confirm" | "cancel" | "rollback",
  after: () => void,
) {
  const toast = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const opts = { params: { path: { id } } };
      const res =
        kind === "confirm"
          ? await api.POST("/admin/infra/requests/{id}/confirm", opts)
          : kind === "cancel"
            ? await api.POST("/admin/infra/requests/{id}/cancel", opts)
            : await api.POST("/admin/infra/requests/{id}/rollback", opts);
      return res.data!.data as InfraRequest;
    },
    onSuccess: () => {
      after();
      toast.success(
        kind === "confirm"
          ? "Подтверждено: GitHub применяет план"
          : kind === "cancel"
            ? "Запрос отменён, в облаке ничего не изменилось"
            : "Откат запущен: сначала будет план",
      );
    },
    onError: (e) => toast.error(e),
  });
}

/** Small status chip of a cloud request. */
export function InfraChip({ request }: { request: InfraRequest }) {
  return (
    <Badge
      tone={infraTone(request.status)}
      dot
      data-testid={`infra-chip-${request.itemId}`}
    >
      {INFRA_STATUS_WORD[request.status] ?? request.status}
    </Badge>
  );
}

/**
 * «План: …» sheet: what GitHub will change, what it costs per month (from
 * the cost registry), what the app feels, and the 2FA confirm. Opens for
 * the request of one row; closes by itself only when the owner closes it.
 */
export function InfraPlanSheet({
  request,
  dryRunMode,
  onClose,
  onConfirm,
  onCancel,
  onRollback,
  busy,
}: {
  request: InfraRequest | null;
  dryRunMode: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onRollback: (id: string) => void;
  busy: boolean;
}) {
  const r = request;
  const left = r ? minutesLeft(r) : null;
  return (
    <Dialog
      open={r !== null}
      onClose={onClose}
      wide
      title={r ? `${targetWord(r.toState)}: ${r.itemName}` : ""}
      description="Изменение в облаке AWS. Сначала GitHub показывает план, потом вы подтверждаете его кодом 2FA, и применяется ровно этот план."
    >
      {r ? (
        <div className="flex flex-col gap-3" data-testid="infra-sheet">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={infraTone(r.status)} dot data-testid="infra-sheet-status">
              {INFRA_STATUS_WORD[r.status] ?? r.status}
            </Badge>
            {r.runUrl ? (
              <a
                href={r.runUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gold-600 underline-offset-2 hover:underline"
              >
                Журнал в GitHub
              </a>
            ) : null}
          </div>
          <Card className="p-3 text-sm" data-testid="infra-sheet-plan">
            <div className="font-medium text-heading">{planLine(r)}</div>
            <div className="mt-1 text-ink" data-testid="infra-sheet-cost">
              Стоимость: {costLine(r.costDeltaUsd)} (по реестру расходов)
            </div>
            {r.impact ? (
              <div className="mt-1 text-xs text-muted">{r.impact}</div>
            ) : null}
            {r.plan && r.plan.resources.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gold-600">
                  Что именно изменится ({r.plan.resources.length})
                </summary>
                <ul className="mt-1 max-h-48 overflow-auto text-xs text-muted">
                  {r.plan.resources.map((x) => (
                    <li key={x.address} className="break-all">
                      {x.action === "create"
                        ? "+ "
                        : x.action.includes("delete")
                          ? "− "
                          : "~ "}
                      {x.address}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>
          {r.error ? (
            <p className="text-sm text-danger" data-testid="infra-sheet-error">
              {r.error}
            </p>
          ) : null}
          {r.status === "dry_run" || (dryRunMode && r.status !== "done") ? (
            <p className="text-xs text-muted">
              Включён пробный режим (настройка infra.dry_run): план только
              показывается, облако не меняется.
            </p>
          ) : null}
          {r.status === "planned" && left !== null ? (
            <p className="text-xs text-muted">
              План действует ещё {left} мин. Потом его нужно сделать заново.
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {r.status === "planned" ? (
              <Button
                variant="gold"
                loading={busy}
                data-testid="infra-confirm"
                onClick={() => onConfirm(r.id)}
              >
                Подтвердить кодом 2FA и применить
              </Button>
            ) : null}
            {["requested", "planning", "planned"].includes(r.status) ? (
              <Button
                variant="outline"
                data-testid="infra-cancel"
                onClick={() => onCancel(r.id)}
              >
                Отменить
              </Button>
            ) : null}
            {r.status === "done" ? (
              <Button
                variant="outline"
                loading={busy}
                data-testid="infra-rollback"
                onClick={() => onRollback(r.id)}
              >
                Откатить
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

/** Авто for the cloud: proposals only («пора включить X»), one tap + 2FA. */
export function InfraSuggestionCards({
  items,
  onPick,
  busyId,
}: {
  items: InfraSuggestion[];
  onPick: (s: InfraSuggestion) => void;
  busyId: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 grid gap-3 md:grid-cols-2" data-testid="infra-suggestions">
      {items.map((s) => (
        <Card key={s.id} className="flex flex-col gap-2 p-4" data-testid={`infra-suggest-${s.id}`}>
          <div className="text-sm font-medium text-heading">
            {s.to === "on" ? "Пора включить" : "Можно выключить"}: {s.name}
          </div>
          <p className="text-sm text-muted">{s.reason}</p>
          <p className="text-sm text-ink">Стоимость: {costLine(s.costDeltaUsd)}</p>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            loading={busyId === s.id}
            onClick={() => onPick(s)}
          >
            Показать план
          </Button>
        </Card>
      ))}
    </div>
  );
}
