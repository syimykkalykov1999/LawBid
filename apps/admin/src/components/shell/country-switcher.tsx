'use client';

import { GlobeHemisphereWest } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { countryTab, onCountryTab, setCountryTab } from '@/lib/country-tab';
import type { Me } from '@/lib/hooks';

/**
 * Owner 2026-10-05: a separate tab per country, so the Canadian team
 * never mixes with US clients and attorneys. Shown when there is a choice
 * (more than one country) or the admin works in one country only.
 */
export function CountrySwitcher({ me }: { me: Me | undefined }) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(countryTab());
    return onCountryTab(() => setValue(countryTab()));
  }, []);

  const tabs = useMemo(() => me?.countryTabs ?? [], [me]);
  const assigned = me?.countries ?? [];
  // A tab the admin no longer has (country closed, rights changed) is dropped.
  useEffect(() => {
    if (!me || !value) return;
    if (!tabs.some((t) => t.code === value)) setCountryTab('');
  }, [me, value, tabs]);

  if (tabs.length === 0 || (tabs.length === 1 && assigned.length === 0)) return null;

  const pick = (code: string) => {
    setCountryTab(code);
    // Every list on screen re-reads for the new country.
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  return (
    <label className="relative flex h-9 max-w-48 min-w-0 items-center gap-1.5 rounded-xl border border-line bg-surface pr-2 pl-2.5 text-sm text-ink transition-colors hover:border-gold/50">
      <GlobeHemisphereWest size={16} className="shrink-0 text-muted" />
      <span className="sr-only">Страна</span>
      <select
        value={value}
        onChange={(e) => pick(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer truncate bg-transparent outline-none"
        title="Страна, с которой вы работаете"
      >
        {tabs.length > 1 ? <option value="">{assigned.length > 0 ? 'Все мои страны' : 'Все страны'}</option> : null}
        {tabs.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
