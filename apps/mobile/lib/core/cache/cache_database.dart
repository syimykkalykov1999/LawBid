import 'package:drift/drift.dart';
import 'package:lawbid/core/persistence/drift_web.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncStateStore;

part 'cache_database.g.dart';

/// Owner 2026-10-22 (client economy plan §5): the last answer of a GET on
/// disk, with its ETag — a cold start asks «still the same?» and gets a
/// free 304 instead of the whole body. One row per account, language and
/// URL ([key]). Bounded in bytes (LRU by [lastUsedAt]).
@DataClassName('HttpCacheRow')
class HttpCache extends Table {
  TextColumn get key => text()();
  TextColumn get etag => text()();
  TextColumn get json => text()();
  IntColumn get bytes => integer()();

  /// When the server last confirmed this body (200, or a 304 on it).
  DateTimeColumn get fetchedAt => dateTime()();
  DateTimeColumn get lastUsedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {key};
}

/// §4 «sync-состояние»: the server time a list was last caught up to
/// (`meta.syncedAt`), per account and list.
@DataClassName('SyncStateRow')
class SyncState extends Table {
  TextColumn get owner => text()();
  TextColumn get listKey => text()();
  DateTimeColumn get syncedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {owner, listKey};
}

/// Package A: «this post's view was sent at …» survives a restart, so a
/// relaunch does not send the same views again within the repeat window.
@DataClassName('EventDedupRow')
class EventDedup extends Table {
  TextColumn get owner => text()();
  TextColumn get key => text()();
  DateTimeColumn get until => dateTime()();

  @override
  Set<Column> get primaryKey => {owner, key};
}

/// Package A: events waiting for the next batch (views, impressions, case
/// views) — kept on disk so a kill between two flushes loses nothing.
@DataClassName('QueuedEventRow')
class EventsQueue extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get owner => text()();

  /// `post:view`, `post:impression`, `post:profile_visit`, `case:view`.
  TextColumn get kind => text()();
  TextColumn get subject => text()();
  DateTimeColumn get createdAt => dateTime()();
}

/// Package C: chat and group messages on the phone (WhatsApp keeps the
/// history on the device; the chat opens without a request). [json] is the
/// message as the server sent it.
@DataClassName('CachedMessageRow')
class CachedMessages extends Table {
  TextColumn get owner => text()();
  TextColumn get conversationId => text()();
  TextColumn get id => text()();
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get json => text()();
  IntColumn get bytes => integer()();

  @override
  Set<Column> get primaryKey => {owner, conversationId, id};
}

/// Package C: what the phone holds of one chat — the newest id (catch-up
/// with `afterId`), the oldest and whether the start was reached, and when
/// it was last opened (LRU by chat).
@DataClassName('ConversationSyncRow')
class ConversationSync extends Table {
  TextColumn get owner => text()();
  TextColumn get conversationId => text()();
  TextColumn get newestId => text().nullable()();

  /// The server's cursor for the page after the oldest one on the phone
  /// (null = none asked yet, or [complete]).
  TextColumn get nextCursor => text().nullable()();
  BoolColumn get complete => boolean().withDefault(const Constant(false))();
  DateTimeColumn get openedAt => dateTime()();
  IntColumn get bytes => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {owner, conversationId};
}

/// Package K: a translated post / message, so reopening it does not ask
/// the server again.
@DataClassName('CachedTranslationRow')
class CachedTranslations extends Table {
  TextColumn get owner => text()();
  TextColumn get kind => text()();
  TextColumn get id => text()();
  TextColumn get target => text()();
  TextColumn get body => text()();
  IntColumn get bytes => integer()();
  DateTimeColumn get usedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {owner, kind, id, target};
}

/// Owner 2026-10-24 («Просмотры» of a case document): who opened my file,
/// kept on the phone like the chat history. [json] is the row as the server
/// sent it (name, role, device, masked address); the list opens from here
/// without a request and only newer rows are fetched.
@DataClassName('CachedFileViewRow')
class CachedFileViews extends Table {
  TextColumn get owner => text()();
  TextColumn get fileId => text()();
  TextColumn get id => text()();
  DateTimeColumn get viewedAt => dateTime()();
  TextColumn get json => text()();
  IntColumn get bytes => integer()();

  @override
  Set<Column> get primaryKey => {owner, fileId, id};
}

