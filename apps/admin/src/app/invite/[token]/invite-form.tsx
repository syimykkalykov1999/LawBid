'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ApiError, errorText, publicApi } from '@/lib/api/client';

/**
 * Open the link → see which address it is for → choose a login and a
 * password → signed in (the proxy sets the session cookie) → the profile,
 * where the authenticator is bound (two-factor), as the first thing to do.
 */
export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    publicApi
      .GET('/admin/auth/invite/{token}', { params: { path: { token } } })
      .then(({ data }) => {
        if (alive) setEmail(data!.data.email);
      })
      .catch(() => {
        if (alive) setGone(true);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const l = login.trim();
      await publicApi.POST('/admin/auth/invite/accept', { body: { token, login: l, password } });
      const { data } = await publicApi.POST('/admin/auth/login/password', { body: { login: l, password } });
      setPassword('');
      // No authenticator is bound yet, so this is already a session.
      if (data!.data.ticket) router.replace('/login');
      else router.replace('/profile');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (gone) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-sm text-muted shadow-card">
        Эта ссылка уже использована или истекла (она действует 72 часа). Попросите владельца прислать новую.
      </div>
    );
  }
  return (
    <form
      className="space-y-3.5"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="text-sm text-muted">{email ? <>Для <span className="text-ink">{email}</span></> : 'Проверяем ссылку…'}</div>
      <div className="space-y-1.5">
        <Label htmlFor="i-login">Логин</Label>
        <Input
          id="i-login"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="латиница, цифры, точка, дефис"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="i-pass">Пароль</Label>
        <Input
          id="i-pass"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-faint">От 10 символов, буквы и цифры, без логина внутри.</p>
      </div>
      <ErrorNote text={error} />
      <Button type="submit" className="w-full" loading={busy} disabled={!email || !login.trim() || password.length < 10}>
        Войти в панель
      </Button>
      <p className="text-xs text-faint">После входа сразу включите двухфакторную защиту в профиле.</p>
    </form>
  );
}
