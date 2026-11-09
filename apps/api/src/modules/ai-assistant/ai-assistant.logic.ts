/**
 * 09.11.2026 (owner): the AI assistant in the admin. The work itself runs in
 * GitHub Actions with the official, MIT-licensed anthropics/claude-code-action
 * (.github/workflows/ai-assistant.yml). The API only (1) opens the task issue,
 * (2) answers the workflow's «may I run?» with the switch and the money
 * ceiling, (3) hands it a digest without personal data, (4) books what each
 * run cost. Pure parts live here.
 */

/** The label the workflow listens to. */
export const AI_TASK_LABEL = 'ai-task';
/** The workflow file the API trusts (OIDC `job_workflow_ref`). */
export const AI_WORKFLOW_FILE = 'ai-assistant.yml';
/** Audience the workflow asks GitHub for when it calls the API. */
export const AI_OIDC_AUDIENCE = 'lawbid-ai-assistant';

export type AiRunKind = 'task' | 'schedule';

export type AiRefusal = 'off' | 'not_connected' | 'budget';

export const AI_REFUSAL_TEXT: Record<AiRefusal, string> = {
  off: 'ИИ-помощник выключен (ai.assistant_mode = Выкл).',
  not_connected:
    'Не подключено: нет GitHub-приложения в «Ключи и сервисы» (github_infra).',
  budget: 'Потолок расходов на ИИ за месяц исчерпан (ai.monthly_max_usd).',
};

/**
 * Pure: may a run start now? Owner rule 5c: Выкл / Вкл / Авто, default Авто.
 * Авто = runs as soon as it is connected and under the month's ceiling,
 * pauses itself at the ceiling and resumes with the next month's key. Вкл =
 * the same (the ceiling still holds: never over budget). Выкл = never. Any
 * unknown value counts as Выкл (a typo never spends money).
 */
export function aiGate(i: {
  mode: string;
  connected: boolean;
  monthUsd: number;
  maxUsd: number;
}): { allowed: boolean; reason: AiRefusal | null; leftUsd: number } {
  const leftUsd = Math.max(0, Math.round((i.maxUsd - i.monthUsd) * 100) / 100);
  const mode = i.mode.trim().toLowerCase();
  if (mode !== 'on' && mode !== 'auto') {
    return { allowed: false, reason: 'off', leftUsd };
  }
  if (!i.connected) return { allowed: false, reason: 'not_connected', leftUsd };
  if (i.maxUsd <= 0 || i.monthUsd >= i.maxUsd) {
    return { allowed: false, reason: 'budget', leftUsd: 0 };
  }
  return { allowed: true, reason: null, leftUsd };
}

/** The Redis key of a month's AI spend, e.g. `ai:usd:2026-11`. */
export function monthKey(now: Date): string {
  return `ai:usd:${now.toISOString().slice(0, 7)}`;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const TOKEN =
  /\b(?:eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}|sk-[\w-]{10,}|AKIA[0-9A-Z]{16})\b/g;

/**
 * Pure: the repository is PUBLIC, so anything the assistant reads may end up
 * in a public issue or log. E-mails, phone numbers, ids and tokens are
 * replaced; the text is cut to [max] characters.
 */
export function scrub(text: string, max = 160): string {
  const clean = text
    .replace(TOKEN, '[token]')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]')
    .replace(PHONE, '[phone]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Pure: the issue body the admin's task becomes (policy reminder last). */
export function taskIssueBody(details: string, adminLabel: string): string {
  return [
    details.trim(),
    '',
    '---',
    `Задача из админки («Задача для ИИ»), автор: ${adminLabel}.`,
    'Правила для помощника: `.github/ai-assistant/POLICY.md` (только исправления, тесты и PR; ' +
      'никаких денег, ключей, IAM/Terraform, магазинов, удаления данных на проде и сборок телефонов).',
  ].join('\n');
}

/** Pure: a cost reported by a run, as a safe number (0..max). */
export function safeCost(v: unknown, max = 100): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n * 10_000) / 10_000);
}
