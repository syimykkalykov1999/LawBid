import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'cases_fakes.dart';

/// Owner 2026-10-22 (delta audit D-P4, Telegram): one bid event on my case =
/// 0 or 1 small request, never the whole bid list (nor the whole case) again.
CaseBid _bid(String id, {int cents = 50000, BidStatus? status}) => CaseBid(
      id: id,
      caseId: 'case-1',
      attorneyId: 'att-$id',
      status: status ?? BidStatus.active,
      feeType: FeeType.fixed,
      amountCents: cents,
      message: 'hello',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 1,
      turn: PartyRole.client,
      createdAt: DateTime(2026, 10, 20, int.parse(id.replaceAll('b', '')) + 1),
    );

OwnerCase _case({int bids = 2}) => OwnerCase(
      id: 'case-1',
      title: 'Speeding ticket',
      description: 'Ticket on the turnpike.',
      practice: const PracticeRef(
        id: 'leaf-1',
        code: 'traffic',
        i18nKey: 'practice.traffic',
        nameEn: 'Traffic',
      ),
      primaryStateCode: 'NJ',
      additionalStateCodes: const [],
      city: null,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      status: CaseStatus.open,
      viewCount: 1,
      bidsCount: bids,
      createdAt: DateTime(2026, 9, 2),
      lastActivityAt: DateTime(2026, 9, 2),
    );

class _Repo extends FakeCasesRepository implements CasesSyncRepository {
  List<CaseBid> bids = [_bid('b1'), _bid('b2')];
  SyncedPage<CaseBid> changed = const SyncedPage(items: []);
  int listReads = 0;
  int deltaReads = 0;
  int caseReads = 0;

  @override
  Future<CursorPage<CaseBid>> caseBids(
    String caseId,
    BidsSort sort, {
    String? cursor,
  }) async {
    listReads++;
    return CursorPage(items: bids);
  }

  @override
  Future<SyncedPage<CaseBid>> caseBidsChangedSince(
    String caseId,
    DateTime since,
  ) async {
    deltaReads++;
    return changed;
  }

  @override
  Future<OwnerCase> ownerCase(String caseId) async {
    caseReads++;
    return _case();
  }

  @override
  Future<SyncedPage<CaseSummary>> myCasesChangedSince(
    MyCasesFilter filter,
    DateTime since,
  ) async =>
      const SyncedPage(items: []);

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

void main() {
  late StreamController<RealtimeEvent> events;
  const key = (caseId: 'case-1', sort: BidsSort.newest);

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
  });

  ProviderContainer make(_Repo repo) {
    final c = ProviderContainer(
      overrides: [
        ...casesOverrides(repo: repo),
        realtimeClientProvider.overrideWithValue(null),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<void> wait() => Future<void>.delayed(
        SyncedListNotifier.catchUpDelay + const Duration(milliseconds: 400),
      );

  RealtimeEvent bidEvent(String kind, Map<String, Object?> bid) =>
      RealtimeEvent('case:update', {
        'caseId': 'case-1',
        'kind': kind,
        'bidId': bid['bidId'],
        'bid': bid,
      });

  test('a counter on a held bid edits the row: 0 requests', () async {
    final repo = _Repo();
    final c = make(repo);
    final sub = c.listen(caseBidsProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(caseBidsProvider(key).future);
    expect(repo.listReads, 1);

    events.add(
      bidEvent('bid_countered', {
        'bidId': 'b1',
        'status': 'active',
        'amountCents': 42000,
      }),
    );
    await wait();

    final rows = c.read(caseBidsProvider(key)).value!.items;
    expect(rows.firstWhere((b) => b.id == 'b1').amountCents, 42000);
    expect(repo.listReads, 1, reason: 'the list is not reloaded');
    expect(repo.deltaReads, 0, reason: 'nor asked for a delta');
  });

  test('a withdrawn bid changes its status in place: 0 requests', () async {
    final repo = _Repo();
    final c = make(repo);
    final sub = c.listen(caseBidsProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(caseBidsProvider(key).future);

    events.add(
      bidEvent('bid_withdrawn', {'bidId': 'b2', 'status': 'withdrawn'}),
    );
    await wait();

    final rows = c.read(caseBidsProvider(key)).value!.items;
    expect(rows.firstWhere((b) => b.id == 'b2').status, BidStatus.withdrawn);
    expect(repo.listReads + repo.deltaReads, 1);
  });

  test('a new bid is one small updatedSince, a burst is still one', () async {
    final repo = _Repo();
    final c = make(repo);
    final sub = c.listen(caseBidsProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(caseBidsProvider(key).future);

    repo.changed = SyncedPage(
      items: [_bid('b3', cents: 30000)],
      syncedAt: DateTime.utc(2026, 10, 22, 12),
    );
    events
      ..add(bidEvent('bid_new', {'bidId': 'b3', 'status': 'active'}))
      ..add(bidEvent('bid_new', {'bidId': 'b3', 'status': 'active'}));
    await wait();

    expect(repo.deltaReads, 1);
    expect(repo.listReads, 1, reason: 'the list is not reloaded');
    expect(
      c.read(caseBidsProvider(key)).value!.items.map((b) => b.id).toSet(),
      {'b1', 'b2', 'b3'},
    );
  });

  test('events that are not about bids touch nothing', () async {
    final repo = _Repo();
    final c = make(repo);
    final sub = c.listen(caseBidsProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(caseBidsProvider(key).future);

    events
      ..add(
        const RealtimeEvent(
          'case:update',
          {'caseId': 'case-1', 'kind': 'task'},
        ),
      )
      ..add(
        const RealtimeEvent(
          'case:update',
          {'caseId': 'other', 'kind': 'bid_new'},
        ),
      );
    await wait();
    expect(repo.listReads + repo.deltaReads, 1);
  });

  test('a reconnect catches up with one delta', () async {
    final repo = _Repo();
    final c = make(repo);
    final sub = c.listen(caseBidsProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(caseBidsProvider(key).future);

    events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
    await wait();
    expect(repo.deltaReads, 1);
    expect(repo.listReads, 1);
  });

  test('the owner card: a new bid moves the counter, a counter touches '
      'nothing, an acceptance re-reads', () async {
    final repo = _Repo();
    final c = make(repo);
    final sub = c.listen(ownerCaseProvider('case-1'), (_, __) {});
    addTearDown(sub.close);
    await c.read(ownerCaseProvider('case-1').future);
    expect(repo.caseReads, 1);

    events.add(bidEvent('bid_new', {'bidId': 'b9', 'status': 'active'}));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(c.read(ownerCaseProvider('case-1')).value!.bidsCount, 3);
    // The same bid again (or a retry of the event) is not counted twice.
    events.add(bidEvent('bid_new', {'bidId': 'b9', 'status': 'active'}));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(c.read(ownerCaseProvider('case-1')).value!.bidsCount, 3);

    events.add(
      bidEvent('bid_countered', {
        'bidId': 'b1',
        'status': 'active',
        'amountCents': 1,
      }),
    );
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(repo.caseReads, 1, reason: 'no request for a bid event');

    events.add(bidEvent('bid_accepted', {'bidId': 'b1', 'status': 'accepted'}));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(repo.caseReads, 2, reason: 'an acceptance changes the card');
  });
}
