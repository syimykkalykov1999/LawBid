import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/invites_providers.dart';
import 'package:lawbid/features/cases/data/invites_repository.dart';
import 'package:lawbid/features/cases/domain/case_invite.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_invites_section.dart';
import 'package:lawbid/features/cases/presentation/widgets/invites_list.dart';
import 'package:lawbid/features/cases/presentation/widgets/offer_case_sheet.dart';

import 'cases_fakes.dart';

/// Practice names come from the server's bundle; here the key stands in.
class _Translator extends StaticTranslatorEn {
  const _Translator();

  @override
  String t(String key, [Map<String, String>? params]) =>
      key.startsWith('practice.') ? key : super.t(key, params);
}

CaseSummary summary({String id = 'case-1', String state = 'CA'}) => CaseSummary(
      id: id,
      title: 'Speeding ticket in Fresno',
      practice: const PracticeRef(
        id: 'p-traffic',
        code: 'traffic',
        i18nKey: 'practice.general_practice.not_sure_or_other',
        nameEn: 'Traffic',
      ),
      primaryStateCode: state,
      additionalStateCount: 0,
      city: null,
      status: CaseStatus.open,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      bidsCount: 0,
      createdAt: DateTime(2026, 10, 4),
      lastActivityAt: DateTime(2026, 10, 4),
    );

CaseInvite invite({
  String id = 'inv-1',
  InviteStatus status = InviteStatus.pending,
  int? budgetCents = 150000,
  String? declineReason,
  BidAttorney? attorney,
}) =>
    CaseInvite(
      id: id,
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: status,
      expiresAt: DateTime(2026, 10, 12),
      createdAt: DateTime(2026, 10, 5),
      caseTitle: 'Speeding ticket in Fresno',
      casePracticeKey: 'practice.general_practice.not_sure_or_other',
      caseStateCodes: const ['CA'],
      message: 'Please help, court date is next month.',
      budgetCents: budgetCents,
      declineReason: declineReason,
      outsideLicensedStates: true,
      attorney: attorney,
    );

class FakeInvitesRepository implements InvitesRepository {
  FakeInvitesRepository({this.items = const [], this.sendError});

  List<CaseInvite> items;
  ApiException? sendError;
  final List<String> calls = [];

  @override
  Future<CaseInvite> send(
    String caseId, {
    required String attorneyId,
    String? message,
    int? budgetCents,
  }) async {
    calls.add('send:$caseId:$attorneyId:$budgetCents:${message ?? ''}');
    final error = sendError;
    if (error != null) throw error;
    return invite(budgetCents: budgetCents);
  }

  @override
  Future<List<CaseInvite>> forCase(String caseId) async => items;

  @override
  Future<List<CaseInvite>> pending() async =>
      items.where((i) => i.isPending).toList();

  @override
  Future<CaseInvite> decline(String id, {String? reason}) async {
    calls.add('decline:$id:${reason ?? ''}');
    items = [];
    return invite(status: InviteStatus.declined);
  }

