# 2026-11-02 · собственный TURN (coturn) на проде + деплой main 7b5cffc6

02.11 Деплой: старый запуск Deploy от 28.10 висел в Waiting и держал очередь `deploy`; снят владельцем (force-cancel в Терминале). Запуск 41363091247 для main 7b5cffc6 прошёл gate и сборку; итог выкатки дописывается отдельной строкой ниже.
TURN: `turn_enabled=true` в `infra/envs/prod/growth.auto.tfvars.json`. Выкатка адресная (`-target=module.stack.module.turn`), 20 новых ресурсов, 0 изменений/удалений; применил владелец в Терминале (Mac блокирует apply). Инстанс i-041904a3f96e6afea (lawbid-prod-turn), новый EIP 54.83.172.171 (прежний 32.192.170.198 не существует), секрет в SSM `/lawbid-prod/turn/static-auth-secret`.
Проверка relay: TURN Allocate с секретом из SSM по UDP 3478 — SUCCESS. В админке TURN v2: urls udp+tcp на 54.83.172.171.
Состояние: инстанс ОСТАНОВЛЕН (stopped) 02.11 — по решению владельца без простоя за деньги, ждём автозапуск по требованию (PR #555 + Terraform: без EIP, IAM start/stop, TURN_ONDEMAND_INSTANCE_ID).
Секрет считать утёкшим (виден на скриншоте): ротировать после apply on-demand (новое значение в SSM, рестарт coturn, новый секрет в админке через pbcopy).
Заметка для Mac: после `eval "$(aws configure export-credentials --format env)"` делать `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION`, иначе ломается `aws login`.
