import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

import 'cases_fakes.dart';

/// Owner 2026-10-22 (client economy plan, package E): a «Mine» list is
/// never reloaded whole — a `case:update` from the server or my own case
/// action is one `?updatedSince`; the changed rows merge, the ones that
/// left the tab go; a test fake without deltas still reloads the page.
CaseSummary _case(String id, {CaseStatus status = CaseStatus.open}) =>
    CaseSummary(
      id: id,
      title: 'Speeding ticket $id',
      practice: const PracticeRef(
        id: 'p-traffic',
        code: 'traffic',
        i18nKey: 'practice.general_practice.not_sure_or_other',
        nameEn: 'Traffic',
      ),
      primaryStateCode: 'CA',
      additionalStateCount: 0,
      city: null,
      status: status,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      bidsCount: 0,
      createdAt: DateTime(2026, 10, 4),
      lastActivityAt: DateTime(2026, 10, 4),
    );

class _SyncFake extends FakeCasesRepository implements CasesSyncRepository {
  _SyncFake(List<CaseSummary> items) : super(myCasesItems: items);

  SyncedPage<CaseSummary> changed = const SyncedPage(items: []);
  int changedCalls = 0;

  @override
  Future<SyncedPage<CaseSummary>> myCasesChangedSince(
    MyCasesFilter filter,
    DateTime since,
  ) async {
    changedCalls++;
    return changed;
  }

  @override
  Future<SyncedPage<MyBid>> myBidsChangedSince(
    MyBidsFilter filter,
    DateTime since,
  ) async =>
      const SyncedPage(items: []);

  @override
  Future<SyncedPage<WorkItem>> myWorkChangedSince(
    WorkFilter filter,
    DateTime since,
  ) async =>
      const SyncedPage(items: []);
}

class _Session extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'at',
        sub: 'u1',
        role: 'client',
        sid: 's1',
        verified: false,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );
}

void main() {
  late StreamController<RealtimeEvent> events;

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
  });

  ProviderContainer make(FakeCasesRepository repo) {
    final cache = CacheDatabase(NativeDatabase.memory());
    final c = ProviderContainer(
      overrides: [
        ...casesOverrides(repo: repo),
        realtimeClientProvider.overrideWithValue(null),
        realtimeEventsProvider.overrideWithValue(events.stream),
        sessionControllerProvider.overrideWith(_Session.new),
        cacheDatabaseProvider.overrideWithValue(cache),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await cache.close();
    });
    return c;
  }

  int pageReads(FakeCasesRepository r) =>
      r.calls.where((c) => c == 'myCases:active').length;

  Future<void> wait() => Future<void>.delayed(
        SyncedListNotifier.catchUpDelay + const Duration(milliseconds: 400),
      );

  test('case:update is one updatedSince: rows merge, deleted leave', () async {
    final repo = _SyncFake([_case('a'), _case('b')]);
    final c = make(repo);
    final sub = c.listen(myCasesProvider(MyCasesFilter.active), (_, __) {});
    addTearDown(sub.close);
    await c.read(myCasesProvider(MyCasesFilter.active).future);
    expect(pageReads(repo), 1);

    repo.changed = SyncedPage(
      items: [_case('a', status: CaseStatus.inProgress), _case('c')],
      deletedIds: const ['b'],
      syncedAt: DateTime.utc(2026, 10, 22, 12),
    );
    events
      ..add(
        const RealtimeEvent('case:update', {'caseId': 'a', 'kind': 'bid_new'}),
      )
      ..add(
        const RealtimeEvent('case:update', {'caseId': 'c', 'kind': 'updated'}),
      );
    await wait();
    expect(repo.changedCalls, 1, reason: 'a burst is one request');
    final items = c.read(myCasesProvider(MyCasesFilter.active)).value!.items;
    expect(items.map((x) => x.id).toSet(), {'a', 'c'});
    expect(items.firstWhere((x) => x.id == 'a').status, CaseStatus.inProgress);
    expect(repo.changedCalls, 1, reason: 'a burst is one request');
    expect(pageReads(repo), 1, reason: 'the page is not reloaded');
  });

  test('my own action: the lists ask a delta, nothing is reloaded', () async {
    final repo = _SyncFake([_case('a')]);
    final c = make(repo);
    final sub = c.listen(myCasesProvider(MyCasesFilter.active), (_, __) {});
    addTearDown(sub.close);
    await c.read(myCasesProvider(MyCasesFilter.active).future);
    c.read(caseListsTouchedProvider.notifier).bump();
    await wait();
    expect(repo.changedCalls, 1);
    expect(pageReads(repo), 1);
  });

  test('a repository without deltas reloads the page instead', () async {
    final repo = FakeCasesRepository(myCasesItems: [_case('a')]);
    final c = make(repo);
    final sub = c.listen(myCasesProvider(MyCasesFilter.active), (_, __) {});
    addTearDown(sub.close);
    await c.read(myCasesProvider(MyCasesFilter.active).future);
    events.add(
      const RealtimeEvent('case:update', {'caseId': 'a', 'kind': 'closed'}),
    );
    await wait();
    expect(pageReads(repo), 2);
  });

  test('the one card is re-read on its own event only', () async {
    final repo = _SyncFake(const []);
    final c = make(repo);
    final sub = c.listen(ownerCaseProvider('case-9'), (_, __) {});
    addTearDown(sub.close);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final before = repo.calls.where((x) => x.contains('ownerCase')).length;
    events.add(const RealtimeEvent('case:update', {'caseId': 'other'}));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(repo.calls.where((x) => x.contains('ownerCase')).length, before);
    events.add(const RealtimeEvent('case:update', {'caseId': 'case-9'}));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(repo.calls.where((x) => x.contains('ownerCase')).length, before + 1);
  });
}
