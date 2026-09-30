import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/data/cases_local_database.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

// No silent automatic retries (Riverpod 3 default): a failed load shows
// its error/offline state with Retry at once (docs/01 §8.3).
Duration? _noRetry(int retryCount, Object error) => null;

// --- Infrastructure --------------------------------------------------------

final casesRepositoryProvider = Provider<CasesRepository>(
  (ref) => ApiCasesRepository(ref.watch(dioProvider)),
);

final casesLocalDatabaseProvider = Provider<CasesLocalDatabase>((ref) {
  final db = CasesLocalDatabase();
  ref.onDispose(db.close);
  return db;
});

// --- Client: "Мои кейсы" (docs/04 §11.1) ------------------------------------

class MyCasesNotifier extends PagedNotifier<CaseSummary> {
  MyCasesNotifier(this.filter);

  final MyCasesFilter filter;

  @override
  Future<CursorPage<CaseSummary>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).myCases(filter, cursor: cursor);

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

final ownerCaseProvider = FutureProvider.autoDispose.family<OwnerCase, String>(
  (ref, id) => ref.watch(casesRepositoryProvider).ownerCase(id),
  retry: _noRetry,
);

typedef CaseBidsKey = ({String caseId, BidsSort sort});

class CaseBidsNotifier extends PagedNotifier<CaseBid> {
  CaseBidsNotifier(this.key);

  final CaseBidsKey key;

  @override
  Future<CursorPage<CaseBid>> fetch(String? cursor) async {
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
  (ref, id) => ref.watch(casesRepositoryProvider).bid(id),
  retry: _noRetry,
);

// --- Attorney: "Кейсы" tab (docs/04 §4.2) -----------------------------------

/// Owner 2026-09-30 (OQ-034): the case feed is filtered like the post feed
/// — a practice category from the topic slider and a state.
typedef FeedFilter = ({String? practiceCategory, String? state});

class FeedNotifier extends PagedNotifier<FeedCase> {
  FeedNotifier(this.filter);

  final FeedFilter filter;

  @override
  Future<CursorPage<FeedCase>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).feed(
            cursor: cursor,
            practiceCategory: filter.practiceCategory,
            state: filter.state,
          );

  @override
  Object idOf(FeedCase item) => item.id;
}

final caseFeedProvider = AsyncNotifierProvider.autoDispose
    .family<FeedNotifier, PaginatedList<FeedCase>, FeedFilter>(
  FeedNotifier.new,
  retry: _noRetry,
);

final attorneyCaseProvider =
    FutureProvider.autoDispose.family<FeedCase, String>(
  (ref, id) => ref.watch(casesRepositoryProvider).attorneyCase(id),
  retry: _noRetry,
);

// --- Attorney: "Моё" (docs/04 §11.2) ----------------------------------------

class MyBidsNotifier extends PagedNotifier<MyBid> {
  MyBidsNotifier(this.filter);

  final MyBidsFilter filter;

  @override
  Future<CursorPage<MyBid>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).myBids(filter, cursor: cursor);

  @override
  Object idOf(MyBid item) => item.bid.id;
}

final myBidsProvider = AsyncNotifierProvider.autoDispose
    .family<MyBidsNotifier, PaginatedList<MyBid>, MyBidsFilter>(
  MyBidsNotifier.new,
  retry: _noRetry,
);

class MyWorkNotifier extends PagedNotifier<WorkItem> {
  MyWorkNotifier(this.filter);

  final WorkFilter filter;

  @override
  Future<CursorPage<WorkItem>> fetch(String? cursor) =>
      ref.read(casesRepositoryProvider).myWork(filter, cursor: cursor);

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

  void _clientCase(String caseId) {
    _ref
      ..invalidate(ownerCaseProvider(caseId))
      ..invalidate(myCasesProvider)
      ..invalidate(caseBidsProvider);
  }

  void _attorneyLists() {
    _ref
      ..invalidate(myBidsProvider)
      ..invalidate(myWorkProvider)
      ..invalidate(caseFeedProvider);
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

  Future<void> complete(String id) async {
    await _repo.completeCase(id);
    _clientCase(id);
  }

  Future<CaseBid> accept(CaseBid bid) async {
    final result = await _repo.accept(bid.id);
    _afterBidChange(bid);
    return result;
  }

  Future<CaseBid> counter(CaseBid bid, int amountCents, String? message) async {
    final result =
        await _repo.counter(bid.id, amountCents: amountCents, message: message);
    _afterBidChange(bid);
    return result;
  }

  Future<CaseBid> decline(CaseBid bid) async {
    final result = await _repo.decline(bid.id);
    _afterBidChange(bid);
    return result;
  }

  Future<CaseBid> withdraw(CaseBid bid) async {
    final result = await _repo.withdraw(bid.id);
    _afterBidChange(bid);
    return result;
  }

  void _afterBidChange(CaseBid bid) {
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
      ..invalidate(savedCasesProvider);
  }

  Future<void> confirmCompletion(String caseId) async {
    await _repo.confirmCompletion(caseId);
    _attorneyLists();
  }

  Future<void> dispute(String caseId, String reason) async {
    await _repo.dispute(caseId, reason);
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
