import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/deals/deal_record_format.dart';
import 'package:lawbid/features/cases/deals/deal_record_screen.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../helpers/ux_harness.dart';

/// Deal record 2026-10-27: the signing screen. The Confirm button is grey
/// (disabled) until a signature is drawn, then takes the app accent; a
/// record that is not the viewer's turn shows no pad at all.
api.DealRecordDto _record({
  bool myTurn = true,
  api.DealRecordStatus status = api.DealRecordStatus.awaitingSignatures,
  String clientName = 'Anna Petrova',
}) =>
    api.DealRecordDto(
      id: 'd1',
      caseId: 'c1',
      bidId: 'b1',
      status: status,
      acceptedBy: api.PartyRole.client,
      myRole: api.PartyRole.client,
      myTurnToSign: myTurn,
      recordCode: '7b7d2f4e-abcdef01',
      snapshotSha256: 'a' * 64,
      sealedSha256: null,
      textVersion: 0,
      acceptedAt: DateTime.utc(2026, 10, 27, 19, 40),
      caseValue: const api.DealCaseDto(
        title: 'Speeding ticket in Trenton',
        practice: 'Traffic',
        states: ['NJ'],
      ),
      client: api.DealPartyDto(
        fullName: clientName,
        email: 'anna@example.com',
        username: 'anna',
      ),
      attorney: const api.DealAttorneyDto(
        fullName: 'John Smith',
        email: 'john@example.com',
        username: 'johns',
        barState: 'NJ',
        barNumber: '12345',
        firmName: null,
      ),
      terms: const api.DealTermsDto(
        feeType: api.FeeType.fixed,
        amountCents: 60000,
        percentBps: null,
        paymentTerms: null,
      ),
      history: [
        api.DealOfferDto(
          feeType: api.FeeType.fixed,
          amountCents: 60000,
          percentBps: null,
          paymentTerms: null,
          roundNo: 0,
          fromRole: api.PartyRole.attorney,
          createdAt: DateTime.utc(2026, 10, 25, 14, 2),
          message: 'I handle NJ speeding tickets every week.',
          status: 'countered',
        ),
        api.DealOfferDto(
          feeType: api.FeeType.fixed,
          amountCents: 60000,
          percentBps: null,
          paymentTerms: null,
          roundNo: 1,
          fromRole: api.PartyRole.client,
          createdAt: DateTime.utc(2026, 10, 27, 19, 40),
          message: null,
          status: 'accepted',
        ),
      ],
      notContractText: 'This is not a contract.',
      footerText: 'LawBid is a listing board.',
      signatures: const [],
      unsignedUrl: 'https://files.test/u.pdf',
      sealedUrl: null,
      sealedFileId: null,
      unsignedFileId: 'f1',
      agreementFileId: null,
      agreementUrl: null,
      declineReason: null,
      failedReason: null,
      createdAt: DateTime.utc(2026, 10, 27, 19, 40),
      sealedAt: null,
      declinedAt: null,
    );

Future<void> main() async {
  setUpAll(initializeDateFormatting);

  Future<void> open(WidgetTester tester, api.DealRecordDto r) =>
      tester.pumpWidget(
        uxApp(
          Scaffold(body: DealRecordBody(record: r)),
          theme: AppTheme.light(),
          size: const Size(390, 1400),
        ),
      );

  testWidgets('Confirm is grey until a signature is drawn, then accent',
      (tester) async {
    await open(tester, _record());
    await tester.pumpAndSettle();
    final finder = find.byType(DealConfirmButton);
    await tester.scrollUntilVisible(
      finder,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(finder, findsOneWidget);
    expect(tester.widget<DealConfirmButton>(finder).enabled, isFalse);
    expect(find.text('Confirm'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    // The three consent lines, in the user's language.
    expect(find.text('This is not a contract'), findsOneWidget);
    expect(
      find.text(
          'By signing I confirm this record of the negotiation is accurate'),
      findsOneWidget,
    );

    // Draw: the pad grabs the pointer, one stroke is enough.
    final pad = find.bySemanticsLabel(RegExp('Signature pad'));
    await tester.scrollUntilVisible(
      pad,
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(pad, findsOneWidget);
    final center = tester.getCenter(pad);
    final gesture = await tester.startGesture(center);
    await gesture.moveBy(const Offset(40, 10));
    await gesture.moveBy(const Offset(30, -8));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(tester.widget<DealConfirmButton>(finder).enabled, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('not my turn: no pad, no Confirm, the status says so',
      (tester) async {
    await open(tester, _record(myTurn: false));
    await tester.pumpAndSettle();
    expect(find.byType(DealConfirmButton), findsOneWidget);
    expect(
      tester.widget<DealConfirmButton>(find.byType(DealConfirmButton)).enabled,
      isFalse,
    );
    expect(find.bySemanticsLabel(RegExp('Signature pad')), findsNothing);
    expect(find.text('Awaiting the other party'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('history is grouped by day; earlier days collapsed',
      (tester) async {
    final r = _record();
    await open(tester, r);
    await tester.pumpAndSettle();
    // Two days, the latest open: the first offer's message is hidden.
    expect(DealRecordFormat.byDay(r.history).length, 2);
    expect(find.text('I handle NJ speeding tickets every week.'), findsNothing);
    await tester.tap(find.text('Messages: 1').first);
    await tester.pumpAndSettle();
    expect(
        find.text('I handle NJ speeding tickets every week.'), findsOneWidget);
  });

  testWidgets('a sealed record shows no pad and no Decline', (tester) async {
    await open(
      tester,
      _record(myTurn: false, status: api.DealRecordStatus.valueSealed),
    );
    await tester.pumpAndSettle();
    expect(find.byType(DealConfirmButton), findsNothing);
    expect(find.text('Decline'), findsNothing);
    expect(find.text('Sealed'), findsWidgets);
  });
}
