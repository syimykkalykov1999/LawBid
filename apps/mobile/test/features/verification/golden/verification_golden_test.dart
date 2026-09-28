import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';

import '../verification_fakes.dart';

class _FailingBackend extends FakeVerificationBackend {
  _FailingBackend(this.error);

  final ApiException error;

  @override
  Future<VerificationOverview> overview() async => throw error;
}

/// Goldens (light + dark) for every wizard step and every status state
/// (docs/03 §8, stage 3.8), plus 200% text scale and reduce-motion checks.
void main() {
  const size = Size(390, 844);

  Future<void> pump(
    WidgetTester tester,
    FakeVerificationBackend backend,
    ThemeData theme, {
    String initial = AppRoutes.verification,
    double textScale = 1,
  }) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      verificationApp(
        backend: backend,
        theme: theme,
        initial: initial,
        textScale: textScale,
      ),
    );
    await tester.pumpAndSettle();
  }

  VerificationRequest req(
    RequestStatus status, {
    String? code,
    String? reason,
    String? info,
    List<VerificationLicense>? licenses,
  }) =>
      VerificationRequest(
        id: 'r',
        status: status,
        rejectionCode: code,
        rejectionReason: reason,
        infoRequestMessage: info,
        submittedAt: DateTime.utc(2026, 9, 20),
        licenses: licenses ?? [license('AL'), license('NY')],
        documents: const [],
      );

  final statusStates = <String, FakeVerificationBackend Function()>{
    'start': FakeVerificationBackend.new,
    'draft': () => FakeVerificationBackend(request: draft()),
    'pending': () => FakeVerificationBackend(
          status: VerificationStatus.pending,
          request: req(RequestStatus.inReview),
        ),
    'needs_more_info': () => FakeVerificationBackend(
          status: VerificationStatus.pending,
          request: req(
            RequestStatus.needsMoreInfo,
            info: 'The front of your driver license is blurry. Please upload '
                'a sharper photo.',
          ),
        ),
    'rejected': () => FakeVerificationBackend(
          status: VerificationStatus.rejected,
          submissionsLast30Days: 1,
          request: req(
            RequestStatus.rejected,
            code: 'name_mismatch',
            reason: 'The surname on the ID differs from the license record.',
            licenses: [
              license('AL',
                  status: LicenseStatus.rejected,
                  rejectionCode: 'name_mismatch'),
            ],
          ),
        ),
    'verified': () => FakeVerificationBackend(
          status: VerificationStatus.verified,
          identityRequired: false,
          request: req(
            RequestStatus.approved,
            licenses: [
              license('NY', status: LicenseStatus.verified),
              license('AL',
                  status: LicenseStatus.rejected,
                  rejectionCode: 'license_inactive'),
            ],
          ),
        ),
    'suspended': () =>
        FakeVerificationBackend(status: VerificationStatus.suspended),
    'error': () => _FailingBackend(
          const ApiException(code: 'INTERNAL_ERROR', message: 'x'),
        ),
    'offline': () => _FailingBackend(
          const ApiException(
            code: ApiException.networkErrorCode,
            message: 'offline',
          ),
        ),
  };

  final wizardSteps = <String, FakeVerificationBackend Function()>{
    'intro': () => FakeVerificationBackend(
          request: const VerificationRequest(
            id: 'r',
            status: RequestStatus.draft,
            licenses: [],
            documents: [],
          ),
        ),
    'licenses': () => FakeVerificationBackend(
          request: VerificationRequest(
            id: 'r',
            status: RequestStatus.draft,
            licenses: [license('AL'), license('NY')],
            documents: [doc(const DocSlot.barLicense('AL'), id: 'd1')],
          ),
        ),
    'identity': () => FakeVerificationBackend(request: draft()),
    'selfie': () => FakeVerificationBackend(request: draft(identity: true)),
    'review': () =>
        FakeVerificationBackend(request: draft(identity: true, selfie: true)),
    'supplement': () => FakeVerificationBackend(
          status: VerificationStatus.pending,
          request: draft(
            identity: true,
            selfie: true,
            status: RequestStatus.needsMoreInfo,
            infoMessage: 'Please add a certificate of good standing.',
          ),
        ),
  };

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme =
        brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    for (final entry in statusStates.entries) {
      testGoldens('status ${entry.key} - $name', (tester) async {
        await pump(tester, entry.value(), theme);
        await screenMatchesGolden(
          tester,
          'verification_status_${entry.key}_$name',
        );
      });
    }

    for (final entry in wizardSteps.entries) {
      testGoldens('wizard ${entry.key} - $name', (tester) async {
        final backend = entry.value();
        Completer<void>? gate;
        await pump(
          tester,
          backend,
          theme,
          initial: AppRoutes.verificationWizard,
        );
        if (entry.key == 'licenses') {
          // Upload states on the cards: one attached, one in progress.
          gate = backend.uploadGate = Completer<void>();
          await tester.ensureVisible(find.text('Photo or PDF').last);
          await tester.pumpAndSettle();
          await tester.tap(find.text('Photo or PDF').last);
          await tester.pumpAndSettle();
        }
        await screenMatchesGolden(
          tester,
          'verification_wizard_${entry.key}_$name',
        );
        gate?.complete();
        await tester.pumpAndSettle();
      });
    }
  }

  testGoldens('wizard upload failure states - light', (tester) async {
    final backend = FakeVerificationBackend(
      request: VerificationRequest(
        id: 'r',
        status: RequestStatus.draft,
        licenses: [license('AL')],
        documents: const [],
      ),
    )..nextScan = ScanState.infected;
    await pump(tester, backend, AppTheme.light(),
        initial: AppRoutes.verificationWizard);
    await tester.ensureVisible(find.text('Photo or PDF').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Photo or PDF').last);
    await tester.pumpAndSettle();
    await screenMatchesGolden(tester, 'verification_wizard_infected_light');
  });

  group('200% text scale renders without overflow', () {
    for (final key in ['rejected', 'needs_more_info', 'verified']) {
      testWidgets('status $key', (tester) async {
        await pump(tester, statusStates[key]!(), AppTheme.light(),
            textScale: 2);
        expect(tester.takeException(), isNull);
      });
    }
    for (final key in ['licenses', 'identity', 'review']) {
      testWidgets('wizard $key', (tester) async {
        await pump(tester, wizardSteps[key]!(), AppTheme.dark(),
            initial: AppRoutes.verificationWizard, textScale: 2);
        expect(tester.takeException(), isNull);
      });
    }
  });

  testWidgets('reduce-motion: final state on the first frame, nothing ticks',
      (tester) async {
    await pump(tester, statusStates['verified']!(), AppTheme.light());
    expect(find.text("You're verified"), findsOneWidget);
    expect(tester.hasRunningAnimations, isFalse);
  });
}
