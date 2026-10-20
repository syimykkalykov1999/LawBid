import { DeviceMobile } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';

type Context = components['schemas']['SupportClientContextDto'];

const PLATFORM: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Веб', other: 'Другое' };
const THEME: Record<string, string> = { day: 'Дневная', night: 'Ночная', navy: 'Navy', glass: 'Glass', system: 'Системная' };

/**
 * «Устройство»: what the app attached when the ticket was opened (owner
 * 2026-10-18) — app version and build, platform, OS, phone model, language,
 * theme, timezone, the screen the user came from, user id and role. Admins
 * only; the user never gets it back.
 */
export function DeviceCard({ c }: { c: Context }) {
  const rows: [string, string | undefined][] = [
    ['Приложение', c.appVersion ? `${c.appVersion}${c.buildNumber ? ` (${c.buildNumber})` : ''}` : undefined],
    ['Платформа', c.platform ? (PLATFORM[c.platform] ?? c.platform) : undefined],
    ['Система', c.osVersion],
    ['Устройство', c.deviceModel],
    ['Язык', c.language],
    ['Тема', c.theme ? (THEME[c.theme] ?? c.theme) : undefined],
    ['Часовой пояс', c.timezone],
    ['Экран', c.route],
    ['Роль', c.role],
    ['ID', c.userId],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  if (shown.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
        <DeviceMobile size={14} weight="light" /> Устройство
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
