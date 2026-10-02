// Mirrors the app icon: gold scales on navy, ivory pans for "Law" and "Bid".
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0a1a3f" />
      <g stroke="#c9a24a" strokeWidth="1.1" strokeLinecap="round" fill="none">
        <path d="M16 8.5v15" />
        <path d="M6.5 12.5h19" />
        <path d="M12.5 24h7" />
        <path d="M7.5 12.5l-3 6.2M7.5 12.5l3 6.2M24.5 12.5l-3 6.2M24.5 12.5l3 6.2" />
      </g>
      <circle cx="16" cy="7.4" r="1.1" fill="none" stroke="#c9a24a" strokeWidth="0.9" />
      <circle cx="16" cy="12.5" r="1.1" fill="#c9a24a" />
      <path d="M3.6 18.7h7.8a3.9 3.9 0 0 1-7.8 0z" fill="#f3efe3" stroke="#c9a24a" strokeWidth="0.6" />
      <path d="M20.6 18.7h7.8a3.9 3.9 0 0 1-7.8 0z" fill="#f3efe3" stroke="#c9a24a" strokeWidth="0.6" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {compact ? null : (
        <span className="leading-none">
          <span className="block text-[16px] font-semibold tracking-tight text-heading">
            Law<span className="text-gold">Bid</span>
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.22em] text-faint">Admin</span>
        </span>
      )}
    </span>
  );
}
