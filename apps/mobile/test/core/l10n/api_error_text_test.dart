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
    expect(apiErrorText(t, phone('invalid')), contains('Такого номера США нет'));
  });

  test('non-mobile / premium line gets its own message', () {
    expect(apiErrorText(t, phone('number_type_not_allowed')), contains('мобильный номер США'));
  });

  test('non-US +1 country keeps the country message', () {
    expect(apiErrorText(t, phone('country_not_allowed')), contains('этой страны'));
    expect(apiErrorText(t, phone(null)), contains('этой страны'));
  });
}
