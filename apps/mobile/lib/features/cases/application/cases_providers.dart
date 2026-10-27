import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/platform/review_prompter.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/data/cases_local_database.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

// No silent automatic retries (Riverpod 3 default): a failed load shows
// its error/offline state with Retry at once (docs/01 §8.3).
Duration? _noRetry(int retryCount, Object error) => null;

/// Owner 2026-10-14: the lawyers of my firm whose licence fits the case
/// (empty without a firm or when the feature is off).
final firmSendersProvider =
    FutureProvider.autoDispose.family<List<api.FirmMemberDto>, String>(
  (ref, caseId) async {
    try {
      return (await guardApiCall(
        () => api.FirmsClient(ref.watch(dioProvider))
            .firmMembersForCase(caseId: caseId),
      ))
          .data;
    } on ApiException {
      return const [];
    }
  },
);

// --- Infrastructure --------------------------------------------------------

/// Package E: the delta side of the repository (null with a test fake).
final casesSyncProvider = Provider<CasesSyncRepository?>((ref) {
  final repo = ref.watch(casesRepositoryProvider);
  // ignore: avoid_dynamic_calls
  return repo is CasesSyncRepository ? repo as CasesSyncRepository : null;
});

/// Bumped after my own case / bid action: every «Mine» list on screen
/// asks one `?updatedSince` for what that changed (the server sends
/// `case:update` to the other side, not to me).
class CaseListsTouched extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final caseListsTouchedProvider =
    NotifierProvider<CaseListsTouched, int>(CaseListsTouched.new);

/// A bid my action answered (accept, decline, counter, withdraw): the bids
/// list of the case replaces its row with it.
class LastChangedBid extends Notifier<CaseBid?> {
  @override
  CaseBid? build() => null;

  // ignore: use_setters_to_change_properties
  void set(CaseBid bid) => state = bid;
}

final lastChangedBidProvider =
    NotifierProvider<LastChangedBid, CaseBid?>(LastChangedBid.new);

/// A `case:update` event about [caseId] (any kind), or a reconnect.
bool caseEventFor(RealtimeEvent e, String caseId) =>
    e.name == 'case:update' &&
    e.data is Map &&
    (e.data! as Map)['caseId'] == caseId;

/// Owner 2026-10-22 (client economy plan, package E): what every «Mine»
/// list shares — the sync state's owner and store, and the two triggers
/// of a delta: a `case:update` from the server, or my own action here.
mixin CaseListSync<T> on SyncedListNotifier<T> {
  @override
  String? get syncOwner =>
      ref.read(sessionControllerProvider.select((s) => s?.sub));

  @override
  SyncStateStore? get syncStore => ref.read(cacheDatabaseProvider);

  @override
  DateTime? updatedAtOf(T item) => null;

  /// Call from [build] before `super.build()`.
  void listenForChanges() {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'case:update' || e.name == RealtimeEvent.reconnected) {
        catchUp();
      }
    });
    ref
      ..onDispose(sub.cancel)
      ..listen(caseListsTouchedProvider, (_, __) => catchUp());
  }
}

final casesRepositoryProvider = Provider<CasesRepository>(
  (ref) => ApiCasesRepository(ref.watch(dioProvider)),
);

final casesLocalDatabaseProvider = Provider<CasesLocalDatabase>((ref) {
  final db = CasesLocalDatabase();
  ref.onDispose(db.close);
  return db;
});

// --- Client: "Мои кейсы" (docs/04 §11.1) ------------------------------------

class MyCasesNotifier extends SyncedListNotifier<CaseSummary>
    with CaseListSync<CaseSummary> {
  MyCasesNotifier(this.filter);

  final MyCasesFilter filter;

  @override
  String get listKey => 'my_cases:${filter.name}';

  @override
  bool get catchesUp => ref.read(casesSyncProvider) != null;

  @override
  Future<PaginatedList<CaseSummary>> build() {
    listenForChanges();
    return super.build();
  }

  @override
  Future<CursorPage<CaseSummary>> fetchPage(String? cursor) =>
      ref.read(casesRepositoryProvider).myCases(filter, cursor: cursor);

  @override
  Future<SyncedPage<CaseSummary>> fetchChanged(DateTime since) =>
      ref.read(casesSyncProvider)!.myCasesChangedSince(filter, since);

  @override
  String keyOf(CaseSummary item) => item.id;

  @override
  Object idOf(CaseSummary item) => item.id;
}

