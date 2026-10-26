"use client";

import { CheckCircle, UserCircleMinus, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useDebounced } from "@/components/legacy/use-debounced";
import { Badge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { PartnerRowExt } from "@/lib/api/demo";
import type { components } from "@/lib/api/schema";
import { CLIENT_RULE, label, ROLE_TEXT } from "@/lib/labels";

/** Row as the API returns it today plus the §4/§5 fields (`user` may be
 * null for a partner without an account). Cast once with `extend()`. */
export type PartnerRow = PartnerRowExt;
export function extend(
  p: components["schemas"]["AdminPartnerRowDto"] | PartnerRowExt,
): PartnerRowExt {
  return p as PartnerRowExt;
}
/** Display name: label, then account, then the external name. */
export function partnerName(p: PartnerRowExt): string {
  return (
    p.label ||
    p.user?.name ||
    p.user?.email ||
    p.external?.name ||
    p.id.slice(0, 8)
  );
}
type PartnerUser = components["schemas"]["AdminPartnerUserDto"];
export type Commission = components["schemas"]["AdminPartnerCommissionRowDto"];
export type CommissionStatus =
  components["schemas"]["PartnerCommissionStatus"];
export type ClientRule = components["schemas"]["PartnerClientRule"];
export type JoinMode = components["schemas"]["PartnerJoinMode"];
export type PartnerStatus = components["schemas"]["PartnerStatus"];

export const COMMISSION_STATUSES: CommissionStatus[] = [
  "held",
  "approved",
  "paid",
  "reversed",
];
export const CLIENT_RULES: ClientRule[] = ["case_published", "bid_accepted"];
export const JOIN_MODES: JoinMode[] = ["open", "approval", "closed"];

/** "$50.00" ↔ cents in an input. */
export function centsToText(c: number | null | undefined): string {
  return c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, "");
}
export function textToCents(t: string): number | null {
  const s = t.trim().replace(",", ".").replace(/^\$/, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function PersonCell({
  u,
  role,
  link,
}: {
  u: PartnerUser;
  role?: string | null;
  link: boolean;
}) {
  const name = u.name || u.email || u.id.slice(0, 8);
  return (
    <div className="min-w-0">
      {link ? (
        <Link
          href={`/users/${u.id}`}
          className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium text-ink">{name}</span>
      )}
      <div
        className="max-w-[180px] truncate text-xs text-faint"
        title={u.email ?? undefined}
      >
        {role ? label(ROLE_TEXT, role) : null}
        {u.email && u.email !== name ? `${role ? " · " : ""}${u.email}` : ""}
      </div>
    </div>
  );
}

/** «Без аккаунта» for a blogger outside the app (§5). */
export function NoAccountBadge() {
  return (
    <Badge tone="warning">
      <UserCircleMinus size={12} weight="light" /> Без аккаунта
    </Badge>
  );
}

/** Account cell of a partner row: the person, or the external contact. */
export function PartnerPerson({
  p,
  link,
}: {
  p: PartnerRowExt;
  link: boolean;
}) {
  if (p.user) return <PersonCell u={p.user} role={p.user.role} link={link} />;
  return (
    <div className="min-w-0">
      <NoAccountBadge />
      <div
        className="mt-1 max-w-[220px] truncate text-xs text-faint"
        title={p.external?.contact ?? undefined}
      >
        {p.external?.name}
        {p.external?.contact ? ` · ${p.external.contact}` : ""}
      </div>
    </div>
  );
}

/** Rate fields shared by the create form and the partner card. An empty
 * field means "program default". */
export function RateFields({
  prefix,
  values,
  onChange,
  defaults,
  disabled,
}: {
  prefix: string;
  values: {
    attorney: string;
    client: string;
    base: string;
    rule: "" | ClientRule;
    hold: string;
  };
  onChange: (v: Partial<typeof values>) => void;
  defaults?: {
    attorneyRateCents: number;
    clientRateCents: number;
    clientRule: ClientRule;
    holdDays: number;
  } | null;
  disabled?: boolean;
}) {
  const d = defaults;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field
        label="За адвоката, $"
        htmlFor={`${prefix}-att`}
        hint={d ? `по умолчанию ${centsToText(d.attorneyRateCents) || 0}` : undefined}
      >
        <Input
          id={`${prefix}-att`}
          inputMode="decimal"
          placeholder={d ? centsToText(d.attorneyRateCents) : ""}
          value={values.attorney}
          disabled={disabled}
          onChange={(e) => onChange({ attorney: e.target.value })}
        />
      </Field>
      <Field
        label="За клиента, $"
        htmlFor={`${prefix}-cl`}
        hint={d ? `по умолчанию ${centsToText(d.clientRateCents) || 0}` : undefined}
      >
        <Input
          id={`${prefix}-cl`}
          inputMode="decimal"
          placeholder={d ? centsToText(d.clientRateCents) : ""}
          value={values.client}
          disabled={disabled}
          onChange={(e) => onChange({ client: e.target.value })}
        />
      </Field>
      <Field label="Ставка в месяц, $" htmlFor={`${prefix}-base`} hint="0 — без оклада">
        <Input
          id={`${prefix}-base`}
          inputMode="decimal"
          placeholder="0"
          value={values.base}
          disabled={disabled}
          onChange={(e) => onChange({ base: e.target.value })}
        />
      </Field>
      <Field
        label="Условие по клиенту"
        htmlFor={`${prefix}-rule`}
        hint={d ? `по умолчанию: ${CLIENT_RULE[d.clientRule]}` : undefined}
      >
        <Select
          id={`${prefix}-rule`}
          value={values.rule}
          disabled={disabled}
          onChange={(e) => onChange({ rule: e.target.value as "" | ClientRule })}
        >
          <option value="">как в программе</option>
          {CLIENT_RULES.map((r) => (
            <option key={r} value={r}>
              {CLIENT_RULE[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Проверка, дней"
        htmlFor={`${prefix}-hold`}
        hint={d ? `по умолчанию ${d.holdDays}` : undefined}
      >
        <Input
          id={`${prefix}-hold`}
          inputMode="numeric"
          placeholder={d ? String(d.holdDays) : ""}
          value={values.hold}
          disabled={disabled}
          onChange={(e) => onChange({ hold: e.target.value.replace(/\D/g, "") })}
        />
      </Field>
    </div>
  );
}

export type Picked = { id: string; name: string | null; email?: string | null };

/** Search any user by name / email / @username to make them a partner. */
export function UserPicker({
  picked,
  onPick,
  id,
}: {
  picked: Picked | null;
  onPick: (p: Picked | null) => void;
  id: string;
}) {
  const [typed, setSearch] = useState("");
  // Owner 2026-10-23: one request per pause in typing, not per key.
  const search = useDebounced(typed);
  const found = useQuery({
    queryKey: ["partner-user-search", search],
    enabled: !picked && search.length >= 2,
    queryFn: async () =>
      (
        await api.GET("/admin/users", {
          params: { query: { q: search, limit: 6 } },
        })
      ).data!.data,
  });
  if (picked) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 px-3 py-2.5">
        <CheckCircle size={18} weight="light" className="text-success" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">
            {picked.name || "Пользователь"}
          </div>
          {picked.email ? (
            <div className="truncate text-xs text-faint">{picked.email}</div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Выбрать другого"
          onClick={() => onPick(null)}
          className="text-faint hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <>
      <Input
        id={id}
        placeholder="Имя, email или @username"
        value={typed}
        onChange={(e) => setSearch(e.target.value.trim())}
      />
      {found.data?.length ? (
        <ul className="mt-1.5 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
          {found.data.map((u) => {
            const name =
              [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() =>
                    onPick({ id: u.id, name, email: u.email ?? null })
                  }
                >
                  <span className="text-ink">
                    {name || u.email || u.id.slice(0, 8)}
                  </span>
                  <span className="ml-2 text-xs text-faint">
                    {label(ROLE_TEXT, u.role ?? "")}
                    {u.email ? ` · ${u.email}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

/** Downloads the commissions CSV through the proxy (admin session). */
export async function downloadCommissionsCsv(
  filters: Record<string, string | undefined>,
): Promise<string> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const res = await fetch(
    `/api/proxy/partners/commissions/export.csv${qs.size ? `?${qs}` : ""}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const name =
    /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
    "partner-commissions.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
