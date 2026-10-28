import { Badge } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';

export type SelfieCapture = {
  source: 'app_camera' | 'unknown';
  tokenVerified: boolean;
  liveness: 'passed' | 'not_checked' | 'skipped';
  challenge: 'blink' | 'turn_left' | 'turn_right' | null;
  fallbackReason: 'timeout' | 'detector_unavailable' | null;
  cardDetected: boolean;
  framesCaptured: number | null;
  capturedAt: string | null;
  platform: string | null;
  deviceModel: string | null;
};

const CHALLENGE: Record<string, string> = {
  blink: 'моргнуть',
  turn_left: 'повернуть голову влево',
  turn_right: 'повернуть голову вправо',
};

/** Owner 2026-10-28 (ID selfie camera): how the selfie was taken, next to it.
 * The app reports liveness and the card hint; only «жетон» is checked by the
 * server. A hint for the verifier, not proof. */
export function SelfieCaptureNote({ capture }: { capture: SelfieCapture | null | undefined }) {
  if (!capture || !capture.tokenVerified) {
    return (
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Badge tone="warning" dot>
          Нет отчёта камеры приложения (снято до 28.10.2026, старой версией или при выключенном правиле) — проверить внимательно
        </Badge>
      </div>
    );
  }
  const liveness =
    capture.liveness === 'passed' ? (
      <Badge tone="success" dot>
        Живой человек: проверка пройдена{capture.challenge ? ` (${CHALLENGE[capture.challenge] ?? capture.challenge})` : ''}
      </Badge>
    ) : capture.liveness === 'skipped' ? (
      <Badge tone="warning" dot>
        Живой человек: не подтверждён — нажал «Сделать фото всё равно»
      </Badge>
    ) : (
      <Badge tone="warning" dot>
        Живой человек: не проверялся (на телефоне нет распознавания лица)
      </Badge>
    );
  const device = [capture.deviceModel, capture.platform].filter(Boolean).join(', ');
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="info">Снято живой камерой приложения</Badge>
        {liveness}
        <Badge tone={capture.cardDetected ? 'success' : 'neutral'}>
          {capture.cardDetected ? 'Удостоверение в кадре найдено' : 'Удостоверение автоматически не найдено — смотрите фото'}
        </Badge>
      </div>
      <div className="text-xs text-muted">
        {capture.framesCaptured ? `Кадров снято: ${capture.framesCaptured} (оставлен лучший)` : null}
        {device ? ` · ${device}` : null}
        {capture.capturedAt ? ` · ${formatDateTime(capture.capturedAt)}` : null}
      </div>
    </div>
  );
}
