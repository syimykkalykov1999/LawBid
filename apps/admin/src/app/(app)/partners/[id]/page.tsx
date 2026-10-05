"use client";

import {
  ArrowLeft,
  Coins,
  DownloadSimple,
  HourglassMedium,
  PlusMinus,
  UsersThree,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Kpi, KpiSkeletons } from "@/components/billing/kpi";
import { CopyButton } from "@/components/billing/shared";
import { CommissionsTable } from "@/components/partners/commissions-table";
import {
  centsToText,
  downloadCommissionsCsv,
  PersonCell,
  RateFields,
  textToCents,
  type ClientRule,
  type PartnerRow,
  type PartnerStatus,
} from "@/components/partners/shared";
import { ErrorNote, PageHeader, SectionTitle } from "@/components/page-header";
import { useReason } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/empty";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Table, TableEmpty, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { growthError } from "@/components/growth/errors";
import { api, errorText } from "@/lib/api/client";
import { useMe } from "@/lib/hooks";
import {
  PARTNER_STATUS,
  REFERRED_STATUS,
  ROLE_TEXT,
  StatusPill,
  label as labelOf,
  usd,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

/** One partner: rates, payout, who they brought, every accrual. */
export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const canWrite = me?.role === "super_admin" || me?.role === "finance";
  const canOpenUsers =
    me?.role === "super_admin" ||
    me?.role === "support" ||
    me?.role === "finance" ||
    me?.role === "moderator";
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [busyCsv, setBusyCsv] = useState(false);

  const q = useQuery({
    queryKey: ["partner", id],
    queryFn: async () =>
      (await api.GET("/admin/partners/{id}", { params: { path: { id } } })).data!.data,
  });
  const settings = useQuery({
    queryKey: ["partners-settings"],
    queryFn: async () => (await api.GET("/admin/partners/settings")).data!.data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner", id] });
    void qc.invalidateQueries({ queryKey: ["partners"] });
    void qc.invalidateQueries({ queryKey: ["partners-stats"] });
    void qc.invalidateQueries({ queryKey: ["partner-commissions"] });
  };

  const pay = useMutation({
    mutationFn: async () => {
      const p = q.data!.partner;
      const a = await ask({
        title: `Выплатить ${usd(p.totals.approvedCents, 2)}`,
        description:
          "Все начисления «к выплате» будут отмечены выплаченными, партнёр получит уведомление. Укажите номер перевода или ведомости.",
        label: "Номер перевода / комментарий",
        confirm: "Выплачено",
      });
      if (!a) return null;
      return (
        await api.POST("/admin/partners/{id}/pay", {
          params: { path: { id } },
          body: { reason: a.text, payoutRef: a.text.slice(0, 120) },
        })
      ).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(`Выплачено ${usd(r.totalCents, 2)} (${r.count} начисл.)`);
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  if (q.isPending) {
    return (
      <>
        <PageHeader eyebrow="Деньги" title="Партнёр" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </>
    );
  }
  if (!q.data) {
    return (
      <>
        <PageHeader eyebrow="Деньги" title="Партнёр" />
        <ErrorNote text={q.error ? errorText(q.error) : "Партнёр не найден"} />
      </>
    );
  }
  const { partner: p, referred, commissions } = q.data;
  const title = p.label || p.user.name || p.user.email || "Партнёр";

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Деньги · Партнёры"
        title={title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill map={PARTNER_STATUS} value={p.status} />
            <span>код</span>
            <span className="font-mono text-ink">{p.code}</span>
            <CopyButton text={p.shareUrl} label="Скопировать ссылку" />
            <span className="text-faint">с {formatDateTime(p.createdAt)}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/partners">
              <Button variant="ghost">
                <ArrowLeft size={16} /> Все партнёры
              </Button>
            </Link>
            {canWrite ? (
              <Button
                variant="gold"
                disabled={p.totals.approvedCents <= 0 || pay.isPending}
                loading={pay.isPending}
                onClick={() => pay.mutate()}
              >
                <Coins size={16} /> Выплатить {usd(p.totals.approvedCents)}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {settings.isPending ? (
          <KpiSkeletons n={4} />
        ) : (
          <>
            <Kpi i={0} icon={UsersThree} title="Привёл людей" value={p.totals.referredCount} hint={`выполнили условие: ${p.totals.qualifiedCount}`} />
            <Kpi i={1} icon={HourglassMedium} title="На проверке" value={p.totals.heldCents} format={(n) => usd(n)} />
            <Kpi i={2} icon={Coins} title="К выплате" value={p.totals.approvedCents} format={(n) => usd(n)} gold />
            <Kpi i={3} icon={Coins} title="Выплачено" value={p.totals.paidCents} format={(n) => usd(n)} hint={`за этот месяц начислено ${usd(p.totals.thisMonthCents)}`} />
          </>
        )}
      </div>

      <SectionTitle>Условия партнёра</SectionTitle>
      <PartnerForm
        key={JSON.stringify(p)}
        partner={p}
        canEdit={canWrite}
        defaults={settings.data ?? null}
        onSaved={refresh}
      />

      {canWrite ? (
        <>
          <SectionTitle>Разовая корректировка</SectionTitle>
          <AdjustmentForm partnerId={p.id} onDone={refresh} />
        </>
      ) : null}

      <SectionTitle>Кто присоединился ({referred.length})</SectionTitle>
      <Table>
        <thead>
          <tr>
            <Th>Человек</Th>
            <Th>Тип</Th>
            <Th>Статус</Th>
            <Th>Начислено</Th>
            <Th>Присоединился</Th>
            <Th>Условие выполнено</Th>
          </tr>
        </thead>
        <tbody>
          {referred.length === 0 ? (
            <TableEmpty colSpan={6}>Пока никто не присоединился по этой ссылке</TableEmpty>
          ) : (
            referred.map((r) => (
              <tr key={r.referralId}>
                <Td>
                  <PersonCell u={{ id: r.id, name: r.name, email: r.email, role: r.role }} link={canOpenUsers} />
                </Td>
                <Td className="text-xs text-muted">{labelOf(ROLE_TEXT, r.role)}</Td>
                <Td>
                  <StatusPill map={REFERRED_STATUS} value={r.status} />
                  {r.referralStatus === "rejected" ? (
                    <div className="mt-1 text-xs text-faint">приглашение отклонено</div>
                  ) : null}
                </Td>
                <Td className="font-mono tabular-nums text-ink">
                  {r.amountCents > 0 ? usd(r.amountCents, 2) : "—"}
                </Td>
                <Td className="text-xs text-muted">{formatDateTime(r.joinedAt)}</Td>
                <Td className="text-xs text-muted">{r.qualifiedAt ? formatDateTime(r.qualifiedAt) : "—"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <SectionTitle
        action={
          canWrite ? (
            <Button
              size="sm"
              variant="outline"
              loading={busyCsv}
              onClick={async () => {
                setBusyCsv(true);
                try {
                  const name = await downloadCommissionsCsv({ partnerId: p.id });
                  toast.success(`Файл ${name} скачан`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Не удалось скачать CSV");
                } finally {
                  setBusyCsv(false);
                }
              }}
            >
              <DownloadSimple size={14} weight="light" /> CSV
            </Button>
          ) : null
        }
      >
        Начисления ({commissions.length})
      </SectionTitle>
      <CommissionsTable
        rows={commissions}
        loading={false}
        canWrite={canWrite}
        canOpenUsers={canOpenUsers}
        showPartner={false}
        onChanged={refresh}
      />
    </>
  );
}

function PartnerForm({
  partner: p,
  canEdit,
  defaults,
  onSaved,
}: {
  partner: PartnerRow;
  canEdit: boolean;
  defaults: {
    attorneyRateCents: number;
    clientRateCents: number;
    clientRule: ClientRule;
    holdDays: number;
  } | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [label, setLabel] = useState(p.label ?? "");
  const [note, setNote] = useState(p.note ?? "");
  const [status, setStatus] = useState<PartnerStatus>(p.status);
  const [rates, setRates] = useState({
    attorney: centsToText(p.attorneyRateCents),
    client: centsToText(p.clientRateCents),
    base: p.rates.monthlyBaseCents ? centsToText(p.rates.monthlyBaseCents) : "",
    rule: (p.clientRule ?? "") as "" | ClientRule,
    hold: p.holdDays == null ? "" : String(p.holdDays),
  });
  const ratesOk =
    (rates.attorney === "" || textToCents(rates.attorney) !== null) &&
    (rates.client === "" || textToCents(rates.client) !== null) &&
    (rates.base === "" || textToCents(rates.base) !== null);

  const save = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: "Изменить условия партнёра",
        description:
          status === "ended"
            ? "Партнёр завершён: его ссылка больше не приносит начислений, уже начисленное остаётся. Причина пойдёт в журнал."
            : "Новые ставки действуют для будущих начислений. Причина пойдёт в журнал.",
        label: "Причина",
        confirm: "Сохранить",
        danger: status === "ended",
      });
      if (!a) return null;
      return (
        await api.PATCH("/admin/partners/{id}", {
          params: { path: { id: p.id } },
          body: {
            label: label.trim() || null,
            note: note.trim() || null,
            status,
            attorneyRateCents: rates.attorney === "" ? null : textToCents(rates.attorney),
            clientRateCents: rates.client === "" ? null : textToCents(rates.client),
            monthlyBaseCents: rates.base === "" ? 0 : (textToCents(rates.base) ?? 0),
            clientRule: rates.rule === "" ? null : rates.rule,
            holdDays: rates.hold === "" ? null : Number(rates.hold),
            reason: a.text,
          },
        })
      ).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success("Условия сохранены");
      onSaved();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <Card className="p-5">
      {dialog}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Метка (для вас)" htmlFor="pf-label">
          <Input id="pf-label" value={label} disabled={!canEdit} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Статус" htmlFor="pf-status" hint="пауза — начисления не идут, ссылка остаётся">
          <Select id="pf-status" value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value as PartnerStatus)}>
            {(["active", "paused", "ended"] as PartnerStatus[]).map((s) => (
              <option key={s} value={s}>
                {PARTNER_STATUS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Аккаунт" htmlFor="pf-user">
          <div id="pf-user" className="pt-2">
            <PersonCell u={p.user} role={p.user.role} link />
          </div>
        </Field>
      </div>
      <div className="mt-4">
        <RateFields prefix="pf" values={rates} onChange={(v) => setRates((r) => ({ ...r, ...v }))} defaults={defaults} disabled={!canEdit} />
      </div>
      <div className="mt-4">
        <Field label="Заметка" htmlFor="pf-note">
          <Textarea id="pf-note" rows={2} value={note} disabled={!canEdit} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <Button disabled={!ratesOk || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>
            Сохранить условия
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function AdjustmentForm({ partnerId, onDone }: { partnerId: string; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState<"plus" | "minus">("plus");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const cents = textToCents(amount);
  const valid = cents !== null && cents > 0 && note.trim().length >= 3 && reason.trim().length >= 10;
  const add = useMutation({
    mutationFn: async () =>
      (
        await api.POST("/admin/partners/{id}/adjustments", {
          params: { path: { id: partnerId } },
          body: {
            amountCents: sign === "plus" ? cents! : -cents!,
            note: note.trim(),
            reason: reason.trim(),
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success(sign === "plus" ? "Бонус начислен" : "Удержание добавлено");
      setAmount("");
      setNote("");
      setReason("");
      onDone();
    },
    onError: (e) => toast.error(growthError(e)),
  });
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">
        Бонус за хорошую работу или удержание — сразу «к выплате», партнёр видит
        комментарий. Так можно платить «кому-то больше, кому-то меньше» без
        изменения ставок.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Field label="Сумма, $" htmlFor="adj-amount">
          <div className="flex gap-2">
            <Select value={sign} onChange={(e) => setSign(e.target.value as "plus" | "minus")} className="w-24" aria-label="Знак">
              <option value="plus">+ бонус</option>
              <option value="minus">− удержание</option>
            </Select>
            <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
          </div>
        </Field>
        <Field label="Комментарий партнёру" htmlFor="adj-note">
          <Input id="adj-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="бонус за октябрь" />
        </Field>
        <Field label="Причина для журнала" htmlFor="adj-reason" hint="не меньше 10 символов">
          <Input id="adj-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button disabled={!valid || add.isPending} loading={add.isPending} onClick={() => add.mutate()}>
            <PlusMinus size={16} /> Добавить
          </Button>
        </div>
      </div>
    </Card>
  );
}
