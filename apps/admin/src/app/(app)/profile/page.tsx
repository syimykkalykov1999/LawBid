'use client';

import { Fingerprint, Key, Password, ShieldCheck } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';
import { Input, Label } from '@/components/ui/input';
import { TwoFactorCard } from '@/components/two-factor-card';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { ROLE_LABEL } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { PASSKEY_CANCELLED_TEXT, createPasskey, passkeyCancelled, passkeysSupported } from '@/lib/webauthn';

/** Own sign-in (the authenticator is mandatory); the super admin also changes their own
 * login and password and sets the recovery question. */
export default function ProfilePage() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <>
      <PageHeader
        eyebrow="Аккаунт"
        title="Профиль и безопасность"
        subtitle={
          me.role === 'super_admin'
            ? 'Ваш логин и пароль, секретный вопрос для восстановления и аутентификатор (обязателен при каждом входе). Пароль хранится в зашифрованном виде и никому не виден.'
            : 'Ваши данные для входа. Логин и пароль вам выдаёт супер-админ или тот, кто управляет админами; код из приложения-аутентификатора спрашивается при каждом входе.'
        }
      />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck size={16} weight="light" /> Ваш аккаунт
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="Email" value={me.email} />
            <Row label="Роль" value={ROLE_LABEL[me.role]} />
            <Row label="Логин" value={me.login ?? 'не задан'} />
            <Row
              label="Пароль"
              value={me.hasPassword ? <Badge tone="success">задан</Badge> : <Badge tone="warning">не задан</Badge>}
            />
            <Row
              label="Аутентификатор"
              value={me.totpEnabled ? <Badge tone="gold">подключён</Badge> : <Badge tone="warning">не подключён</Badge>}
            />
          </CardContent>
        </Card>
        {me.role === 'super_admin' ? <CredentialsCard hasPassword={me.hasPassword} login={me.login} /> : null}
        <TwoFactorCard enabled={me.totpEnabled} />
        <PasskeysCard />
        {me.onCallAvailable ? <OnCallCard enabled={me.onCallEnabled ?? true} /> : null}
        {me.role === 'super_admin' ? <QuestionCard question={me.securityQuestion} /> : null}
      </div>
    </>
  );
}

