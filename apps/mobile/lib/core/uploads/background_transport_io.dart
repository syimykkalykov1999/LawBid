import 'dart:async';
import 'dart:io';

import 'package:background_downloader/background_downloader.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:path_provider/path_provider.dart';

StorageTransport queueTransport({required StorageTransport fallback}) =>
    !kIsWeb && (Platform.isAndroid || Platform.isIOS)
        ? BackgroundStorageTransport(fallback: fallback)
        : fallback;

/// Stops the OS transfer with this task id (a cancelled upload).
Future<void> cancelBackgroundUpload(String taskId) async {
  if (kIsWeb || !(Platform.isAndroid || Platform.isIOS)) return;
  try {
    await FileDownloader().cancelTaskWithId(taskId);
  } on Object catch (e) {
    debugPrint('cancel upload $taskId: $e');
  }
}

/// Forgets the record of [taskId]; the next post sends the file again.
Future<void> forgetBackgroundUpload(String taskId) async {
  if (kIsWeb || !(Platform.isAndroid || Platform.isIOS)) return;
  try {
    await FileDownloader().database.deleteRecordWithId(taskId);
  } on Object catch (e) {
    debugPrint('forget upload $taskId: $e');
  }
}

bool get backgroundHandsOff =>
    !kIsWeb && (Platform.isAndroid || Platform.isIOS);

/// A transfer of [taskId] that is running or complete. On any doubt: true, so
/// the file stays with the OS as before.
Future<bool> backgroundUploadKnown(String taskId) async {
  if (!backgroundHandsOff) return false;
  try {
    await BackgroundStorageTransport._start();
    final record = await FileDownloader().database.recordForId(taskId);
    return record != null &&
        (record.status == TaskStatus.complete || record.status.isNotFinalState);
  } on Object catch (e) {
    debugPrint('upload record $taskId: $e');
    return true;
  }
}

/// Owner 2026-10-22 (audit #4 §3): the S3 POST of a queued file as an OS
/// background transfer (`background_downloader`: Android WorkManager, iOS
/// background URLSession). The task id is the queue job's id, so after the
/// app was killed the next run finds the same transfer — finished, still
/// running (it waits for it) or failed (it starts it again) — instead of
/// sending the file twice. Anything the OS service cannot take (bytes in
/// memory, a file outside the queue folder, no job id) goes through
/// [fallback].
class BackgroundStorageTransport implements StorageTransport {
  BackgroundStorageTransport({required this.fallback});

  final StorageTransport fallback;

  static Future<void>? _started;

  /// Once per run: track tasks in the plugin's database and collect what
  /// happened while the app was not running.
  static Future<void> _start() => _started ??= FileDownloader()
      .start(autoCleanDatabase: true)
      .catchError((Object e) => debugPrint('background uploads: $e'));

  /// How long a transfer that was already running is waited for.
  static const _waitRunning = Duration(minutes: 30);

  @override
  Future<void> post(
    StorageTarget target,
    UploadBody body, {
    required String filename,
    required String mime,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    String? taskId,
  }) async {
    final file = body is FileUploadBody ? File(body.path) : null;
    if (taskId == null ||
        file == null ||
        file.parent.uri.pathSegments.where((s) => s.isNotEmpty).lastOrNull !=
            UploadFiles.folder) {
      return fallback.post(
        target,
        body,
        filename: filename,
        mime: mime,
        onProgress: onProgress,
        cancel: cancel,
        taskId: taskId,
      );
    }
    await _start();
    final record = await FileDownloader().database.recordForId(taskId);
    TaskStatusUpdate? result;
    if (record != null && record.status == TaskStatus.complete) return;
    if (record != null && record.status.isNotFinalState) {
      result = await _awaitRunning(taskId, onProgress);
    }
    result ??= await FileDownloader().upload(
      UploadTask(
        taskId: taskId,
        url: target.url,
        filename: file.uri.pathSegments.last,
        directory: UploadFiles.folder,
        baseDirectory: BaseDirectory.applicationSupport,
        httpRequestMethod: target.isPut ? 'PUT' : 'POST',
        // R2 (PUT): the file is the raw body, with the signed headers.
        post: target.isPut ? 'binary' : null,
        // An empty Content-Disposition keeps the plugin from adding its own
        // `attachment` (R2 would store it and serve photos as downloads).
        headers: target.isPut
            ? {...target.headers, 'Content-Disposition': ''}
            : null,
        mimeType: mime,
        fields: target.isPut ? null : target.fields,
        updates: Updates.statusAndProgress,
        retries: 3,
        // Owner row 100: its notification (configureBackgroundUploads).
        group: uploadsGroup,
      ),
      onProgress: (p) {
        if (p >= 0) onProgress?.call(p);
      },
    );
    if (result.status == TaskStatus.complete) return;
    if (result.status == TaskStatus.canceled) {
      throw DioException.requestCancelled(
        requestOptions: RequestOptions(path: target.url),
        reason: 'cancelled',
      );
    }
    final code = result.responseStatusCode;
    throw ApiException(
      code: code == null
          ? ApiException.networkErrorCode
          : ApiErrorCodes.fileNotUploaded,
      message: 'Upload to storage failed.',
      statusCode: code,
    );
  }

