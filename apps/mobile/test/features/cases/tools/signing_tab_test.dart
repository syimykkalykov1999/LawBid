import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid/features/cases/tools/signing_tab.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../helpers/ux_harness.dart';

api.SignRequestDto _req(
  String id,
  String title,
  api.SignRequestDtoStatus status, {
  bool canSign = false,
  bool canCancel = false,
  List<api.SignatureDto> signatures = const [],
  String? reason,
}) =>
    api.SignRequestDto(
      id: id,
      title: title,
      status: status,
      createdByRole: api.SignRequestDtoCreatedByRole.attorney,
      createdAt: DateTime.utc(2026, 10, 18, 10),
      completedAt: null,
      sourceUrl: 'https://files.test/$id.pdf',
      finalUrl: null,
      sourceSha256: 'a' * 64,
      finalSha256: null,
      signatures: signatures,
      canSign: canSign,
      canDecline: canSign,
      canCancel: canCancel,
      declinedByRole:
          reason == null ? null : api.SignRequestDtoDeclinedByRole.client,
      declineReason: reason,
    );

Future<void> main() async {
  setUpAll(initializeDateFormatting);

  Future<void> open(
    WidgetTester tester,
    List<api.SignRequestDto> list, {
    bool isAttorney = true,
    double scale = 1,
  }) =>
      tester.pumpWidget(
        uxApp(
          Scaffold(
            body: SingleChildScrollView(
              child: SigningTab(caseId: 'c1', isAttorney: isAttorney),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(360, 800),
          textScale: scale,
          overrides: [
            signRequestsProvider('c1').overrideWith((ref) async => list),
          ],
        ),
      );

  testWidgets('statuses, signers and the buttons the server allows',
      (tester) async {
    await open(tester, [
      _req(
        'r1',
        'Retainer',
        api.SignRequestDtoStatus.pending,
        canSign: true,
        canCancel: true,
        signatures: [
          api.SignatureDto(
            role: api.SignatureDtoRole.attorney,
            name: 'Ann Lee',
            method: api.SignatureDtoMethod.typed,
            signedAt: DateTime.utc(2026, 10, 19, 9),
          ),
        ],
      ),
      _req(
        'r2',
        'NDA',
        api.SignRequestDtoStatus.declined,
        reason: 'Wrong date',
      ),
      _req('r3', 'Old', api.SignRequestDtoStatus.canceled),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('Retainer'), findsOneWidget);
    expect(find.text('Waiting for signatures'), findsOneWidget);
    expect(find.textContaining('Ann Lee'), findsOneWidget);
    expect(find.text('Waiting for Client'), findsOneWidget);
    expect(find.text('Sign'), findsOneWidget);
    expect(find.text('Get signed'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    expect(find.text('Withdraw'), findsOneWidget);
    expect(find.text('Declined'), findsOneWidget);
    expect(find.text('Reason: Wrong date'), findsOneWidget);
    expect(find.text('Canceled'), findsOneWidget);
    expect(find.text('From template'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no sign button when the server says no; client has no templates',
      (tester) async {
    await open(
      tester,
      [_req('r1', 'Retainer', api.SignRequestDtoStatus.pending)],
      isAttorney: false,
    );
    await tester.pumpAndSettle();
    expect(find.text('Decline'), findsNothing);
    expect(find.text('Sign document'), findsNothing);
    expect(find.text('From template'), findsNothing);
  });

  testWidgets('the sign sheet needs a name, a signature and the consent',
      (tester) async {
    await open(tester, [
      _req('r1', 'Retainer', api.SignRequestDtoStatus.pending, canSign: true),
    ]);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign'));
    await tester.pumpAndSettle();
    expect(find.text('Sign document'), findsOneWidget);
    expect(find.text('Draw'), findsOneWidget);
    expect(find.text('Type'), findsOneWidget);
    expect(find.textContaining('ESIGN Act'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Signature pad')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty list and large text do not overflow at 360 dp',
      (tester) async {
    await open(tester, const [], scale: 2);
    await tester.pumpAndSettle();
    expect(find.text('No documents to sign yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