  @override
  Future<CaseInvite> cancel(String id) async {
    calls.add('cancel:$id');
    items = [invite(status: InviteStatus.cancelled)];
    return items.single;
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    required FakeInvitesRepository invites,
    List<CaseSummary> cases = const [],
  }) async {
    tester.view.physicalSize = const Size(390, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final overrides = <Override>[
      translatorProvider.overrideWithValue(const _Translator()),
      ...casesOverrides(repo: FakeCasesRepository(myCasesItems: cases)),
      invitesRepositoryProvider.overrideWithValue(invites),
    ];
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: child),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Widget opener() => Builder(
        builder: (context) => TextButton(
          onPressed: () => showOfferCaseSheet(
            context,
            attorneyId: 'att-1',
            attorneyName: 'Jane Doe',
            licensedStateCodes: const {'NY'},
            practiceIds: const {'p-traffic'},
          ),
          child: const Text('OPEN'),
        ),
      );

  group('offer a case (client)', () {
    testWidgets('pick a case, see the state note, send with a budget',
        (tester) async {
      final repo = FakeInvitesRepository();
      await pump(tester, opener(), invites: repo, cases: [summary()]);
      await tester.tap(find.text('OPEN'));
      await tester.pumpAndSettle();
      expect(find.text('Offer a case to Jane Doe'), findsOneWidget);
      final send = tester.widget<AppButton>(
        find.byKey(const ValueKey('offer-send')),
      );
      expect(send.isEnabled, isFalse);

      await tester.tap(find.byKey(const ValueKey('offer-case-case-1')));
      await tester.pumpAndSettle();
      // CA case, attorney licensed in NY only.
      expect(
        find.text(const StaticTranslatorEn().t('invite.mismatch.state')),
        findsOneWidget,
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('offer-budget')),
          matching: find.byType(EditableText),
        ),
        '1500',
      );
      await tester.tap(find.byKey(const ValueKey('offer-send')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['send:case-1:att-1:150000:']);
      expect(find.byType(OfferCaseSheet), findsNothing);
    });

    testWidgets('no open cases: offers to create one', (tester) async {
      await pump(tester, opener(), invites: FakeInvitesRepository());
      await tester.tap(find.text('OPEN'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('offer-create-case')), findsOneWidget);
      expect(find.byKey(const ValueKey('offer-send')), findsNothing);
    });

    testWidgets('an attorney who already bid: a clear message', (tester) async {
      final repo = FakeInvitesRepository(
        sendError: const ApiException(
          code: ApiErrorCodes.bidAlreadyExists,
          message: 'exists',
        ),
      );
      await pump(tester, opener(), invites: repo, cases: [summary()]);
      await tester.tap(find.text('OPEN'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('offer-case-case-1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('offer-send')));
      await tester.pumpAndSettle();
      expect(
        find.text(const StaticTranslatorEn().t('invite.offer.alreadyBid')),
        findsOneWidget,
      );
      expect(find.byType(OfferCaseSheet), findsOneWidget);
    });
  });

  group('invites (attorney)', () {
    testWidgets('a pending invite shows budget, note, mismatch; decline',
        (tester) async {
      final repo = FakeInvitesRepository(items: [invite()]);
      await pump(tester, const InvitesList(), invites: repo);
      expect(find.byKey(const ValueKey('invite-inv-1')), findsOneWidget);
      expect(find.textContaining(r'$1,500'), findsOneWidget);
      expect(
        find.text('Please help, court date is next month.'),
        findsOneWidget,
      );
      // Owner 2026-10-05: the case file with the "open after you accept" rule.
      expect(
        find.byKey(const ValueKey('invite-dossier-inv-1')),
        findsOneWidget,
      );
      expect(
        find.textContaining('as soon as you accept this offer'),
        findsOneWidget,
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('invite-decline-inv-1')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('invite-decline-inv-1')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('invite-decline-reason')),
          matching: find.byType(EditableText),
        ),
        'Too busy this month',
      );
      await tester.tap(find.byKey(const ValueKey('invite-decline-confirm')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['decline:inv-1:Too busy this month']);
      expect(find.byKey(const ValueKey('invites-empty')), findsOneWidget);
    });

    testWidgets('no invites: an empty state', (tester) async {
      await pump(
        tester,
        const InvitesList(),
        invites: FakeInvitesRepository(),
      );
      expect(find.byKey(const ValueKey('invites-empty')), findsOneWidget);
    });
  });

  group('invites on the client case', () {
    const attorney = BidAttorney(
      id: 'att-1',
      username: 'jdoe',
      firstName: 'Jane',
      lastName: 'Doe',
      avatarUrl: null,
      verifiedBadge: true,
      ratingAvg: 4.8,
      ratingCount: 12,
      licensedStates: ['NY'],
    );

    testWidgets('status and cancel while pending', (tester) async {
      final repo = FakeInvitesRepository(items: [invite(attorney: attorney)]);
      await pump(
        tester,
        const CaseInvitesSection(caseId: 'case-1'),
        invites: repo,
      );
      expect(find.text('Jane Doe'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('case-invite-cancel-inv-1')));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('case-invite-cancel-confirm')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['cancel:inv-1']);
      expect(
        find.byKey(const ValueKey('case-invite-cancel-inv-1')),
        findsNothing,
      );
    });

    testWidgets('a declined invite shows the reason', (tester) async {
      await pump(
        tester,
        const CaseInvitesSection(caseId: 'case-1'),
        invites: FakeInvitesRepository(
          items: [
            invite(
              status: InviteStatus.declined,
              declineReason: 'Too busy',
              attorney: attorney,
            ),
          ],
        ),
      );
      expect(find.textContaining('Too busy'), findsOneWidget);
    });

    testWidgets('no invites: nothing shown', (tester) async {
      await pump(
        tester,
        const CaseInvitesSection(caseId: 'case-1'),
        invites: FakeInvitesRepository(),
      );
      expect(find.byKey(const ValueKey('case-invites')), findsNothing);
    });
  });
}
