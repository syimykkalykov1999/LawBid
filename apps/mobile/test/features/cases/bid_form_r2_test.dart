import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart'
    show myFirmProvider;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import '../team/team_fakes.dart';
import 'cases_fakes.dart';

/// R2-A batch B (14.11): bid compose — «send as» shows the real sender,
/// cancelling the date picker keeps the previous choice, and leaving with
/// typed work asks «Save draft?».

class _Session extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'at',
        sub: 'me',
        role: 'attorney',
        sid: 's1',
        verified: true,
        subscriptionStatus: 'active',
        accessTokenExpiresAt: DateTime.utc(2100),
      );
}

class _Placed extends FakeCasesRepository {
  BidInput? placed;

  /// Firms audit 16.11 (PR-4): the server's answer instead of a bid.
  ApiException? fail;

  @override
  Future<CaseBid> placeBid(String caseId, BidInput input) async {
    placed = input;
    if (fail != null) throw fail!;
    return CaseBid(
      id: 'bid-1',
      caseId: caseId,
      attorneyId: 'me',
      status: BidStatus.active,
      feeType: input.feeType,
      amountCents: input.amountCents ?? 0,
      message: input.message,
      startAvailability: input.startAvailability,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 0,
      turn: PartyRole.client,
      createdAt: DateTime(2026, 11, 14),
    );
  }

  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: 'A case',
        description: 'Text.',
        practice: const PracticeRef(
          id: 'leaf-1',
          code: 'immigration',
          i18nKey: 'practice.immigration',
          nameEn: 'Practice',
        ),
        primaryStateCode: 'NY',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 0,
        createdAt: DateTime(2026, 9, 20),
        isNew: false,
        hasOwnBid: false,
      );
}

