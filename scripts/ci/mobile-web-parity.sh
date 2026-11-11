#!/usr/bin/env bash
# Owner rule 2026-11-03 «правка в приложении = правка в вебе» (WORK_PLAN_BY_SURFACE
# #92, OPEN_ITEMS_SWEEP 2026-11-09 B-c15): a PR that changes the app's feature
# code must say how the same change behaves on the web (lawbid.dev is the same
# Flutter code), or carry the label `web-n/a` when the change cannot touch the
# web (native-only: CallKit, push, camera…).
#
#   scripts/ci/mobile-web-parity.sh <changed-files-file> <pr-body-file> <labels-file>
#
# Feature code = apps/mobile/lib/features/** (any layer) and apps/mobile/lib/
# core/** — not tests, not generated *.g.dart / *.freezed.dart, not docs.
# The body passes when it has the table header «правка в приложении» with
# «вебе» (the owner's table) or a «## Веб» / «Web:» section. Exit 1 with a
# Russian message otherwise. Used by repo-guards.yml.
set -euo pipefail
FILES="${1:?changed files list}"; BODY="${2:?pr body file}"; LABELS="${3:?labels file (one per line)}"
feature=$(grep -E '^apps/mobile/lib/(features|core)/' "$FILES" \
  | grep -Ev '\.(g|freezed|gr|config)\.dart$|/test/|_test\.dart$' || true)
if [ -z "$feature" ]; then echo "parity: no app feature code changed — nothing to check"; exit 0; fi
if grep -qix 'web-n/a' "$LABELS"; then echo "parity: label web-n/a — the change is native-only, ok"; exit 0; fi
# Plain alternations, no -i / \b / [Кк] classes: BSD grep (macOS) matches
# Cyrillic bracket classes only in a UTF-8 locale, GNU grep (CI) always does.
if grep -Eq '(Правка|правка) в приложении[^|]*\|[^|]*(Веб|веб)|(Правка|правка) в приложении = правка в вебе' "$BODY" \
   || grep -Eq '^#+ *(Веб|веб|Web|web)( |:|$)|^\*?\*?(Веб|веб|Web|web):' "$BODY"; then
  echo "parity: the PR says what the web does — ok"; exit 0
fi
n=$(printf '%s\n' "$feature" | wc -l | tr -d ' ')
echo "::error title=Правка в приложении = правка в вебе::PR меняет код приложения ($n файл(ов) в apps/mobile/lib/features или core), но в описании нет таблицы «правка в приложении | правка в вебе» (или раздела «## Веб»). Сайт lawbid.dev — тот же Flutter-код: напишите, что меняется на вебе и как проверено, либо поставьте метку web-n/a, если правка только для телефона (CallKit, пуши, камера)."
printf '%s\n' "$feature" | head -20 | sed 's/^/  - /'
exit 1
