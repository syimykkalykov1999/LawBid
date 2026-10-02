import * as React from 'react';

/** Russian wording for raw codes the API passes through (Stripe decline codes, system cancel reasons). */
export const REASON_TEXT: Record<string, string> = {
  // payments (Stripe)
  card_declined: 'Карта отклонена',
  generic_decline: 'Карта отклонена банком',
  insufficient_funds: 'Недостаточно средств',
  expired_card: 'Срок карты истёк',
  incorrect_cvc: 'Неверный CVC',
  incorrect_number: 'Неверный номер карты',
  invalid_number: 'Неверный номер карты',
  invalid_expiry_month: 'Неверный срок карты',
  invalid_expiry_year: 'Неверный срок карты',
  processing_error: 'Ошибка при обработке платежа',
  authentication_required: 'Нужно подтверждение банка (3-D Secure)',
  authentication_failure: 'Подтверждение банка не пройдено',
  do_not_honor: 'Банк отказал в платеже',
  lost_card: 'Карта утеряна',
  stolen_card: 'Карта украдена',
  fraudulent: 'Подозрение на мошенничество',
  withdrawal_count_limit_exceeded: 'Превышен лимит операций по карте',
  currency_not_supported: 'Валюта не поддерживается картой',
  invoice_payment_failed: 'Не удалось оплатить счёт',
  payment_failed: 'Платёж не прошёл',
  requires_payment_method: 'Нет способа оплаты',
  // promotions
  checkout_expired: 'Время на оплату истекло',
  checkout_failed: 'Оплата не прошла',
  superseded: 'Заменено новым продвижением',
  admin_cancel: 'Отменено администратором',
  // videos
  missing_at_provider: 'Видео пропало у провайдера',
  too_long: 'Видео слишком длинное',
  encoding_failed: 'Не удалось обработать видео',
  // refunds
  requested_by_customer: 'По просьбе клиента',
  duplicate: 'Дубликат платежа',
  expired_uncaptured_charge: 'Платёж не был завершён',
};

/** Human text for a raw code; unknown codes are returned unchanged. */
export function reasonText(code: string | null | undefined): string {
  if (!code) return '';
  return REASON_TEXT[code] ?? code;
}

/** Renders the Russian text with the raw code in a tooltip. */
export function Reason({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!code) return null;
  return (
    <span className={className} title={code}>
      {reasonText(code)}
    </span>
  );
}
