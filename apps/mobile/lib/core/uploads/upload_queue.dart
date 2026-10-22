import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/uploads/background_transport.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';

/// One queued job, as its handler sees it.
@immutable
class UploadJob {
  const UploadJob({
    required this.id,
    required this.ownerId,
    required this.kind,
    required this.target,
    required this.payload,
    required this.createdAt,
    this.fileName,
    this.mime,
    this.fileId,
    this.progress = const {},
    this.attempts = 0,
    this.failedCode,
  });

  factory UploadJob.fromRow(UploadJobRow r) => UploadJob(
        id: r.id,
        ownerId: r.ownerId,
        kind: r.kind,
        target: r.target,
        payload: _map(r.payload),
        createdAt: r.createdAt,
        fileName: r.fileName,
        mime: r.mime,
        fileId: r.fileId,
        progress: _map(r.progress),
        attempts: r.attempts,
        failedCode: r.failedCode,
      );

  static Map<String, Object?> _map(String json) {
    try {
      return (jsonDecode(json) as Map).cast<String, Object?>();
    } on Object {
      return const {};
    }
  }

  final String id;
  final String ownerId;
  final String kind;
  final String target;
  final Map<String, Object?> payload;
  final DateTime createdAt;
  final String? fileName;
  final String? mime;
  final String? fileId;
  final Map<String, Object?> progress;
  final int attempts;
  final String? failedCode;

  bool get failed => failedCode != null;
}

/// What a job's handler may do while it runs.
class UploadJobScope {
  UploadJobScope._(this._queue, this.job);

  final UploadQueue _queue;

  /// The job as it was when this step started.
  final UploadJob job;

  /// The queue's uploader (the OS background transport on the phone).
  StorageUploader get uploader => _queue.uploader;

  /// The local file of the job (null in the browser or when it is gone).
  Future<String?> filePath() async {
    final n = job.fileName;
    return n == null ? null : _queue.files.pathOf(n);
  }

  /// The job's file to send: streamed from disk on the phone, from memory
  /// in the browser; `LOCAL_FILE_MISSING` when it no longer exists.
  Future<UploadBody> body() async {
    final path = await filePath();
    if (path != null) return UploadBody.file(path);
    final n = job.fileName;
    final bytes = n == null ? null : await _queue.files.read(n);
    if (bytes == null) {
      throw const ApiException(
        code: UploadQueue.localFileMissing,
        message: 'The file to send is no longer on this device.',
      );
    }
    return UploadBody.bytes(bytes);
  }

  Future<Uint8List?> bytes() async {
    final n = job.fileName;
    return n == null ? null : _queue.files.read(n);
  }

  Future<void> saveFileId(String fileId) =>
      _queue.db.saveFileId(job.id, fileId);

  /// Merges [values] into the job's saved progress (survives a restart).
  Future<void> saveProgress(Map<String, Object?> values) async {
    final row = await _queue.db.byId(job.id);
    final now =
        row == null ? <String, Object?>{} : UploadJob.fromRow(row).progress;
    await _queue.db.saveProgress(
      job.id,
      jsonEncode({...now, ...values}),
    );
  }

  /// 0…1 of the current transfer, for the bubble / card.
  void reportProgress(double value) {
    if (!_queue._progress.isClosed) {
      _queue._progress.add((id: job.id, value: value));
    }
  }
}

/// Runs the jobs of one kind. [prepare] is the long part (the upload) and
/// runs for several jobs at once; [commit] (the send) runs one target at a
/// time, oldest first, so an album keeps its order.
abstract class UploadJobHandler {
  String get kind;

  Future<void> prepare(UploadJob job, UploadJobScope scope) async {}

  Future<void> commit(UploadJob job, UploadJobScope scope);

  /// The job left the queue (done or deleted); its file is removed right
  /// after (move it away first to keep it).
  Future<void> removed(UploadJob job, {required bool sent}) async {}

  /// The job was refused for good ([code]); it waits for Retry / Delete.
  void refused(UploadJob job, String code) {}
}

typedef UploadProgress = ({String id, double value});

/// Owner 2026-10-22 (product audit #4 §3, WhatsApp / Instagram): the
/// persistent media queue. Jobs live in Drift ([UploadQueueDatabase]) with
/// their file in the queue folder ([UploadFiles]); they drain when added,
/// at start, when the app comes back to the front and when the connection
/// returns. A temporary failure (no network, 401 while renewing, 408 /
/// 425 / 429 / 5xx) is retried after 1 → 2 → 4 … 30 s; a refusal stays as
/// «not sent» with Retry / Delete. A job is removed only after the server
/// accepted it, so a kill at any moment never loses or duplicates it (the
/// steps are keyed: the message's clientMessageId, the transfer's task id).
class UploadQueue with WidgetsBindingObserver {
  UploadQueue({
    required this.db,
    required this.files,
    required this.uploader,
    required String? Function() ownerId,
    this.parallel = 3,
    bool observeLifecycle = true,
  }) : _ownerId = ownerId {
    if (observeLifecycle) WidgetsBinding.instance.addObserver(this);
    _observing = observeLifecycle;
  }

