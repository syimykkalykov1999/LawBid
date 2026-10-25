---
id: github-branch-ruleset
title: Защитить ветку main на GitHub (ruleset)
category: security
cost: Бесплатно для публичного репозитория
time: 15 минут
verified: 2026-10-25
sources:
  - GitHub: Creating rulesets for a repository | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository
  - GitHub: Available rules for rulesets | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
  - Репозиторий: .github/workflows | https://github.com/syimykkalykov1999/LawBid/tree/main/.github/workflows
---

## Что это и зачем

Правило (ruleset) не даёт никому, даже по ошибке, перезаписать или удалить ветку `main` и заставляет всё менять через pull request с зелёными проверками. Репозиторий у нас публичный, поэтому защита особенно важна: `main` напрямую уходит на боевой сервер.

## Что понадобится

- Права администратора репозитория на GitHub.
- Понимание: если вы единственный разработчик, обязательные одобрения (approvals) включать не надо, иначе вы не сможете слить свой же PR.

## Шаги

1. Откройте репозиторий на GitHub → вкладка **Settings**.
2. Слева в блоке **Code and automation** выберите **Rules** → **Rulesets**.
3. Нажмите **New ruleset** → **New branch ruleset**.
4. В поле **Ruleset name** впишите `protect-main`.
5. В **Enforcement status** выберите **Evaluate** на первые дни (только записывает нарушения), потом смените на **Active**.
6. В **Target branches** нажмите **Add target** → **Include default branch**.
7. В **Branch rules** включите: **Restrict deletions**, **Block force pushes**, **Require a pull request before merging** (число approvals оставьте 0, если вы работаете один), **Require status checks to pass**.
8. В **Require status checks to pass** нажмите **Add checks** и добавьте проверки, которые запускаются на каждом PR: `gitleaks` (workflow Secret scan) и `CodeQL (javascript-typescript)`.
9. Проверки `API CI` (`Lint, typecheck, unit + e2e tests`), `admin-ci` и Mobile CI запускаются только при изменении своих папок. Если сделать их обязательными, PR без таких изменений будет вечно ждать. Добавляйте их только когда они запускаются всегда.
10. Нажмите **Create**.
11. Через несколько дней в **Rules** → **Insights** посмотрите, нет ли нарушений, и переключите ruleset с **Evaluate** на **Active**.

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

Попробуйте отправить изменение прямо в `main` из Terminal: GitHub откажет (`protected branch` или `Repository rule violations`). PR с красной проверкой не даёт кнопку **Merge**. Отдельного света на «Запуске» нет.

## Частые ошибки

- Проверка в списке не находится: её имя появится только после того, как она хоть раз запускалась на этом репозитории.
- Обязательная проверка с фильтром путей: PR зависает в ожидании. См. шаг 9.
- Включили approvals при одном разработчике: никто не может слить. Поставьте 0.
- Bypass-список (**Bypass list**) не заполняйте без надобности: он разрешает обходить правила.
- (не удалось проверить: точные названия проверок в выпадающем списке GitHub. Они взяты из имён job в .github/workflows и могут отличаться оформлением.)
