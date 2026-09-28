import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/01_FOUNDATION_AUTH.md §7: one ErrorCode enum on server and client.
/// `api.ErrorCode` is generated from the server enum (via openapi.json), so
/// this fails as soon as apps/api adds/renames a code and the client
/// constants are not updated with it.
void main() {
  final generated = api.ErrorCode.$valuesDefined.map((c) => c.json!).toSet();

  test('ApiErrorCodes.all is exactly the generated ErrorCode enum', () {
    expect(ApiErrorCodes.all.toSet(), generated);
    expect(ApiErrorCodes.all, hasLength(ApiErrorCodes.all.toSet().length),
        reason: 'no duplicates');
  });

  test('the generated enum still knows the codes the app branches on', () {
    for (final code in [
      ApiErrorCodes.tokenExpired,
      ApiErrorCodes.authSessionRevoked,
      ApiErrorCodes.appUpdateRequired,
      ApiErrorCodes.clientContactsIncomplete,
    ]) {
      expect(api.ErrorCode.fromJson(code), isNot(api.ErrorCode.$unknown));
    }
  });

  group('user-visible codes have their own localized text (en + ru)', () {
    const visible = [
      ApiErrorCodes.deviceAttestationRequired,
      ApiErrorCodes.authRefreshReuseDetected,
      ApiErrorCodes.authSessionRevoked,
      ApiErrorCodes.authRefreshExpired,
      ApiErrorCodes.authSocialTokenInvalid,
      ApiErrorCodes.authSocialProviderUnavailable,
      ApiErrorCodes.idempotencyKeyConflict,
      ApiErrorCodes.forbidden,
      ApiErrorCodes.notFound,
      ApiErrorCodes.notImplemented,
      ApiErrorCodes.attorneyNotVerified,
      ApiErrorCodes.usernameTaken,
      ApiErrorCodes.usernameReserved,
      ApiErrorCodes.usernameChangeTooSoon,
    ];
    for (final translator in const [StaticTranslatorEn(), StaticTranslatorRu()]) {
      final fallback = translator.t('error.default.message');
      for (final code in visible) {
        test('${translator.runtimeType} $code', () {
          final text = apiErrorText(
            translator,
            ApiException(code: code, message: 'server text'),
          );
          expect(text, isNot(fallback));
          expect(text, isNot(contains('error.api.')), reason: 'key must resolve');
          expect(text, isNot('server text'));
        });
      }
    }
  });

  test('refresh-token reuse explains the forced sign-out', () {
    const en = StaticTranslatorEn();
    expect(
      apiErrorText(
        en,
        const ApiException(
          code: ApiErrorCodes.authRefreshReuseDetected,
          message: 'x',
        ),
      ),
      contains('signed out on all devices'),
    );
  });
}
