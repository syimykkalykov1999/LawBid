import { Badge } from '@/components/ui/card';
import { REGISTRY_LICENSE_STATUS_RU } from '@/lib/trust-labels';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function detailsOf(result: Record<string, unknown>): Record<string, unknown> {
  return (result.details && typeof result.details === 'object' ? result.details : result) as Record<string, unknown>;
}

/** Does the registry answer carry a readable block (found / not found)? */
export function hasRegistryResult(result: Record<string, unknown> | null | undefined): boolean {
  return !!result && typeof detailsOf(result).found === 'boolean';
}

/** Readable form of the automatic state-registry result for the verifier
 * (owner 2026-10-28). On top only what the decision needs: found or not,
 * the registry name against the profile name, the license status and the
 * «valid until» date. «Допущен», «Фирма» and the raw answer sit in a
 * collapsed «Подробнее». Renders nothing when the state has no adapter or
 * the registry did not answer — the one-line label above says so already. */
export function RegistryResult({ result, profileName }: { result: Record<string, unknown>; profileName: string }) {
  const d = detailsOf(result);
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
        Реестр штата: <Badge tone={found ? 'success' : 'danger'}>{found ? 'найден' : 'не найден'}</Badge>
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
          <div>Статус лицензии: {status ? <Badge tone={status.tone}>{status.text}</Badge> : '—'}</div>
          <div>Действует до: {until ?? '—'}</div>
        </>
      ) : null}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block text-primary underline">
          Открыть запись в реестре
        </a>
      ) : null}
      <details data-testid="registry-more">
        <summary className="cursor-pointer text-muted">Подробнее</summary>
        {found ? (
          <div className="mt-1 space-y-0.5">
            <div>Допущен: {admitted ?? '—'}</div>
            <div>Фирма: {firm ?? '—'}</div>
            {rawStatus ? <div className="text-muted">Статус как в реестре: {rawStatus}</div> : null}
          </div>
        ) : null}
        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface p-1.5">{JSON.stringify(result, null, 1)}</pre>
      </details>
    </dl>
  );
}
