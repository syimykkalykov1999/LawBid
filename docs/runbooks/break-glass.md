# Break-glass: аварийный вход в AWS

## Кратко для владельца (по-русски)

- Это запасная роль-администратор `lawbid-<env>-break-glass`. Нужна только если обычный вход сломался (SSO недоступен, ключи деплоя украдены или отозваны).
- Войти может только человек из списка `break_glass_principal_arns`, только с кодом MFA (не старше 15 минут), сессия до 1 часа.
- Каждый вход (и каждая неудачная попытка) сразу приходит в критичный канал (тот, что звонит на телефон). Если ты не входил сам, это инцидент: см. `BREACH.md`.
- Включить: в tfvars `break_glass_enabled = true` и `break_glass_principal_arns = ["arn:aws:iam::<account>:user/<имя>"]`, затем apply. Стоит $0.
- Раз в квартал заходи по этой инструкции и проверяй, что пришло оповещение. Роль, которой никогда не пользовались, в нужный момент не сработает.

## Как войти (консоль)

1. Войди своим пользователем с MFA.
2. Консоль, меню справа вверху, Switch role: Account = номер аккаунта, Role = `lawbid-<env>-break-glass`.
3. Сделай нужное минимальное действие (включить/отозвать ключи, вернуть доступ). Не оставляй ничего "на потом".
4. Выйди (Switch back). Роль не нужно отключать, но проверь CloudTrail за время сессии.

## Как войти (CLI)

```
aws sts assume-role \
  --role-arn arn:aws:iam::<account>:role/lawbid-<env>-break-glass \
  --role-session-name <твоё-имя>-<причина> \
  --duration-seconds 900 \
  --serial-number arn:aws:iam::<account>:mfa/<твоё-устройство> \
  --token-code <6 цифр>
```

## Что происходит автоматически

- Доверие роли: только перечисленные пользователи/роли, `aws:MultiFactorAuthPresent = true`, `aws:MultiFactorAuthAge < 900`.
- EventBridge правило `<name>-break-glass-assumed` ловит `sts:AssumeRole` по ARN роли в CloudTrail и шлёт строку в critical SNS topic (PagerDuty и/или почта).
- События STS региональных endpoint-ов попадают в регион endpoint-а; глобальный endpoint это us-east-1. Стек живёт в us-east-1, так что правило видит основной вход. Если вход идёт через другой регион, правило его не увидит: используй `AWS_STS_REGIONAL_ENDPOINTS=legacy` или регион стека.

## После использования

1. Запроси в Athena `<name>-iam-changes` и `<name>-who-deleted-something` (workgroup `<name>-security`) и посмотри, что было сделано.
2. Если создавались ключи доступа, удали их сразу.
3. Запиши в журнал: когда, зачем, кто.

## Связь с org-guardrails

SCP `no-iam-access-keys` разрешает `iam:CreateAccessKey` только этой роли (`break_glass_role_name`), а region-lock и защита CloudTrail/Config/GuardDuty её не трогают. Поэтому имя роли в модуле `org-guardrails` должно совпадать с `<name>-break-glass`.
