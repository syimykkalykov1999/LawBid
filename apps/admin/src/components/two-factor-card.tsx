'use client';

import { DeviceMobile } from '@phosphor-icons/react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Owner 2026-10-22 (system audit #2, item 1): the authenticator is
 * mandatory for every admin. It is set up at the first sign-in (QR +
 * recovery codes); it cannot be switched off here. A lost phone: sign in
 * with a recovery code, or ask the super admin to reset it (the next
 * sign-in sets up a new one).
 */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DeviceMobile size={16} weight="light" /> Аутентификатор{' '}
          {enabled ? <Badge tone="gold">подключён</Badge> : <Badge tone="warning">не подключён</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted">
        <p>
          Вход в админку — всегда логин, пароль и код из приложения-аутентификатора. Без него войти нельзя, поэтому
          выключить его нельзя.
        </p>
        <p>
          Потеряли телефон — войдите с одним из кодов восстановления, которые вы сохранили при подключении. Если кодов
          нет, попросите супер-админа сбросить аутентификатор: при следующем входе вы подключите новый.
        </p>
      </CardContent>
    </Card>
  );
}
