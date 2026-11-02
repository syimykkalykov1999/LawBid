import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { Component, type ComponentType, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/lib/theme';
import type { SampleMode } from '@/test-utils/openapi-sample';

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).IntersectionObserver ??= NoObserver;
(globalThis as Record<string, unknown>).ResizeObserver ??= NoObserver;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
Element.prototype.scrollIntoView ??= () => {};

/**
 * Stability sweep 2026-11-02 (owner: "the admin keeps breaking"): every
 * admin page is opened against API answers that are legal but thin — an
 * empty list, a null field — and against an API error. A page must never
 * fall into app/(app)/error.tsx ("Страница не открылась") for these.
 */
type Scenario = { name: string; mode: SampleMode; reject?: boolean; strict: boolean };

const SCENARIOS: Scenario[] = [
  // The thinnest answers the API contract allows (packages/api-contract/openapi.json).
  { name: 'required fields only, empty lists', mode: { nulls: false, optional: false }, strict: true },
  { name: 'every nullable field null', mode: { nulls: true, optional: true }, strict: true },
  { name: 'api error', mode: { nulls: false, optional: false }, reject: true, strict: true },
];

const state = vi.hoisted(() => ({ reject: false, mode: { nulls: false, optional: false } as SampleMode }));
const callFor = vi.hoisted(() => (method: string) => async (path: string) => {
  if (state.reject) throw new Error('HTTP 500');
  const { sampleResponse } = await import('@/test-utils/openapi-sample');
  const body = sampleResponse(method, path, state.mode);
  return body === undefined ? { data: undefined } : { data: body };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'x', type: 'post', key: 'k', role: 'mass', adminId: 'a', userId: 'u', attorneyId: 'a', token: 't' }),
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={String(href)}>{children}</a>,
}));
vi.mock('@/lib/api/client', () => ({
  api: { GET: callFor('get'), POST: callFor('post'), PUT: callFor('put'), PATCH: callFor('patch'), DELETE: callFor('delete') },
  publicApi: { GET: callFor('get'), POST: callFor('post') },
  ApiError: class ApiError extends Error {},
  toProxy: { onRequest: () => undefined },
  registerStepUpPrompt: vi.fn(),
  errorText: (e: unknown) => String(e),
  errorDetail: () => undefined,
}));

class Boundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch(e: Error) {
    this.props.onError(e);
  }
  render() {
    return this.state.bad ? null : this.props.children;
  }
}

const pages = (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob('./**/page.tsx');
const names = Object.keys(pages).sort();

describe('every admin page survives thin and failing API answers', () => {
  afterEach(cleanup);
  for (const sc of SCENARIOS) {
    it(`${sc.name} (${names.length} pages)`, async () => {
      state.reject = !!sc.reject;
      state.mode = sc.mode;
      const broken: string[] = [];
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      for (const file of names) {
        let mod: { default: ComponentType<Record<string, unknown>> };
        try {
          mod = (await pages[file]!()) as typeof mod;
        } catch (e) {
          if (/server-only/.test((e as Error).message)) continue; // server components
          broken.push(`${file}: import ${(e as Error).message.slice(0, 100)}`);
          continue;
        }
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const params = Promise.resolve({ id: 'x', type: 'post', key: 'k', role: 'mass', adminId: 'a', userId: 'u', attorneyId: 'a', token: 't' });
        const Page = mod.default;
        // Server components (async) and pure redirects are not client pages.
        if (Page.constructor.name === 'AsyncFunction' || file === './(app)/legal/page.tsx') continue;
        let failure: Error | null = null;
        try {
          render(
            <ThemeProvider>
              <ToastProvider>
                <QueryClientProvider client={qc}>
                  <Boundary onError={(e) => (failure = e)}>
                    <Page params={params} searchParams={Promise.resolve({})} />
                  </Boundary>
                </QueryClientProvider>
              </ToastProvider>
            </ThemeProvider>,
          );
          await new Promise((r) => setTimeout(r, 30));
        } catch (e) {
          failure = e as Error;
        }
        if (failure) broken.push(`${file}: ${(failure as Error).message.slice(0, 140)}`);
        cleanup();
        qc.clear();
      }
      log.mockRestore();
      if (broken.length) console.warn(`[${sc.name}] ${broken.length} broken:\n${broken.join('\n')}`);
      if (sc.strict) expect(broken, broken.join('\n')).toEqual([]);
    }, 300_000);
  }
});
