import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'social_local_database.g.dart';

/// docs/05 §2.2.6: the first feed page, shown offline.
@DataClassName('CachedPageRow')
class CachedPages extends Table {
  TextColumn get key => text()();
  TextColumn get json => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {key};
}

/// docs/05 §8.4: messages written offline, sent (with the same
/// clientMessageId, so never twice) once the connection is back.
@DataClassName('OutboxRow')
class ChatOutbox extends Table {
  TextColumn get clientMessageId => text()();
  TextColumn get ownerId => text()();
  TextColumn get conversationId => text()();
  TextColumn get body => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();

  /// Refused by the server for good (closed chat, too long …): kept to
  /// show "не отправлено", never retried automatically.
  TextColumn get failedCode => text().nullable()();

  @override
  Set<Column> get primaryKey => {clientMessageId};
}

/// docs/05 §7.2: recent searches, local only, can be cleared.
@DataClassName('RecentSearchRow')
class RecentSearches extends Table {
  TextColumn get ownerId => text()();
  TextColumn get query => text()();
  DateTimeColumn get usedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {ownerId, query};
}

@DriftDatabase(tables: [CachedPages, ChatOutbox, RecentSearches])
class SocialLocalDatabase extends _$SocialLocalDatabase {
  SocialLocalDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: 'lawbid_social'));

  @override
  int get schemaVersion => 1;

  static const _recentMax = 10;

  // --- cached pages ---------------------------------------------------

  Future<String?> pageJson(String key) async =>
      (await (select(cachedPages)..where((p) => p.key.equals(key)))
              .getSingleOrNull())
          ?.json;

  Future<void> savePage(String key, String json) =>
      into(cachedPages).insertOnConflictUpdate(CachedPagesCompanion.insert(
        key: key,
        json: json,
        updatedAt: DateTime.now(),
      ),);

  // --- chat outbox ----------------------------------------------------

  Future<void> enqueue({
    required String clientMessageId,
    required String ownerId,
    required String conversationId,
    required String body,
  }) =>
      into(chatOutbox).insertOnConflictUpdate(ChatOutboxCompanion.insert(
        clientMessageId: clientMessageId,
        ownerId: ownerId,
        conversationId: conversationId,
        body: body,
        createdAt: DateTime.now(),
      ),);

  Future<List<OutboxRow>> pending(String ownerId, {String? conversationId}) =>
      (select(chatOutbox)
            ..where((o) =>
                o.ownerId.equals(ownerId) &
                (conversationId == null
                    ? const Constant(true)
                    : o.conversationId.equals(conversationId)),)
            ..orderBy([(o) => OrderingTerm.asc(o.createdAt)]))
          .get();

  Stream<List<OutboxRow>> watchPending(String ownerId, String conversationId) =>
      (select(chatOutbox)
            ..where((o) =>
                o.ownerId.equals(ownerId) &
                o.conversationId.equals(conversationId),)
            ..orderBy([(o) => OrderingTerm.asc(o.createdAt)]))
          .watch();

  Future<void> sent(String clientMessageId) => (delete(chatOutbox)
        ..where((o) => o.clientMessageId.equals(clientMessageId)))
      .go();

  Future<void> attempted(String clientMessageId, {String? failedCode}) =>
      customUpdate(
        'UPDATE chat_outbox SET attempts = attempts + 1, failed_code = ? '
        'WHERE client_message_id = ?',
        variables: [
          Variable<String>(failedCode),
          Variable<String>(clientMessageId),
        ],
        updates: {chatOutbox},
      );

  // --- recent searches ------------------------------------------------

  Future<List<String>> recent(String ownerId) async => [
        for (final r in await (select(recentSearches)
              ..where((r) => r.ownerId.equals(ownerId))
              ..orderBy([(r) => OrderingTerm.desc(r.usedAt)])
              ..limit(_recentMax))
            .get())
          r.query,
      ];

  Future<void> remember(String ownerId, String query) async {
    await into(recentSearches).insertOnConflictUpdate(
      RecentSearchesCompanion.insert(
        ownerId: ownerId,
        query: query,
        usedAt: DateTime.now(),
      ),
    );
    final keep = await recent(ownerId);
    await (delete(recentSearches)
          ..where((r) => r.ownerId.equals(ownerId) & r.query.isNotIn(keep)))
        .go();
  }

  Future<void> clearRecent(String ownerId) =>
      (delete(recentSearches)..where((r) => r.ownerId.equals(ownerId))).go();
}
