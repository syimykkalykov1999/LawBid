import { ApiError, errorText } from '@/lib/api/client';

/** Russian text for the 409/404 codes of the growth, media and case endpoints. */
const TEXT: Record<string, string> = {
  CASE_NOT_FOUND: 'Кейс не найден.',
  CASE_INVALID_STATE: 'Это действие недоступно для кейса в текущем статусе. Обновите страницу.',
  PROMOTION_ALREADY_ACTIVE: 'У этого кейса уже идёт продвижение.',
  PROMOTION_INVALID_STATE: 'Статус продвижения уже изменился. Обновите список.',
  FEATURE_DISABLED: 'Функция выключена в настройках.',
  REFERRAL_INVALID_STATE: 'Статус приглашения не подходит для этого действия.',
  CONTENT_INVALID_STATE: 'Это нельзя восстановить: автор удалил сам или видео уже снято.',
  STICKER_PACK_NAME_TAKEN: 'Такое короткое имя уже занято.',
  FILE_NOT_UPLOADED: 'Файл не дошёл до хранилища. Попробуйте ещё раз.',
  FILE_TYPE_NOT_ALLOWED: 'Этот формат файла не подходит.',
  NOT_FOUND: 'Не найдено.',
};

/** errorText() plus the codes above; keeps the server message for a reward retry (it explains why). */
export function growthError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'REFERRAL_INVALID_STATE' && /Stripe/.test(e.message)) {
      return 'Деньги не начислены: у адвоката ещё нет аккаунта в Stripe (начислятся при первой оплате) или Stripe отказал.';
    }
    if (TEXT[e.code]) return TEXT[e.code];
  }
  return errorText(e);
}
