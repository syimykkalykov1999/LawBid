# Свой раннер CI на Linux-ноуте (32 ядра)

Зачем: GitHub даёт ≈20 параллельных job на репозиторий, а у PR их 10–15. На ноуте тяжёлые job API CI (static, 3 × e2e, two-db, N-1) идут без очереди. Сборки Mobile (macOS) остаются на GitHub: ноут Linux. Mobile analyze/test на ubuntu переведём таким же условием после слияния #546.

## Как это устроено
- `api-ci.yml`: у 4 тяжёлых job `runs-on` выбирает раннер по переменной репозитория **`CI_RUNNER`**. `self` и (событие не PR или PR из ЭТОГО репозитория) → метки `self-hosted, linux, lawbid-ci`. Иначе `ubuntu-latest`. PR из форков на ноут не попадают никогда.
- Раннер офлайн: GitHub сам на `ubuntu-latest` не переключит, поэтому `down` ставит `CI_RUNNER=github`. Если ноут выключился без `down`, в Settings → Secrets and variables → Actions → Variables поменять `CI_RUNNER` на `github` (или удалить). Job не потеряются, только встанут в очередь до смены.
- Скрипт `scripts/ci/self-hosted-runner.sh`: N контейнеров-раннеров (по умолчанию 4 × 6 CPU / 12 ГБ), каждый **эфемерный**: один job, потом контейнер уничтожается и поднимается новый. Без монтирования домашней папки. Docker для service-контейнеров (Postgres, Redis) — свой Docker-in-Docker рядом с каждым раннером, не сокет хоста. Токен регистрации берётся через `gh` в момент запуска и нигде не хранится.

## Что сделать владельцу один раз (в браузере)
1. Settings → Actions → General → **Fork pull request workflows**: включить **Require approval for all outside collaborators** (минимум). Репозиторий публичный, это обязательно.
2. Settings → Actions → Runners → ничего вручную не добавлять, скрипт регистрирует сам.
3. Settings → Rules → Rulesets (по желанию): required check **«Repo guards»**.

## Запуск (когда нагрузочный тест закончен), на ноуте
```
gh auth login            # один раз, аккаунт с правами admin на репозиторий
git clone https://github.com/syimykkalykov1999/LawBid && cd LawBid
scripts/ci/self-hosted-runner.sh up
scripts/ci/self-hosted-runner.sh status
```
Остановка: `scripts/ci/self-hosted-runner.sh down`. Размер: `RUNNERS=6 RUNNER_CPUS=5 scripts/ci/self-hosted-runner.sh up`.

## Риски (честно)
- Контейнер раннера исполняет код PR из репозитория: любой, у кого есть запись в репозиторий, исполняет код на ноуте. Docker-in-Docker привилегированный. Лучше запускать в отдельной ВМ или на ноуте без личных данных и не держать на нём `gh` с лишними правами.
- Секреты репозитория доступны job так же, как на GitHub.
- Пока идёт нагрузочный тест, ноут не трогаем: `up` не запускать.
