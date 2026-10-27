import { checkEnv } from './check-config';

describe('check-config (deploy preflight, prints names never values)', () => {
  it('refuses a production env with a missing key and names it', () => {
    const r = checkEnv({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://u:VerySecretPassword@db:5432/x?sslmode=require',
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/REDIS_URL/);
    expect(r.problems.join('\n')).not.toContain('VerySecretPassword');
  });
});
