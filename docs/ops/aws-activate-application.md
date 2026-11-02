# AWS Activate Founders: заявка для аккаунта 047754151252

Цель: получить кредиты AWS Activate (Founders) на текущий аккаунт, где уже работает прод (api.lawbid.dev, RDS, ECS). Новый аккаунт не создаём.

## Условия (проверено 02.11.2026 по поиску; сайт aws.amazon.com из облачной сессии недоступен, перед отправкой сверить на странице)

Источники: [AWS: Activate Founders](https://aws.amazon.com/activate/founders/), [AWS: Activate credits](https://aws.amazon.com/activate/credits), [AWS: пошаговый гид](https://aws.amazon.com/aws-startups/learn/applying-for-aws-activate-credits-a-step-by-step-guide).

- Founders: 1 000 $ кредитов для стартапов на собственные средства; отдельные стартапы могут получить до 5 000 $ со временем. Срок действия обычно 2 года (по сторонним источникам, уточнить).
- Требования: стадия не позже Series B; сайт компании или профиль компании; основана не более 10 лет назад; аккаунт AWS на платном плане (Paid Tier Plan, не Free).
- Раньше кредиты Activate не получали (или просим больше прежнего). Ранее не было Portfolio-кредитов.
- Не подходит: кредиты не покрывают часть сервисов (в т.ч. Marketplace, некоторые Support-планы) — мелким шрифтом на странице.

## Что владелец вводит сам (по одному)

1. Сайт: https://lawbid.dev/about (лендинг «О нас», репозиторий LawBidSite; владелец подтвердил 02.11). Нужно, чтобы по адресу открывалась публичная страница с описанием продукта. По репозиторию (docs/runbooks/WEB_LAUNCH.md) веб и страница /about ещё не опубликованы: AWS+DNS для lawbid.dev делаются на Маке. Пока страница не открывается, в заявке указать профиль компании (LinkedIn/Crunchbase) или дождаться публикации.
2. E-mail для заявки (лучше на домене lawbid.dev, если есть).
3. Страна и юрлицо (название, год основания; если юрлица нет — указать «sole proprietor / pre-incorporation», как позволит форма).
4. Подтвердить, что аккаунт на платном плане (Billing → Account → план).

## Тексты для формы (English)

**Company name:** LawBid

**Website:** https://lawbid.dev/about (лендинг «О нас» из репозитория LawBidSite; в заявку вставлять только после публикации веба на lawbid.dev)

**One-line description (≤ 150 chars):**
LawBid is a mobile marketplace where clients find and hire verified attorneys, with in-app chat, calls, case tracking and a social feed.

**Product description:**
LawBid connects clients with licensed attorneys. Clients post a legal need or browse attorney profiles, then chat, make voice/video calls, share documents and track the case in one app. Attorneys build a verified profile, publish short posts and reels, answer public Q&A, and manage cases with tasks and updates. The app is available in 85 languages, including right-to-left scripts. Mobile clients are built with Flutter (iOS and Android), with a web admin console.

**Stage:** Pre-release, production environment live, testing with early users. Self-funded, no outside funding.

**Why AWS / how credits will be used:**
The whole backend runs on AWS in us-east-1: ECS Fargate (API and workers), RDS PostgreSQL (Multi-AZ), ElastiCache Redis, S3 and CloudFront, ALB with WAF, SSM and CloudWatch. Credits will cover production hosting during the launch period and the load testing needed to size the platform for tens of thousands of concurrent users (database read replicas, caching, call infrastructure) before public release.

**Tech stack:** NestJS (TypeScript), PostgreSQL 16, Redis, Next.js admin, Flutter mobile, Terraform, GitHub Actions.

**Current AWS spend:** about 10–11 USD per day in production (about 300 USD per month) during pre-release.

**AWS account ID:** 047754151252 (в форму вводить только если спросят; это не секрет, но и не нужен в чате).

**Funding:** Self-funded (bootstrapped). Choose "Founders" tier, not Portfolio.

## Пошагово, что нажать

1. Войти в AWS-консоль под sima-admin (аккаунт 047754151252) и убедиться, что план платный.
2. Открыть https://aws.amazon.com/activate/founders/ → «Apply now» (кнопка может называться «Get started»).
3. Выбрать «Activate Founders» (self-funded). Вход — тем же аккаунтом AWS.
4. Заполнить поля текстами выше, вставить свой сайт, e-mail, страну, юрлицо.
5. Отправить. Ответ приходит на e-mail; обычно в течение нескольких дней, кредиты видны в Billing → Credits.
6. Если откажут: причину прислать нам, поправим текст и подадим повторно (повторы разрешены не сразу; сроки уточнить на странице).

## После одобрения

Записать сумму и срок действия в docs/dev/journal. Бюджет lawbid-prod-monthly (200 $) не менять без команды.
