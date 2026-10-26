import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';

import 'verification_fakes.dart';

/// Owner 2026-10-18: the license sheet never reveals a state's format; a
/// refused number counts as an attempt, 5 lock adding one for an hour, and
/// «My number is correct — send it for review» sends the number, the state
/// and the bar card photo (+ a note) to a person, also while locked.
void main() {
  final theme = AppTheme.light();

  Future<void> tapText(WidgetTester tester, String text) async {
    final finder = find.text(text).last;
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  /// Wizard → licenses step → the open «Add a state» sheet.
  Future<void> openSheet(
    WidgetTester tester,
    FakeVerificationBackend backend, {
    FakeDocumentSource? source,
  }) async {
    tester.view.physicalSize = const Size(390, 844) * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      verificationApp(backend: backend, theme: theme, source: source),
    );
    await tester.pumpAndSettle();
    await tapText(tester, 'Start verification');
    await tapText(tester, 'Start');
    await tapText(tester, 'Add a state');
  }

  Future<void> fill(WidgetTester tester, String stateName, String bar) async {
    await tester.tap(find.text('Choose a state'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(stateName).last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, bar);
    await tester.pumpAndSettle();
  }

  bool enabled(WidgetTester tester, String label) => tester
      .widget<AppButton>(find.widgetWithText(AppButton, label).last)
      .isEnabled;

  testWidgets('no format hint or example while typing, only the neutral helper',
      (tester) async {
    final backend = FakeVerificationBackend();
    await openSheet(tester, backend);
    await fill(tester, 'Alabama', 'NOFMT');
    expect(find.text('Letters and digits as on your license.'), findsOneWidget);
    expect(find.textContaining('nusual'), findsNothing);
    // No example of the state's number anywhere (Alabama's would be ASB…).
    expect(find.textContaining('ASB'), findsNothing);
    expect(
      find.text('My number is correct — send it for review'),
      findsNothing,
    );
  });

  testWidgets(
      'a refused number shows the generic error and opens the manual path '
      'with the bar card and a note', (tester) async {
    final backend = FakeVerificationBackend();
    final source = FakeDocumentSource();
    await openSheet(tester, backend, source: source);
    await fill(tester, 'Alabama', 'NOFMT');
    await tapText(tester, 'Add license');
    expect(find.text('Bar number not found for this state.'), findsOneWidget);
    expect(backend.request!.pendingLicenses, isEmpty);

    await tapText(tester, 'My number is correct — send it for review');
    expect(find.text('Manual number check'), findsOneWidget);
    expect(find.text('Photo of your bar card'), findsOneWidget);
    // The card photo is required.
    expect(enabled(tester, 'Send for review'), isFalse);
    await tapText(tester, 'Take a photo');
    expect(source.captures, 1);
    expect(find.text('photo.jpg'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Issued in 1998');
    await tester.pumpAndSettle();
    expect(enabled(tester, 'Send for review'), isTrue);
    await tapText(tester, 'Send for review');

    expect(backend.lastManualReview, isTrue);
    final lic = backend.request!.pendingLicenses.single;
    expect(lic.stateCode, 'AL');
    expect(lic.manualReview, isTrue);
    expect(backend.attached.single, const DocSlot.barLicense('AL'));
    expect(backend.lastNote, 'Issued in 1998');
    // The sheet closed; the card shows on the license.
    expect(find.text('Manual number check'), findsNothing);
  });

  testWidgets(
      'locked: «Add» is off with the time left, manual review still works',
      (tester) async {
    final backend = FakeVerificationBackend()..lockSeconds = 47 * 60;
    final source = FakeDocumentSource();
    await openSheet(tester, backend, source: source);
    await fill(tester, 'Alabama', '1234567');
    expect(
      find.text('Too many attempts. Try again in 47 min.'),
      findsOneWidget,
    );
    expect(enabled(tester, 'Add license'), isFalse);
    await tester.tap(find.text('Add license').last);
    await tester.pumpAndSettle();
    expect(backend.lastManualReview, isNull);

    await tapText(tester, 'My number is correct — send it for review');
    await tapText(tester, 'Photo or PDF');
    await tapText(tester, 'Send for review');
    expect(backend.lastManualReview, isTrue);
    expect(backend.request!.pendingLicenses.single.manualReview, isTrue);
    expect(backend.lastNote, isNull);
  });

  testWidgets('the 5th refusal locks: the time left appears at once',
      (tester) async {
    final backend = FakeVerificationBackend();
    await openSheet(tester, backend);
    await fill(tester, 'Alabama', '1234567');
    backend.lockSeconds = 3600;
    await tapText(tester, 'Add license');
    expect(
      find.text('Too many attempts. Try again in 60 min.'),
      findsOneWidget,
    );
    expect(enabled(tester, 'Add license'), isFalse);
    expect(
      find.text('My number is correct — send it for review'),
      findsOneWidget,
    );
  });
}
