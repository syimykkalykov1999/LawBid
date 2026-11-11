import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../helpers/onboarding_harness.dart';
import '../../profile/profile_fakes.dart';
import '../cases_fakes.dart';
import '../support/fake_case_files_remote.dart';

/// Owner 2026-11-05: the case screen of both profiles at both stages, at the
/// narrowest width, in English (the test fonts draw it everywhere).
const _practice = PracticeRef(
  id: 'leaf-1',
  code: 'traffic',
  i18nKey: 'practice.traffic',
  nameEn: 'Traffic',
);

CaseBid _bid(BidStatus status) => CaseBid(
      id: 'bid-1',
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: status,
      feeType: FeeType.fixed,
      amountCents: 60000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 0,
      turn: PartyRole.client,
      createdAt: DateTime(2026, 9, 20),
    );

class _Repo extends FakeCasesRepository {
  _Repo(this.status, {this.accepted, this.ownBid});

  final CaseStatus status;
  final CaseBid? accepted;
  final String? ownBid;

  @override
  Future<OwnerCase> ownerCase(String caseId) async => OwnerCase(
        id: caseId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week.',
        practice: _practice,
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        status: status,
        viewCount: 1,
        bidsCount: 1,
        createdAt: DateTime(2026, 9, 2),
        lastActivityAt: DateTime(2026, 9, 2),
        acceptedBid: accepted,
        conversationId: accepted == null ? null : 'conv-1',
      );

  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week.',
        practice: _practice,
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        status: status,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1,
        createdAt: DateTime(2026, 9, 20),
        isNew: false,
        hasOwnBid: ownBid != null,
        ownBidId: ownBid,
      );

  @override
  Future<CaseBid> bid(String bidId) async => _bid(BidStatus.active);

  @override
  Future<void> recordViews(List<String> caseIds) async {}
}

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  final screens = <String, (Widget, _Repo, String?)>{
    'client_open_overview': (
      const OwnerCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.open),
      null,
    ),
    'client_work_overview': (
      const OwnerCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.inProgress, accepted: _bid(BidStatus.accepted)),
      null,
    ),
    'client_work_files': (
      const OwnerCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.inProgress, accepted: _bid(BidStatus.accepted)),
      'Files',
    ),
    'attorney_open_overview': (
      const AttorneyCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.open),
      null,
    ),
    'attorney_open_changes': (
      const AttorneyCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.open, ownBid: 'bid-1'),
      'Changes',
    ),
    'attorney_work_overview': (
      const WorkCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.inProgress),
      null,
    ),
    'attorney_work_tasks': (
      const WorkCaseScreen(caseId: 'case-1'),
      _Repo(CaseStatus.inProgress),
      'Tasks',
    ),
  };

  for (final e in screens.entries) {
    testWidgets(e.key, (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: [
          ...casesOverrides(repo: e.value.$2),
          caseFilesProvider('case-1').overrideWith((ref) async => const []),
          caseFilesRemoteProvider
              .overrideWithValue(FakeCaseFilesRemote(const [])),
          caseTasksProvider('case-1').overrideWith(
            (ref) async => const api.CaseTasksDto(
              role: api.CaseTasksDtoRole.attorney,
              forClient: [],
              shared: [],
              joint: [],
              private: [],
              canEdit: true,
            ),
          ),
          caseWorkspaceProvider('case-1').overrideWith(
            (ref) async => const api.CaseWorkspaceDto(
              role: api.CaseWorkspaceDtoRole.attorney,
              files: [],
              openTasks: 0,
              updatesCount: 0,
              publishedAt: '2026-09-20T00:00:00.000Z',
              bidsCount: 1,
              newUpdates: 0,
              canWrite: true,
            ),
          ),
        ],
      );
      await tester.pumpWidget(wrap(e.value.$1));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));
      final section = e.value.$3;
      if (section != null) {
        await tester.tap(
          find.descendant(
            of: find.byKey(const ValueKey('case-sections')),
            matching: find.text(section),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
      }
      await expectLater(
        find.byType(Scaffold).first,
        matchesGoldenFile('goldens/case_screen_${e.key}.png'),
      );
    });
  }
}