final myCasesProvider = AsyncNotifierProvider.autoDispose
    .family<MyCasesNotifier, PaginatedList<CaseSummary>, MyCasesFilter>(
  MyCasesNotifier.new,
  retry: _noRetry,
);

/// Unseen bids per case for the "Мои кейсы" cards: bidsCount minus bids
/// the client already opened on this device (local, docs/04 §11.1).
final seenBidCountsProvider =
    FutureProvider.autoDispose.family<Map<String, int>, String>((ref, joined) {
  final ids = joined.isEmpty ? const <String>[] : joined.split(',');
  return ref.watch(casesLocalDatabaseProvider).seenCounts(ids);
});

/// Package E: one card is re-read on its own `case:update`, not the lists.
void _rereadOn(Ref ref, bool Function(RealtimeEvent e) test) {
  final sub = ref.watch(realtimeEventsProvider).listen((e) {
    if (test(e)) ref.invalidateSelf();
  });
  ref.onDispose(sub.cancel);
}

/// The one-bid patch a bid `case:update` carries (delta audit D-P4):
/// `{bid: {bidId, status, amountCents?, percentBps?}}`, or null.
({String bidId, BidStatus status, int? amountCents, int? percentBps})?
    bidPatchOf(RealtimeEvent e) {
  final data = e.data;
  final raw = data is Map ? data['bid'] : null;
  if (raw is! Map || raw['bidId'] is! String || raw['status'] is! String) {
    return null;
  }
  final status = BidStatus.values
      .where((s) => s.json == raw['status'])
      .cast<BidStatus?>()
      .firstOrNull;
  if (status == null) return null;
  return (
    bidId: raw['bidId'] as String,
    status: status,
    amountCents: raw['amountCents'] is int ? raw['amountCents'] as int : null,
    percentBps: raw['percentBps'] is int ? raw['percentBps'] as int : null,
  );
}

/// Owner 2026-10-22 (delta audit D-P4): the owner's case card is edited
/// by what the event says (a new bid moves the counter; a counter / a
/// decline / a withdrawal touches nothing on the card: 0 requests); only
/// an event the card cannot be edited from (accepted, closed, updated …)
/// re-reads it.
class OwnerCaseNotifier extends AsyncNotifier<OwnerCase> {
  OwnerCaseNotifier(this.id);

  final String id;

  final _counted = <String>{};

  @override
  Future<OwnerCase> build() {
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(sub.cancel);
    return ref.watch(casesRepositoryProvider).ownerCase(id);
  }

  void _onEvent(RealtimeEvent e) {
    if (!caseEventFor(e, id)) return;
    final current = state.value;
    final patch = bidPatchOf(e);
    final kind = (e.data! as Map)['kind'];
    if (current != null && patch != null) {
      if (kind == 'bid_new') {
        // bids_count counts bid rows: this one is counted once.
        if (_counted.add(patch.bidId)) {
          state = AsyncData(
            current.withBidsCount(
              current.bidsCount + 1,
              activeAt: DateTime.now(),
            ),
          );
        }
        return;
      }
      if (kind == 'bid_countered' ||
          kind == 'bid_declined' ||
          kind == 'bid_withdrawn') {
        // The card shows none of it; the bids list edits its row.
        return;
      }
    }
    ref.invalidateSelf();
  }
}

final ownerCaseProvider = AsyncNotifierProvider.autoDispose
    .family<OwnerCaseNotifier, OwnerCase, String>(
  OwnerCaseNotifier.new,
  retry: _noRetry,
);

typedef CaseBidsKey = ({String caseId, BidsSort sort});

/// Owner 2026-10-22 (delta audit D-P4, Telegram): the bids of my case are
/// never reloaded whole. My own answer replaces its row; a bid event
/// carries `{bidId, status, amount}` and edits the row (0 requests); a
/// bid the list does not hold yet, or an event without a patch, is one
/// small `?updatedSince`.
class CaseBidsNotifier extends SyncedListNotifier<CaseBid> {
  CaseBidsNotifier(this.key);

