import { RuleBasedRecommendationTemplate } from './staff-recommendation.template';

describe('RuleBasedRecommendationTemplate (plain-Russian text from evidence)', () => {
  const t = new RuleBasedRecommendationTemplate();
  const evidence = {
    status: 'red',
    rating: 54.4,
    n: 112,
    flags: ['very_low', 'rushing', 'unknown_flag'],
    rankPct: 96,
  };

  it('maps every kind to one of three verdicts', () => {
    const verdict = (k: string) => t.render({ kind: k, evidence }).adviceLabel;
    expect(verdict('reward')).toBe('Премировать');
    for (const k of ['warn', 'retrain', 'more_review'])
      expect(verdict(k)).toBe('Обучить');
    for (const k of ['pull', 'pause', 'replace'])
      expect(verdict(k)).toBe('Заменить');
  });

  it('puts the proof into numbers, one line each, skipping unknown flags', () => {
    const r = t.render({ kind: 'pull', evidence });
    expect(r.lines).toEqual([
      'Рейтинг 54 из 100 за 112 решений.',
      'Место: верхние 96 % своего пространства.',
      'Замечено: рейтинг сильно ниже нормы.',
      'Замечено: решает слишком быстро.',
    ]);
    expect(r.actionLabel).toContain('7 дней');
  });

  it('a replace says that warnings did not help', () => {
    const r = t.render({ kind: 'replace', evidence });
    expect(r.lines.at(-1)).toContain('Предупреждения уже были');
    expect(r.headline).toContain('заменить');
  });

  it('copes with empty or broken evidence and an unknown kind', () => {
    const r = t.render({
      kind: 'something',
      evidence: { rating: 'x', flags: 5 },
    });
    expect(r.lines).toEqual([]);
    expect(r.advice).toBe('train');
  });
});
