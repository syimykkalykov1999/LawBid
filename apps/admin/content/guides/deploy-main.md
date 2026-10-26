---
id: deploy-main
title: Выкатить последнюю версию (main) на боевой сервер
category: launch
cost: Бесплатно (минуты GitHub Actions в рамках тарифа)
time: 15-30 минут
launch: deploy
verified: 2026-10-25
sources:
  - Репозиторий: docs/runbooks/DEPLOY_PROD.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/DEPLOY_PROD.md
  - Репозиторий: docs/runbooks/DEPLOY_SAFETY.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/DEPLOY_SAFETY.md
  - GitHub: Reviewing deployments | https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/reviewing-deployments
---

## Что это и зачем

Код попадает на боевой сервер через GitHub Actions, workflow **Deploy**. Он собирает образы, прогоняет миграции базы отдельной задачей, плавно заменяет серверы и делает проверку. Перед боевой выкладкой GitHub ждёт вашей кнопки подтверждения. Если сервер работает не на последней версии `main`, на «Запуске» горит свет.

## Что понадобится

- Доступ владельца к GitHub-репозиторию (вы указаны как проверяющий окружения `production`).
- Переменная репозитория `DEPLOY_ENABLED` = `true` и секреты AWS настроены (разово, описано в docs/runbooks/DEPLOY_PROD.md, шаги 2-4).
- В «Ключах и сервисах» подключена карточка GitHub (только чтение), чтобы свет определялся сам.

## Шаги

1. Откройте репозиторий на GitHub → вкладка **Actions** → слева **Deploy**.
2. Обычно запуск уже идёт сам после слияния изменений в `main`. Если нет, нажмите **Run workflow**, ветка `main`, ещё раз **Run workflow**.
3. Дождитесь, пока job **Deploy production** остановится на ожидании. Появится жёлтая плашка с кнопкой **Review deployments**.
4. Нажмите **Review deployments**, поставьте галочку у **production** и нажмите **Approve and deploy**.
5. Дальше всё идёт само: проверка подписи образов, миграции, замена серверов, проверка здоровья. Ждите зелёной галочки.
6. Если выкладка красная, откат происходит сам (ECS возвращает прошлую версию). Вручную: **Actions** → **Rollback production** → **Run workflow**.

## Куда вставить в нашей админке

Ничего вставлять не нужно. Если свет серый: **Ключи и сервисы** → карточка GitHub, репозиторий `syimykkalykov1999/LawBid` (только чтение).

## Как проверить

Выполните `curl -fsS https://api.lawbid.dev/health/ready` или откройте админку. На **Система → Запуск** строка «Запущена последняя версия (main)» станет зелёной, когда версия сервера совпадёт с последним коммитом `main`. Красная значит, что на `main` есть изменения, которые ещё не выложены.

## Частые ошибки

- Нет кнопки Review deployments: окружение `production` создано без проверяющих. Откройте **Settings** → **Environments** → **production** → **Required reviewers**, добавьте себя.
- Ошибка `Not authorized to perform sts:AssumeRoleWithWebIdentity`: сломана роль доступа GitHub к AWS, смотрите docs/runbooks/DEPLOY_PROD.md, шаг 2.
- Повторный запуск того же коммита безопасен: образы повторно не собираются.
- Свет серый: не подключена карточка GitHub.
