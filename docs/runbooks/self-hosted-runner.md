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
Кэш npm: у каждого раннера свой именованный том `lawbid-ci-npm-N` на `~/.npm` (переживает job, `down` его не удаляет; чистка: `docker volume rm lawbid-ci-npm-1 …`, после этого первый job скачает всё заново). В GitHub-кэш с self-hosted ничего не выгружается (шаг «Post setup-node» занимал 17 мин под нагрузкой), только читается кэш, сохранённый GitHub-раннерами.

Остановка: `scripts/ci/self-hosted-runner.sh down`. Размер: `RUNNERS=6 RUNNER_CPUS=5 scripts/ci/self-hosted-runner.sh up`.

## Риски (честно)
- Контейнер раннера исполняет код PR из репозитория: любой, у кого есть запись в репозиторий, исполняет код на ноуте. Docker-in-Docker привилегированный. Лучше запускать в отдельной ВМ или на ноуте без личных данных и не держать на нём `gh` с лишними правами.
- Секреты репозитория доступны job так же, как на GitHub.
- Пока идёт нагрузочный тест, ноут не трогаем: `up` не запускать.

## Вариант попроще: один раннер службой systemd (без скрипта и gh)
Для начала хватает одного раннера (он берёт job по очереди, на 32 ядрах API CI идёт параллельно по job только если раннеров несколько: повторите шаги 3–4 в каталогах runner2, runner3, runner4).

1. В браузере: GitHub → репозиторий → Settings → Actions → Runners → **New self-hosted runner** → Linux x64. Страница покажет токен (живёт 1 час, никому не отправлять) и актуальную ссылку на архив.
2. Отдельный пользователь без sudo и без личных файлов:
```
sudo useradd -m -s /bin/bash ghrunner
sudo usermod -aG docker ghrunner     # нужен для Postgres/Redis service-контейнеров
sudo -iu ghrunner
```
3. Скачать и настроить (команды curl/tar скопировать со страницы из п.1, затем):
```
./config.sh --url https://github.com/syimykkalykov1999/LawBid --token <ТОКЕН_СО_СТРАНИЦЫ> --labels lawbid-ci --name laptop-1 --unattended
```
4. Служба (из под обычного пользователя с sudo, не ghrunner):
```
cd /home/ghrunner/actions-runner
sudo ./svc.sh install ghrunner && sudo ./svc.sh start && sudo ./svc.sh status
```
5. Settings → Actions → Runners: раннер `laptop-1` должен быть **Idle**.
6. Включить: Settings → Secrets and variables → Actions → **Variables** → New repository variable `CI_RUNNER` = `self`. Выключить: значение `github` (или удалить переменную).
7. Проверка, что внешние PR сюда не попадают: (а) Settings → Actions → General → Fork pull request workflows → «Require approval for all outside collaborators»; (б) в `api-ci.yml` условие `github.event.pull_request.head.repo.full_name == github.repository` пускает на раннер только PR из этого репозитория; PR из форка идёт на `ubuntu-latest`; (в) открыть тестовый PR и в логе job строка «Runner name» должна быть `laptop-1`.

Docker-вариант со скриптом `self-hosted-runner.sh` безопаснее (раннер уничтожается после каждого job), но требует `gh` на ноуте.
