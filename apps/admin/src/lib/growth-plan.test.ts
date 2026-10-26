import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isOwnerSession } from './growth-plan';
import { inlineText, parseInline, parseMarkdown, safeHref } from './markdown';
import { canOpen, groupsFor, sectionsFor } from './rbac';

const FILE = path.join(__dirname, '../../content/growth-plan.ru.md');

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('«План роста» access (owner only)', () => {
  it('opens the menu item and the URL only for the super admin', () => {
    expect(canOpen({ role: 'super_admin' }, '/growth-plan')).toBe(true);
    for (const role of ['moderator', 'verifier', 'support', 'finance'] as const) {
      expect(canOpen({ role, permissions: { settings: 'manage', money: 'manage' } }, '/growth-plan')).toBe(false);
    }
    // the deputy who manages admins reads the owner-only money pages, but not this one
    expect(canOpen({ role: 'support', permissions: {}, canManageAdmins: true }, '/growth-plan')).toBe(false);
    expect(canOpen({ role: 'support', permissions: {}, partnerLead: true, countryPartnerId: 'p1' }, '/growth-plan')).toBe(false);
  });

  it('shows the item in the «Система» section for the owner only', () => {
    const owner = groupsFor({ role: 'super_admin' }).find((g) => g.key === 'system');
    expect(owner?.items.map((s) => s.href)).toContain('/growth-plan');
    expect(sectionsFor({ role: 'moderator', permissions: { settings: 'manage' } }).map((s) => s.href)).not.toContain('/growth-plan');
  });

  it('server check: super_admin passes, every other answer is closed', async () => {
    const ok = reply(200, { data: { role: 'super_admin' } });
    expect(await isOwnerSession('tok', 'http://api', ok as unknown as typeof fetch)).toBe(true);
    expect(ok).toHaveBeenCalledWith('http://api/admin/auth/me', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer tok' }) }));

    expect(await isOwnerSession('tok', 'http://api', reply(200, { data: { role: 'finance' } }) as unknown as typeof fetch)).toBe(false);
    expect(await isOwnerSession('tok', 'http://api', reply(401, { error: {} }) as unknown as typeof fetch)).toBe(false);
    expect(await isOwnerSession('tok', 'http://api', reply(200, {}) as unknown as typeof fetch)).toBe(false);
    const down = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await isOwnerSession('tok', 'http://api', down as unknown as typeof fetch)).toBe(false);
  });

  it('server check: no session cookie means no request at all', async () => {
    const f = vi.fn();
    expect(await isOwnerSession(null, 'http://api', f as unknown as typeof fetch)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('safe Markdown', () => {
  it('keeps raw HTML as text and drops unsafe links', () => {
    const [p] = parseMarkdown('<script>alert(1)</script> и [клик](javascript:alert(1)) и [ок](https://aws.amazon.com)');
    expect(p.t).toBe('p');
    const inl = (p as { c: ReturnType<typeof parseInline> }).c;
    expect(inlineText(inl)).toContain('<script>alert(1)</script>');
    expect(inl.filter((n) => n.t === 'link')).toHaveLength(1);
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('http://x.y')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('https://x.y/z')).toBe('https://x.y/z');
  });

  it('reads headings, lists, tables, quotes and code', () => {
    const md = ['# A', '', '- one', '- two', '', '1. x', '2. y', '', '| h1 | h2 |', '|---|---|', '| a | b |', '', '> note', '', '```', 'growth = {}', '```'].join('\n');
    expect(parseMarkdown(md).map((b) => b.t)).toEqual(['heading', 'ul', 'ol', 'table', 'quote', 'code']);
  });
});

describe('growth-plan.ru.md', () => {
  const md = readFileSync(FILE, 'utf8');
  const blocks = parseMarkdown(md);
  const h2 = blocks.filter((b) => b.t === 'heading' && b.level === 2).map((b) => inlineText((b as { c: ReturnType<typeof parseInline> }).c));

  it('has the five stages in order', () => {
    const stages = h2.filter((h) => /^(Сейчас|Когда людей)/.test(h));
    expect(stages).toHaveLength(5);
    expect(h2[0]).toBe('Как пользоваться этой страницей');
    expect(h2.findIndex((h) => h.startsWith('Сейчас'))).toBeLessThan(h2.findIndex((h) => h.includes('100 тысяч')));
    expect(h2.findIndex((h) => h.includes('100 тысяч'))).toBeLessThan(h2.findIndex((h) => h.includes('1 миллиона')));
    expect(h2.findIndex((h) => h.includes('1 миллиона'))).toBeLessThan(h2.findIndex((h) => h.includes('10 миллионов')));
    expect(h2.findIndex((h) => h.includes('10 миллионов'))).toBeLessThan(h2.findIndex((h) => h.includes('100 миллионов')));
  });

  it('marks deferred code as not written or ready', () => {
    for (const w of ['feed precompute', 'OpenSearch', 'sharded counters', 'partitioning', 'relationJoins', 'cluster', 'LiveKit']) {
      expect(md).toContain(w);
    }
    expect(md).toContain('код ещё не написан — попросить разработчика');
    expect(md).toContain('код готов, только включить');
  });

  it('contains no secrets, keys or passwords', () => {
    expect(md).not.toMatch(/AKIA[0-9A-Z]{12,}/);
    expect(md).not.toMatch(/sk_(live|test)_[A-Za-z0-9]/);
    expect(md).not.toMatch(/pk_live_[A-Za-z0-9]/);
    expect(md).not.toMatch(/-----BEGIN/);
    expect(md).not.toMatch(/postgres(ql)?:\/\/[^\s]+:[^\s]+@/);
    expect(md).not.toMatch(/\b\d{12}\b/); // AWS account ids
  });
});
