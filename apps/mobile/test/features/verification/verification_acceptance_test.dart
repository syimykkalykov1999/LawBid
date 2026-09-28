import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';

import 'verification_fakes.dart';

/// docs/03 §11 stage 3.8 acceptance checklist, as widget tests against an
/// in-memory API (verification_fakes.dart).
void main() {
  final theme = AppTheme.light();

  Future<void> pumpApp(
    WidgetTester tester,
    FakeVerificationBackend backend, {
    FakeDocumentSource? source,
    String initial = AppRoutes.verification,
  }) async {
    tester.view.physicalSize = const Size(390, 844) * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      verificationApp(
        backend: backend,
        theme: theme,
        source: source,
        initial: initial,
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapText(WidgetTester tester, String text, {int? at}) async {
    final all = find.text(text);
    final finder = at == null ? all.last : all.at(at);
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> addLicense(
    WidgetTester tester,
    String buttonLabel,
    String stateName,
    String bar,
  ) async {
    await tapText(tester, buttonLabel);
    await tester.tap(find.text('Choose a state'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(stateName).last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, bar);
    await tester.pumpAndSettle();
    await tapText(tester, 'Add license');
  }

  testWidgets('1. wizard with two states → submitted', (tester) async {
    final backend = FakeVerificationBackend();
    final source = FakeDocumentSource();
    await pumpApp(tester, backend, source: source);

    expect(find.text('Get verified'), findsOneWidget);
    await tapText(tester, 'Start verification');
    expect(backend.createCalls, 1);
    expect(find.text('Verify your license'), findsOneWidget);
    expect(find.text('Step 1 of 5'), findsOneWidget);

    await tapText(tester, 'Start');
    expect(find.text('Your licenses'), findsOneWidget);

    // Continue is refused until a license with its document exists.
    await tapText(tester, 'Continue');
    expect(find.text('Add at least one state license.'), findsOneWidget);

    await addLicense(tester, 'Add a state', 'Alabama', 'al123');
    await addLicense(tester, 'Add another state', 'Alaska', 'AK-77');
    expect(
        backend.request!.pendingLicenses.map((l) => l.stateCode), ['AL', 'AK']);
    expect(backend.request!.pendingLicenses.first.barNumber, 'AL123');

    for (var i = 0; i < 2; i++) {
      await tapText(tester, 'Photo or PDF', at: i);
    }
    expect(backend.attached.where((s) => s.kind == DocKind.barLicense),
        hasLength(2));
    await tapText(tester, 'Continue');

    expect(find.text('Identity document'), findsWidgets);
    await tapText(tester, 'Take a photo'); // front
    await tapText(tester, 'Take a photo'); // back
    await tapText(tester, 'Continue');

    expect(find.text('Take a selfie'), findsOneWidget);
    await tapText(tester, 'Open camera');
    expect(source.captures, 3);
    await tapText(tester, 'Continue');

    expect(find.text('Check and submit'), findsOneWidget);
    expect(find.text('Alabama, Alaska'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Maiden name on ID');
    await tapText(tester, 'Submit for review');

    expect(backend.submitCalls, 1);
    expect(backend.lastComment, 'Maiden name on ID');
    // Back on the status screen, now pending.
    expect(find.text('Under review'), findsWidgets);
  });

  testWidgets('2. closing the app at step 3 resumes the saved draft',
      (tester) async {
    final backend = FakeVerificationBackend();
    await pumpApp(tester, backend);
    await tapText(tester, 'Start verification');
    await tapText(tester, 'Start');
    await addLicense(tester, 'Add a state', 'Alabama', '123');
    await tapText(tester, 'Photo or PDF');
    await tapText(tester, 'Continue');
    expect(find.text('Step 3 of 5'), findsOneWidget);
    await tapText(tester, 'Take a photo'); // front only, then "close the app"

    // App killed: a brand-new widget tree + providers, same server.
    await tester.pumpWidget(const SizedBox.shrink());
    await pumpApp(tester, backend);
    expect(find.text('Your draft is saved'), findsOneWidget);
    expect(find.text('0 of 3 parts complete'), findsNothing);
    expect(find.text('1 of 3 parts complete'), findsOneWidget);

    await tapText(tester, 'Continue');
    expect(backend.createCalls, 1, reason: 'the draft is reused');
    expect(find.text('Step 3 of 5'), findsOneWidget);
    expect(find.text('Identity document'), findsWidgets);
    // The front uploaded before closing is still there; back is missing.
    expect(find.text('Uploaded'), findsOneWidget);
  });

  testWidgets('3. needs_more_info: re-upload and resubmit', (tester) async {
    final backend = FakeVerificationBackend(
      status: VerificationStatus.pending,
      request: draft(
        identity: true,
        selfie: true,
        status: RequestStatus.needsMoreInfo,
        infoMessage: 'The ID photo is blurry, please re-upload the front.',
      ),
    );
    await pumpApp(tester, backend);

    expect(find.text('More information needed'), findsOneWidget);
    expect(
      find.text('The ID photo is blurry, please re-upload the front.'),
      findsOneWidget,
    );
    await tapText(tester, 'Add information');

    // Opens at review with the verifier's message.
    expect(find.text('Add information'), findsWidgets);
    expect(
      find.text('The ID photo is blurry, please re-upload the front.'),
      findsOneWidget,
    );
    await tapText(tester, 'Edit', at: 0); // licenses
    await tapText(tester, 'Continue');
    expect(find.text('Identity document'), findsWidgets);
    // Answering an info request adds files (up to 3), nothing is removed.
    expect(find.bySemanticsLabel('Remove file'), findsNothing);
    await tapText(tester, 'Take a photo', at: 0); // front
    expect(
      backend.request!
          .docsFor(
              DocSlot.identity(IdDocumentType.driversLicense, DocSide.front))
          .length,
      2,
    );
    await tapText(tester, 'Continue');
    await tapText(tester, 'Continue');
    await tapText(tester, 'Send the answer');

    expect(backend.submitCalls, 1);
    expect(backend.request!.status, RequestStatus.submitted);
    expect(find.text('Under review'), findsWidgets);
  });

  testWidgets('4. rejected: reason shown and a new request', (tester) async {
    final backend = FakeVerificationBackend(
      status: VerificationStatus.rejected,
      submissionsLast30Days: 1,
      request: VerificationRequest(
        id: 'old',
        status: RequestStatus.rejected,
        rejectionCode: 'name_mismatch',
        rejectionReason: 'The surname on the ID differs.',
        licenses: [
          license('AL',
              status: LicenseStatus.rejected,
              rejectionCode: 'license_not_found'),
        ],
        documents: const [],
      ),
    );
    await pumpApp(tester, backend);

    expect(find.text('Request declined'), findsOneWidget);
    expect(
      find.textContaining("Name doesn't match the documents"),
      findsOneWidget,
    );
    expect(
        find.textContaining('The surname on the ID differs.'), findsOneWidget);
    expect(find.textContaining('License not found in the state database'),
        findsOneWidget);
    expect(find.text('Requests in the last 30 days: 1 of 5.'), findsOneWidget);

    await tapText(tester, 'Submit a new request');
    expect(backend.createCalls, 1);
    expect(backend.request!.status, RequestStatus.draft);
    expect(find.text('Verify your license'), findsOneWidget);
  });

  testWidgets('4b. rejected with the 30-day limit used: no new request',
      (tester) async {
    final backend = FakeVerificationBackend(
      status: VerificationStatus.rejected,
      submissionsLast30Days: 5,
      request: VerificationRequest(
        id: 'old',
        status: RequestStatus.rejected,
        rejectionCode: 'other',
        licenses: const [],
        documents: const [],
      ),
    );
    await pumpApp(tester, backend);
    expect(
      find.text(
        "You've used all 5 requests for the last 30 days. Try again later.",
      ),
      findsOneWidget,
    );
    await tapText(tester, 'Submit a new request');
    expect(backend.createCalls, 0);
  });

  testWidgets('5. unfinished and infected files block submit', (tester) async {
    final backend = FakeVerificationBackend(
      request: draft(identity: true, selfie: true),
    );
    await pumpApp(tester, backend);
    await tapText(tester, 'Continue');
    expect(find.text('Check and submit'), findsOneWidget);

    // Add one more license file whose upload doesn't finish.
    await tapText(tester, 'Edit', at: 0);
    final gate = Completer<void>();
    backend
      ..uploadGate = gate
      ..nextScan = ScanState.infected;
    await tapText(tester, 'Photo or PDF');
    expect(find.text('Uploading… 40%'), findsOneWidget);
    await tapText(tester, 'Continue');
    await tapText(tester, 'Continue');
    await tapText(tester, 'Continue');
    await tapText(tester, 'Submit for review');
    expect(
      find.text('Wait until all files finish uploading and checking.'),
      findsOneWidget,
    );
    expect(backend.submitCalls, 0);

    // The upload finishes but the antivirus flags it.
    gate.complete();
    await tester.pumpAndSettle();
    await tapText(tester, 'Submit for review');
    expect(
      find.textContaining("didn't pass the security check"),
      findsWidgets,
    );
    expect(backend.submitCalls, 0);

    // Removing the infected file unblocks submission.
    await tapText(tester, 'Edit', at: 0);
    expect(
      find.text("The file didn't pass the security check. Remove it and "
          'upload another one.'),
      findsOneWidget,
    );
    await tester.tap(find.bySemanticsLabel('Remove file').last);
    await tester.pumpAndSettle();
    for (var i = 0; i < 3; i++) {
      await tapText(tester, 'Continue');
    }
    await tapText(tester, 'Submit for review');
    expect(backend.submitCalls, 1);
  });
}
