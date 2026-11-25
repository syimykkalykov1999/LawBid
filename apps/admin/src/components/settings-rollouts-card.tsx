"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/legacy/confirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { useMe } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";

type Rollout = {
  id: string;
  adminId: string;
  action: string;
  keys: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  startedAt: string;
  watchUntil: string;
  percent: number;
};

export const SETTINGS_ROLLOUTS_KEY = ["settings-rollouts"] as const;

const show = (v: unknown) =>
  v === null || v === undefined
    ? "по умолчанию"
    : Array.isArray(v)
      ? v.join(", ")
      : String(v);

/**
 * Б3 (25.11): changes of settings under watch. A save first works on a
 * share of the servers while the quality alarms are watched; an alarm
 * puts the old value back by itself. «Применить всем сейчас» skips the
 * rest of the window, «Вернуть» puts the old value back now (both 2FA).
 * Shown only while something is under watch; re-read every 30 s then.
 */
export function SettingsRolloutsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: me } = useMe();
  const canAct = me?.role === "super_admin";
  const q = useQuery({
    queryKey: SETTINGS_ROLLOUTS_KEY,
    queryFn: async () =>
      ((await api.GET("/admin/settings-rollouts")).data?.data ??
        []) as Rollout[],
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) > 0 ? 30_000 : false,
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: SETTINGS_ROLLOUTS_KEY });
    void qc.invalidateQueries({ queryKey: ["config"] });
    void qc.invalidateQueries({ queryKey: ["audit-log"] });
  };
  const promote = useMutation({
    mutationFn: async (id: string) => {
      await api.POST("/admin/settings-rollouts/{id}/promote", {
        params: { path: { id } },
      });
    },
    onSuccess: () => {
      toast.success("Включено у всех");
      done();
    },
    onError: (e) => toast.error(e),
  });
  const revert = useMutation({
    mutationFn: async (id: string) => {
      await api.POST("/admin/settings-rollouts/{id}/revert", {
        params: { path: { id } },
      });
    },
    onSuccess: () => {
      toast.success("Старое значение возвращено");
      done();
    },
    onError: (e) => toast.error(e),
  });

  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <section className="mb-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
      {dialog}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Изменения на проверке
        </h2>
        <Badge tone="warning">{rows.length}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted">
        Новое значение пока работает только на части серверов. Если за это время
        сработает тревога качества, старое значение вернётся само. Потом новое
        значение включится у всех.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                {r.keys.map((k) => (
                  <div key={k}>
                    <span className="font-mono text-xs text-ink">{k}</span>
                    <span className="text-muted">
                      {" "}
                      {show(r.before[k])} → {show(r.after[k])}
                    </span>
                  </div>
                ))}
                <div className="text-xs text-faint">
                  {r.percent} % серверов · у всех с{" "}
                  {formatDateTime(r.watchUntil)}
                </div>
              </div>
              {canAct ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revert.isPending || promote.isPending}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Вернуть старое значение?",
                          description:
                            "Старое значение сразу вернётся у всех. Нужен код 2FA.",
                          confirm: "Вернуть",
                          danger: true,
                        })
                      )
                        revert.mutate(r.id);
                    }}
                  >
                    Вернуть
                  </Button>
                  <Button
                    size="sm"
                    disabled={revert.isPending || promote.isPending}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Включить у всех сейчас?",
                          description:
                            "Срочное изменение: проверка на части серверов пропускается. Нужен код 2FA, действие попадёт в журнал.",
                          confirm: "Включить у всех",
                        })
                      )
                        promote.mutate(r.id);
                    }}
                  >
                    Применить всем сейчас
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
