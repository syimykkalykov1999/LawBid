import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/verification/presentation/widgets/phone_handoff_panel.dart';

import 'verification_fakes.dart';

/// Owner 2026-10-28: an attorney who started on a computer is never stuck
/// at the ID selfie — «continue on the phone» (QR + SMS), the phone resumes
/// the same server draft at the selfie step, the computer notices the
/// selfie by itself, and Back never loses the draft.
void main() {
  final theme = AppTheme.light();

  Future<void> pumpWizard(
    WidgetTester tester,
    FakeVerificationBackend backend, {
    required bool needsPhone,
  }) async {
    tester.view.physicalSize = const Size(390, 844) * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      verificationApp(
        backend: backend,
        theme: theme,
        initial: AppRoutes.verificationWizard,
        extra: [selfieNeedsPhoneProvider.overrideWithValue(needsPhone)],
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('desktop without a camera: the handoff panel, not a camera',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: true);

    // The saved draft resumes at the selfie step.
    expect(find.text('Take a selfie'), findsOneWidget);
    expect(find.byKey(const ValueKey('selfie-phone-handoff')), findsOneWidget);
    expect(find.text('Continue on your phone'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'QR code that opens verification in the LawBid app on your phone',
      ),
      findsOneWidget,
    );
    expect(find.text('Open camera'), findsNothing);
    expect(find.text('Photo library'), findsNothing);

    final sms = find.byKey(const ValueKey('selfie-handoff-sms'));
    await tester.ensureVisible(sms);
    await tester.pumpAndSettle();
    await tester.tap(sms);
    await tester.pumpAndSettle();
    expect(backend.handoffTexts, 1);
    expect(
      find.text('Link sent to the number ending in 0142'),
      findsOneWidget,
    );
  });

  testWidgets('the computer moves on by itself once the phone sent the selfie',
      (tester) async {
    final backend = FakeVerificationBackend(request: draft(identity: true));
    await pumpWizard(tester, backend, needsPhone: true);
    expect(find.text('Take a selfie'), findsOneWidget);

    // Nothing yet: still waiting after one poll.
    await tester.pump(selfieHandoffPollInterval);
    await tester.pumpAndSettle();
    expect(find.text('Take a selfie'), findsOneWidget);

    // The phone attached the selfie to the same draft.
    backend.request = draft(identity: true, selfie: true);
    await tester.pump(selfieHandoffPollInterval);
    await tester.pumpAndSettle();
    expect(find.text('Check and submit'), findsOneWidget);
    expect(backend.createCalls, 0);
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

  test('the QR / SMS link opens the wizard in the app (after sign-in)', () {
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
