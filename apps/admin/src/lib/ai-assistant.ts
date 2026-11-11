/** 09.11.2026 «Задача для ИИ»: what a task's state means, in words. */
export function taskLine(t: {
  state: string;
  pulls: { url: string; state: string; merged: boolean }[];
}): { text: string; tone: 'success' | 'warning' | 'neutral' } {
  if (t.pulls.some((p) => p.merged)) return { text: 'Готово: PR влит', tone: 'success' };
  if (t.pulls.some((p) => p.state === 'open')) return { text: 'PR ждёт проверки', tone: 'warning' };
  if (t.state === 'closed') return { text: 'Закрыта без PR', tone: 'neutral' };
  return { text: 'В работе', tone: 'neutral' };
}
