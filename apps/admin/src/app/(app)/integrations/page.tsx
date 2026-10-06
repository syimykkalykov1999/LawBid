'use client';

import { ArrowsClockwise, LockKey, Plugs, Plus } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { StateRegistries } from '@/components/registries/state-registries';
import { StepUpDialog } from '@/components/step-up-dialog';
import { CustomServiceDialog } from '@/components/integrations/custom-service-dialog';
import { IntegrationCard, type Guarded, type Integration } from '@/components/integrations/integration-card';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorText } from '@/lib/api/client';
import { fieldHint, fieldLabel, providerDescription, providerLabel, providerWarning } from '@/lib/integration-labels';

/** Russian service / field texts (keys stay as the server sends them). */
function localize(it: Integration): Integration {
  return {
    ...it,
    label: providerLabel(it.provider, it.label),
    description: providerDescription(it.provider, it.description),
    warning: providerWarning(it.provider, it.warning),
    fields: it.fields.map((f) => ({
      ...f,
      label: fieldLabel(it.provider, f.name, f.label),
      hint: fieldHint(f.hint) ?? f.hint,
    })),
  };
}

/**
 * Owner 2026-10-01 — "Integrations & API keys": the owner adds, changes,
 * tests, activates, rolls back and removes the keys of Bunny, Stripe,
 * Twilio… Values are write-only (only ••••last4 is ever shown); every
 * change asks for a fresh 2FA code; a new key works at once, no release.
 * Owner 2026-10-05: several keys per service (backups in order) and
 * services added from here without a code change.
 */
export default function IntegrationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { ask, dialog: reasonDialog } = useReason();
  const [stepUp, setStepUp] = useState(false);
  const [adding, setAdding] = useState(false);
  const retry = useRef<(() => void) | null>(null);
  const q = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await api.GET('/admin/integrations')).data!.data,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['integrations'] });
    // Every provider's history (prefix match on the key).
    void qc.invalidateQueries({ queryKey: ['integration-versions'] });
  };

  const guarded: Guarded = (fn, opts) => {
    const run = () => {
      fn()
        .then(() => {
          toast.success(opts.success);
          refresh();
        })
        .catch(async (e: unknown) => {
          if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
            retry.current = run;
            setStepUp(true);
            return;
          }
          if (opts.onError && (await opts.onError(e))) return;
          toast.error(e);
          refresh();
        });
    };
    run();
  };

  const reencrypt = async () => {
    const ok = await confirm({
      title: 'Перешифровать ключи?',
      description:
        'Все ключи, сохранённые в админке, будут заново зашифрованы текущим мастер-ключом сервера (SECRETS_ACTIVE_KID). Значения ключей не меняются, приложение продолжит работать. Нужно после смены мастер-ключа, чтобы старый можно было убрать.',
      confirm: 'Перешифровать',
    });
    if (!ok) return;
    guarded(
      async () => {
        await api.POST('/admin/integrations/reencrypt');
      },
      { success: 'Ключи перешифрованы текущим мастер-ключом' },
    );
  };

  const data = q.data;
  const items = (data?.items ?? []).map(localize);
  return (
    <>
      {confirmDialog}
      {reasonDialog}
      <PageHeader
        eyebrow="Система"
        title="Ключи и сервисы"
        subtitle="Ключи сторонних сервисов. Как добавить: 1) откройте «Где взять ключи?» в карточке сервиса и скопируйте значения с его сайта; 2) «Добавить ключи» → вставьте → «Сохранить»; 3) «Проверить» → «Включить». Приложение подхватывает ключ сразу, без обновления. Значения никому не показываются — видны только последние 4 символа."
        actions={
          data?.storageEnabled ? (
            <>
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus size={16} weight="light" />
                Добавить сервис
              </Button>
              <Button variant="outline" onClick={() => void reencrypt()}>
                <ArrowsClockwise size={16} weight="light" />
                Перешифровать ключи
              </Button>
            </>
          ) : null
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {data && !data.storageEnabled ? (
        <FadeIn className="mb-4">
          <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm text-warning">
            <LockKey size={20} weight="light" className="mt-0.5 shrink-0" />
            <span>
              <b className="block text-base">Кнопки «Добавить ключи» неактивны: хранение ключей выключено</b>
              На сервере не задан мастер-ключ шифрования: переменные SECRETS_MASTER_KEYS и SECRETS_ACTIVE_KID в
              настройках API. Задайте их и перезапустите API, кнопки включатся. Пока ключи берутся только из настроек
              сервера.
            </span>
          </div>
        </FadeIn>
      ) : null}
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : !q.error && items.length === 0 ? (
        <EmptyState icon={Plugs} title="Сервисов нет" text="Сервер не вернул ни одной интеграции." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((it, i) => (
            <FadeIn key={it.provider} i={i}>
              <IntegrationCard
                it={it}
                editable={data?.storageEnabled ?? false}
                guarded={guarded}
                confirm={confirm}
                ask={ask}
              />
            </FadeIn>
          ))}
        </div>
      )}
      {/* Owner 2026-10-05: per-state lawyer registries (keys per state). */}
      <StateRegistries />
      <CustomServiceDialog open={adding} onClose={() => setAdding(false)} guarded={guarded} />
      <StepUpDialog
        open={stepUp}
        onCancel={() => setStepUp(false)}
        onDone={() => {
          setStepUp(false);
          retry.current?.();
        }}
      />
    </>
  );
}
