import { cn } from '@/lib/utils';

/**
 * Scalloped "verified" seal with a white check, as on Instagram.
 * Attorneys: blue (license). Clients: gold #C9A24A (paid, approved).
 */
export function VerifiedBadge({
  kind,
  size = 16,
  className,
}: {
  kind: 'attorney' | 'client';
  size?: number;
  className?: string;
}) {
  const fill = kind === 'client' ? '#C9A24A' : '#1D9BF0';
  const points = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 11.5 : 9.6;
    return `${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={kind === 'client' ? 'Клиент подтверждён' : 'Адвокат подтверждён'}
      className={cn('inline-block shrink-0 align-[-2px]', className)}
    >
      <polygon points={points} fill={fill} stroke={fill} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7.4 12.4l3 3 6.2-6.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
