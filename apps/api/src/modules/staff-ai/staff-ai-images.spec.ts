/* eslint-disable @typescript-eslint/no-unsafe-return */
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { OWNER_STAFF_SETTINGS as STAFF_SETTINGS } from '../../common/app-settings/staff-settings';
import { QA_SCHEMA } from './staff-ai-schemas';
import { IMAGE_TOKENS_MAX } from './staff-ai-client.service';
import { modelForTier } from './staff-ai.types';
import { AI_ON, clientKit, messageOf } from './staff-ai.test-support';

/**
 * Owner 2026-11-12 (row 48): the owner's pictures reach the Anthropic request
 * as base64 `image` blocks (before the text), the worst case is reserved for
 * them. Row 55: the staff AI models follow the task and are the owner's to
 * change.
 */
const SYSTEM = [{ text: 'rubric', cacheTtl: '1h' as const }];
const GOOD = {
  verdict: 'agree',
  confidence: 80,
  reason: 'ok',
  better_outcome: '',
};
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';

describe('StaffAiClient: pictures', () => {
  it('Messages: image blocks before the text, labelled, the last one cached', async () => {
    const kit = clientKit(AI_ON, () => messageOf(GOOD));
    await kit.client.message({
      feature: 'qa',
      model: 'claude-opus-5-5',
      system: SYSTEM,
      user: 'look at bob@example.com',
      images: [
        { mediaType: 'image/png', data: PNG, label: 'Picture 1:' },
        { mediaType: 'image/jpeg', data: '/9j/4AAQ', cache: true },
      ],
      schema: QA_SCHEMA,
      maxTokens: 300,
      timeoutMs: 3000,
    });
    const content = kit.calls[0].body.messages[0].content as Array<
      Record<string, any>
    >;
    expect(content.map((c) => c.type)).toEqual([
      'text',
      'image',
      'image',
      'text',
    ]);
    expect(content[1].source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: PNG,
    });
    expect(content[1].cache_control).toBeUndefined();
    expect(content[2].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    // The text is still PII-scrubbed.
    expect(content[3].text).not.toContain('bob@example.com');
  });

  it('Batches: every request carries the pictures', async () => {
    const kit = clientKit(AI_ON, () => ({ id: 'msgbatch_1' }));
    await kit.client.submitBatch({
      feature: 'qa',
      model: 'claude-opus-5-5',
      schema: QA_SCHEMA,
      maxTokens: 300,
      items: [
        {
          customId: 'c1',
          system: SYSTEM,
          user: 'x',
          images: [{ mediaType: 'image/webp', data: 'UklGRg==' }],
        },
        { customId: 'c2', system: SYSTEM, user: 'y' },
      ],
    });
    const reqs = kit.calls[0].body.requests as Array<Record<string, any>>;
    expect(reqs[0].params.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: 'UklGRg==' },
    });
    // No pictures = the plain string turn as before.
    expect(reqs[1].params.messages[0].content).toBe('y');
  });

  it('the reservation counts the pictures (worst case per picture)', () => {
    const kit = clientKit(AI_ON, () => messageOf(GOOD));
    const none = kit.client.estimateItemMillicents(
      'claude-opus-5-5',
      SYSTEM,
      'x',
      300,
      true,
    );
    const two = kit.client.estimateItemMillicents(
      'claude-opus-5-5',
      SYSTEM,
      'x',
      300,
      true,
      2,
    );
    expect(two).toBeGreaterThan(none);
    // docs.claude.com «Vision»: at most 4,784 visual tokens on Claude 4.7+.
    expect(IMAGE_TOKENS_MAX).toBe(4784);
  });
});

describe('staff AI models follow the task (row 55)', () => {
  it('tier 1 (complex) = Opus 5.5, tier 2 (simple) = Haiku 5.5 by default', () => {
    expect(modelForTier(STAFF_SETTINGS['staff.ai.model_tier1'])).toBe(
      'claude-opus-5-5',
    );
    expect(modelForTier(STAFF_SETTINGS['staff.ai.model_tier2'])).toBe(
      'claude-haiku-5-5',
    );
    expect(modelForTier(0)).toBe('claude-haiku-5-5');
    expect(modelForTier(1)).toBe('claude-sonnet-5-5');
    expect(modelForTier(2)).toBe('claude-opus-5-5');
  });

  it('the AI technician defaults to Opus 5.5', () => {
    expect(APP_SETTINGS['ai.assistant_model']).toBe('claude-opus-5-5');
  });
});