  final CaseBidsKey key;

  @override
  String get listKey => 'case_bids:${key.caseId}:${key.sort.name}';

  @override
  bool get catchesUp => ref.read(casesSyncProvider) != null;

  // Memory only: the list keeps no saved copy.
  @override
  String? get syncOwner => null;

  @override
  String keyOf(CaseBid item) => item.id;

  @override
  DateTime? updatedAtOf(CaseBid item) => null;

  @override
  int Function(CaseBid, CaseBid)? get order => switch (key.sort) {
        BidsSort.newest => (a, b) {
            final byTime = b.createdAt.compareTo(a.createdAt);
            return byTime != 0 ? byTime : b.id.compareTo(a.id);
          },
        BidsSort.lowestPrice => (a, b) {
            final byPrice = a.amountCents.compareTo(b.amountCents);
            return byPrice != 0 ? byPrice : a.id.compareTo(b.id);
          },
        BidsSort.highestRating => (a, b) {
            final byRating = (b.attorney?.ratingAvg ?? 0)
                .compareTo(a.attorney?.ratingAvg ?? 0);
            return byRating != 0 ? byRating : b.id.compareTo(a.id);
          },
      };

  @override
  Future<PaginatedList<CaseBid>> build() {
    // My own answer to a bid replaces its row.
    ref.listen(lastChangedBidProvider, (_, bid) {
      if (bid == null || bid.caseId != key.caseId) return;
      applyRow(bid.id, (_) => bid);
    });
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == RealtimeEvent.reconnected) {
        catchUp();
        return;
      }
      if (!caseEventFor(e, key.caseId)) return;
      final kind = (e.data! as Map)['kind'];
      if (kind is! String || !kind.startsWith('bid_')) return;
      final patch = bidPatchOf(e);
      if (patch != null) {
        final held = applyRow(
          patch.bidId,
          (b) => b?.patched(
            status: patch.status,
            amountCents: patch.amountCents,
            percentBps: patch.percentBps,
          ),
        );
        if (held) return;
      }
      // A bid this list does not hold (new), or an event without a patch.
      catchUp();
    });
    ref.onDispose(sub.cancel);
    return super.build();
  }

  @override
  Future<SyncedPage<CaseBid>> fetchChanged(DateTime since) async {
    final page = await ref
        .read(casesSyncProvider)!
        .caseBidsChangedSince(key.caseId, since);
    unawaited(_markSeen(page.items));
    return page;
  }

  Future<void> _markSeen(List<CaseBid> bids) => ref
          .read(casesLocalDatabaseProvider)
          .markSeen(key.caseId, bids.map((b) => b.id))
          .then((_) {
        if (ref.mounted) ref.invalidate(seenBidCountsProvider);
      });

  @override
  Future<CursorPage<CaseBid>> fetchPage(String? cursor) async {
    final page = await ref
        .read(casesRepositoryProvider)
        .caseBids(key.caseId, key.sort, cursor: cursor);
    // Opening the list marks these bids seen (card's "new" counter).
    unawaited(
      ref
          .read(casesLocalDatabaseProvider)
          .markSeen(key.caseId, page.items.map((b) => b.id))
          .then((_) {
        if (ref.mounted) ref.invalidate(seenBidCountsProvider);
      }),
    );
    return page;
  }

  @override
  Object idOf(CaseBid item) => item.id;
}

final caseBidsProvider = AsyncNotifierProvider.autoDispose
    .family<CaseBidsNotifier, PaginatedList<CaseBid>, CaseBidsKey>(
  CaseBidsNotifier.new,
  retry: _noRetry,
);

final bidProvider = FutureProvider.autoDispose.family<CaseBid, String>(
  (ref, id) {
    _rereadOn(
      ref,
      (e) =>
          e.name == 'case:update' &&
          e.data is Map &&
          (e.data! as Map)['bidId'] == id,
    );
    return ref.watch(casesRepositoryProvider).bid(id);
  },
  retry: _noRetry,
);

// --- Attorney: "Кейсы" tab (docs/04 §4.2) -----------------------------------