/** Owner 2026-10-22: «Дежурный» — system alerts (push + e-mail) for this admin. */
function OnCallCard({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: async (value: boolean) => {
      await api.PUT('/admin/auth/me/on-call', { body: { enabled: value } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Сохранено');
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck size={16} weight="light" /> Дежурный
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-start gap-4 text-sm">
        <p className="min-w-0 flex-1 text-muted">
          Когда в системе сбой (база, Redis, очереди, платежи Stripe, пуши, звонки, ошибки API), вам приходит
          пуш в приложение и письмо; пока сбой идёт, напоминание каждые 15 минут, а потом сообщение «восстановлено».
          Выключите, если вы в отпуске.
        </p>
        <Switch
          label="Получать сообщения о сбоях системы"
          checked={enabled}
          disabled={save.isPending}
          onChange={(v) => save.mutate(v)}
        />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function CredentialsCard({ hasPassword, login }: { hasPassword: boolean; login: string | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const mismatch = newPassword !== '' && repeat !== '' && newPassword !== repeat;

  const save = useMutation({
    mutationFn: async () => {
      await api.PUT('/admin/auth/me/credentials', {
        body: {
          currentPassword: current || undefined,
          newLogin: newLogin.trim() || undefined,
          newPassword: newPassword || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(newPassword ? 'Сохранено. Другие ваши сессии завершены.' : 'Логин обновлён');
      setCurrent('');
      setNewLogin('');
      setNewPassword('');
      setRepeat('');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key size={16} weight="light" /> {hasPassword ? 'Сменить логин или пароль' : 'Задать логин и пароль'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3.5"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) save.mutate();
          }}
        >
          {hasPassword ? (
            <div className="space-y-1.5">
              <Label htmlFor="cur">Текущий пароль</Label>
              <Input
                id="cur"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="nl">Новый логин {login ? <span className="text-faint">(сейчас: {login})</span> : null}</Label>
            <Input
              id="nl"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="латиница, цифры, точка, дефис"
              value={newLogin}
              onChange={(e) => setNewLogin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np">Новый пароль</Label>
            <Input
              id="np"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-faint">От 10 символов, буквы и цифры, без логина внутри.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp">Повторите пароль</Label>
            <Input
              id="rp"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </div>
          <ErrorNote text={mismatch ? 'Пароли не совпадают.' : save.error ? errorText(save.error) : null} />
          <Button
            type="submit"
            loading={save.isPending}
            disabled={mismatch || (!newLogin.trim() && !newPassword) || (hasPassword && !current)}
          >
            Сохранить
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function QuestionCard({ question }: { question: string | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState(question ?? '');
  const [a, setA] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      await api.PUT('/admin/auth/me/security-question', { body: { question: q.trim(), answer: a } });
    },
    onSuccess: () => {
      toast.success('Секретный вопрос сохранён');
      setA('');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint size={16} weight="light" /> Секретный вопрос на случай, если забудете пароль
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Работает только для супер-админа. Ответ на экране входа («Забыли пароль?») позволяет задать новый пароль, все
          сессии при этом завершаются. Если двухфакторный вход включён, он по-прежнему спрашивается при входе. Ответ
          хранится только в виде хеша, регистр и лишние пробелы не важны; от 4 символов, лучше длинный.
        </p>
        <form
          className="grid gap-3.5 sm:grid-cols-2"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="q">Вопрос</Label>
            <Input id="q" required minLength={3} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a">{question ? 'Новый ответ' : 'Ответ'}</Label>
            <Input id="a" type="password" autoComplete="off" required minLength={4} value={a} onChange={(e) => setA(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={q.trim().length < 3 || a.length < 4}>
              {question ? 'Обновить вопрос и ответ' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Owner 2026-10-22: passkeys (Face ID / Touch ID / Windows Hello / a
 * hardware key) — step 2 of the sign-in and step-up without the code from
 * the app. Adding and removing need a fresh step-up; the API client asks
 * for it by itself (StepUpHost) and repeats the call.
 */
function PasskeysCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState('Этот компьютер');
  const [error, setError] = useState<string | null>(null);
  // Set after mount: the server render must not differ from the browser's.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(passkeysSupported()), []);

  const list = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => (await api.GET('/admin/auth/passkeys')).data!.data.passkeys,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['passkeys'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const opts = await api.POST('/admin/auth/passkeys/options');
      const response = await createPasskey(opts.data!.data.options);
      await api.POST('/admin/auth/passkeys', { body: { response, name: name.trim() || undefined } });
    },
    onSuccess: () => {
      setError(null);
      toast.success('Ключ доступа добавлен');
      refresh();
    },
    onError: (e) => setError(passkeyCancelled(e) ? PASSKEY_CANCELLED_TEXT : errorText(e)),
  });

  const remove = useMutation({
    mutationFn: async (p: { id: string; name: string }) => {
      const ok = await confirm({
        title: `Удалить ключ «${p.name}»?`,
        description: 'Этим ключом больше нельзя будет войти или подтвердить действие. Код из приложения и коды восстановления продолжают работать.',
        confirm: 'Удалить',
        danger: true,
      });
      if (!ok) return false;
      await api.DELETE('/admin/auth/passkeys/{id}', { params: { path: { id: p.id } } });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      setError(null);
      toast.success('Ключ удалён');
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });

  const keys = list.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Password size={16} weight="light" /> Ключи доступа (passkeys)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5 text-sm">
        <p className="text-muted">
          Ключ доступа — это вход через Face ID, Touch ID, Windows Hello или аппаратный ключ вместо кода из
          приложения. Пароль по-прежнему спрашивается, а коды восстановления продолжают работать.
        </p>
        {list.error ? <ErrorNote text={errorText(list.error)} /> : null}
        {!keys ? (
          <Skeleton className="h-12 rounded-[var(--radius-md)]" />
        ) : keys.length === 0 ? (
          <p className="text-faint">Ключей пока нет.</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-ink">
                    <span className="font-medium">{k.name}</span>
                    <Badge tone={k.deviceType === 'multiDevice' ? 'info' : 'neutral'}>
                      {k.deviceType === 'multiDevice' ? 'синхронизируемый' : 'аппаратный'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted">
                    Добавлен {formatDateTime(k.createdAt)}
                    {' · '}
                    {k.lastUsedAt ? `последний вход ${formatDateTime(k.lastUsedAt)}` : 'ещё не использовался'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger-soft"
                  loading={remove.isPending && remove.variables?.id === k.id}
                  disabled={add.isPending}
                  onClick={() => remove.mutate({ id: k.id, name: k.name })}
                >
                  Удалить
                </Button>
              </li>
            ))}
          </ul>
        )}
        {supported ? (
          <form
            className="flex flex-wrap items-end gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="pk-name">Название ключа</Label>
              <Input
                id="pk-name"
                maxLength={64}
                placeholder="Этот компьютер"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" loading={add.isPending} disabled={remove.isPending}>
              <Fingerprint size={16} /> Добавить ключ
            </Button>
          </form>
        ) : (
          <p className="text-xs text-faint">Этот браузер не умеет работать с ключами доступа.</p>
        )}
        <ErrorNote text={error} />
        <p className="text-xs text-faint">
          Перед добавлением и удалением спросим свежий код из приложения. Название — чтобы отличать ключи:
          «Этот компьютер», «iPhone», «YubiKey».
        </p>
      </CardContent>
      {dialog}
    </Card>
  );
}
