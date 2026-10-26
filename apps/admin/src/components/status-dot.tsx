import { STATUS_DOT, statusTitle, type CostRowStatus } from "@/lib/launch";

/**
 * Owner 2026-10-26: a small, quiet status dot. 7 px, muted colour, no
 * animation, always the same place; the reason shows on hover / tap.
 */
export function StatusDot({
  status,
  testId,
}: {
  status: CostRowStatus | null | undefined;
  testId?: string;
}) {
  const live = status?.live ?? "idle";
  const title = statusTitle(status);
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      data-testid={testId}
      data-live={live}
      className="inline-block shrink-0 rounded-full"
      style={{ width: 7, height: 7, backgroundColor: STATUS_DOT[live].color }}
    />
  );
}

export function StatusLegend() {
  return (
    <p
      className="mb-2 text-[11px] text-muted opacity-70"
      data-testid="status-legend"
    >
      {
        "● зелёный — работает сейчас · ○ серый — выключено, включится когда понадобится · ● жёлтый — нужно ваше внимание"
      }
    </p>
  );
}