api.FirmMemberDto _member(String id, String first, api.FirmMemberDtoRole r) =>
    api.FirmMemberDto(
      attorneyId: id,
      firstName: first,
      lastName: 'Doe',
      role: r,
      status: api.FirmMemberDtoStatus.active,
      states: const ['NY'],
    );

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  Finder key(String k) => find.byKey(ValueKey(k));

  Future<({_Placed cases, FakeTeamRepository team})> pump(
    WidgetTester t, {
    List<api.FirmMemberDto> fit = const [],
    String? ownerId,
  }) async {
    t.view.physicalSize = const Size(390, 2600);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final cases = _Placed();
    final team = FakeTeamRepository();
    final members = [
      _member(
        'me',
        'Ann',
        ownerId == 'me'
            ? api.FirmMemberDtoRole.owner
            : api.FirmMemberDtoRole.member,
      ),
      ...fit,
    ];
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: attorneyMe(),
      extra: <Override>[
        ...casesOverrides(repo: cases),
        sessionControllerProvider.overrideWith(_Session.new),
        teamRepositoryProvider.overrideWithValue(team),
        firmSendersProvider.overrideWith((ref, caseId) async => fit),
        myFirmProvider.overrideWith(
          (ref) async => ownerId == null
              ? null
              : api.FirmDto(
                  id: 'f1',
                  name: 'Doe LLP',
                  ownerId: ownerId,
                  states: const ['NY'],
                  members: members,
                  inviteExpiresAt: null,
                ),
        ),
      ],
    );
    final router = GoRouter(
      initialLocation: '/case',
      routes: [
        GoRoute(
          path: '/case',
          builder: (context, _) => Scaffold(
            body: TextButton(
              key: const ValueKey('open-bid'),
              onPressed: () => context.push('/case/bid'),
              child: const Text('case'),
            ),
          ),
          routes: [
            GoRoute(
              path: 'bid',
              builder: (_, __) => const BidFormScreen(caseId: 'case-1'),
            ),
          ],
        ),
        GoRoute(
          path: '/bid/:id',
          builder: (_, __) => const Scaffold(body: Text('bid page')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await t.pumpWidget(
      wrap(MaterialApp.router(theme: AppTheme.light(), routerConfig: router)),
    );
    await t.pumpAndSettle();
    await t.tap(key('open-bid'));
    await t.pumpAndSettle();
    return (cases: cases, team: team);
  }

  Future<void> typeMessage(WidgetTester t) async {
    final fields = find.byType(EditableText);
    await t.enterText(
      fields.at(t.widgetList(fields).length - 2),
      'I handle such cases every week and will take this one.',
    );
    await t.pump();
  }

  Future<void> tapBack(WidgetTester t) async {
    await t.tap(find.byType(AppBackButton));
    await t.pumpAndSettle();
  }

  group('#21 leaving with typed work', () {
    testWidgets('nothing typed: back leaves at once', (t) async {
      await pump(t);
      await tapBack(t);
      expect(find.byType(BidFormScreen), findsNothing);
      expect(key('bid-leave-save'), findsNothing);
    });

    testWidgets('typed text: «Save draft» saves on the server and leaves',
        (t) async {
      final r = await pump(t);
      await typeMessage(t);
      await tapBack(t);
      expect(key('bid-leave-save'), findsOneWidget);
      await t.tap(key('bid-leave-save'));
      await t.pumpAndSettle();
      expect(
        r.team.calls.where((c) => c.startsWith('draft:case-1')),
        hasLength(1),
      );
      expect(find.byType(BidFormScreen), findsNothing);
    });

    testWidgets('«Discard» leaves without a draft', (t) async {
      final r = await pump(t);
      await typeMessage(t);
      await tapBack(t);
      await t.tap(key('bid-leave-discard'));
      await t.pumpAndSettle();
      expect(r.team.calls.where((c) => c.startsWith('draft:')), isEmpty);
      expect(find.byType(BidFormScreen), findsNothing);
    });

    testWidgets('«Keep editing» stays with the text', (t) async {
      await pump(t);
      await typeMessage(t);
      await tapBack(t);
      await t.tap(key('bid-leave-stay'));
      await t.pumpAndSettle();
      expect(find.byType(BidFormScreen), findsOneWidget);
      expect(
        find.text('I handle such cases every week and will take this one.'),
        findsOneWidget,
      );
    });

    testWidgets('the system back asks too', (t) async {
      await pump(t);
      await typeMessage(t);
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(key('bid-leave-save'), findsOneWidget);
      expect(find.byType(BidFormScreen), findsOneWidget);
    });
  });

  group('#21 date picker', () {
    testWidgets('cancel keeps the previous start choice', (t) async {
      await pump(t);
      List<AppChip> chips() =>
          t.widgetList<AppChip>(find.byType(AppChip)).toList();
      final before = chips().map((c) => c.selected).toList();
      expect(before.first, isTrue);
      await t.ensureVisible(find.byType(AppChip).last);
      await t.tap(find.byType(AppChip).last);
      await t.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      await t.tap(find.text('Cancel'));
      await t.pumpAndSettle();
      expect(chips().map((c) => c.selected).toList(), before);
    });
  });

  group('#4 send as', () {
    final other = _member('colleague', 'Bob', api.FirmMemberDtoRole.member);

    testWidgets('a plain member sees no picker and the bid is theirs',
        (t) async {
      final r = await pump(t, fit: [other], ownerId: 'boss');
      expect(key('bid-send-as'), findsNothing);
      await t.enterText(key('pay-field-amount'), '3000');
      await t.pump();
      await typeMessage(t);
      await t.ensureVisible(find.byType(GavelStrikeButton));
      await t.tap(find.byType(GavelStrikeButton));
      await t.pumpAndSettle();
      expect(r.cases.placed, isNotNull);
      expect(r.cases.placed!.sendAsAttorneyId, isNull);
    });

    testWidgets('the owner whose licence does not fit sees «me» first',
        (t) async {
      // Only the colleague fits the case; the owner is not in the list.
      final r = await pump(t, fit: [other], ownerId: 'me');
      expect(key('bid-send-as'), findsOneWidget);
      final field = t.widget<DropdownButtonFormField<String>>(
        key('bid-send-as'),
      );
      expect(field.initialValue, 'me');
      expect(find.textContaining('Ann Doe'), findsOneWidget);
      await t.enterText(key('pay-field-amount'), '3000');
      await t.pump();
      await typeMessage(t);
      await t.ensureVisible(find.byType(GavelStrikeButton));
      await t.tap(find.byType(GavelStrikeButton));
      await t.pumpAndSettle();
      expect(r.cases.placed!.sendAsAttorneyId, isNull);
    });

    testWidgets('the owner picks a colleague: the bid goes as them', (t) async {
      final r = await pump(t, fit: [other], ownerId: 'me');
      await t.ensureVisible(key('bid-send-as'));
      await t.tap(key('bid-send-as'));
      await t.pumpAndSettle();
      await t.tap(find.text('Bob Doe').last);
      await t.pumpAndSettle();
      await t.enterText(key('pay-field-amount'), '3000');
      await t.pump();
      await typeMessage(t);
      await t.ensureVisible(find.byType(GavelStrikeButton));
      await t.tap(find.byType(GavelStrikeButton));
      await t.pumpAndSettle();
      expect(r.cases.placed!.sendAsAttorneyId, 'colleague');
    });

    // Firms audit 16.11 (PR-4, owner): one bid per firm per case.
    testWidgets('a colleague already bid: «Присоединиться» joins his bid',
        (t) async {
      final r = await pump(t);
      r.cases.fail = const ApiException(
        code: ApiErrorCodes.firmBidExists,
        message: 'A colleague from your firm has already bid on this case.',
        statusCode: 409,
        details: {
          'bidId': 'bid-9',
          'attorneyId': 'att-2',
          'firstName': 'Bob',
          'lastName': 'Roe',
        },
      );
      await t.enterText(key('pay-field-amount'), '3000');
      await t.pump();
      await typeMessage(t);
      await t.ensureVisible(find.byType(GavelStrikeButton));
      await t.tap(find.byType(GavelStrikeButton));
      await t.pumpAndSettle();
      expect(
        find.text('Your colleague has already placed a bid'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Bob Roe has already sent it'),
        findsOneWidget,
      );
      await t.tap(find.text('Join'));
      await t.pumpAndSettle();
      expect(r.cases.calls, contains('joinFirmBid:bid-9'));
    });
  });
}
