import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/session/biometric_auth_service.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/stub_auth_repository.dart';
import 'package:lawbid/features/auth/domain/account_deletion_result.dart';
import 'package:lawbid/features/auth/domain/reauth_result.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_gate_view.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/profile/application/delete_account_controller.dart';
import 'package:lawbid/features/profile/domain/delete_account_step.dart';
import 'package:lawbid/features/settings/data_export/application/data_export_providers.dart';
import 'package:lawbid/features/settings/data_export/data/data_export_repository.dart';
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-08: a DEMO session skips the reauth code (case history
/// export, data export, account deletion) via `POST /auth/reauth/demo`; a
/// real session keeps the code step. The server decides; the app only
/// picks the screen.
class _Repo extends StubAuthRepository {
  _Repo({this.demoResult = const ReauthResult.success(reauthToken: 'demo-t')});

  ReauthResult demoResult;
  AccountDeletionResult deletion = const AccountDeletionResult.success();
  int demoCalls = 0;
  final List<String> otpRequests = [];
  String? deletedWith;

  @override
  Future<ReauthResult> reauthDemo() async {
    demoCalls++;
    return demoResult;
  }

  @override
  Future<void> requestOtp(String identifier, {String channel = 'phone'}) async {
    otpRequests.add(identifier);
  }

  @override
  Future<AccountDeletionResult> deleteAccount({
    required String reauthToken,
  }) async {
    deletedWith = reauthToken;
    return deletion;
  }
}

class _NoBiometric extends BiometricAuthService {
  @override
  Future<bool> isAvailable() async => false;
}

class _ExportRepo implements DataExportRepository {
  final List<String> tokens = [];

  @override
  Future<DataExport> request(String reauthToken) async {
    tokens.add(reauthToken);
    return DataExport(
      id: 'exp-1',
      status: DataExportStatus.queued,
      createdAt: DateTime.utc(2026, 10, 8),
    );
  }

  @override
  Future<DataExport> status(String exportId) async => DataExport(
        id: exportId,
        status: DataExportStatus.processing,
        createdAt: DateTime.utc(2026, 10, 8),
      );
}

const _en = StaticTranslatorEn();

void main() {
  setUpAll(initializeDateFormatting);

  group('re-auth gate (case history + data export)', () {
    late _Repo auth;
    late _ExportRepo exports;

    setUp(() {
      auth = _Repo();
      exports = _ExportRepo();
    });

    Future<void> pump(WidgetTester tester, {required bool demo}) async {
      await tester.pumpWidget(
        uxApp(
          const DataExportScreen(),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              isDemoSessionProvider.overrideWithValue(demo),
              authRepositoryProvider.overrideWithValue(auth),
              dataExportRepositoryProvider.overrideWithValue(exports),
              dataExportPollIntervalProvider
                  .overrideWithValue(const Duration(hours: 1)),
            ],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    testWidgets('demo: one tap, no code, then the export runs', (tester) async {
      await pump(tester, demo: true);
      expect(find.byType(ReauthGateView), findsOneWidget);
      expect(find.text(_en.t('demo.reauth.message')), findsOneWidget);
      expect(find.text(_en.t('history.reauth.send')), findsNothing);
      expect(find.byType(AppOtpField), findsNothing);

      await tester.tap(find.byKey(const ValueKey('reauth-demo-continue')));
      await tester.pump();
      await tester.pump();
      expect(auth.demoCalls, 1);
      expect(auth.otpRequests, isEmpty);
      expect(find.byType(ReauthGateView), findsNothing);

      await tester.tap(find.byKey(const ValueKey('request-export')));
      await tester.pump();
      await tester.pump();
      expect(exports.tokens, ['demo-t']);
    });

    testWidgets('demo: a refusal keeps the gate locked with an error',
        (tester) async {
      auth.demoResult = const ReauthResult.invalid();
      await pump(tester, demo: true);
      await tester.tap(find.byKey(const ValueKey('reauth-demo-continue')));
      await tester.pump();
      await tester.pump();
      expect(find.byType(ReauthGateView), findsOneWidget);
      expect(find.text(_en.t('offline.message')), findsOneWidget);
    });

    testWidgets('real session: no skip button, the code step stays',
        (tester) async {
      await pump(tester, demo: false);
      expect(find.byType(ReauthGateView), findsOneWidget);
      expect(find.byKey(const ValueKey('reauth-demo-continue')), findsNothing);
      expect(find.text(_en.t('demo.reauth.message')), findsNothing);
      expect(auth.demoCalls, 0);
    });

    test('HistoryAccessController.continueDemo opens the history', () async {
      final container = ProviderContainer(
        overrides: [authRepositoryProvider.overrideWithValue(auth)],
      );
      addTearDown(container.dispose);
      await container.read(historyAccessProvider.notifier).continueDemo();
      final access = container.read(historyAccessProvider);
      expect(access.token, 'demo-t');
      expect(access.isOpen, isTrue);
    });
  });

  group('DeleteAccountController', () {
    ProviderContainer container(_Repo repo, {required bool demo}) {
      final c = ProviderContainer(
        overrides: [
          isDemoSessionProvider.overrideWithValue(demo),
          authRepositoryProvider.overrideWithValue(repo),
          biometricAuthServiceProvider.overrideWithValue(_NoBiometric()),
        ],
      );
      addTearDown(c.dispose);
      return c;
    }

    test('demo: warning → confirm phrase with a code-less token', () async {
      final repo = _Repo();
      final c = container(repo, demo: true);
      final ctrl = c.read(deleteAccountControllerProvider.notifier);
      await ctrl.acknowledgeWarning();
      final state = c.read(deleteAccountControllerProvider);
      expect(state.step, DeleteAccountStep.confirmPhrase);
      expect(state.reauthToken, 'demo-t');
      expect(repo.otpRequests, isEmpty);

      expect(await ctrl.submitDeletion(), isTrue);
      expect(repo.deletedWith, 'demo-t');
      expect(
        c.read(deleteAccountControllerProvider).step,
        DeleteAccountStep.done,
      );
    });

    test('demo: a refused or expired token goes back to the warning', () async {
      final repo = _Repo(demoResult: const ReauthResult.invalid());
      final c = container(repo, demo: true);
      final ctrl = c.read(deleteAccountControllerProvider.notifier);
      await ctrl.acknowledgeWarning();
      var state = c.read(deleteAccountControllerProvider);
      expect(state.step, DeleteAccountStep.warning);
      expect(state.errorMessage, 'network');
      expect(state.reauthToken, isNull);

      repo
        ..demoResult = const ReauthResult.success(reauthToken: 'demo-2')
        ..deletion = const AccountDeletionResult.reauthInvalid();
      await ctrl.acknowledgeWarning();
      expect(await ctrl.submitDeletion(), isFalse);
      state = c.read(deleteAccountControllerProvider);
      expect(state.step, DeleteAccountStep.warning);
      expect(state.errorMessage, 'reauthExpired');
    });

    test('real session: still phone → code, no demo call', () async {
      final repo = _Repo();
      final c = container(repo, demo: false);
      final ctrl = c.read(deleteAccountControllerProvider.notifier);
      await ctrl.acknowledgeWarning();
      expect(
        c.read(deleteAccountControllerProvider).step,
        DeleteAccountStep.reauthPhone,
      );
      expect(c.read(deleteAccountControllerProvider).reauthToken, isNull);
      expect(repo.demoCalls, 0);
    });
  });
}
