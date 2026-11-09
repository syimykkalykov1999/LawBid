import {
  aiGate,
  monthKey,
  safeCost,
  scrub,
  taskIssueBody,
} from './ai-assistant.logic';

describe('AI assistant logic (09.11.2026)', () => {
  const on = { mode: 'on', connected: true, monthUsd: 4, maxUsd: 30 };

  it('runs only when switched on, connected and under the money ceiling', () => {
    expect(aiGate(on)).toEqual({ allowed: true, reason: null, leftUsd: 26 });
    expect(aiGate({ ...on, mode: 'off' }).reason).toBe('off');
    expect(aiGate({ ...on, mode: 'auto' }).reason).toBe('off');
    expect(aiGate({ ...on, connected: false }).reason).toBe('not_connected');
    expect(aiGate({ ...on, monthUsd: 30 })).toEqual({
      allowed: false,
      reason: 'budget',
      leftUsd: 0,
    });
    expect(aiGate({ ...on, maxUsd: 0 }).reason).toBe('budget');
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
    const t = scrub(
      'Login failed for anna@example.com phone +1 (415) 555-0100 user 3f2b1c9e-1d2a-4b5c-9e8f-0a1b2c3d4e5f key AKIAABCDEFGHIJKLMNOP',
    );
    expect(t).not.toMatch(/anna@|555-0100|3f2b1c9e|AKIA/);
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
