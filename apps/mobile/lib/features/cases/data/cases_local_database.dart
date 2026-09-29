import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'cases_local_database.g.dart';

/// docs/04 §3.1: "Черновик хранится только локально (drift) до
/// публикации". One row per account ([ownerId]) so a shared device never
/// shows one user's draft to another.
class CaseDrafts extends Table {
  TextColumn get ownerId => text()();
  TextColumn get json => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {ownerId};
}

/// Bids the client has already seen on their case (docs/04 §11.1 card:
/// "число непросмотренных новых"). Local only: `bids_count` counts every
/// submitted bid, so unseen = bidsCount - seen rows for the case.
class SeenBids extends Table {
  TextColumn get caseId => text()();
  TextColumn get bidId => text()();

  @override
  Set<Column> get primaryKey => {caseId, bidId};
}

@DriftDatabase(tables: [CaseDrafts, SeenBids])
class CasesLocalDatabase extends _$CasesLocalDatabase {
  CasesLocalDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: 'lawbid_cases'));

  @override
  int get schemaVersion => 1;

  Future<String?> draftJson(String ownerId) async =>
      (await (select(caseDrafts)..where((d) => d.ownerId.equals(ownerId)))
              .getSingleOrNull())
          ?.json;

  Future<void> saveDraft(String ownerId, String json) =>
      into(caseDrafts).insertOnConflictUpdate(
        CaseDraftsCompanion.insert(
          ownerId: ownerId,
          json: json,
          updatedAt: DateTime.now(),
        ),
      );

  Future<void> deleteDraft(String ownerId) =>
      (delete(caseDrafts)..where((d) => d.ownerId.equals(ownerId))).go();

  Future<void> markSeen(String caseId, Iterable<String> bidIds) => batch(
        (b) => b.insertAllOnConflictUpdate(seenBids, [
          for (final id in bidIds)
            SeenBidsCompanion.insert(caseId: caseId, bidId: id),
        ]),
      );

  Future<Map<String, int>> seenCounts(Iterable<String> caseIds) async {
    final ids = caseIds.toList();
    if (ids.isEmpty) return const {};
    final count = seenBids.bidId.count();
    final rows = await (selectOnly(seenBids)
          ..addColumns([seenBids.caseId, count])
          ..where(seenBids.caseId.isIn(ids))
          ..groupBy([seenBids.caseId]))
        .get();
    return {
      for (final r in rows) r.read(seenBids.caseId)!: r.read(count) ?? 0,
    };
  }
}
