"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StepUpDialog } from "@/components/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";

export interface RecoQaStatus {
  enabled: boolean;
  lastRunAt: string | null;
  durationMs: number;
  attorneys: number;
  questions: number;
  cases: number;
  queued: boolean;
}

interface Entry {
  key: string;
  value: unknown;
  defaultValue: unknown;
}

/** The weights of the Q&A ranking, in the order the owner reads them. */
export const RECO_QA_WEIGHTS: readonly { key: string; label: string }[] = [
  { key: "reco.qa.answers", label: "Ответы (за 90 дней)" },
  { key: "reco.qa.likes", label: "Лайки на ответах" },
  { key: "reco.qa.best", label: "Лучшие ответы" },
  { key: "reco.qa.gravity", label: "Затухание свежести" },
  { key: "reco.people.qa", label: "Вклад в сетку «Люди»" },
  { key: "reco.people.qaTopic", label: "Совпадение тем (люди)" },
  { key: "reco.case.qaTopic", label: "Совпадение тем (кейсы)" },
];

export const isRecoQaKey = (key: string): boolean =>
  RECO_QA_WEIGHTS.some((w) => w.key === key);

/** The last run as one Russian line. */
export function recoQaLine(s: RecoQaStatus | undefined): string {
  if (!s) return "Загрузка…";
  if (!s.lastRunAt)
    return "Ещё не считалось: первый расчёт ночью (05:20 UTC) или по кнопке.";
  return `Последний расчёт ${formatDateTime(s.lastRunAt)}: ${s.attorneys} адвокатов с баллом, ${s.questions} открытых вопросов, ${s.cases} открытых кейсов, ${Math.round(s.durationMs / 1000)} с.`;
}

/**
 * R-401 (owner 2026-11-04): «Рекомендации по вопросам» — the weights of
 * the nightly Q&A ranking (answers, likes, best, freshness, topic match)
 * next to the generic editor, the last run and «Пересчитать сейчас» (the
 * cron job queued once; a fresh 2FA code, no second admin).
 */
export function RecoQaCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [stepUp, setStepUp] = useState(false);
  const status = useQuery({
    queryKey: ["reco-qa"],
    queryFn: async () =>
      (await api.GET("/admin/system-health/reco-qa")).data!
        .data as RecoQaStatus,
  });
  const config = useQuery({
    queryKey: ["config"],
    queryFn: async () => (await api.GET("/admin/config")).data!.data as Entry[],
  });
  const save = useMutation({
    mutationFn: (v: { key: string; value: number }) =>
      api.PUT("/admin/config/{key}", {
        params: { path: { key: v.key } },
        body: { value: v.value } as never,
      }),
    onSuccess: (_r, v) => {
      toast.success(`Сохранено: ${v.key}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[v.key];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (e) => toast.error(e),
  });
  const recompute = useMutation({
    mutationFn: async () =>
      (await api.POST("/admin/system-health/reco-qa/recompute")).data!
        .data as RecoQaStatus,
    onSuccess: (r) => {
      qc.setQueryData(["reco-qa"], r);
      toast.success("Пересчёт поставлен в очередь");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "ADMIN_STEP_UP_REQUIRED")
        setStepUp(true);
      else toast.error(err);
    },
  });

  const byKey = new Map((config.data ?? []).map((e) => [e.key, e]));
  const s = status.data;
  return (
    <>
      <Card className="mb-6 flex flex-col gap-3 p-4" data-testid="reco-qa-card">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-sm font-medium text-heading">
            Рекомендации по вопросам (ответы адвокатов)
          </div>
          {s ? (
            <Badge tone={s.enabled ? "success" : "neutral"} dot>
              {s.enabled ? "Включено" : "Выключено"}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Адвокат, который отвечает на вопросы клиентов, поднимается в сетке
          «Люди», а кейсы его тем — у него в поиске. Считается раз в ночь,
          страницы читают готовый список. Переключатель: Функции →
          recommendations_qa_ranking.
        </p>
        <p className="text-sm text-muted">{recoQaLine(s)}</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {RECO_QA_WEIGHTS.map((w) => {
            const e = byKey.get(w.key);
            const current = e ? String(e.value) : "";
            const draft = drafts[w.key] ?? current;
            const changed = e !== undefined && draft !== current;
            return (
              <label
                key={w.key}
                className="flex flex-col gap-1 text-xs text-muted"
              >
                <span>
                  {w.label} <span className="text-faint">({w.key})</span>
                </span>
                <div className="flex gap-1">
                  <Input
                    aria-label={w.label}
                    inputMode="decimal"
                    value={draft}
                    onChange={(ev) =>
                      setDrafts((d) => ({ ...d, [w.key]: ev.target.value }))
                    }
                  />
                  {changed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={save.isPending && save.variables?.key === w.key}
                      disabled={
                        Number.isNaN(Number(draft)) || draft.trim() === ""
                      }
                      onClick={() =>
                        save.mutate({ key: w.key, value: Number(draft) })
                      }
                    >
                      Сохранить
                    </Button>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            <ArrowsClockwise size={14} /> Пересчитать сейчас
          </Button>
        </div>
      </Card>
      <StepUpDialog
        open={stepUp}
        description="Пересчёт рекомендаций требует свежий код. Подтвердите, что это вы."
        onCancel={() => setStepUp(false)}
        onDone={() => {
          setStepUp(false);
          recompute.mutate();
        }}
      />
    </>
  );
}