  /// The job's local file disappeared (a browser reload).
  static const localFileMissing = 'LOCAL_FILE_MISSING';

  final UploadQueueDatabase db;
  final UploadFiles files;
  final StorageUploader uploader;
  final String? Function() _ownerId;
  final int parallel;
  late final bool _observing;

  final _handlers = <String, UploadJobHandler>{};
  final _progress = StreamController<UploadProgress>.broadcast();

  /// The pass running for each target, and the targets asked again
  /// while theirs runs.
  final _running = <String, Future<void>>{};
  final _again = <String>{};
  final _retries = <String, Timer>{};
  final _failures = <String, int>{};
  bool _disposed = false;

  /// The account whose jobs run now (null signed out).
  String? get ownerId => _ownerId();

  Stream<UploadProgress> get progress => _progress.stream;

  void register(UploadJobHandler handler) {
    _handlers[handler.kind] = handler;
    unawaited(drain());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(drain());
  }

  /// Adds a job (its file already kept under [fileName]) and starts it.
  Future<void> enqueue({
    required String id,
    required String kind,
    required String target,
    Map<String, Object?> payload = const {},
    String? fileName,
    String? mime,
  }) async {
    final owner = ownerId;
    if (owner == null) return;
    final now = DateTime.now();
    await db.put(
      UploadJobsCompanion.insert(
        id: id,
        ownerId: owner,
        kind: kind,
        target: target,
        payload: jsonEncode(payload),
        fileName: Value(fileName),
        mime: Value(mime),
        seq: now.microsecondsSinceEpoch,
        createdAt: now,
      ),
    );
    unawaited(drain());
  }

  /// «Повторить»: a refused job goes again.
  Future<void> retry(String id) async {
    await db.clearFailure(id);
    _failures.clear();
    unawaited(drain());
  }

  /// «Удалить»: the job and its file go.
  Future<void> discard(String id) async {
    final row = await db.byId(id);
    if (row == null) return;
    await _remove(UploadJob.fromRow(row), sent: false);
  }

  Future<void> _remove(UploadJob job, {required bool sent}) async {
    await db.remove(job.id);
    try {
      // First the handler (it may keep the file, e.g. as a voice cache).
      await _handlers[job.kind]?.removed(job, sent: sent);
    } on Object {
      // Clean-up is best effort.
    }
    final n = job.fileName;
    if (n != null) await files.remove(n);
  }

  /// The wait before retry number [failures] (1-based): 1, 2, 4 … 30 s.
  @visibleForTesting
  static Duration backoff(int failures) {
    final s = 1 << (failures - 1).clamp(0, 5);
    return Duration(seconds: s > 30 ? 30 : s);
  }

  /// Refusals that no repeat can change.
  static const _final = {
    localFileMissing,
    ApiErrorCodes.fileTooLarge,
    ApiErrorCodes.fileNotAttachable,
  };

  /// Worth repeating as it is (same rule as the text outbox).
  static bool temporary(Object e) {
    if (e is! ApiException) return e is! ArgumentError && e is! StateError;
    if (_final.contains(e.code)) return false;
    final c = e.statusCode ?? 500;
    return e.isNetworkError ||
        c == 401 ||
        c == 408 ||
        c == 425 ||
        c == 429 ||
        c >= 500;
  }

  /// Starts a pass for every target with jobs; a target already running
  /// gets one more pass after the current one (so nothing written meanwhile
  /// is left behind). Targets run independently: a long video upload never
  /// holds a chat's voice note back. Completes when these passes end.
  Future<void> drain() async {
    if (_disposed) return;
    final owner = ownerId;
    if (owner == null) return;
    final List<UploadJobRow> rows;
    try {
      rows = await db.pending(owner);
    } on Object catch (e) {
      debugPrint('upload queue: $e');
      return;
    }
    final targets = {
      for (final r in rows)
        if (r.failedCode == null && _handlers.containsKey(r.kind)) r.target,
    };
    await Future.wait([
      for (final t in targets) _drainTarget(owner, t),
    ]);
  }

  Future<void> _drainTarget(String owner, String target) {
    final running = _running[target];
    if (running != null) {
      _again.add(target);
      return running;
    }
    final pass = _targetLoop(owner, target);
    _running[target] = pass;
    return pass.whenComplete(() => _running.remove(target));
  }