/// Owner 2026-09-30 (OQ-034): the case feed is filtered like the post feed
/// — a practice category from the topic slider and a state.
typedef FeedFilter = ({
  String? practiceCategory,
  // Owner 2026-10-06: one state or several, comma-separated ("NJ,NY") so
  // the key compares by value.
  String? state,
  bool mineOnly,
});

class FeedNotifier extends PagedNotifier<FeedCase> {
  FeedNotifier(this.filter);

  final FeedFilter filter;

  // Owner 2026-10-18 (speed): kept for 5 minutes after the screen leaves
  // (see PagedNotifier.keepAliveFor).
  @override
  Duration? get keepAliveFor => const Duration(minutes: 5);

  @override
  Future<CursorPage<FeedCase>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).feed(
            cursor: cursor,
            practiceCategory: filter.practiceCategory,
            states: [
              for (final c in (filter.state ?? '').split(','))
                if (c.isNotEmpty) c,
            ],
            mineOnly: filter.mineOnly,
          );

  @override
  Object idOf(FeedCase item) => item.id;
}

final caseFeedProvider = AsyncNotifierProvider.autoDispose
    .family<FeedNotifier, PaginatedList<FeedCase>, FeedFilter>(
  FeedNotifier.new,
  retry: _noRetry,
);

/// Audit 2026-10-01: the Search tab's Cases explore grid — every filter
/// applied on the server (no client-side filtering of one page).
typedef ExploreCasesKey = ({
  String? practiceCategory,
  String? state,
  CaseFeedExtras extras,
});

class ExploreCasesNotifier extends PagedNotifier<FeedCase> {
  ExploreCasesNotifier(this.key);

  final ExploreCasesKey key;

  @override
  Future<CursorPage<FeedCase>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).feed(
            cursor: cursor,
            practiceCategory: key.practiceCategory,
            state: key.state,
            extras: key.extras,
            // Audit 2026-10-04: "All" here matches the feed's "All" —
            // every open case, not just the licensed states.
            mineOnly: false,
          );

  @override
  Object idOf(FeedCase item) => item.id;
}

final exploreCasesProvider = AsyncNotifierProvider.autoDispose
    .family<ExploreCasesNotifier, PaginatedList<FeedCase>, ExploreCasesKey>(
  ExploreCasesNotifier.new,
  retry: _noRetry,
);

final attorneyCaseProvider =
    FutureProvider.autoDispose.family<FeedCase, String>(
  (ref, id) {
    _rereadOn(ref, (e) => caseEventFor(e, id));
    return ref.watch(casesRepositoryProvider).attorneyCase(id);
  },
  retry: _noRetry,
);

// --- Attorney: "Моё" (docs/04 §11.2) ----------------------------------------

class MyBidsNotifier extends SyncedListNotifier<MyBid>
    with CaseListSync<MyBid> {
  MyBidsNotifier(this.filter);

  final MyBidsFilter filter;

  @override
  String get listKey => 'my_bids:${filter.name}';

  @override
  bool get catchesUp => ref.read(casesSyncProvider) != null;

  @override
  Future<PaginatedList<MyBid>> build() {
    listenForChanges();
    return super.build();
  }

  @override
  Future<CursorPage<MyBid>> fetchPage(String? cursor) =>
      ref.read(casesRepositoryProvider).myBids(filter, cursor: cursor);

  @override
  Future<SyncedPage<MyBid>> fetchChanged(DateTime since) =>
      ref.read(casesSyncProvider)!.myBidsChangedSince(filter, since);

  @override
  String keyOf(MyBid item) => item.bid.id;

  @override
  Object idOf(MyBid item) => item.bid.id;
}

final myBidsProvider = AsyncNotifierProvider.autoDispose
    .family<MyBidsNotifier, PaginatedList<MyBid>, MyBidsFilter>(
  MyBidsNotifier.new,
  retry: _noRetry,
);

