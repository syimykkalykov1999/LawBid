import { createHmac } from 'node:crypto';
import {
  aiGate,
  monthKey,
  safeCost,
  scrub,
  sentryNewIssue,
  sentrySignatureValid,
  taskIssueBody,
  triggerInputs,
  triggerKey,
} from './ai-assistant.logic';

describe('AI assistant logic (09.11.2026)', () => {
  const on = { mode: 'on', connected: true, monthUsd: 4, maxUsd: 30 };

  it('runs only when switched on, connected and under the money ceiling', () => {
    expect(aiGate(on)).toEqual({ allowed: true, reason: null, leftUsd: 26 });
    expect(aiGate({ ...on, mode: 'off' }).reason).toBe('off');
    expect(aiGate({ ...on, mode: 'aut' }).reason).toBe('off');
    expect(aiGate({ ...on, connected: false }).reason).toBe('not_connected');
    expect(aiGate({ ...on, monthUsd: 30 })).toEqual({
      allowed: false,
      reason: 'budget',
      leftUsd: 0,
    });
    expect(aiGate({ ...on, maxUsd: 0 }).reason).toBe('budget');
  });

  it('owner 12.11: Выкл nothing, Авто the scheduled look only, Вкл also the owner tasks', () => {
    const sched = { ...on, kind: 'schedule' as const };
    const task = { ...on, kind: 'task' as const };
    // Выкл: neither
    expect(aiGate({ ...sched, mode: 'off' }).allowed).toBe(false);
    expect(aiGate({ ...task, mode: 'off' }).reason).toBe('off');
    // Авто: the scheduled look runs, a task waits for Вкл
    expect(aiGate({ ...sched, mode: 'Auto ' })).toEqual({
      allowed: true,
      reason: null,
      leftUsd: 26,
    });
    expect(aiGate({ ...task, mode: 'auto' }).reason).toBe('tasks_need_on');
    // a caller that does not say its kind counts as a task
    expect(aiGate({ ...on, mode: 'auto' }).reason).toBe('tasks_need_on');
    // Вкл: both
    expect(aiGate(sched).allowed).toBe(true);
    expect(aiGate(task).allowed).toBe(true);
    // the ceiling holds in every mode
    expect(aiGate({ ...sched, mode: 'auto', monthUsd: 31 }).reason).toBe(
      'budget',
    );
  });

  it('the month key and a safe cost', () => {
    expect(monthKey(new Date('2026-11-09T02:00:00Z'))).toBe('ai:usd:2026-11');
    expect(safeCost(0.12345678)).toBe(0.1235);
    expect(safeCost('1.5')).toBe(1.5);
    expect(safeCost(-3)).toBe(0);
    expect(safeCost('x')).toBe(0);
    expect(safeCost(1e9)).toBe(100);
  });

  it('scrubs personal data before anything reaches the public repository', () => {
    // Built at run time so no secret scanner sees a key-shaped literal.
    const fakeAwsKey = ['AK', 'IA', 'X'.repeat(16)].join('');
    const t = scrub(
      `Login failed for anna@example.com phone +1 (415) 555-0100 user 3f2b1c9e-1d2a-4b5c-9e8f-0a1b2c3d4e5f key ${fakeAwsKey}`,
    );
    expect(t).not.toMatch(/anna@|555-0100|3f2b1c9e/);
    expect(t).not.toContain(fakeAwsKey);
    expect(t).toContain('[email]');
    expect(t).toContain('[phone]');
    expect(t).toContain('[id]');
    expect(t).toContain('[token]');
    expect(scrub('x'.repeat(500))).toHaveLength(160);
  });

  it('the task body ends with the policy reminder', () => {
    const b = taskIssueBody(
      '  Fix the crash on the case screen  ',
      'admin 1234abcd',
    );
    expect(b.startsWith('Fix the crash')).toBe(true);
    expect(b).toContain('.github/ai-assistant/POLICY.md');
    expect(b).toContain('admin 1234abcd');
  });
});

describe('AI assistant triggers (12.11.2026)', () => {
  it('builds a safe debounce key and scrubbed workflow inputs', () => {
    expect(triggerKey('alarm', 'lawbid-prod-db down')).toBe(
      'ai:trigger:alarm:lawbid-prod-db_down',
    );
    expect(triggerKey('sentry', 'x'.repeat(300)).length).toBeLessThan(150);
    expect(triggerInputs('alarm', 'a\nb anna@example.com')).toEqual({
      reason: 'alarm',
      alarm: 'a b [email]',
    });
    expect(triggerInputs('sentry', 't').issue).toBe('t');
  });

  const secret = 'c'.repeat(64);
  const raw = Buffer.from('{"action":"created"}');
  const sign = (b: Buffer, k = secret) =>
    createHmac('sha256', k).update(b).digest('hex');

  it('checks the Sentry HMAC of the body in constant time', () => {
    expect(sentrySignatureValid(raw, sign(raw), secret)).toBe(true);
    expect(sentrySignatureValid(raw, sign(raw).toUpperCase(), secret)).toBe(
      true,
    );
    expect(sentrySignatureValid(raw, undefined, secret)).toBe(false);
    expect(sentrySignatureValid(raw, 'abc', secret)).toBe(false);
    expect(sentrySignatureValid(raw, sign(raw, 'other'), secret)).toBe(false);
    expect(sentrySignatureValid(Buffer.from('{}'), sign(raw), secret)).toBe(
      false,
    );
    expect(sentrySignatureValid(raw, sign(raw, ''), '')).toBe(false);
  });

  const issue = (o: Record<string, unknown> = {}) => ({
    action: 'created',
    data: {
      issue: {
        id: '4512',
        level: 'error',
        title: 'TypeError for bob@example.com',
        culprit: 'CasesService.list',
        ...o,
      },
    },
  });

  it('only a NEW error/fatal issue starts a run, with title and culprit only', () => {
    expect(sentryNewIssue('issue', issue())).toEqual({
      id: '4512',
      text: 'error: TypeError for [email] @ CasesService.list',
    });
    expect(sentryNewIssue('issue', issue({ level: 'fatal' }))?.id).toBe('4512');
    expect(sentryNewIssue('issue', issue({ level: 'warning' }))).toBeNull();
    expect(sentryNewIssue('issue', { ...issue(), action: 'resolved' })).toBe(
      null,
    );
    expect(sentryNewIssue('event_alert', issue())).toBeNull();
    expect(sentryNewIssue(undefined, issue())).toBeNull();
    expect(sentryNewIssue('issue', issue({ id: '../x' }))).toBeNull();
    expect(sentryNewIssue('issue', null)).toBeNull();
  });
});
