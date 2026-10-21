// Продолжение релиза через Claude Agent SDK (биллинг по ANTHROPIC_API_KEY → промокредиты Console).
// Запуск: ANTHROPIC_API_KEY=... node scripts/agent/run-handoff.mjs   (повторный запуск = продолжение сессии)
import { query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Нет ANTHROPIC_API_KEY (Console → Client Keys)');
  process.exit(1);
}

const cwd = process.env.LAWBID_DIR || join(homedir(), 'Desktop', 'LawBid');
const sessionFile = join(homedir(), '.lawbid-agent-session');
const resume = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8').trim() : undefined;

const TASK =
  'Прочитай docs/runbooks/RELEASE_20OCT_HANDOFF.md целиком (раздел 13 обязательно) и docs/runbooks/RELEASE_20OCT_JOURNAL.md ' +
  'и продолжай без вопросов с последнего записанного шага; каждый шаг в журнал с SHA; правило владельца: готовое до 60ae65d8 не менять, ' +
  'правки минимальным диффом, не ломая готовое; ПЕРВЫМ делом inbox/notes.txt и скрины в ~/Desktop/LawBid-download/inbox (слово владельца, разделы 13.99–13.101 выше остальных правил, не только Q&A/CI); в финале список изменённых файлов после 60ae65d8 и один финальный список';

for await (const m of query({
  prompt: resume ? 'Продолжай с последнего записанного шага в журнале. ' + TASK : TASK,
  options: {
    cwd,
    model: 'claude-opus-5-5',
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settingSources: ['project'],
    ...(resume && { resume }),
  },
})) {
  if (m.session_id) writeFileSync(sessionFile, m.session_id);
  if (m.type === 'assistant') {
    for (const b of m.message.content) if (b.type === 'text') console.log(b.text);
  } else if (m.type === 'result') {
    console.log(`\n=== ${m.subtype} · $${m.total_cost_usd?.toFixed?.(2) ?? '?'} ===`);
    process.exit(m.subtype === 'success' ? 0 : 1);
  }
}