class MyWorkNotifier extends SyncedListNotifier<WorkItem>
    with CaseListSync<WorkItem> {
  MyWorkNotifier(this.filter);

  final WorkFilter filter;

  @override
  String get listKey => 'my_work:${filter.name}';

  @override
  bool get catchesUp => ref.read(casesSyncProvider) != null;

  @override
  Future<PaginatedList<WorkItem>> build() {
    listenForChanges();
    return super.build();
  }

  @override
  Future<CursorPage<WorkItem>> fetchPage(String? cursor) =>
      ref.read(casesRepositoryProvider).myWork(filter, cursor: cursor);

  @override
  Future<SyncedPage<WorkItem>> fetchChanged(DateTime since) =>
      ref.read(casesSyncProvider)!.myWorkChangedSince(filter, since);

  @override
  String keyOf(WorkItem item) => item.caseId;

  @override
  Object idOf(WorkItem item) => item.caseId;
}

final myWorkProvider = AsyncNotifierProvider.autoDispose
    .family<MyWorkNotifier, PaginatedList<WorkItem>, WorkFilter>(
  MyWorkNotifier.new,
  retry: _noRetry,
);

class SavedCasesNotifier extends PagedNotifier<SavedCase> {
  @override
  Future<CursorPage<SavedCase>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).savedCases(cursor: cursor);

  @override
  Object idOf(SavedCase item) => item.caseId;
}

final savedCasesProvider = AsyncNotifierProvider.autoDispose<SavedCasesNotifier,
    PaginatedList<SavedCase>>(
  SavedCasesNotifier.new,
  retry: _noRetry,
);

// --- Owner 2026-09-30: "Mine" with search and filters -------------------

typedef MineCasesKey = ({MyCasesFilter filter, MineSearch search});

class MineCasesNotifier extends SyncedListNotifier<CaseSummary>
    with CaseListSync<CaseSummary> {
  MineCasesNotifier(this.key);

  final MineCasesKey key;

  @override
  String get listKey => 'mine_cases:${key.filter.name}';

  /// A filtered / searched tab has no delta: it reloads its page.
  @override
  bool get catchesUp =>
      key.search.isEmpty && ref.read(casesSyncProvider) != null;

  @override
  Future<PaginatedList<CaseSummary>> build() {
    listenForChanges();
    return super.build();
  }

  @override
  Future<CursorPage<CaseSummary>> fetchPage(String? cursor) => ref
      .read(casesRepositoryProvider)
      .myCases(key.filter, cursor: cursor, search: key.search);

  @override
  Future<SyncedPage<CaseSummary>> fetchChanged(DateTime since) =>
      ref.read(casesSyncProvider)!.myCasesChangedSince(key.filter, since);

  @override
  String keyOf(CaseSummary item) => item.id;

  @override
  Object idOf(CaseSummary item) => item.id;
}

final mineCasesProvider = AsyncNotifierProvider.autoDispose
    .family<MineCasesNotifier, PaginatedList<CaseSummary>, MineCasesKey>(
  MineCasesNotifier.new,
  retry: _noRetry,
);

typedef MineBidsKey = ({MyBidsFilter filter, MineSearch search});

class MineBidsNotifier extends SyncedListNotifier<MyBid>
    with CaseListSync<MyBid> {
  MineBidsNotifier(this.key);

  final MineBidsKey key;

  @override
  String get listKey => 'mine_bids:${key.filter.name}';

  @override
  bool get catchesUp =>
      key.search.isEmpty && ref.read(casesSyncProvider) != null;

  @override
  Future<PaginatedList<MyBid>> build() {
    listenForChanges();
    return super.build();
  }

  @override
  Future<SyncedPage<MyBid>> fetchChanged(DateTime since) async {
    final page = await ref
        .read(casesSyncProvider)!
        .myBidsChangedSince(key.filter, since);
    if (key.filter != MyBidsFilter.finished) return page;
    // «Finished» leaves out accepted bids (see fetchPage): a bid that
    // became accepted leaves this tab.
    return SyncedPage(
      items: [
        for (final b in page.items)
          if (b.bid.status != BidStatus.accepted) b,
      ],
      deletedIds: [
        ...page.deletedIds,
        for (final b in page.items)
          if (b.bid.status == BidStatus.accepted) b.bid.id,
      ],
      syncedAt: page.syncedAt,
    );
  }

  @override
  String keyOf(MyBid item) => item.bid.id;

  @override
  Future<CursorPage<MyBid>> fetchPage(String? cursor) async {
    final repo = ref.read(casesRepositoryProvider);
    if (key.filter != MyBidsFilter.finished) {
      return repo.myBids(key.filter, cursor: cursor, search: key.search);
    }
    // Audit 2026-10-04: "Finished" leaves out accepted bids — those cases
    // are already under "In progress" / "Completed". A page of only
    // accepted bids reads on so the grid never shows a false empty.
    var next = cursor;
    while (true) {
      final page =
          await repo.myBids(key.filter, cursor: next, search: key.search);
      final items = [
        for (final b in page.items)
          if (b.bid.status != BidStatus.accepted) b,
      ];
      final more = page.nextCursor;
      if (items.isNotEmpty || more == null || more.isEmpty) {
        return CursorPage(items: items, nextCursor: more);
      }
      next = more;
    }
  }

  @override
  Object idOf(MyBid item) => item.bid.id;
}