/// What the phone holds of one file's view list: the newest `viewedAt` (the
/// `?since=` of the next catch-up), the server cursor for the page older
/// than the oldest held row, and when it was last opened (LRU by file).
@DataClassName('FileViewsSyncRow')
class FileViewsSync extends Table {
  TextColumn get owner => text()();
  TextColumn get fileId => text()();
  DateTimeColumn get newestAt => dateTime().nullable()();
  TextColumn get olderCursor => text().nullable()();
  DateTimeColumn get openedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {owner, fileId};
}

/// The cache database (`lawbid_cache`). On the web build it lives only in
/// the tab's memory (plan §5: a shared or private computer keeps nothing
/// of the account on disk); on phones it is a file the OS protects.
@DriftDatabase(
  tables: [
    HttpCache,
    SyncState,
    EventDedup,
    EventsQueue,
    CachedMessages,
    ConversationSync,
    CachedTranslations,
    CachedFileViews,
    FileViewsSync,
  ],
)
class CacheDatabase extends _$CacheDatabase implements SyncStateStore {
  CacheDatabase([QueryExecutor? executor])
      : super(executor ?? appDriftCacheDatabase('lawbid_cache'));

  @override
  int get schemaVersion => 2;

  // v2 (owner 2026-10-24): the view lists of case documents - two new
  // tables; nothing existing changes.
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(cachedFileViews);
            await m.createTable(fileViewsSync);
          }
        },
      );

  // --- http cache -------------------------------------------------------

  Future<HttpCacheRow?> httpEntry(String key) =>
      (select(httpCache)..where((r) => r.key.equals(key))).getSingleOrNull();

  Future<void> putHttpEntry({
    required String key,
    required String etag,
    required String json,
    required int bytes,
    required DateTime now,
  }) =>
      into(httpCache).insertOnConflictUpdate(
        HttpCacheCompanion.insert(
          key: key,
          etag: etag,
          json: json,
          bytes: bytes,
          fetchedAt: now,
          lastUsedAt: now,
        ),
      );

  /// A 304: the body is still current — it counts as fetched now.
  Future<void> touchHttpEntry(
    String key,
    DateTime now, {
    bool confirmed = false,
  }) =>
      (update(httpCache)..where((r) => r.key.equals(key))).write(
        HttpCacheCompanion(
          lastUsedAt: Value(now),
          fetchedAt: confirmed ? Value(now) : const Value.absent(),
        ),
      );

  Future<int> httpBytes() async {
    final sum = httpCache.bytes.sum();
    final row = await (selectOnly(httpCache)..addColumns([sum])).getSingle();
    return row.read(sum) ?? 0;
  }

  /// Drops the least recently used rows until the table fits [limitBytes].
  Future<void> trimHttp(int limitBytes) async {
    var total = await httpBytes();
    if (total <= limitBytes) return;
    final rows = await (select(httpCache)
          ..orderBy([(r) => OrderingTerm.asc(r.lastUsedAt)]))
        .get();
    final drop = <String>[];
    for (final r in rows) {
      if (total <= limitBytes) break;
      drop.add(r.key);
      total -= r.bytes;
    }
    if (drop.isNotEmpty) {
      await (delete(httpCache)..where((r) => r.key.isIn(drop))).go();
    }
  }

  Future<void> clearHttp() => delete(httpCache).go();

  // --- sync state -------------------------------------------------------

  @override
  Future<DateTime?> syncedAt(String owner, String listKey) async =>
      (await (select(syncState)
                ..where(
                  (r) => r.owner.equals(owner) & r.listKey.equals(listKey),
                ))
              .getSingleOrNull())
          ?.syncedAt;

  @override
  Future<void> setSyncedAt(String owner, String listKey, DateTime at) =>
      into(syncState).insertOnConflictUpdate(
        SyncStateCompanion.insert(
          owner: owner,
          listKey: listKey,
          syncedAt: at,
        ),
      );

  @override
  Future<void> clearSyncedAt(String owner, String listKey) => (delete(syncState)
        ..where((r) => r.owner.equals(owner) & r.listKey.equals(listKey)))
      .go();

  // --- event dedup + queue (package A) ----------------------------------

  Future<DateTime?> dedupUntil(String owner, String key) async =>
      (await (select(eventDedup)
                ..where((r) => r.owner.equals(owner) & r.key.equals(key)))
              .getSingleOrNull())
          ?.until;

  Future<void> setDedup(String owner, String key, DateTime until) =>
      into(eventDedup).insertOnConflictUpdate(
        EventDedupCompanion.insert(owner: owner, key: key, until: until),
      );

  Future<void> dropExpiredDedup(DateTime now) =>
      (delete(eventDedup)..where((r) => r.until.isSmallerThanValue(now))).go();

  /// Appends one event; the queue never grows past [maxRows] (the oldest
  /// go first — statistics never fill the phone).
  Future<void> enqueueEvent({
    required String owner,
    required String kind,
    required String subject,
    required DateTime now,
    int maxRows = 500,
  }) async {
    await into(eventsQueue).insert(
      EventsQueueCompanion.insert(
        owner: owner,
        kind: kind,
        subject: subject,
        createdAt: now,
      ),
    );
    final count = countAll();
    final total = await (selectOnly(eventsQueue)..addColumns([count]))
        .map((r) => r.read(count) ?? 0)
        .getSingle();
    final extra = total - maxRows;
    if (extra > 0) {
      await customStatement(
        'DELETE FROM events_queue WHERE id IN '
        '(SELECT id FROM events_queue ORDER BY id ASC LIMIT $extra)',
      );
    }
  }

  Future<List<QueuedEventRow>> queuedEvents(String owner, {int limit = 50}) =>
      (select(eventsQueue)
            ..where((r) => r.owner.equals(owner))
            ..orderBy([(r) => OrderingTerm.asc(r.id)])
            ..limit(limit))
          .get();

  Future<void> dropEvents(Iterable<int> ids) =>
      (delete(eventsQueue)..where((r) => r.id.isIn(ids))).go();

  // --- messages (package C) ---------------------------------------------

  /// The newest row of a chat (the `afterId` of the next catch-up).
  Future<CachedMessageRow?> newestMessage(
    String owner,
    String conversationId,
  ) =>
      (select(cachedMessages)
            ..where(
              (r) =>
                  r.owner.equals(owner) &
                  r.conversationId.equals(conversationId),
            )
            ..orderBy([(r) => OrderingTerm.desc(r.createdAt)])
            ..limit(1))
          .getSingleOrNull();

  Future<List<CachedMessageRow>> messagesOf(
    String owner,
    String conversationId, {
    int limit = 50,
    DateTime? before,
  }) =>
      (select(cachedMessages)
            ..where(
              (r) =>
                  r.owner.equals(owner) &
                  r.conversationId.equals(conversationId) &
                  (before == null
                      ? const Constant(true)
                      : r.createdAt.isSmallerThanValue(before)),
            )
            ..orderBy([(r) => OrderingTerm.desc(r.createdAt)])
            ..limit(limit))
          .get();

  Stream<List<CachedMessageRow>> watchMessages(
    String owner,
    String conversationId, {
    int limit = 200,
  }) =>
      (select(cachedMessages)
            ..where(
              (r) =>
                  r.owner.equals(owner) &
                  r.conversationId.equals(conversationId),
            )
            ..orderBy([(r) => OrderingTerm.desc(r.createdAt)])
            ..limit(limit))
          .watch();

  Future<void> putMessages(
    String owner,
    String conversationId,
    Iterable<({String id, DateTime createdAt, String json})> rows,
  ) =>
      batch((b) {
        for (final r in rows) {
          b.insert(
            cachedMessages,
            CachedMessagesCompanion.insert(
              owner: owner,
              conversationId: conversationId,
              id: r.id,
              createdAt: r.createdAt,
              json: r.json,
              bytes: r.json.length,
            ),
            onConflict: DoUpdate(
              (_) => CachedMessagesCompanion(
                json: Value(r.json),
                bytes: Value(r.json.length),
                createdAt: Value(r.createdAt),
              ),
            ),
          );
        }
      });

  Future<void> deleteMessage(
    String owner,
    String conversationId,
    String id,
  ) =>
      (delete(cachedMessages)
            ..where(
              (r) =>
                  r.owner.equals(owner) &
                  r.conversationId.equals(conversationId) &
                  r.id.equals(id),
            ))
          .go();

  Future<ConversationSyncRow?> conversationSyncOf(
    String owner,
    String conversationId,
  ) =>
      (select(conversationSync)
            ..where(
              (r) =>
                  r.owner.equals(owner) &
                  r.conversationId.equals(conversationId),
            ))
          .getSingleOrNull();

  /// «Leave this field as it is» for [setConversationSync].
  static const Object keep = _keep;

  Future<void> setConversationSync({
    required String owner,
    required String conversationId,
    required DateTime now,
    Object? nextCursor = _keep,
    Object? newestId = _keep,
    bool? complete,
  }) async {
    final current = await conversationSyncOf(owner, conversationId);
    final bytesSum = cachedMessages.bytes.sum();
    final bytes = await (selectOnly(cachedMessages)
          ..addColumns([bytesSum])
          ..where(
            cachedMessages.owner.equals(owner) &
                cachedMessages.conversationId.equals(conversationId),
          ))
        .map((r) => r.read(bytesSum) ?? 0)
        .getSingle();
    await into(conversationSync).insertOnConflictUpdate(
      ConversationSyncCompanion.insert(
        owner: owner,
        conversationId: conversationId,
        nextCursor: Value(
          identical(nextCursor, _keep)
              ? current?.nextCursor
              : nextCursor as String?,
        ),
        newestId: Value(
          identical(newestId, _keep) ? current?.newestId : newestId as String?,
        ),
        complete: Value(complete ?? current?.complete ?? false),
        openedAt: now,
        bytes: Value(bytes),
      ),
    );
  }

  /// Forgets one chat (a `409 SYNC_TOO_OLD`, or LRU eviction).
  Future<void> dropConversation(String owner, String conversationId) async {
    await (delete(cachedMessages)
          ..where(
            (r) =>
                r.owner.equals(owner) & r.conversationId.equals(conversationId),
          ))
        .go();
    await (delete(conversationSync)
          ..where(
            (r) =>
                r.owner.equals(owner) & r.conversationId.equals(conversationId),
          ))
        .go();
  }

  Future<int> messagesBytes() async {
    final sum = cachedMessages.bytes.sum();
    final row =
        await (selectOnly(cachedMessages)..addColumns([sum])).getSingle();
    return row.read(sum) ?? 0;
  }

  /// Plan §5.1: LRU **by chat** — the chat opened longest ago goes whole,
  /// until the messages fit [limitBytes]. [keep] (the open chat) stays.
  Future<List<String>> trimMessages(int limitBytes, {String? keep}) async {
    var total = await messagesBytes();
    if (total <= limitBytes) return const [];
    final chats = await (select(conversationSync)
          ..orderBy([(r) => OrderingTerm.asc(r.openedAt)]))
        .get();
    final dropped = <String>[];
    for (final c in chats) {
      if (total <= limitBytes) break;
      if (c.conversationId == keep) continue;
      await dropConversation(c.owner, c.conversationId);
      dropped.add(c.conversationId);
      total -= c.bytes;
    }
    return dropped;
  }

  Future<void> clearMessages() async {
    await delete(cachedMessages).go();
    await delete(conversationSync).go();
  }

  // --- translations (package K) -----------------------------------------

  Future<String?> translation(
    String owner,
    String kind,
    String id,
    String target,
    DateTime now,
  ) async {
    final row = await (select(cachedTranslations)
          ..where(
            (r) =>
                r.owner.equals(owner) &
                r.kind.equals(kind) &
                r.id.equals(id) &
                r.target.equals(target),
          ))
        .getSingleOrNull();
    if (row == null) return null;
    await (update(cachedTranslations)
          ..where(
            (r) =>
                r.owner.equals(owner) &
                r.kind.equals(kind) &
                r.id.equals(id) &
                r.target.equals(target),
          ))
        .write(CachedTranslationsCompanion(usedAt: Value(now)));
    return row.body;
  }

  Future<void> putTranslation({
    required String owner,
    required String kind,
    required String id,
    required String target,
    required String body,
    required DateTime now,
    int limitBytes = 2 * 1024 * 1024,
  }) async {
    await into(cachedTranslations).insertOnConflictUpdate(
      CachedTranslationsCompanion.insert(
        owner: owner,
        kind: kind,
        id: id,
        target: target,
        body: body,
        bytes: body.length,
        usedAt: now,
      ),
    );
    final sum = cachedTranslations.bytes.sum();
    var total = await (selectOnly(cachedTranslations)..addColumns([sum]))
        .map((r) => r.read(sum) ?? 0)
        .getSingle();
    if (total <= limitBytes) return;
    final rows = await (select(cachedTranslations)
          ..orderBy([(r) => OrderingTerm.asc(r.usedAt)]))
        .get();
    for (final r in rows) {
      if (total <= limitBytes) break;
      await (delete(cachedTranslations)
            ..where(
              (x) =>
                  x.owner.equals(r.owner) &
                  x.kind.equals(r.kind) &
                  x.id.equals(r.id) &
                  x.target.equals(r.target),
            ))
          .go();
      total -= r.bytes;
    }
  }

  Future<int> translationsBytes() async {
    final sum = cachedTranslations.bytes.sum();
    final row =
        await (selectOnly(cachedTranslations)..addColumns([sum])).getSingle();
    return row.read(sum) ?? 0;
  }

  // --- file views (owner 2026-10-24) ------------------------------------

  /// Rows kept per file: the newest ones; older pages are read from the
  /// server when asked and not kept.
  static const fileViewsPerFile = 100;

  /// Newest first.
  Future<List<CachedFileViewRow>> fileViewsOf(String owner, String fileId) =>
      (select(cachedFileViews)
            ..where((r) => r.owner.equals(owner) & r.fileId.equals(fileId))
            ..orderBy([
              (r) => OrderingTerm.desc(r.viewedAt),
              (r) => OrderingTerm.desc(r.id),
            ])
            ..limit(fileViewsPerFile))
          .get();

  Future<FileViewsSyncRow?> fileViewsSyncOf(String owner, String fileId) =>
      (select(fileViewsSync)
            ..where((r) => r.owner.equals(owner) & r.fileId.equals(fileId)))
          .getSingleOrNull();

  /// Stores [rows] (upsert by id) and moves the file's sync row in one go,
  /// so a kill in between never leaves a cursor ahead of its rows.
  /// [olderCursor] is left as it is unless [setOlderCursor].
  Future<void> putFileViews({
    required String owner,
    required String fileId,
    required Iterable<({String id, DateTime viewedAt, String json})> rows,
    required DateTime now,
    DateTime? newestAt,
    String? olderCursor,
    bool setOlderCursor = false,
  }) =>
      transaction(() async {
        final current = await fileViewsSyncOf(owner, fileId);
        await batch((b) {
          for (final r in rows) {
            b.insert(
              cachedFileViews,
              CachedFileViewsCompanion.insert(
                owner: owner,
                fileId: fileId,
                id: r.id,
                viewedAt: r.viewedAt,
                json: r.json,
                bytes: r.json.length,
              ),
              onConflict: DoUpdate(
                (_) => CachedFileViewsCompanion(
                  viewedAt: Value(r.viewedAt),
                  json: Value(r.json),
                  bytes: Value(r.json.length),
                ),
              ),
            );
          }
        });
        final held = current?.newestAt;
        final newest = newestAt == null
            ? held
            : (held != null && held.isAfter(newestAt) ? held : newestAt);
        await into(fileViewsSync).insertOnConflictUpdate(
          FileViewsSyncCompanion.insert(
            owner: owner,
            fileId: fileId,
            newestAt: Value(newest),
            olderCursor: Value(
              setOlderCursor ? olderCursor : current?.olderCursor,
            ),
            openedAt: now,
          ),
        );
      });

  Future<int> fileViewsCount(String owner, String fileId) async {
    final n = countAll();
    return (selectOnly(cachedFileViews)
          ..addColumns([n])
          ..where(
            cachedFileViews.owner.equals(owner) &
                cachedFileViews.fileId.equals(fileId),
          ))
        .map((r) => r.read(n) ?? 0)
        .getSingle();
  }

  Future<void> dropFileViews(String owner, String fileId) async {
    await (delete(cachedFileViews)
          ..where((r) => r.owner.equals(owner) & r.fileId.equals(fileId)))
        .go();
    await (delete(fileViewsSync)
          ..where((r) => r.owner.equals(owner) & r.fileId.equals(fileId)))
        .go();
  }

  Future<int> fileViewsBytes() async {
    final sum = cachedFileViews.bytes.sum();
    final row =
        await (selectOnly(cachedFileViews)..addColumns([sum])).getSingle();
    return row.read(sum) ?? 0;
  }

  /// LRU **by file**: the list opened longest ago goes whole until the rows
  /// fit [limitBytes].
  Future<void> trimFileViews(int limitBytes) async {
    var total = await fileViewsBytes();
    if (total <= limitBytes) return;
    final files = await (select(fileViewsSync)
          ..orderBy([(r) => OrderingTerm.asc(r.openedAt)]))
        .get();
    for (final f in files) {
      if (total <= limitBytes) break;
      final sum = cachedFileViews.bytes.sum();
      final size = await (selectOnly(cachedFileViews)
            ..addColumns([sum])
            ..where(
              cachedFileViews.owner.equals(f.owner) &
                  cachedFileViews.fileId.equals(f.fileId),
            ))
          .map((r) => r.read(sum) ?? 0)
          .getSingle();
      await dropFileViews(f.owner, f.fileId);
      total -= size;
    }
  }

  /// «Прочее»: everything small and technical.
  Future<void> clearOther() async {
    await delete(syncState).go();
    await delete(eventDedup).go();
    await delete(cachedTranslations).go();
    await delete(cachedFileViews).go();
    await delete(fileViewsSync).go();
  }
}

const Object _keep = Object();