  /// A transfer started before the app was killed: its final status.
  Future<TaskStatusUpdate?> _awaitRunning(
    String taskId,
    void Function(double progress)? onProgress,
  ) async {
    try {
      return await FileDownloader()
          .updates
          .where((u) => u.task.taskId == taskId)
          .map((u) {
            if (u is TaskProgressUpdate && u.progress >= 0) {
              onProgress?.call(u.progress);
            }
            return u;
          })
          .where((u) => u is TaskStatusUpdate && u.status.isFinalState)
          .cast<TaskStatusUpdate>()
          .first
          .timeout(_waitRunning);
    } on Object {
      // Lost track of it: start it again (S3 just overwrites the object).
      return null;
    }
  }
}

/// Owner row 100: the background_downloader group of the queue's whole-file
/// uploads (their progress notification).
const uploadsGroup = 'lawbid-uploads';

/// Owner row 100 (media audit 13.11, batch E item 10; R3): background
/// uploads on Android run as a foreground service with a progress
/// notification — WorkManager alone stops a task after about 9 minutes
/// (background_downloader README, «Android: … limited to 9 minutes»), so a
/// big video sent from a closed app restarted or failed. Config copied from
/// the package's doc/CONFIG.md («run task in foreground») and
/// doc/notifications.md. Android 14+ needs the `dataSync` service type
/// (AndroidManifest.xml). iOS runs them in its background URLSession and
/// shows no running notification; nothing to change there.
Future<void> configureBackgroundUploads({
  required bool foreground,
  required String title,
}) async {
  if (!backgroundHandsOff) return;
  try {
    final d = FileDownloader();
    if (Platform.isAndroid) {
      await d.configure(
        androidConfig: [
          (Config.runInForeground, foreground ? Config.always : Config.never),
        ],
      );
    }
    final running = foreground ? TaskNotification(title, '{progress}') : null;
    d
      ..configureNotificationForGroup(
        uploadsGroup,
        running: running,
        progressBar: foreground,
      )
      // The parts of one file: ONE notification, finished / all parts.
      ..configureNotificationForGroup(
        OsBackgroundParts.group,
        running: foreground
            ? TaskNotification(title, '{numFinished}/{numTotal}')
            : null,
        progressBar: foreground,
        groupNotificationId: foreground ? OsBackgroundParts.group : '',
      );
  } on Object catch (e) {
    debugPrint('background uploads config: $e');
  }
}

BackgroundParts? backgroundParts({required bool Function() enabled}) =>
    backgroundHandsOff ? OsBackgroundParts(enabled: enabled) : null;

/// Owner row 100 (media audit 13.11, batch E item 11; R4): the parts of a big
/// queued file still missing when the app leaves the screen, each as its own
/// OS background transfer (Android WorkManager, iOS background URLSession):
/// a 5 MiB part is short, so no OS time limit stops it, and after a kill
/// only the parts storage does not have go again. The pattern is
/// background_downloader's own parallel download (BSD-3, lib/src/chunk.dart:
/// one task per piece in a reserved group, the parent collecting their final
/// states), turned around for an upload: each part's bytes are written to
/// their own file (the OS sends files, not ranges) and PUT to the part's
/// presigned link; the server lists what storage has (ListParts), so no
/// ETags are collected here.
class OsBackgroundParts implements BackgroundParts {
  OsBackgroundParts({required bool Function() enabled}) : _enabled = enabled;

  final bool Function() _enabled;

  /// The reserved group of part transfers.
  static const group = 'lawbid-parts';

