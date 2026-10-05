/** Owner 2026-10-05: where the paid translator works (the API reads the
 * same keys before calling Google; the app hides «Перевести» elsewhere). */
export const TRANSLATE_FLAG = 'chat_translate';
export const TRANSLATE_SCOPE_KEY = 'translate.scope';
export type TranslateScope = 'all' | 'zones';

export const TRANSLATE_ZONES: readonly { key: string; label: string; hint: string }[] = [
  { key: 'translate.chat', label: 'Чаты', hint: 'Сообщения собеседника' },
  { key: 'translate.posts', label: 'Лента', hint: 'Посты и комментарии' },
  { key: 'translate.cases', label: 'Кейсы и ставки', hint: 'Описание кейса, текст ставки' },
  { key: 'translate.reviews', label: 'Отзывы', hint: 'Текст отзыва' },
  { key: 'translate.profiles', label: 'Профили', hint: '«О себе» адвоката' },
];

/** Which zones are translated for these settings (scope 'all' = every one). */
export function activeZones(scope: TranslateScope, values: Record<string, unknown>): string[] {
  return TRANSLATE_ZONES.filter((z) => scope === 'all' || values[z.key] !== false).map((z) => z.key);
}
