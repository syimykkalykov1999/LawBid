import 'package:drift/drift.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:lawbid/core/persistence/drift_web.dart';
import 'package:lawbid/core/persistence/saved_json.dart';

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

  /// Owner 2026-10-20: a reply quotes this message; a forward is labelled.
  TextColumn get replyToId => text().nullable()();
  BoolColumn get forwarded => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {clientMessageId};
}

/// docs/05 §7.2: recent searches, local only, can be cleared.
///
/// Owner 2026-10-18: every Search tab has its OWN history. [ownerId] holds
/// `<userId>` for rows saved before that (legacy: dropped, see
/// `dropLegacyRecent`) or `<userId>#<tab>` for a tab's history, so no schema
/// migration is needed and the primary key stays unique per tab.
@DataClassName('RecentSearchRow')
class RecentSearches extends Table {
  TextColumn get ownerId => text()();
  TextColumn get query => text()();
  DateTimeColumn get usedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {ownerId, query};
}

@DriftDatabase(tables: [CachedPages, ChatOutbox, RecentSearches])
class SocialLocalDatabase extends _$SocialLocalDatabase
    implements SavedPageStore {
  SocialLocalDatabase([QueryExecutor? executor])
      : super(
          executor ??
              appDriftDatabase(
                'lawbid_social',
                recovery: DriftRecovery.quarantine,
              ),
        );

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.addColumn(chatOutbox, chatOutbox.replyToId);
            await m.addColumn(chatOutbox, chatOutbox.forwarded);
          }
        },
      );

  static const _recentMax = 10;

  // --- cached pages ---------------------------------------------------

  @override
  Future<String?> pageJson(String key) async =>
      (await (select(cachedPages)..where((p) => p.key.equals(key)))
              .getSingleOrNull())
          ?.json;

  @override
  Future<void> savePage(String key, String json) =>
      into(cachedPages).insertOnConflictUpdate(
        CachedPagesCompanion.insert(
          key: key,
          json: json,
          updatedAt: DateTime.now(),
        ),
      );

  @override
  Future<int> pagesBytes() async {
    final sum = cachedPages.json.length.sum();
    final row = await (selectOnly(cachedPages)..addColumns([sum])).getSingle();
    return row.read(sum) ?? 0;
  }

  @override
  Future<void> clearPages() => delete(cachedPages).go();

  // --- chat outbox ----------------------------------------------------

  Future<void> enqueue({
    required String clientMessageId,
    required String ownerId,
    required String conversationId,
    required String body,
    String? replyToId,
    bool forwarded = false,
  }) =>
      into(chatOutbox).insertOnConflictUpdate(
        ChatOutboxCompanion.insert(
          clientMessageId: clientMessageId,
          ownerId: ownerId,
          conversationId: conversationId,
          body: body,
          createdAt: DateTime.now(),
          replyToId: Value(replyToId),
          forwarded: Value(forwarded),
        ),
      );

  Future<List<OutboxRow>> pending(String ownerId, {String? conversationId}) =>
      (select(chatOutbox)
            ..where(
              (o) =>
                  o.ownerId.equals(ownerId) &
                  (conversationId == null
                      ? const Constant(true)
                      : o.conversationId.equals(conversationId)),
            )
            ..orderBy([(o) => OrderingTerm.asc(o.createdAt)]))
          .get();

  Stream<List<OutboxRow>> watchPending(String ownerId, String conversationId) =>
      (select(chatOutbox)
            ..where(
              (o) =>
                  o.ownerId.equals(ownerId) &
                  o.conversationId.equals(conversationId),
            )
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

  /// The storage key of one tab's history of one account.
  static String recentKey(String ownerId, String tab) => '$ownerId#$tab';

  /// [tab] = the Search tab ('attorneys', 'cases', 'posts', 'tags').
  Future<List<String>> recent(String ownerId, String tab) async {
    final key = recentKey(ownerId, tab);
    return [
      for (final r in await (select(recentSearches)
            ..where((r) => r.ownerId.equals(key))
            ..orderBy([(r) => OrderingTerm.desc(r.usedAt)])
            ..limit(_recentMax))
          .get())
        r.query,
    ];
  }

  Future<void> remember(String ownerId, String tab, String query) async {
    final key = recentKey(ownerId, tab);
    await into(recentSearches).insertOnConflictUpdate(
      RecentSearchesCompanion.insert(
        ownerId: key,
        query: query,
        usedAt: DateTime.now(),
      ),
    );
    final keep = await recent(ownerId, tab);
    await (delete(recentSearches)
          ..where((r) => r.ownerId.equals(key) & r.query.isNotIn(keep)))
        .go();
  }

  Future<void> forgetRecent(String ownerId, String tab, String query) =>
      (delete(recentSearches)
            ..where(
              (r) =>
                  r.ownerId.equals(recentKey(ownerId, tab)) &
                  r.query.equals(query),
            ))
          .go();

  Future<void> clearRecent(String ownerId, String tab) => (delete(
        recentSearches,
      )..where((r) => r.ownerId.equals(recentKey(ownerId, tab))))
          .go();

  /// History saved before the tabs had their own: one list for everything,
  /// so there is no telling which tab a line belonged to. Dropped.
  Future<void> dropLegacyRecent(String ownerId) =>
      (delete(recentSearches)..where((r) => r.ownerId.equals(ownerId))).go();
}
