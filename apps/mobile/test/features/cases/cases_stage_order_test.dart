import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_list_filter_store.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cases_fakes.dart';

/// Owner 2026-11-09 («Дела → Активные»): the cases that show the stage
/// scale sort by it — the most advanced first (wrapping up, in progress,
/// bids, new), the newest activity first inside a stage. The phone copy
/// and every page follow the same order (the server sorts the same way);
/// «Done» keeps its order. Before this change the rows came as the server
/// sent them (by date), so a case «In work, stage 3 of 5» sat under two
/// «Open, stage 1 of 5» — this file is red on that code.
CaseSummary _case(
  String id, {
  required int day,
  CaseStatus status = CaseStatus.open,
  int bids = 0,
  int? activity,
}) =>
    CaseSummary(
      id: id,
      title: 'Case $id',
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
      bidsCount: bids,
      createdAt: DateTime(2026, 10, day),
      lastActivityAt: DateTime(2026, 10, activity ?? day),
    );

WorkItem _work(
  String id, {
  required int activity,
  CaseStatus status = CaseStatus.inProgress,
}) =>
    WorkItem(
      caseId: id,
      bidId: 'b$id',
      title: 'Work $id',
      status: status,
      clientName: null,
      feeType: FeeType.fixed,
      amountCents: 1000,
      lastActivityAt: DateTime(2026, 10, activity),
    );

/// The server's rows in the OLD order (newest created first) — what a
/// phone copy saved before this change holds, and what a server one
/// version older still sends.
class _ByDateRepo extends FakeCasesRepository {
  _ByDateRepo(this.cases, this.work);

  final List<CaseSummary> cases;
  final List<WorkItem> work;
  MineSearch? lastSearch;

  @override
  Future<CursorPage<CaseSummary>> myCases(
    MyCasesFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async {
    if (readingFromPhoneOnly) return CursorPage(items: cases);
    lastSearch = search;
    return CursorPage(items: cases);
  }

  @override
  Future<CursorPage<WorkItem>> myWork(
    WorkFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async =>
      CursorPage(items: work);
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

  // Newest created first (the old order): new (no bids), bids, in work,
  // wrapping up — the owner's screenshot had the «In work» card last.
  final byDate = [
    _case('fresh', day: 20),
    _case('bids', bids: 2, day: 19),
    _case('workQuiet', status: CaseStatus.inProgress, day: 18, activity: 10),
    _case('workBusy', status: CaseStatus.inProgress, day: 12, activity: 17),
    _case('pending', status: CaseStatus.pendingCompletion, day: 9),
  ];
  const wanted = ['pending', 'workBusy', 'workQuiet', 'bids', 'fresh'];

  test('comparator: stage first, then the newest activity, then the id', () {
    final order = caseSummaryOrder(MyCasesFilter.active, const MineSearch())!;
    final sorted = [...byDate]..sort(order);
    expect(sorted.map((c) => c.id), wanted);
    // Two cases of one stage and one moment: a stable tie-break by id.
    final a = _case('a', day: 5);
    final b = _case('b', day: 5);
    expect(order(a, b) > 0, isTrue);
    // «Done» keeps its date order; the «Дата» filter reorders any tab.
    expect(
      ([...byDate]..sort(
              caseSummaryOrder(MyCasesFilter.completed, const MineSearch()),
            ))
          .map((c) => c.id),
      ['fresh', 'bids', 'workQuiet', 'workBusy', 'pending'],
    );
    expect(
      ([...byDate]..sort(
              caseSummaryOrder(
                MyCasesFilter.active,
                const MineSearch(sort: CasesSort.oldest),
              ),
            ))
          .map((c) => c.id),
      ['pending', 'workBusy', 'workQuiet', 'bids', 'fresh'],
    );
  });

  test('«Active» shows the most advanced case first, from any server order',
      () async {
    final repo = _ByDateRepo(byDate, const []);
    final c = make(repo);
    final sub = c.listen(myCasesProvider(MyCasesFilter.active), (_, __) {});
    addTearDown(sub.close);
    final page = await c.read(myCasesProvider(MyCasesFilter.active).future);
    expect(page.items.map((x) => x.id), wanted);
    // The phone copy (the first value, read before the live page) is in
    // the same order: a copy saved under the old order is re-sorted.
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(
      c
          .read(myCasesProvider(MyCasesFilter.active))
          .value!
          .items
          .map((x) => x.id),
      wanted,
    );
  });

  test('the cases screen list (Mine) sorts the same; «Done» does not',
      () async {
    final repo = _ByDateRepo(byDate, const []);
    final c = make(repo);
    const active = (filter: MyCasesFilter.active, search: MineSearch());
    final sub = c.listen(mineCasesProvider(active), (_, __) {});
    addTearDown(sub.close);
    final page = await c.read(mineCasesProvider(active).future);
    expect(page.items.map((x) => x.id), wanted);

    const done = (filter: MyCasesFilter.completed, search: MineSearch());
    final sub2 = c.listen(mineCasesProvider(done), (_, __) {});
    addTearDown(sub2.close);
    final donePage = await c.read(mineCasesProvider(done).future);
    expect(
      donePage.items.map((x) => x.id),
      byDate.map((x) => x.id),
      reason: '«Готово» keeps its order',
    );
  });

  test('the filters reach the repository (the server does the narrowing)',
      () async {
    final repo = _ByDateRepo(byDate, const []);
    final c = make(repo);
    const key = (
      filter: MyCasesFilter.active,
      search:
          MineSearch(stages: {0, 2}, awaiting: true, sort: CasesSort.newest),
    );
    final sub = c.listen(mineCasesProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(mineCasesProvider(key).future);
    expect(repo.lastSearch?.stageList, [0, 2]);
    expect(repo.lastSearch?.awaiting, isTrue);
    expect(repo.lastSearch?.sort, CasesSort.newest);
    expect(key.search.isEmpty, isFalse, reason: 'a filtered list: no copy');
    expect(key.search.listFilterCount, 3);
    expect(key.search.withoutListFilters, const MineSearch());
  });

  test('the attorney’s «Active» work: wrapping up first, then by activity',
      () async {
    final work = [
      _work('quiet', activity: 3),
      _work('busy', activity: 20),
      _work('dispute', status: CaseStatus.disputed, activity: 1),
    ];
    final repo = _ByDateRepo(const [], work);
    final c = make(repo);
    final sub = c.listen(myWorkProvider(WorkFilter.active), (_, __) {});
    addTearDown(sub.close);
    final page = await c.read(myWorkProvider(WorkFilter.active).future);
    expect(page.items.map((x) => x.caseId), ['dispute', 'busy', 'quiet']);
    // A closed list keeps the server's order.
    expect(workItemOrder(WorkFilter.closed, const MineSearch()), isNull);
  });

  test('the cases-screen filter is remembered per account on the device',
      () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final c = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(c.dispose);
    final store = c.read(casesListFilterStoreProvider);
    expect(store.load('u1'), const MineSearch());
    const picked = MineSearch(
      q: 'tax',
      stages: {1, 3},
      awaiting: true,
      sort: CasesSort.oldest,
    );
    await store.save('u1', picked);
    // The text is per visit; the stages, «Ждёт меня» and the order stay.
    expect(store.load('u1'), picked.copyWith(q: ''));
    expect(store.load('u2'), const MineSearch(), reason: 'another account');
    await store.save('u1', const MineSearch());
    expect(store.load('u1'), const MineSearch());
  });
}
