---
id: aws-organizations
title: AWS Organizations (делать позже)
category: aws
cost: Бесплатно (платите только за ресурсы в аккаунтах)
time: 30 минут
verified: 2026-10-25
sources:
  - AWS: Creating an organization | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html
  - AWS: Creating a member account | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create.html
  - AWS: Inviting an account to join | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_invite-account.html
---

## Что это и зачем

AWS Organizations объединяет несколько аккаунтов AWS под одним «главным» с общим счётом (consolidated billing). Нужно позже: отдельный аккаунт для тестов и отдельный аккаунт для резервных копий, чтобы взлом основного не уничтожил бэкапы. Для запуска это не обязательно, поэтому делайте после выхода в прод.

## Что понадобится

- Основной аккаунт AWS станет management account. В нём уже должен стоять MFA (см. инструкцию «Защитить главный вход в AWS (root): MFA и удаление ключей»).
- Для каждого нового аккаунта отдельный адрес почты, которого ещё нет в AWS. Подойдёт вариант вида `имя+backup@вашдомен`, если почта поддерживает плюс-адреса.

## Шаги

1. Откройте [console.aws.amazon.com/organizations/v2](https://console.aws.amazon.com/organizations/v2) под админом основного аккаунта.
2. На стартовой странице нажмите **Create an organization**. Оставьте режим со всеми функциями (all features).
3. AWS пришлёт письмо на почту аккаунта. Подтвердите адрес в течение 24 часов.
4. Откройте **AWS accounts** → **Add an AWS account** → **Create an AWS account**.
5. Впишите имя (**AWS account name**), почту (**Email address of the account's owner**) и оставьте имя роли `OrganizationAccountAccessRole`. Нажмите **Create AWS account**.
6. Подождите, пока аккаунт появится в списке. Зайдите в него через роль или по сбросу пароля root и сразу включите MFA.
7. Если аккаунт уже существует, выберите вместо этого **Invite an existing AWS account** и введите его номер или почту (приглашать можно только после подтверждения почты).
8. Скажите Claude номер нового аккаунта: в Terraform есть параметр копии бэкапов в отдельный аккаунт (`backup_copy_account_id`, см. docs/runbooks/backups.md).

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

В списке **AWS accounts** виден ваш главный аккаунт и новый. Отдельного света на «Запуске» нет.

## Частые ошибки

- Не делайте этого за день до запуска: это не блокирует выход.
- Теги расходов и бюджеты после создания организации включайте в главном аккаунте, см. инструкцию «Включить теги расходов AWS (видно, на что уходят деньги)».
- Закрывать созданный аккаунт потом сложно. Создавайте только то, что нужно.