final mineBidsProvider = AsyncNotifierProvider.autoDispose
    .family<MineBidsNotifier, PaginatedList<MyBid>, MineBidsKey>(
  MineBidsNotifier.new,
  retry: _noRetry,
);

typedef MineWorkKey = ({WorkFilter filter, MineSearch search});

class MineWorkNotifier extends SyncedListNotifier<WorkItem>
    with CaseListSync<WorkItem> {
  MineWorkNotifier(this.key);

  final MineWorkKey key;

  @override
  String get listKey => 'mine_work:${key.filter.name}';

  @override
  bool get catchesUp =>
      key.search.isEmpty && ref.read(casesSyncProvider) != null;

  @override
  Future<PaginatedList<WorkItem>> build() {
    listenForChanges();
    return super.build();
  }

  @override
  Future<CursorPage<WorkItem>> fetchPage(String? cursor) => ref
      .read(casesRepositoryProvider)
      .myWork(key.filter, cursor: cursor, search: key.search);

  @override
  Future<SyncedPage<WorkItem>> fetchChanged(DateTime since) =>
      ref.read(casesSyncProvider)!.myWorkChangedSince(key.filter, since);

  @override
  String keyOf(WorkItem item) => item.caseId;

  @override
  Object idOf(WorkItem item) => item.caseId;
}

final mineWorkProvider = AsyncNotifierProvider.autoDispose
    .family<MineWorkNotifier, PaginatedList<WorkItem>, MineWorkKey>(
  MineWorkNotifier.new,
  retry: _noRetry,
);

class MineSavedNotifier extends PagedNotifier<SavedCase> {
  MineSavedNotifier(this.search);

  final MineSearch search;

  @override
  Future<CursorPage<SavedCase>> fetch(String? cursor) => ref
      .read(casesRepositoryProvider)
      .savedCases(cursor: cursor, search: search);

  @override
  Object idOf(SavedCase item) => item.caseId;
}

final mineSavedProvider = AsyncNotifierProvider.autoDispose
    .family<MineSavedNotifier, PaginatedList<SavedCase>, MineSearch>(
  MineSavedNotifier.new,
  retry: _noRetry,
);

final clientContactsProvider =
    FutureProvider.autoDispose.family<ClientContacts, String>(
  (ref, caseId) => ref.watch(casesRepositoryProvider).contacts(caseId),
  retry: _noRetry,
);

// --- Actions ---------------------------------------------------------------

/// Mutations shared by the screens: each calls the repository and then
/// invalidates exactly the lists/details it changed. Errors propagate to
/// the caller (the screen shows the localized ApiException text).
class CaseActions {
  CaseActions(this._ref);

  final Ref _ref;

  CasesRepository get _repo => _ref.read(casesRepositoryProvider);

  /// Package E: the one card is re-read; every «Mine» list on screen asks
  /// one `?updatedSince` for what the action changed (no reloads).
  void _clientCase(String caseId) {
    _ref.invalidate(ownerCaseProvider(caseId));
    _ref.read(caseListsTouchedProvider.notifier).bump();
  }

  void _attorneyLists() {
    // The case feed is a pull list (no delta on the server).
    _ref.invalidate(caseFeedProvider);
    _ref.read(caseListsTouchedProvider.notifier).bump();
  }

