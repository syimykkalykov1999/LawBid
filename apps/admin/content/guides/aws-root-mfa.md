---
id: aws-root-mfa
title: Защитить главный вход в AWS (root): MFA и удаление ключей
category: system
cost: Бесплатно (аппаратный ключ YubiKey по желанию, цену проверьте в магазине)
time: 20 минут
verified: 2026-10-25
sources:
  - AWS: MFA for the AWS account root user | https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-mfa-for-root.html
  - AWS: Root user access keys | https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-access-keys.html
  - AWS: IAM security best practices | https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
---

## Что это и зачем

Root-вход в AWS (по почте и паролю) может всё, в том числе закрыть аккаунт. Его защищают вторым фактором (MFA) и не держат для него ключей доступа. Повседневная работа идёт через отдельного админа, а root остаётся на крайний случай. AWS сейчас в любом случае требует MFA для root.

## Что понадобится

- Почта и пароль root-входа AWS.
- Телефон с менеджером паролей (1Password, Apple Passwords, Bitwarden) или приложением-аутентификатором. Лучше ещё второе устройство.

## Шаги

1. Откройте [console.aws.amazon.com](https://console.aws.amazon.com/), выберите **Root user** и войдите по почте и паролю.
2. Справа вверху нажмите на название аккаунта и выберите **Security credentials**.
3. В блоке **Multi-factor authentication (MFA)** нажмите **Assign MFA device**.
4. В поле **Device name** впишите понятное имя, например `owner-iphone`.
5. Выберите **Passkey or security key** (надёжнее всего, AWS рекомендует именно его) или **Authenticator app**. Нажмите **Next** и пройдите шаги на экране.
6. Добавьте второе устройство тем же способом: AWS позволяет несколько. Если потеряете телефон, второе устройство спасёт.
7. На той же странице найдите блок **Access keys**. Если там есть ключи, нажмите **Actions** → **Deactivate**, неделю понаблюдайте, что ничего не сломалось, потом **Actions** → **Delete**. Если ключей нет, ничего не делайте и не создавайте их.
8. Откройте [console.aws.amazon.com/iam](https://console.aws.amazon.com/iam/) → **Users** и проверьте, что есть отдельный пользователь-админ (или IAM Identity Center) тоже с MFA. Работайте через него, а не через root.

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

В блоке MFA два устройства, в блоке **Access keys** пусто. Выйдите и войдите заново: AWS попросит второй фактор. Отдельного света на «Запуске» нет.

## Частые ошибки

- Не создавайте root-ключи «для скриптов». Наши скрипты работают через обычного IAM-пользователя или роль.
- Только одно устройство MFA: потеряете его, придётся восстанавливать доступ через поддержку AWS. Добавьте второе.
- Проверьте, что в настройках аккаунта (**Account**) актуальны почта и телефон: по ним восстанавливается root.
- Не храните пароль root и MFA в одном месте.
