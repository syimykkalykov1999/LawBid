import { Badge } from '@/components/ui/card';
import { REGISTRY_LICENSE_STATUS_RU } from '@/lib/trust-labels';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Readable form of the automatic state-registry result for the verifier
 * (owner 2026-10-28). Renders nothing when the state has no adapter or the
 * registry did not answer — the one-line label above says so already. */
export function RegistryResult({ result, profileName }: { result: Record<string, unknown>; profileName: string }) {
  const d = (result.details && typeof result.details === 'object' ? result.details : result) as Record<string, unknown>;
  const reason = str(result.reason) ?? str(d.reason);
  if (typeof d.found !== 'boolean') return null;
  const found = d.found;
  const regName = str(d.name);
  const status = REGISTRY_LICENSE_STATUS_RU[str(d.licenseStatus) ?? ''];
  const rawStatus = str(d.registryStatus);
  const admitted = str(d.admittedAt);
  const firm = str(d.firm);
  const until = str(d.registryExpiresAt);
  const url = str(d.sourceUrl);
  const nameMatch = reason === 'name_mismatch' ? false : result.result === 'pass' ? true : null;
  return (
    <dl className="mt-1 space-y-0.5 rounded-lg bg-surface-2 p-1.5" data-testid="registry-result">
      <div>
        Реестр штата:{' '}
        <Badge tone={found ? 'success' : 'danger'}>{found ? 'найден' : 'не найден'}</Badge>
      </div>
      {found ? (
        <>
          <div>
            Имя в реестре: <span className="font-medium">{regName ?? '—'}</span>
          </div>
          <div>
            Имя в профиле: <span className="font-medium">{profileName}</span>{' '}
            {nameMatch === null ? null : (
              <Badge tone={nameMatch ? 'success' : 'danger'}>{nameMatch ? 'совпадает' : 'НЕ совпадает'}</Badge>
            )}
          </div>
          <div>
            Статус:{' '}
            {status ? <Badge tone={status.tone}>{status.text}</Badge> : '—'}
            {rawStatus ? <span className="text-muted"> (как в реестре: {rawStatus})</span> : null}
          </div>
          <div>Допущен: {admitted ?? '—'}</div>
          <div>Фирма: {firm ?? '—'}</div>
          <div>Регистрация действует до: {until ?? '—'}</div>
        </>
      ) : null}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block text-primary underline">
          Открыть запись в реестре
        </a>
      ) : null}
    </dl>
  );
}
