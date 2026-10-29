import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/session/biometric_auth_service.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/domain/password_reauth_outcome.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_step_up.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_gate_view.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart';
import 'package:lawbid/features/settings/data_export/application/data_export_providers.dart';
import 'package:lawbid/features/settings/data_export/data/data_export_repository.dart';
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart';

import '../../helpers/stub_auth_repository.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-28: «Подтвердите, что это вы» asks for the ACCOUNT
/// PASSWORD (no paid SMS); the code is only the fallback.
class _Repo extends StubAuthRepository {
  final List<String> passwords = [];
  final List<String> otpRequests = [];
  PasswordReauthOutcome? forced;

  @override
  Future<PasswordReauthOutcome> reauthWithPassword(String password) async {
    passwords.add(password);
    return forced ?? super.reauthWithPassword(password);
  }

  @override
  Future<void> requestOtp(String identifier, {String channel = 'phone'}) async {
    otpRequests.add(identifier);
  }
}

class _ExportRepo implements DataExportRepository {
  final List<String> tokens = [];

  @override
  Future<DataExport> request(String reauthToken) async {
    tokens.add(reauthToken);
    return DataExport(
      id: 'exp-1',
      status: DataExportStatus.queued,
      createdAt: DateTime.utc(2026, 10, 28),
    );
  }

  @override
  Future<DataExport> status(String exportId) async => DataExport(
        id: exportId,
        status: DataExportStatus.processing,
        createdAt: DateTime.utc(2026, 10, 28),
      );
}

class _NoBiometric extends BiometricAuthService {
  @override
  Future<bool> isAvailable() async => false;
}

const _en = StaticTranslatorEn();

Finder get _field => find.descendant(
      of: find.byKey(const ValueKey('step-up-password')),
      matching: find.byType(EditableText),
    );

void main() {
  setUpAll(initializeDateFormatting);

  late _Repo auth;
  late _ExportRepo exports;

  setUp(() {
    auth = _Repo();
    exports = _ExportRepo();
  });

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      uxApp(
        const DataExportScreen(),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            isDemoSessionProvider.overrideWithValue(false),
            authRepositoryProvider.overrideWithValue(auth),
            dataExportRepositoryProvider.overrideWithValue(exports),
            dataExportPollIntervalProvider
                .overrideWithValue(const Duration(hours: 1)),
            stepUpPasskeyProvider.overrideWith((ref) async => false),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  Future<void> submit(WidgetTester tester, String password) async {
    await tester.enterText(_field, password);
    await tester.tap(find.byKey(const ValueKey('step-up-password-submit')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
  }

  testWidgets('a password field replaces the code boxes; no SMS is sent',
      (tester) async {
    await pump(tester);
    expect(find.byType(ReauthGateView), findsOneWidget);
    expect(find.byType(PasswordStepUp), findsOneWidget);
    expect(find.byType(AppOtpField), findsNothing);
    expect(find.text(_en.t('stepUp.password.body')), findsOneWidget);
    expect(find.text(_en.t('history.reauth.send')), findsNothing);
    expect(auth.otpRequests, isEmpty);
  });

  testWidgets('show / hide the password', (tester) async {
    await pump(tester);
    bool obscured() => tester.widget<EditableText>(_field).obscureText;
    expect(obscured(), isTrue);
    await tester.tap(find.byTooltip(_en.t('auth.password.show')));
    await tester.pump();
    expect(obscured(), isFalse);
  });

  testWidgets('a wrong password shows the error and keeps the gate',
      (tester) async {
    await pump(tester);
    await submit(tester, 'wrong');
    expect(find.text(_en.t('stepUp.password.wrong')), findsOneWidget);
    expect(find.byType(ReauthGateView), findsOneWidget);
    expect(auth.passwords, ['wrong']);
  });

  testWidgets('locked: says so and points to the SMS code', (tester) async {
    await pump(tester);
    await submit(tester, 'locked');
    expect(find.text(_en.t('stepUp.password.locked')), findsOneWidget);
    expect(find.byKey(const ValueKey('step-up-use-code')), findsOneWidget);
  });

  testWidgets('the right password opens the gate with the reauth token',
      (tester) async {
    await pump(tester);
    await submit(tester, 'stub-password');
    expect(find.byType(ReauthGateView), findsNothing);
    await tester.tap(find.byKey(const ValueKey('request-export')));
    await tester.pump();
    await tester.pump();
    expect(exports.tokens, ['stub-reauth-token']);
    expect(auth.otpRequests, isEmpty);
  });

  testWidgets('«Forgot password?» goes to the SMS code path', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('step-up-use-code')));
    await tester.pump();
    expect(find.byType(PasswordStepUp), findsNothing);
    expect(find.text(_en.t('stepUp.password.body')), findsNothing);
  });

  testWidgets(
      'no password on the account / an older server: straight to the code',
      (tester) async {
    await pump(tester);
    auth.forced = const PasswordReauthUseCode();
    await submit(tester, 'anything');
    expect(find.byType(PasswordStepUp), findsNothing);
    expect(find.byType(ReauthGateView), findsOneWidget);
  });

  testWidgets('no connection: the offline message, still on the password',
      (tester) async {
    await pump(tester);
    auth.forced = const PasswordReauthNetworkError();
    await submit(tester, 'stub-password');
    expect(find.text(_en.t('offline.message')), findsOneWidget);
    expect(find.byType(PasswordStepUp), findsOneWidget);
  });

  testWidgets('delete account: the password step leads to the confirm phrase',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        const DeleteAccountScreen(),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            isDemoSessionProvider.overrideWithValue(false),
            authRepositoryProvider.overrideWithValue(auth),
            biometricAuthServiceProvider.overrideWithValue(_NoBiometric()),
            stepUpPasskeyProvider.overrideWith((ref) async => false),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.text(_en.t('deleteAccount.warning.continue')));
    await tester.pump();
    await tester.pump();
    expect(find.byType(PasswordStepUp), findsOneWidget);
    expect(find.byType(AppOtpField), findsNothing);
    await submit(tester, 'stub-password');
    expect(
      find.text(_en.t('deleteAccount.confirmPhrase.title')),
      findsOneWidget,
    );
    expect(auth.otpRequests, isEmpty);
  });
}
