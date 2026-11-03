# Вход по паролю: «No connection» при живом интернете (2026-11-03)

- Жалоба: Samsung, prod c4ec2a94c, Войти -> Log in (телефон + пароль) -> «No connection», а «Продолжить» (код) в 17:45 входит.
- Сервер: в /lawbid/lawbid-prod/api за 23:30-23:55Z нет ни одной строки по /auth/password/login (4xx/5xx логируются всегда, 2xx - 1 %). WAF: блокировок в 23:40-23:47Z нет (только сканеры в 23:35-23:40). ALB 5xx нет. Контрольный запрос с выдуманным номером: 401 AUTH_INVALID_CREDENTIALS за 1,8 с - эндпоинт жив, заголовки App Check/Turnstile ему не нужны.
- Клиент: signInWithPassword и _passwordFailure отдавали networkError на любое неожиданное исключение и на любой код сервера без своего текста. Реальную причину это скрывало.
- Сделано: новый статус failed -> «Что-то пошло не так»; networkError только если вызов не получил ответа (ApiException.isNetworkError); ошибка сохранения сессии после полученных токенов больше не «нет сети».
- Не доказано: что именно сработало на телефоне (logcat release-сборки пуст). Ассистентский вход (signInWithAssistantCode) и OTP имеют тот же паттерн catch-all - не менялись, вид не менялся.

## Дополнение: сравнение путей по коду
- Пароль (`passwordLogin`) и код (`verifyOtp`) идут через один `AuthApiClient`, один Dio, ту же цепочку перехватчиков, `_skipAuth`, `guardApiCall`, тот же `deviceInfo` и `applyTokens`. Отличаются только DTO, путь и разбор номера (`LoginIdentifier.tryParse`/`normalizeToE164`). Ни App Attest/Play Integrity, ни Turnstile, ни хеширования на клиенте, ни биометрии на пути пароля нет (App Check нужен только otp/request, password/reset/request, social, phone/status). Андроид-специфичного броска в коде не найдено.
- Ассистентский вход: тот же статус `failed` (OtpVerifyResult.failed), «нет сети» только без ответа.
- Хлебная крошка: `AuthStageBreadcrumb` (этап + тип исключения, без номера/пароля/токена) уходит в CrashReporter (флаг `crash_reports`) на этапах password:request / password:server-КОД / password:session и assistant:*.
