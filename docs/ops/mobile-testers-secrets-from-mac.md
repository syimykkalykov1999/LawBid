# Секреты тестовых сборок: владелец только логинится, Mac делает остальное

Для `mobile-testers.yml` (общая схема: `docs/runbooks/mobile-testers-ci.md`). Mac-сессия (Claude Code, RC) берёт значения
из файлов и браузера, кодирует и кладёт в окружение `release` через `gh`. Значения **не печатаются
в чат и не лежат в истории команд**: только `< файл` и каналы (пайпы). После работы удалить
скачанные `.p8` и JSON-ключи из `~/Downloads`.

Предусловия: `gh auth status` успешен (нужны права на секреты и переменные репозитория), окружение
`release` существует (Settings -> Environments), в нём нет Required reviewers.

```bash
R=syimykkalykov1999/LawBid
cd ~/Desktop/LawBid
```

| Владелец (только логинится / нажимает) | Mac делает сам |
|---|---|
| В Safari/Chrome Mac заходит в **App Store Connect**, вводит код 2FA на телефоне | Создаёт ключ (Integrations -> App Store Connect API -> Team Keys -> «+», доступ **Admin**), скачивает `AuthKey_<KEYID>.p8`, читает Issuer ID со страницы, кладёт три секрета |
| Заходит в **Google Play Console** и **Firebase** (тот же Google-аккаунт) | Создаёт сервисный аккаунт `lawbid-ci` и JSON-ключ, приглашает его в Play Console с правом Release to testing tracks, скачивает `GoogleService-Info.plist`, если его нет на диске |
| Если Google спросит подтверждение (пароль, код на телефоне) — вводит | Кладёт переменную `MOBILE_TESTERS_ENABLED=true` после всех секретов |
| На iPhone ставит TestFlight, принимает приглашение; на Samsung открывает ссылку «Become a tester» | Создаёт в TestFlight группу с Automatic distribution, в Play — список e-mail тестеров и ссылку (`docs/runbooks/mobile-testers-add.md`) |

## Команды `gh secret set` (все значения из файлов)

```bash
E="--env release --repo $R"

# Dart-определения prod
gh secret set MOBILE_DART_DEFINES_JSON $E < apps/mobile/config/prod.json

# Firebase (два файла, base64 без переносов строк)
base64 < apps/mobile/ios/Runner/GoogleService-Info.plist | tr -d '\n' | gh secret set GOOGLE_SERVICE_INFO_PLIST_BASE64 $E
base64 < apps/mobile/android/app/src/prod/google-services.json | tr -d '\n' | gh secret set GOOGLE_SERVICES_JSON_BASE64 $E

# Apple
printf '%s' 78T56RPM74 | gh secret set APPLE_TEAM_ID $E
P8=$(ls -t ~/Downloads/AuthKey_*.p8 | head -1)           # самый свежий скачанный ключ
KEYID=$(basename "$P8" .p8 | sed 's/^AuthKey_//')           # Key ID в имени файла
printf '%s' "$KEYID" | gh secret set ASC_KEY_ID $E
base64 < "$P8" | tr -d '\n' | gh secret set ASC_KEY_CONTENT $E
# Issuer ID (UUID) со страницы Team Keys: читается из браузера, в переменную, без echo:
read -r ISSUER   # вставляет сама Mac-сессия из страницы, не из чата
printf '%s' "$ISSUER" | gh secret set ASC_ISSUER_ID $E
rm -f "$P8"

# Google Play: JSON сервисного аккаунта целиком (не base64)
PLAY=$(ls -t ~/Downloads/*.json | head -1)               # проверить, что это ключ lawbid-ci
gh secret set PLAY_SERVICE_ACCOUNT_JSON $E < "$PLAY"
rm -f "$PLAY"

# Ключ загрузки Android (если файл найден). Пароли — из git-ignored android/key.properties
KP=apps/mobile/android/key.properties
base64 < "$(grep '^storeFile=' $KP | cut -d= -f2-)" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 $E
grep '^storePassword=' $KP | cut -d= -f2- | tr -d '\n' | gh secret set ANDROID_KEYSTORE_PASSWORD $E
grep '^keyAlias='      $KP | cut -d= -f2- | tr -d '\n' | gh secret set ANDROID_KEY_ALIAS $E
grep '^keyPassword='   $KP | cut -d= -f2- | tr -d '\n' | gh secret set ANDROID_KEY_PASSWORD $E

# Включить workflow — последним
gh variable set MOBILE_TESTERS_ENABLED --body true --repo $R

# Проверка (только имена, без значений)
gh secret list --env release --repo $R
gh workflow run mobile-testers.yml --repo $R
```

## Если ключа Android на Mac нет

Найти строку `storeFile` в `android/key.properties` или `~/lawbid-upload.jks` (старый
`~/lawbid-upload-new-20oct.jks` не использовать). Если файла нет: токен `GH_SECRETS_TOKEN` (fine-grained, этот
репозиторий, Secrets: read and write; Mac создаёт его в браузере под владельцем), кладёт
`gh secret set GH_SECRETS_TOKEN --repo $R` (уровень репозитория, не `release`), запускает
`gh workflow run android-upload-key.yml --repo $R -f confirm=RESET`, качает артефакт
`upload-certificate-PUBLIC` (`gh run download`) и в Play Console -> App integrity -> App signing ->
Request upload key reset загружает `upload_certificate.pem`. Google одобряет ~2 дня; до этого
iOS уже работает, Android-сборки Play не примет.
