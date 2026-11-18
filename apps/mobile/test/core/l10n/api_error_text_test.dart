import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';

void main() {
  const t = StaticTranslatorRu();

  ApiException phone(String? reason) => ApiException(
        code: ApiErrorCodes.phoneCountryNotSupported,
        message: 'x',
        details: reason == null ? null : {'reason': reason},
      );

  test('non-existent US number gets its own message', () {
    expect(
      apiErrorText(t, phone('invalid')),
      contains('Такого номера США нет'),
    );
  });

  test('non-mobile / premium line gets its own message', () {
    expect(
      apiErrorText(t, phone('number_type_not_allowed')),
      contains('мобильный номер США'),
    );
  });

  test('a country LawBid is not open in says so', () {
    expect(
      apiErrorText(t, phone('country_not_allowed')),
      contains('не работает в этой стране'),
    );
    expect(apiErrorText(t, phone(null)), contains('этой страны'));
  });

  // Final pass 18.11 (FA2): Stripe did not answer a refund (503). The
  // attorney is told to try again (the same refund goes), not «Что-то
  // пошло не так».
  test('a refund Stripe did not answer says to try again', () {
    const e = ApiException(
      code: ApiErrorCodes.refundProviderFailed,
      message: 'x',
      statusCode: 503,
    );
    expect(apiErrorText(t, e), contains('Stripe'));
    expect(apiErrorText(const StaticTranslatorEn(), e), contains('Stripe'));
  });
}
