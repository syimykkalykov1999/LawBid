import 'dart:async';
import 'dart:io';

import 'package:background_downloader/background_downloader.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/core/uploads/upload_files.dart';

StorageTransport queueTransport({required StorageTransport fallback}) =>
    !kIsWeb && (Platform.isAndroid || Platform.isIOS)
        ? BackgroundStorageTransport(fallback: fallback)
        : fallback;

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
        httpRequestMethod: 'POST',
        mimeType: mime,
        fields: target.fields,
        updates: Updates.statusAndProgress,
        retries: 3,
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
