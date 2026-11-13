'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'lawbid-admin-theme';

/** Runs before paint (inlined in <head>) so the page never flashes. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

const Ctx = createContext<{
  pref: ThemePref;
  resolved: 'light' | 'dark';
  setPref: (p: ThemePref) => void;
  toggle: () => void;
} | null>(null);

/**
 * Turns every CSS transition off for one frame while the theme class flips, so
 * the switch costs one restyle instead of thousands of colour transitions on a
 * big table (owner row 88, 2026-11-13). Copied from next-themes
 * `disableAnimation` (MIT, Copyright (c) 2022 Paco Coursey; see
 * THIRD_PARTY_NOTICES.md), the code behind its `disableTransitionOnChange`.
 */
export const disableAnimation = () => {
  const css = document.createElement('style');
  css.appendChild(
    document.createTextNode(
      `*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`,
    ),
  );
  document.head.appendChild(css);

  return () => {
    // Force restyle
    (() => window.getComputedStyle(document.body))();

    // Wait for next tick before removing
    setTimeout(() => {
      document.head.removeChild(css);
    }, 1);
  };
};

function apply(pref: ThemePref): 'light' | 'dark' {
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const enable = disableAnimation();
  document.documentElement.classList.toggle('dark', dark);
  enable();
  return dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let p: ThemePref = 'system';
    try {
      p = (localStorage.getItem(KEY) as ThemePref | null) ?? 'system';
    } catch {
      /* private mode: keep system */
    }
    setPrefState(p);
    setResolved(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const cur = (localStorage.getItem(KEY) as ThemePref | null) ?? 'system';
      if (cur === 'system') setResolved(apply('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
    setPrefState(p);
    setResolved(apply(p));
  }, []);

  const toggle = useCallback(() => {
    setPref(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [setPref]);

  return <Ctx.Provider value={{ pref, resolved, setPref, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
