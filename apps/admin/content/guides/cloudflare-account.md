---
id: cloudflare-account
title: Cloudflare: аккаунт и защита входа
category: launch
cost: Бесплатно (тариф Free). Платите только за отдельные услуги, которые включите сами.
time: 10 минут
verified: 2026-10-25
sources:
  - Create a Cloudflare account | https://developers.cloudflare.com/fundamentals/account/create-account/
  - Set up two-factor authentication | https://developers.cloudflare.com/fundamentals/user-profiles/2fa/
  - Find account and zone IDs | https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/
---

## Что это и зачем

В Cloudflare у нас живут звонки, фото, защита сайта от ботов и DNS домена. Все эти инструкции начинаются с одного аккаунта. Сделайте его один раз.

## Что понадобится

- Почта, к которой есть доступ только у вас (лучше рабочая, не личная).
- Телефон с приложением для кодов (Google Authenticator, Microsoft Authenticator или аналог).
- Банковская карта понадобится позже, только для R2 (см. инструкцию «Cloudflare: фото и медиа (R2)»).

## Шаги

1. Откройте [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Впишите **Email** и **Password** (длинный, уникальный, лучше из менеджера паролей).
3. Нажмите **Create Account**.
4. Откройте письмо от Cloudflare и нажмите ссылку подтверждения. Без подтверждённой почты двухфакторную защиту включить нельзя.
5. Войдите в [dash.cloudflare.com](https://dash.cloudflare.com). Справа сверху откройте меню **My Profile** и нажмите **My Profile**.
6. Слева выберите **Authentication**.
7. В блоке **Mobile App Authentication** нажмите **Add**. Отсканируйте QR-код приложением, впишите шестизначный код, введите пароль.
8. Сохраните **backup codes** (резервные коды) в надёжное место: на бумаге или в менеджере паролей. Без них при потере телефона вы потеряете вход.
9. Cloudflare советует включить ещё один способ: в блоке **Security Key Authentication** нажмите **Add** и зарегистрируйте Touch ID или ключ YubiKey.
10. Чтобы найти **Account ID** (нужен в нескольких карточках): нажмите **Search** (или Cmd+K), впишите `Copy account ID` и выберите найденный пункт. Это 32 символа из букв a-f и цифр.

## Куда вставить в нашей админке

Сам аккаунт нигде не вводится. **Account ID** вы вставите позже в карточки «Ключи и сервисы» → Cloudflare R2 (поле «Cloudflare account ID») и Cloudflare TURN (поле «Account ID», необязательное).

## Как проверить

- В **My Profile** → **Authentication** виден включённый способ.
- Выйдите и войдите снова: Cloudflare должен спросить код.
- Лампочек на «Запуск» этот шаг не зажигает, но без него остальные шаги Cloudflare невозможны.

## Частые ошибки

- Не подтвердили почту: двухфакторная защита не включится. Нажмите ссылку в письме.
- Потеряли телефон без резервных кодов: восстановление идёт через поддержку Cloudflare и занимает дни. Коды сохраните сразу.
- Завели аккаунт на чужую или общую почту: потом сложно передать права. Используйте почту компании.
