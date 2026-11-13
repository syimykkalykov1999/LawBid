import type { components } from "@/lib/api/schema";
import type { CostRowStatus } from "@/lib/launch";

/**
 * Owner 2026-10-26: infra switches from the admin. Выкл / Вкл on a cloud
 * (Terraform) row creates a change request; GitHub makes a plan; the owner
 * confirms the plan with a 2FA code; GitHub applies exactly that plan.
 * Pure helpers for «Расходы» and «Масштаб».
 */
export type InfraOverview = components["schemas"]["InfraOverviewDto"];
export type InfraRequest = components["schemas"]["InfraRequestDto"];
export type InfraSuggestion = components["schemas"]["InfraSuggestionDto"];

export const INFRA_ACTIVE = [
  "requested",
  "planning",
  "planned",
  "confirmed",
  "applying",
] as const;

export function isActive(r: Pick<InfraRequest, "status"> | null | undefined): boolean {
  return !!r && (INFRA_ACTIVE as readonly string[]).includes(r.status);
}

/** Plain Russian status for the chip. */
export const INFRA_STATUS_WORD: Record<string, string> = {
  requested: "Запущено, ждём GitHub",
  planning: "Готовится план",
  planned: "План готов — нужен ваш код",
  confirmed: "Подтверждено, применяется",
  applying: "Применяется",
  done: "Готово",
  failed: "Не получилось",
  expired: "План устарел",
  cancelled: "Отменено",
  dry_run: "Только план (пробный режим)",
  rolled_back: "Откачено",
};

export type InfraTone = "success" | "warning" | "danger" | "neutral";

export function infraTone(status: string): InfraTone {
  if (status === "done") return "success";
  if (status === "failed") return "danger";
  if (status === "planned") return "warning";
  return "neutral";
}

/**
 * Owner row 86 (13.11): a failed request whose target the cloud already
 * holds (API `settled`: the last finished change set it, or its plan touched
 * nothing of the item) is not the row's state any more. The request keeps
 * «failed» and its error; only the chip and the sheet badge stop saying
 * «Не получилось».
 */
export const SETTLED_WORD = "В облаке уже так";

export function showsFailure(
  r: Pick<InfraRequest, "status" | "settled"> | null | undefined,
): boolean {
  return !!r && r.status === "failed" && !r.settled;
}

/** The chip / badge word of a request (a settled failure reads SETTLED_WORD). */
export function requestWord(r: Pick<InfraRequest, "status" | "settled">): string {
  if (r.status === "failed" && r.settled) return SETTLED_WORD;
  return INFRA_STATUS_WORD[r.status] ?? r.status;
}

export function requestTone(r: Pick<InfraRequest, "status" | "settled">): InfraTone {
  if (r.status === "failed" && r.settled) return "success";
  return infraTone(r.status);
}

/**
 * The quiet dot for a row while a request runs: yellow when the owner has
 * to act (plan waiting / failed), grey while GitHub works.
 */
export function requestDot(r: InfraRequest): CostRowStatus {
  const attention = r.status === "planned" || r.status === "failed";
  const state = (r.toState === "on" ? "on" : "off") as CostRowStatus["state"];
  return {
    state,
    live: attention ? "attention" : r.status === "done" ? "active" : "idle",
    reason: INFRA_STATUS_WORD[r.status] ?? r.status,
    checkedAt: r.createdAt,
  };
}

/** «План: +1 добавить · ~0 изменить · −0 удалить». */
export function planLine(r: Pick<InfraRequest, "plan">): string {
  if (!r.plan) return "План ещё готовится…";
  const p = r.plan;
  return `План: +${p.add} добавить · ~${p.change} изменить · −${p.destroy} удалить`;
}

/** «+$28–280 в месяц» / «−$11 в месяц» / «без изменения цены». */
export function costLine(usd: number[] | null | undefined): string {
  if (!usd || usd.length < 2) return "цена неизвестна";
  const [lo, hi] = usd;
  if (lo === 0 && hi === 0) return "без изменения цены";
  const f = (n: number) =>
    Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const sign = hi <= 0 ? "−" : "+";
  const range = Math.abs(lo) === Math.abs(hi) ? `$${f(lo)}` : `$${f(Math.min(Math.abs(lo), Math.abs(hi)))}–${f(Math.max(Math.abs(lo), Math.abs(hi)))}`;
  return `${sign}${range} в месяц`;
}

/** Minutes left before an unconfirmed plan is thrown away (null = n/a). */
export function minutesLeft(r: Pick<InfraRequest, "expiresAt">, now: Date = new Date()): number | null {
  if (!r.expiresAt) return null;
  return Math.max(0, Math.ceil((Date.parse(r.expiresAt) - now.getTime()) / 60_000));
}

/** The newest request of [itemId] (the list comes newest first). */
export function latestFor(requests: InfraRequest[] | undefined, itemId: string): InfraRequest | null {
  return requests?.find((r) => r.itemId === itemId) ?? null;
}

/** «Выкл → Вкл» for the sheet title. */
export function targetWord(to: string): string {
  return to === "on" ? "Включить" : "Выключить";
}
