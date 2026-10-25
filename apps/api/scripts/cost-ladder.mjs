#!/usr/bin/env node
/**
 * Writes the two owner documents from the cost registry, so they never drift:
 *   docs/runbooks/COST_LADDER.md                    (the table of everything)
 *   apps/admin/content/guides/cost-ladder.md        (step by step, per item)
 * Run:   node apps/api/scripts/cost-ladder.mjs          (writes both)
 *        node apps/api/scripts/cost-ladder.mjs --check  (exit 1 if they differ)
 * The registry is TypeScript with erasable syntax only, loaded by Node's
 * native type stripping (Node >= 22.18).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const reg = await import(
  pathToFileURL(resolve(here, '../src/common/ops/cost-registry.ts')).href
);
const { COST_REGISTRY, LADDER_USERS, STATE_LABEL, dayOneTotals, mid, stepsFor, totalAtUsers } = reg;

const f = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const usd = (r) => (r[0] === r[1] ? `$${f(r[0])}` : `$${f(r[0])}–${f(r[1])}`);
const users = (n) => (n >= 1e6 ? `${n / 1e6} млн` : n >= 1000 ? `${n / 1000} тыс.` : `${n}`);
const checkedAt = COST_REGISTRY.map((e) => e.price.checkedAt).sort().at(-1);
const totals = dayOneTotals();

const dayOne = COST_REGISTRY.filter((e) => e.defaultState !== 'off' && mid(e.usd.launch) > 0);
const switchable = COST_REGISTRY.filter((e) => e.defaultState === 'off' && e.ifOnUsd);
const auto = COST_REGISTRY.filter((e) => e.states.includes('auto') && e.defaultState === 'auto');
const controlWhere = (e) => {
  const c = e.control;
  if (c.type === 'app-setting') return `админка → Расходы (настройка \`${c.key}\`)`;
  if (c.type === 'ssm-mode') return `админка → Расходы (переключатель AWS SSM, ${c.target})`;
  if (c.type === 'tfvars') return `\`terraform.tfvars\`: ${c.vars.map((v) => `\`${v}\``).join(', ')}`;
  return 'нельзя выключить';
};
const statesWord = (e) => e.states.map((s) => STATE_LABEL[s]).join(' / ');

function ladderTable() {
  const rows = [
    '| Пользователей | Всего в месяц, примерно |',
    '|---|---|',
    ...LADDER_USERS.map((u) => `| ${users(u)} | **${usd(totalAtUsers(u))}** |`),
  ];
  return rows.join('\n');
}

function runbook() {
  const L = [];
  L.push('<!-- ГЕНЕРИРУЕТСЯ: node apps/api/scripts/cost-ladder.mjs из apps/api/src/common/ops/cost-registry.ts. Руками не править. -->');
  L.push('# Лестница расходов LawBid');
  L.push('');
  L.push(`Для владельца. Цены в долларах в месяц, список цен AWS (us-east-1) и поставщиков, проверено ${checkedAt}; «уточнить» значит, что цену ещё надо сверить в кабинете. Каждый пункт имеет положения **Выкл / Вкл / Авто**, где это возможно: «Авто» значит, что система сама включает и выключает по сигналу и не выходит за потолок. Страница в админке: **Расходы**.`);
  L.push('');
  L.push('## 1. День первый: пустое приложение');
  L.push('');
  L.push('| Что | Зачем | $/мес | Положения | Где переключить |');
  L.push('|---|---|---|---|---|');
  for (const e of dayOne) L.push(`| ${e.name} | ${e.purpose} | ${usd(e.usd.launch)} | ${statesWord(e)} | ${controlWhere(e)} |`);
  L.push('');
  L.push(`**Итого AWS: ${usd(totals.aws)}. Сторонние и аккаунты: ${usd(totals.vendors)}. ИТОГО в первый месяц: ${usd(totals.all)}.**`);
  L.push('');
  L.push('Важно: старые документы писали «≈ $150–170». Это занижено примерно на $100 (не посчитаны публичные адреса IPv4, фильтры WAF, тревоги и графики, вторая копия базы, SMS-номер). Письма бюджета AWS (50 %, 80 %, 100 % от `monthly_budget_usd` = $350) рассчитаны на реальные ≈ $270–285 плюс запас на рост.');
  L.push('');
  L.push('## 2. Что вы включаете сами (по умолчанию выключено)');
  L.push('');
  L.push('| Что | Цена, если включить | Зачем | Когда стоит | Где переключить |');
  L.push('|---|---|---|---|---|');
  for (const e of switchable) L.push(`| ${e.name} | +${usd(e.ifOnUsd)} | ${e.purpose} | ${e.neededNote} | ${controlWhere(e)} |`);
  L.push('');
  L.push('## 3. Что включается само (положение Авто)');
  L.push('');
  L.push('| Что | По какому сигналу и как ограничено | Тревога |');
  L.push('|---|---|---|');
  for (const e of auto) L.push(`| ${e.name} | ${e.neededNote}${e.ceiling ? ` Потолок: ${e.ceiling.label}.` : ''} | ${e.alarm ?? '—'} |`);
  L.push('');
  L.push('## 4. Всего в месяц при росте (грубо, ошибиться можно в 2 раза)');
  L.push('');
  L.push('Берутся только пункты, включённые по умолчанию. Между запуском и 100 тысячами рост считается прямой линией.');
  L.push('');
  L.push(ladderTable());
  L.push('');
  L.push('Что главное в каждой ступени: на 10 тысячах это SMS; на 100 тысячах раздача файлов и база; на миллионе раздача файлов, SMS, база с копиями для чтения.');
  L.push('');
  L.push('## 5. Полный список со ссылками на цены');
  L.push('');
  L.push('| Пункт | Цена | Старт | 100 тыс. | 1 млн | Тревога | Источник цены |');
  L.push('|---|---|---|---|---|---|---|');
  for (const e of COST_REGISTRY) {
    L.push(`| ${e.name} | ${e.price.text}${e.price.verified ? '' : ' (уточнить)'} | ${usd(e.usd.launch)} | ${usd(e.usd.k100)} | ${usd(e.usd.m1)} | ${e.alarm ?? '—'} | [${e.price.checkedAt}](${e.price.sourceUrl}) |`);
  }
  L.push('');
  L.push('## 6. Как переключать');
  L.push('');
  L.push('- **Из админки** (настройки приложения и автомасштабы): **Расходы** → строка → положение Выкл / Вкл / Авто → код 2FA. Действие записывается в журнал.');
  L.push('- **Через Terraform** (всё, что живёт в AWS): строка в `infra/envs/prod/terraform.tfvars`, затем «примени Terraform» (plan, `plan-guard.sh`, ваш ответ «да»). Подробности: гид «Terraform plan и apply через наши скрипты».');
  L.push('');
  L.push('Как ограничен рост без вашего участия: потолок серверов 50 и 20 копий и правило «Экономика»; размер базы и Redis не выше суммы, которую допускает правило «Экономика» (база до 35 %, Redis до 15 %); дневной тормоз расходов; лимиты SMS, писем, переводов, видео и проверок в деньгах; письма при росте GuardDuty, WAF и CloudFront.');
  L.push('');
  L.push('Внимание про репозиторий: GitHub Actions бесплатны, пока репозиторий **публичный**. Если его сделать приватным, появится расход на минуты.');
  L.push('');
  return L.join('\n');
}

function guide() {
  const L = [];
  L.push('---');
  L.push('id: cost-ladder');
  L.push('title: Лестница расходов: что мы платим и как это включить или выключить');
  L.push('category: aws');
  L.push(`cost: Сама страница бесплатна; на день первый всего ≈ ${usd(totals.all)} в месяц`);
  L.push('time: 15 минут, чтобы прочитать; по 2–5 минут на каждое переключение');
  L.push(`verified: ${checkedAt}`);
  L.push('sources:');
  L.push('  - AWS: Pricing | https://aws.amazon.com/pricing/');
  L.push('  - Репозиторий: docs/runbooks/COST_LADDER.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/COST_LADDER.md');
  L.push('  - Репозиторий: apps/api/src/common/ops/cost-registry.ts | https://github.com/syimykkalykov1999/LawBid/blob/main/apps/api/src/common/ops/cost-registry.ts');
  L.push('---');
  L.push('');
  L.push('<!-- ГЕНЕРИРУЕТСЯ: node apps/api/scripts/cost-ladder.mjs. Руками не править. -->');
  L.push('');
  L.push('## Что это и зачем');
  L.push('');
  L.push(`Здесь собрано всё, за что мы платим: серверы, база, сеть, сторонние сервисы, аккаунты. На день первый, с пустым приложением, выходит ≈ ${usd(totals.all)} в месяц (AWS ${usd(totals.aws)} и ${usd(totals.vendors)} сторонних и аккаунтов). У каждого пункта в админке на странице **Расходы** есть положения **Выкл**, **Вкл** и **Авто**: «Авто» значит, что система сама включает и выключает по сигналу и не выходит за потолок.`);
  L.push('');
  L.push('## Что понадобится');
  L.push('');
  L.push('- Вход в админку как владелец и код 2FA (для переключения из админки).');
  L.push('- Для пунктов с пометкой «через Terraform»: Mac с проектом и Claude, который выполнит plan и apply.');
  L.push('');
  L.push('## Шаги');
  L.push('');
  L.push('1. Откройте в админке **Система → Расходы**. Вверху блок **Лестница расходов**: день первый, что включаете вы, что включается само, сколько будет при росте.');
  L.push('2. Ниже таблица всех платных пунктов. В каждой строке: что это, положение переключателя, деньги за этот месяц (настоящие, из счёта AWS и сервисов) и прогноз, нужно ли это сейчас, какая тревога следит.');
  L.push('3. Чтобы поменять положение, нажмите **Выкл**, **Вкл** или **Авто** и введите код 2FA. Если кнопка серая, пункт меняется через Terraform: раскройте **Как включить / выключить** и следуйте шагам.');
  L.push('4. Раз в месяц сверяйте «этот месяц» и «прогноз» с таблицей «Старт»: расхождение больше чем вдвое повод разобраться.');
  L.push('');
  L.push('### Рост без вашего участия');
  L.push('');
  L.push('Серверы растут сами до потолка 50 и 20 копий и правила **Экономика**. База и Redis растут сами, но не дороже, чем допускает правило **Экономика** (база до 35 %, Redis до 15 % допустимой суммы). Лимиты SMS, писем, переводов, видео и проверок стоят в деньгах. GuardDuty, WAF и CloudFront присылают письмо, если счёт по ним вырос.');
  L.push('');
  L.push(`### Сколько в месяц при росте (грубо, ошибиться можно в 2 раза)`);
  L.push('');
  L.push(ladderTable());
  L.push('');
  L.push('## По каждому пункту');
  L.push('');
  for (const e of COST_REGISTRY) {
    L.push(`### ${e.name}`);
    L.push('');
    L.push(`${e.purpose} Цена: ${e.price.text}${e.price.verified ? '' : ' (цену ещё надо сверить)'}. Старт ${usd(e.usd.launch)}, 100 тыс. человек ${usd(e.usd.k100)}, 1 млн ${usd(e.usd.m1)}${e.ifOnUsd ? `; если включить, добавит ${usd(e.ifOnUsd)}` : ''}. По умолчанию: ${STATE_LABEL[e.defaultState]}. ${e.neededNote}${e.alarm ? ` Тревога: ${e.alarm}.` : ''}`);
    L.push('');
    for (const st of e.states) {
      if (e.states.length > 1) L.push(`Положение **${STATE_LABEL[st]}**:`);
      stepsFor(e, st).forEach((s, i) => L.push(`${i + 1}. ${s.replace(/\n/g, ' ')}`));
      L.push('');
    }
  }
  L.push('## Куда вставить в нашей админке');
  L.push('');
  L.push('Ничего вставлять не нужно: переключатели на странице **Система → Расходы**.');
  L.push('');
  L.push('## Как проверить');
  L.push('');
  L.push('После переключения строка покажет новое положение (страница обновляется сама). Для пунктов через Terraform после apply команда `terraform plan` должна сказать `No changes`.');
  L.push('');
  L.push('## Частые ошибки');
  L.push('');
  L.push('- Выключили охрану (GuardDuty) или фильтр WAF «для экономии»: экономия $4–11, а защита пропадает. Сначала выключайте дорогие части, не саму защиту.');
  L.push('- Забыли, что репозиторий публичный: если сделать его приватным, минуты GitHub Actions станут платными.');
  L.push('- Ждёте мгновенного эффекта от Terraform: изменения применяются только после apply.');
  L.push('- Цены вида «уточнить» ещё не сверены в кабинете: не считайте их точными.');
  L.push('');
  return L.join('\n');
}

const out = [
  [resolve(repo, 'docs/runbooks/COST_LADDER.md'), runbook()],
  [resolve(repo, 'apps/admin/content/guides/cost-ladder.md'), guide()],
];
if (process.argv.includes('--check')) {
  let bad = 0;
  for (const [p, text] of out) {
    let cur = '';
    try { cur = readFileSync(p, 'utf8'); } catch { /* missing */ }
    if (cur !== text) { console.error(`out of date: ${p}`); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
for (const [p, text] of out) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  console.log(`wrote ${p}`);
}