  /// Where part files wait (inside the queue's own folder).
  static const folder = '${UploadFiles.folder}/parts';

  static final _waiting = <String, Completer<bool>>{};
  static bool _listening = false;

  static String partId(String taskId, int number) => '$taskId.p$number';

  @override
  bool get enabled => backgroundHandsOff && _enabled();

  static void _listen() {
    if (_listening) return;
    _listening = true;
    FileDownloader().registerCallbacks(
      group: group,
      taskStatusCallback: (u) {
        if (!u.status.isFinalState) return;
        _waiting.remove(u.task.taskId)?.complete(
              u.status == TaskStatus.complete,
            );
      },
    );
  }

  @override
  Future<bool> send(
    String taskId,
    UploadBody body,
    List<StoragePart> parts, {
    void Function(int bytes)? onPartDone,
    CancelToken? cancel,
  }) async {
    if (parts.isEmpty) return true;
    await BackgroundStorageTransport._start();
    _listen();
    final root = await getApplicationSupportDirectory();
    final dir = Directory('${root.path}/$folder');
    await dir.create(recursive: true);
    final ids = <String>[];
    final results = <Future<bool>>[];
    var failed = false;
    Future<void> stopAll() async {
      try {
        await FileDownloader().cancelTasksWithIds(ids);
      } on Object catch (e) {
        debugPrint('parts cancel: $e');
      }
    }

    unawaited(cancel?.whenCancel.then((_) => stopAll()));
    // One part at a time is written and handed over, so whatever was handed
    // over before the OS suspends the app keeps going.
    for (final p in parts) {
      if (failed || (cancel?.isCancelled ?? false)) break;
      final id = partId(taskId, p.number);
      final file = File('${dir.path}/$id');
      try {
        final sink = file.openWrite();
        await sink.addStream(body.openRange(p.start, p.end));
        await sink.close();
      } on Object catch (e) {
        debugPrint('part file $id: $e');
        failed = true;
        break;
      }
      final done = Completer<bool>();
      _waiting[id] = done;
      ids.add(id);
      final queued = await FileDownloader().enqueue(
        UploadTask(
          taskId: id,
          url: p.url,
          filename: id,
          directory: folder,
          baseDirectory: BaseDirectory.applicationSupport,
          httpRequestMethod: 'PUT',
          post: 'binary',
          // An empty Content-Disposition keeps the plugin from adding one.
          headers: const {'Content-Disposition': ''},
          group: group,
          retries: 3,
        ),
      );
      if (!queued) {
        _waiting.remove(id);
        done.complete(false);
      }
      results.add(
        done.future.then((ok) async {
          await _drop(file);
          if (ok) {
            onPartDone?.call(p.end - p.start);
          } else if (!failed) {
            // One failed part fails the file: the rest stop at once.
            failed = true;
            await stopAll();
          }
          return ok;
        }),
      );
    }
    final oks = await Future.wait(results);
    await _forget(ids);
    return !failed &&
        oks.length == parts.length &&
        oks.every((ok) => ok) &&
        !(cancel?.isCancelled ?? false);
  }

  @override
  Future<void> settle(String taskId) async {
    if (!backgroundHandsOff) return;
    try {
      await BackgroundStorageTransport._start();
      final records = [
        for (final r in await FileDownloader().database.allRecords(
              group: group,
            ))
          if (r.taskId.startsWith('$taskId.p')) r,
      ];
      if (records.isEmpty) return;
      final ids = [for (final r in records) r.taskId];
      final open = [
        for (final r in records)
          if (r.status.isNotFinalState) r.taskId,
      ];
      if (open.isNotEmpty) await FileDownloader().cancelTasksWithIds(open);
      final root = await getApplicationSupportDirectory();
      for (final id in ids) {
        await _drop(File('${root.path}/$folder/$id'));
      }
      await _forget(ids);
    } on Object catch (e) {
      debugPrint('parts settle $taskId: $e');
    }
  }

  static Future<void> _drop(File f) async {
    try {
      if (f.existsSync()) await f.delete();
    } on Object {
      // The queue's folder cleanup takes it later.
    }
  }

  static Future<void> _forget(List<String> ids) async {
    if (ids.isEmpty) return;
    try {
      await FileDownloader().database.deleteRecordsWithIds(ids);
    } on Object {
      // autoCleanDatabase removes old records anyway.
    }
  }
}