  Future<void> closeCase(String id) async {
    await _repo.closeCase(id);
    _clientCase(id);
  }

  Future<void> deleteCase(String id) async {
    await _repo.deleteCase(id);
    _clientCase(id);
  }

  Future<void> restoreCase(String id) async {
    await _repo.restoreCase(id);
    _clientCase(id);
  }

  Future<void> keepAlive(String id) async {
    await _repo.keepAlive(id);
    _clientCase(id);
  }

  /// OQ-054: «Да, нужен» / «Жду предложений получше» / «Уже не нужен» /
  /// «Сменить на «Не срочно»».
  Future<void> answerStillNeeded(String id, StillNeededAnswer answer) async {
    await _repo.answerStillNeeded(id, answer);
    _clientCase(id);
  }

  /// OQ-054: «Вернуть» — a paused case is visible to attorneys again.
  Future<void> resume(String id) async {
    await _repo.resumeCase(id);
    _clientCase(id);
  }

  Future<void> complete(String id) async {
    await _repo.completeCase(id);
    _clientCase(id);
  }

  Future<CaseBid> accept(CaseBid bid) async {
    final result = await _repo.accept(bid.id);
    _afterBidChange(result);
    return result;
  }

  /// [value]: cents, or basis points for a contingency bid.
  Future<CaseBid> counter(CaseBid bid, int value, String? message) async {
    final result = bid.feeType == FeeType.contingency
        ? await _repo.counter(bid.id, percentBps: value, message: message)
        : await _repo.counter(bid.id, amountCents: value, message: message);
    _afterBidChange(result);
    return result;
  }

  Future<CaseBid> decline(CaseBid bid) async {
    final result = await _repo.decline(bid.id);
    _afterBidChange(result);
    return result;
  }

  Future<CaseBid> withdraw(CaseBid bid) async {
    final result = await _repo.withdraw(bid.id);
    _afterBidChange(result);
    return result;
  }

  void _afterBidChange(CaseBid bid) {
    // The answer is the bid: the bids list of the case replaces the row.
    _ref.read(lastChangedBidProvider.notifier).set(bid);
    _ref
      ..invalidate(bidProvider(bid.id))
      ..invalidate(attorneyCaseProvider(bid.caseId))
      ..invalidate(clientContactsProvider(bid.caseId));
    _clientCase(bid.caseId);
    _attorneyLists();
  }

  Future<CaseBid> placeBid(String caseId, BidInput input) async {
    final result = await _repo.placeBid(caseId, input);
    _ref.invalidate(attorneyCaseProvider(caseId));
    _attorneyLists();
    return result;
  }

  Future<void> setSaved(String caseId, {required bool saved}) async {
    await _repo.setSaved(caseId, saved: saved);
    _ref
      ..invalidate(attorneyCaseProvider(caseId))
      ..invalidate(savedCasesProvider)
      ..invalidate(mineSavedProvider);
  }

  /// Owner 2026-10-02: completion is symmetric — the attorney marks
  /// "Done" first, then the client confirms (see confirmCompletion).
  Future<void> completeAsAttorney(String caseId) async {
    await _repo.completeCase(caseId);
    _ref.invalidate(attorneyCaseProvider(caseId));
    _attorneyLists();
  }

  Future<void> confirmCompletion(String caseId) async {
    await _repo.confirmCompletion(caseId);
    _ref.invalidate(attorneyCaseProvider(caseId));
    _clientCase(caseId);
    _attorneyLists();
    // Owner 2026-10-22 (checklist §27): a case done to the client's
    // satisfaction — ask for the store rating (90-day cap, flag).
    askForReviewLater(_ref);
  }

  Future<void> dispute(String caseId, String reason) async {
    await _repo.dispute(caseId, reason);
    _ref.invalidate(attorneyCaseProvider(caseId));
    _clientCase(caseId);
    _attorneyLists();
  }

  Future<void> reportContactIssue(
    String caseId,
    ContactIssueType type,
    String? note,
  ) =>
      _repo.reportContactIssue(caseId, type, note);

  Future<CaseConversation> openConversation(String caseId) =>
      _repo.openConversation(caseId);
}

final caseActionsProvider = Provider<CaseActions>(CaseActions.new);
