import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid/features/verification/presentation/screens/verification_wizard_screen.dart';
import 'package:lawbid/features/verification/presentation/widgets/phone_handoff_panel.dart';

import 'verification_fakes.dart';

/// Owner 2026-10-28: an attorney who started on a computer is never stuck
/// at the ID selfie — «continue on the phone» (QR code), the phone resumes
/// the same server draft at the selfie step, the computer notices the
/// selfie by itself, and Back never loses the draft.
void main() {
  final theme = AppTheme.light();

  Future<void> pumpWizard(
    WidgetTester tester,
    FakeVerificationBackend backend, {
    required bool needsPhone,
    String initial = AppRoutes.verificationWizard,
  }) async {
    tester.view.physicalSize = const Size(390, 1400) * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      verificationApp(
        backend: backend,
        theme: theme,
        initial: initial,
        extra: [selfieNeedsPhoneProvider.overrideWithValue(needsPhone)],
      ),
    );
    await tester.pumpAndSettle();
  }

  AppButton continueButton(WidgetTester tester) => tester.widget<AppButton>(
        find.widgetWithText(AppButton, 'Continue').last,
      );

  testWidgets('desktop without a camera: the handoff panel, not a camera',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: true);

    // The saved draft resumes at the selfie step.
    expect(find.text('Take a selfie'), findsOneWidget);
    expect(find.byKey(const ValueKey('selfie-phone-handoff')), findsOneWidget);
    expect(find.text('No camera? Continue on your phone'), findsOneWidget);
    // R-146: a one-time code bound to this draft, as a QR and a short link.
    expect(backend.handoffsCreated, 1);
    expect(
      find.text('https://lawbid.dev/selfie/test-handoff-token-1'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('selfie-handoff-copy')), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'QR code that opens verification in the LawBid app on your phone',
      ),
      findsOneWidget,
    );
    expect(find.text('Open camera'), findsNothing);
    expect(find.text('Photo library'), findsNothing);

    // No SMS option (owner 2026-10-28): QR + "just sign in on the phone".
    expect(find.byKey(const ValueKey('selfie-handoff-sms')), findsNothing);
    expect(
      find.text(
        'Or just sign in to the app on your phone with the same number '
        "— you'll continue from this step.",
      ),
      findsOneWidget,
    );
  });

  testWidgets('R-146: status done → «Selfie received ✓» and Continue turns on',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: true);
    expect(find.text('Take a selfie'), findsOneWidget);
    expect(continueButton(tester).isEnabled, isFalse);

    // Nothing yet: still waiting after one poll (every 3 s).
    expect(selfieHandoffPollInterval, const Duration(seconds: 3));
    await tester.pump(selfieHandoffPollInterval);
    await tester.pumpAndSettle();
    expect(backend.handoffStatusCalls, 1);
    expect(
      find.text('Waiting for the selfie from your phone…'),
      findsOneWidget,
    );

    // The phone attached the selfie to the same draft.
    backend
      ..request = draft(identity: true, selfie: true)
      ..handoffState = SelfieHandoffStatus.done;
    await tester.pump(selfieHandoffPollInterval);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('selfie-handoff-done')), findsOneWidget);
    expect(find.text('Selfie received ✓'), findsOneWidget);
    expect(find.text('Take a selfie'), findsOneWidget);
    expect(continueButton(tester).isEnabled, isTrue);
    expect(backend.createCalls, 0);

    // Done: no more requests.
    final calls = backend.handoffStatusCalls;
    await tester.pump(selfieHandoffPollInterval * 3);
    await tester.pumpAndSettle();
    expect(backend.handoffStatusCalls, calls);

    await tester.tap(find.widgetWithText(AppButton, 'Continue').last);
    await tester.pumpAndSettle();
    expect(find.text('Check and submit'), findsOneWidget);
  });

  testWidgets('R-146: expired → «Refresh QR code» makes a new code',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: true);
    backend.handoffState = SelfieHandoffStatus.expired;
    await tester.pump(selfieHandoffPollInterval);
    await tester.pumpAndSettle();
    expect(find.text('The code has expired.'), findsOneWidget);
    expect(
      find.text('https://lawbid.dev/selfie/test-handoff-token-1'),
      findsNothing,
    );
    // Polling stopped at expired.
    final calls = backend.handoffStatusCalls;
    await tester.pump(selfieHandoffPollInterval * 2);
    expect(backend.handoffStatusCalls, calls);

    backend.handoffState = SelfieHandoffStatus.pending;
    await tester.tap(find.byKey(const ValueKey('selfie-handoff-refresh')));
    await tester.pumpAndSettle();
    expect(backend.handoffsCreated, 2);
    expect(
      find.text('https://lawbid.dev/selfie/test-handoff-token-2'),
      findsOneWidget,
    );
    expect(find.text('The code has expired.'), findsNothing);
  });

  testWidgets('R-146: the phone opens the camera step for the token',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(
      tester,
      backend,
      needsPhone: false,
      initial: selfieHandoffLocation('test-handoff-token-1'),
    );
    expect(find.text('Take a selfie'), findsOneWidget);
    expect(find.text('Open camera'), findsOneWidget);
    expect(find.byKey(const ValueKey('selfie-phone-handoff')), findsNothing);
    expect(
      find.byKey(const ValueKey('selfie-handoff-link-invalid')),
      findsNothing,
    );
    expect(backend.handoffsCreated, 0);
    expect(backend.createCalls, 0);

    // After the selfie: «Done — go back to your computer.»
    backend.request = draft(identity: true, selfie: true);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(VerificationWizardScreen)),
    );
    await container
        .read(verificationWizardProvider.notifier)
        .refreshForHandoff();
    await tester.pumpAndSettle();
    expect(find.text('Done — go back to your computer.'), findsOneWidget);
  });

  testWidgets("R-146: a stale or another account's link says so on the phone",
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true))
      ..handoffKnown = false;
    await pumpWizard(
      tester,
      backend,
      needsPhone: false,
      initial: selfieHandoffLocation('test-handoff-token-9'),
    );
    expect(
      find.byKey(const ValueKey('selfie-handoff-link-invalid')),
      findsOneWidget,
    );
    // The camera still works (the selfie goes to the own draft).
    expect(find.text('Open camera'), findsOneWidget);
  });

  testWidgets('R-146: a phone browser without the app is sent to the app',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(
      tester,
      backend,
      needsPhone: true,
      initial: selfieHandoffLocation('test-handoff-token-1'),
    );
    expect(
      find.byKey(const ValueKey('selfie-handoff-needs-app')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('selfie-handoff-open-app')),
      findsOneWidget,
    );
    // Not a second QR code on the phone.
    expect(find.byKey(const ValueKey('selfie-phone-handoff')), findsNothing);
    expect(backend.handoffsCreated, 0);
  });

  testWidgets('on the phone the same draft resumes at the selfie camera',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: false);
    expect(find.text('Take a selfie'), findsOneWidget);
    expect(find.text('Open camera'), findsOneWidget);
    expect(find.byKey(const ValueKey('selfie-phone-handoff')), findsNothing);
    // Licences and ID photos entered on the computer are all there.
    expect(backend.request!.identityComplete, isTrue);
    expect(backend.createCalls, 0);
  });

  testWidgets('Back from the selfie step goes to the ID step, draft kept',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: true);
    expect(find.text('Take a selfie'), findsOneWidget);
    final before = backend.request!;

    await tester.tap(find.bySemanticsLabel('Back').first);
    await tester.pumpAndSettle();
    expect(find.text('Take a selfie'), findsNothing);
    expect(find.text('Identity document'), findsWidgets);
    expect(backend.request!.id, before.id);
    expect(backend.request!.documents.length, before.documents.length);
    expect(backend.createCalls, 0);

    // And forward again lands on the selfie step.
    final next = find.text('Continue').last;
    await tester.ensureVisible(next);
    await tester.pumpAndSettle();
    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(find.text('Take a selfie'), findsOneWidget);
  });

  test('R-146: …/selfie/<token> opens the selfie step with the token', () {
    final want = TabDeepLink(selfieHandoffLocation('AbCdEfGhIjKlMnOpQrStUv'));
    expect(
      parseDeepLink(
        Uri.parse('https://lawbid.dev/selfie/AbCdEfGhIjKlMnOpQrStUv'),
        host: 'lawbid.dev',
      ),
      want,
    );
    expect(
      parseDeepLink(
        Uri.parse('lawbid://selfie/AbCdEfGhIjKlMnOpQrStUv'),
        host: 'lawbid.dev',
      ),
      want,
    );
    expect(
      selfieHandoffLocation('AbCdEfGhIjKlMnOpQrStUv'),
      '/verification/wizard?handoff=AbCdEfGhIjKlMnOpQrStUv',
    );
    // Too short / foreign host / odd characters: ignored.
    for (final bad in [
      'https://lawbid.dev/selfie/short',
      'https://evil.example/selfie/AbCdEfGhIjKlMnOpQrStUv',
      'https://lawbid.dev/selfie/AbCdEfGh%3CIjKlMnOpQrStUv',
    ]) {
      expect(
        parseDeepLink(Uri.parse(bad), host: 'lawbid.dev'),
        isNull,
        reason: bad,
      );
    }
  });

  test('the QR link opens the wizard in the app (after sign-in)', () {
    const want = TabDeepLink(verificationWizardLocation);
    expect(
      parseDeepLink(
        Uri.parse('https://lawbid.dev/verification/wizard'),
        host: 'lawbid.dev',
      ),
      want,
    );
    expect(
      parseDeepLink(
        Uri.parse('lawbid://verification/wizard'),
        host: 'lawbid.dev',
      ),
      want,
    );
    expect(
      parseDeepLink(
        Uri.parse('https://evil.example/verification/wizard'),
        host: 'lawbid.dev',
      ),
      isNull,
    );
    expect(verificationWizardLocation, AppRoutes.verificationWizard);
  });
}
