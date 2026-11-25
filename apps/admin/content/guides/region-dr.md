---
id: region-dr
title: Если пропал весь регион AWS: поднять LawBid во втором регионе (us-west-2)
category: system
cost: Пока аварии нет, почти ноль. Копии образов около $0.10 за ГБ в месяц, реплики секретов около $0.40 за секрет в месяц. В день аварии второй регион стоит как обычный прод.
time: Один раз: применить облако (10 минут). В день аварии: 6–8 часов вместе с Claude. Учение раз в год: 2–3 часа.
runbook: region-dr.md
verified: 2026-11-25
sources:
  - Репозиторий: docs/runbooks/region-dr.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/region-dr.md
  - AWS Well-Architected: REL13 Plan for disaster recovery | https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/plan-for-disaster-recovery-dr.html
  - AWS ECR: Private image replication | https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html
  - AWS Secrets Manager: Replicate secrets to other Regions | https://docs.aws.amazon.com/secretsmanager/latest/userguide/create-manage-multi-region-secrets.html
---

## Что это и зачем

Весь сервер LawBid работает в одном регионе AWS (us-east-1, Вирджиния). Если этот регион пропадёт надолго, а такое у AWS бывает раз в несколько лет, приложение, сайт и админка перестанут работать. На этот случай во втором регионе (us-west-2, Орегон) уже лежит всё нужное:

- копия базы, каждую ночь;
- файлы дел и чатов, сразу при записи;
- образы сервера (каждая новая версия копируется сама);
- все секреты (Secrets Manager держит их копию сам);
- описание всего облака для второго региона: `infra/envs/dr`.

Цель: снова работать **не позже чем через 8 часов**, потерять **не больше суток** записей (возраст ночной копии). Публичные фото лежат в Cloudflare R2, их авария AWS не трогает.

## Что понадобится

- Вход в AWS Console и терминал с AWS CLI.
- Доступ к DNS (Cloudflare или Namecheap).
- Claude: он ведёт шаги и проверяет.

## Шаги

Один раз, заранее:
1. Применить bootstrap (`infra/bootstrap`, `terraform apply`). Включится копирование образов в us-west-2.
2. Применить прод (`infra/envs/prod`, `terraform apply`). У каждого секрета появится копия в us-west-2.
3. Раз в год провести учение вместе с Claude (раздел «Учение раз в год» в `region-dr.md`).

В день аварии (решение «поднимаем» за вами):
1. Сказать Claude «поднимаем DR». Он откроет запись аварии и обновит страницу статуса (запасная копия в R2).
2. AWS Console → **AWS Backup → Backup vaults → `lawbid-prod-db-dr`** → самая новая копия → **Restore**. Claude подскажет имя и сеть.
3. AWS Console → регион **us-west-2** → **Certificate Manager → Request** для `api.lawbid.dev` и `admin.lawbid.dev`. Добавить в DNS записи, которые он покажет.
4. Запустить `terraform apply` в `infra/envs/dr`, когда Claude подготовит файл настроек.
5. В DNS: записи `api` и `admin` направить на новый адрес балансировщика (Claude даст точное значение), облачко серое.

## Как проверить

- `https://api.lawbid.dev/health/ready` отвечает 200.
- Вход в приложение, лента и чат работают; в админке открывается «Состояние системы».
- После учения Claude записывает в таблицу `chaos-and-restore-drills.md` (часть 3), сколько занял каждый шаг. Это и есть наше настоящее время восстановления.