  Future<void> _targetLoop(String owner, String target) async {
    var temporaryFailure = false;
    do {
      _again.remove(target);
      try {
        final jobs = [
          for (final r in await db.pending(owner))
            if (r.target == target &&
                r.failedCode == null &&
                _handlers.containsKey(r.kind))
              UploadJob.fromRow(r),
        ];
        temporaryFailure = jobs.isNotEmpty && await _runTarget(jobs);
      } on Object catch (e) {
        debugPrint('upload queue: $e');
        temporaryFailure = true;
      }
    } while (_again.contains(target) && !_disposed);
    if (_disposed) return;
    if (temporaryFailure) {
      final n = (_failures[target] ?? 0) + 1;
      _failures[target] = n;
      _retries[target]?.cancel();
      _retries[target] = Timer(backoff(n), () => unawaited(drain()));
    } else {
      _failures.remove(target);
      _retries.remove(target)?.cancel();
    }
  }

  /// One target's jobs: their uploads start at once (at most [parallel]
  /// in the whole queue), their sends go oldest first; a temporary failure
  /// holds the ones behind it. True when something should be tried again.
  Future<bool> _runTarget(List<UploadJob> jobs) async {
    var temporaryFailure = false;
    final prepared = <String, Future<bool>>{
      for (final job in jobs) job.id: _slot(() => _prepare(job)),
    };
    for (final job in jobs) {
      if (_disposed) return false;
      final ok = await prepared[job.id]!;
      if (!ok) {
        // Refused for good: the next one may go; temporary: they wait.
        final row = await db.byId(job.id);
        if (row == null || row.failedCode != null) continue;
        temporaryFailure = true;
        break;
      }
      final row = await db.byId(job.id);
      if (row == null) continue; // deleted meanwhile
      final fresh = UploadJob.fromRow(row);
      try {
        await _handlers[job.kind]!.commit(fresh, UploadJobScope._(this, fresh));
        await _remove(fresh, sent: true);
      } on Object catch (e) {
        if (await _failed(fresh, e)) {
          temporaryFailure = true;
          break;
        }
      }
    }
    // Let the uploads still running finish before the pass ends.
    await Future.wait(prepared.values);
    return temporaryFailure;
  }

  Future<bool> _prepare(UploadJob job) async {
    try {
      await _handlers[job.kind]!.prepare(job, UploadJobScope._(this, job));
      return true;
    } on Object catch (e) {
      await _failed(job, e);
      return false;
    }
  }

  int _busy = 0;
  final _waiting = <Completer<void>>[];

  /// At most [parallel] uploads at a time across the queue.
  Future<T> _slot<T>(Future<T> Function() run) async {
    while (_busy >= parallel) {
      final c = Completer<void>();
      _waiting.add(c);
      await c.future;
    }
    _busy++;
    try {
      return await run();
    } finally {
      _busy--;
      if (_waiting.isNotEmpty) _waiting.removeAt(0).complete();
    }
  }

  /// Records a failure; true when it is worth trying again later.
  Future<bool> _failed(UploadJob job, Object e) async {
    debugPrint('upload queue: ${job.kind} ${job.id}: $e');
    // Stopped mid-way (signed out, the app closing): untouched, next run.
    if (_disposed) return true;
    final again = temporary(e);
    final code = again ? null : (e is ApiException ? e.code : 'UPLOAD_FAILED');
    await db.attempted(job.id, failedCode: code);
    if (code != null) _handlers[job.kind]?.refused(job, code);
    return again;
  }

  void dispose() {
    _disposed = true;
    for (final t in _retries.values) {
      t.cancel();
    }
    if (_observing) WidgetsBinding.instance.removeObserver(this);
    unawaited(_progress.close());
  }
}

final uploadQueueDatabaseProvider = Provider<UploadQueueDatabase>((ref) {
  final db = UploadQueueDatabase();
  ref.onDispose(db.close);
  return db;
});

final uploadFilesProvider = Provider<UploadFiles>((ref) => UploadFiles());

/// The account whose jobs run (the signed-in session).
final uploadQueueOwnerProvider = Provider<String?>(
  (ref) => ref.watch(sessionControllerProvider.select((s) => s?.sub)),
);

/// The queue's uploader: the OS background transfer on the phone.
final uploadQueueUploaderProvider = Provider<StorageUploader>(
  (ref) => StorageUploader(
    apiDio: ref.watch(dioProvider),
    transport: queueTransport(
      fallback: DioStorageTransport(ref.watch(storageDioProvider)),
    ),
  ),
);

/// The app's one queue; rebuilt for another account.
final uploadQueueProvider = Provider<UploadQueue>((ref) {
  final owner = ref.watch(uploadQueueOwnerProvider);
  final queue = UploadQueue(
    db: ref.watch(uploadQueueDatabaseProvider),
    files: ref.watch(uploadFilesProvider),
    uploader: ref.watch(uploadQueueUploaderProvider),
    ownerId: () => owner,
  );
  ref
    ..listen(connectivityStatusProvider, (prev, next) {
      if (next.offlineReason == null && prev?.offlineReason != null) {
        unawaited(queue.drain());
      }
    })
    ..onDispose(queue.dispose);
  return queue;
});
