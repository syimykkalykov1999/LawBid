import 'package:drift/drift.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:lawbid/core/persistence/drift_web.dart';

part 'upload_queue_database.g.dart';

/// Owner 2026-10-22 (product audit #4 §3, WhatsApp / Instagram): media that
/// waits to be uploaded and sent — a voice note, a photo or file, a sticker
/// of a chat, a reel being published. A row outlives the app: closed or
/// killed mid-upload, the job continues on the next start (or when the
/// connection comes back).
@DataClassName('UploadJobRow')
class UploadJobs extends Table {
  /// The job id; for a chat message its clientMessageId (the server's
  /// unique key, so a job is never sent twice).
  TextColumn get id => text()();
  TextColumn get ownerId => text()();

  /// What the job is (`chat.voice`, `chat.attachment`, `chat.sticker`,
  /// `reel`): the handler that runs it.
  TextColumn get kind => text()();

  /// Where it goes (a conversation id); jobs of one target go in order.
  TextColumn get target => text()();

  /// What the handler needs (JSON): durations, captions, names …
  TextColumn get payload => text()();

  /// The local copy of the file in the queue's folder (a name, not a path:
  /// iOS moves the app's folder between launches).
  TextColumn get fileName => text().nullable()();
  TextColumn get mime => text().nullable()();

  /// Set once storage has the file and the scan is clean.
  TextColumn get fileId => text().nullable()();

  /// The handler's own progress between steps (JSON), e.g. a reel's
  /// upload address to resume from.
  TextColumn get progress => text().withDefault(const Constant('{}'))();
  IntColumn get attempts => integer().withDefault(const Constant(0))();

  /// Refused for good (too big, not allowed …): kept to show «не
  /// отправлено» with Retry / Delete; never retried on its own.
  TextColumn get failedCode => text().nullable()();

  /// Order of creation (microseconds; ties broken by the id).
  IntColumn get seq => integer()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [UploadJobs])
class UploadQueueDatabase extends _$UploadQueueDatabase {
  UploadQueueDatabase([QueryExecutor? executor])
      : super(
          executor ??
              appDriftDatabase(
                'lawbid_uploads',
                recovery: DriftRecovery.quarantine,
              ),
        );

  @override
  int get schemaVersion => 1;

  Future<void> put(UploadJobsCompanion job) =>
      into(uploadJobs).insertOnConflictUpdate(job);

  Future<UploadJobRow?> byId(String id) =>
      (select(uploadJobs)..where((j) => j.id.equals(id))).getSingleOrNull();

  /// Every job of [ownerId], oldest first.
  Future<List<UploadJobRow>> pending(String ownerId) => (select(uploadJobs)
        ..where((j) => j.ownerId.equals(ownerId))
        ..orderBy([
          (j) => OrderingTerm.asc(j.seq),
          (j) => OrderingTerm.asc(j.id),
        ]))
      .get();

  /// The jobs of one [target] whose kind starts with [kindPrefix].
  Stream<List<UploadJobRow>> watchTarget(
    String ownerId,
    String target, {
    String kindPrefix = '',
  }) =>
      (select(uploadJobs)
            ..where(
              (j) =>
                  j.ownerId.equals(ownerId) &
                  j.target.equals(target) &
                  j.kind.like('$kindPrefix%'),
            )
            ..orderBy([(j) => OrderingTerm.asc(j.seq)]))
          .watch();

  /// The jobs of one [kind] (e.g. the reel being published).
  Future<List<UploadJobRow>> ofKind(String ownerId, String kind) =>
      (select(uploadJobs)
            ..where((j) => j.ownerId.equals(ownerId) & j.kind.equals(kind))
            ..orderBy([(j) => OrderingTerm.asc(j.seq)]))
          .get();

  Future<void> remove(String id) =>
      (delete(uploadJobs)..where((j) => j.id.equals(id))).go();

  Future<void> saveFileId(String id, String fileId) =>
      (update(uploadJobs)..where((j) => j.id.equals(id)))
          .write(UploadJobsCompanion(fileId: Value(fileId)));

  Future<void> saveProgress(String id, String json) =>
      (update(uploadJobs)..where((j) => j.id.equals(id)))
          .write(UploadJobsCompanion(progress: Value(json)));

  Future<void> attempted(String id, {String? failedCode}) => customUpdate(
        'UPDATE upload_jobs SET attempts = attempts + 1, failed_code = ? '
        'WHERE id = ?',
        variables: [Variable<String>(failedCode), Variable<String>(id)],
        updates: {uploadJobs},
      );

  /// Retry: forget the refusal.
  Future<void> clearFailure(String id) =>
      (update(uploadJobs)..where((j) => j.id.equals(id)))
          .write(const UploadJobsCompanion(failedCode: Value(null)));
}
