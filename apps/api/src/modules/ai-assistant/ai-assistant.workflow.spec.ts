import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAFF_AI_MODELS } from '../staff-ai/staff-ai.types';
import { forbiddenPaths } from './ai-pull-guard.logic';

/**
 * Owner 2026-11-12: the AI technician workflow (rows 48, 55). The model comes
 * from the admin setting but only a known model id may reach the command
 * line; the owner's pictures come from the API to the runner only.
 */
const ROOT = join(__dirname, '../../../../..');
const yml = readFileSync(
  join(ROOT, '.github/workflows/ai-assistant.yml'),
  'utf8',
);
const api = readFileSync(join(ROOT, 'scripts/ai-assistant/api.sh'), 'utf8');

describe('ai-assistant.yml', () => {
  it('the model is the gate answer, checked against exactly the known models list', () => {
    const m = /case "\$model" in\s*\n\s*([^)]+)\)/.exec(yml);
    expect(m).not.toBeNull();
    expect(m![1].trim().split('|').sort()).toEqual([...STAFF_AI_MODELS].sort());
    // Anything else falls back to Opus 5.5.
    expect(yml).toMatch(/\*\) model=claude-opus-5-5 ;;/);
    expect(yml).toContain(
      "--model ${{ steps.gate.outputs.model || 'claude-opus-5-5' }}",
    );
    // No other hardcoded --model.
    expect(yml.match(/--model /g)).toHaveLength(1);
  });

  it('pictures: fetched by id through the OIDC API helper, written only under .ai-attachments/, removed after', () => {
    expect(yml).toContain('scripts/ai-assistant/api.sh attachments');
    expect(api).toMatch(/\^\(gate\|digest\|report\|attachments\)\$/);
    expect(yml).toContain('echo ".ai-attachments/" >> .git/info/exclude');
    expect(yml).toContain('rm -rf .ai-attachments');
    // Only uuid ids are taken from the issue, only safe extensions written.
    expect(yml).toContain(
      "grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'",
    );
    expect(yml).toContain(
      'case "$ext" in jpg|png|gif|webp) ;; *) continue ;; esac',
    );
    // Never published anywhere.
    expect(yml).not.toMatch(/upload-artifact/);
    expect(forbiddenPaths(['.ai-attachments/x.png'])).toEqual([
      '.ai-attachments/x.png',
    ]);
  });
});
