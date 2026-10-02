'use client';

import { Fingerprint, Key, ShieldCheck } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { TwoFactorCard } from '@/components/two-factor-card';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { ROLE_LABEL } from '@/lib/rbac';

/** Own sign-in: optional two-factor; the super admin also changes their own
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
            ? 'Ваш логин и пароль, секретный вопрос для восстановления и необязательный двухфакторный вход. Пароль хранится в зашифрованном виде и никому не виден.'
            : 'Ваши данные для входа. Логин и пароль вам выдаёт супер-админ или тот, кто управляет админами; двухфакторный вход можно включить самому.'
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
              label="Двухфакторный вход"
              value={me.totpEnabled ? <Badge tone="gold">включён</Badge> : <Badge>выключен</Badge>}
            />
          </CardContent>
        </Card>
        {me.role === 'super_admin' ? <CredentialsCard hasPassword={me.hasPassword} login={me.login} /> : null}
        <TwoFactorCard enabled={me.totpEnabled} />
        {me.role === 'super_admin' ? <QuestionCard question={me.securityQuestion} /> : null}
      </div>
    </>
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
