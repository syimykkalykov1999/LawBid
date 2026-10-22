import 'dart:async';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Where one file goes: the presigned S3 POST of `POST /files/presign`.
class StorageTarget {
  const StorageTarget({
    required this.fileId,
    required this.url,
    required this.fields,
  });

  final String fileId;
  final String url;

  /// The policy fields; the file part always goes LAST (S3 POST policy).
  final Map<String, String> fields;
}

/// Sends the bytes of one [StorageTarget]. [DioStorageTransport] in the
/// foreground; the persistent upload queue uses the platform's background
/// transfer service on Android / iOS (core/uploads/background_transport.dart)
/// so an upload keeps going after the app is closed.
// A seam on purpose: Dio in the foreground, the OS service in the queue.
// ignore: one_member_abstracts
abstract interface class StorageTransport {
  Future<void> post(
    StorageTarget target,
    UploadBody body, {
    required String filename,
    required String mime,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    String? taskId,
  });
}

/// A storage refusal / a lost connection, in the app's error type (storage
/// answers in XML, never in our error envelope).
ApiException storageError(DioException e) => ApiException(
      code: e.response == null
          ? ApiException.networkErrorCode
          : ApiErrorCodes.fileNotUploaded,
      message: 'Upload to storage failed.',
      statusCode: e.response?.statusCode,
    );

/// The S3 POST over Dio, with retries: a lost connection, a timeout or a
/// busy storage (408 / 429 / 5xx) is tried again after 1 s, 2 s, 4 s …; a
/// refusal (a 4xx such as an expired policy) is not.
class DioStorageTransport implements StorageTransport {
  DioStorageTransport(
    this._storage, {
    this.attempts = 4,
    Duration Function(int failures)? backoff,
  }) : _backoff = backoff ?? defaultBackoff;

  final Dio _storage;
  final int attempts;
  final Duration Function(int failures) _backoff;

  /// 1 s, 2 s, 4 s … up to 30 s.
  static Duration defaultBackoff(int failures) {
    final s = 1 << (failures - 1).clamp(0, 5);
    return Duration(seconds: s > 30 ? 30 : s);
  }

  static bool _temporary(DioException e) {
    final c = e.response?.statusCode;
    return c == null || c == 408 || c == 429 || c >= 500;
  }

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
    for (var failures = 0;; failures++) {
      try {
        await _storage.post<void>(
          target.url,
          data: FormData.fromMap({
            ...target.fields,
            // S3 POST policy: the file must be the LAST field.
            'file': await body.multipart(filename: filename, mime: mime),
          }),
          cancelToken: cancel,
          onSendProgress: (sent, total) {
            if (total > 0) onProgress?.call(sent / total);
          },
        );
        return;
      } on DioException catch (e) {
        if (CancelToken.isCancel(e)) rethrow;
        if (!_temporary(e) || failures + 1 >= attempts) throw storageError(e);
        await Future<void>.delayed(_backoff(failures + 1));
        if (cancel?.isCancelled ?? false) rethrow;
      }
    }
  }
}

/// Owner 2026-10-22 (product audit #4 §3): the ONE way the app puts a file
/// into storage — `POST /files/presign` → S3 POST → `POST /files/:id/confirm`
/// → wait for a clean virus scan. Before, nine repositories each had their
/// own copy of these steps («Upload to storage failed»); now they call this.
class StorageUploader {
  StorageUploader({
    required Dio apiDio,
    required StorageTransport transport,
    this.scanPoll = const Duration(milliseconds: 700),
    this.scanMaxPolls = 40,
  })  : _files = api.FilesClient(apiDio),
        _transport = transport;

  /// The usual pair: the API's Dio and the plain storage Dio.
  factory StorageUploader.dio(
    Dio apiDio,
    Dio storageDio, {
    Duration scanPoll = const Duration(milliseconds: 700),
    int scanMaxPolls = 40,
  }) =>
      StorageUploader(
        apiDio: apiDio,
        transport: DioStorageTransport(storageDio),
        scanPoll: scanPoll,
        scanMaxPolls: scanMaxPolls,
      );

  final api.FilesClient _files;
  final StorageTransport _transport;
  final Duration scanPoll;
  final int scanMaxPolls;

  /// Step 1. Idempotent server-side: a retried presign returns the same link.
  Future<StorageTarget> presign({
    required api.FilePurpose purpose,
    required String mime,
    required int sizeBytes,
    required String sha256,
  }) async {
    final d = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: purpose,
          mime: mime,
          sizeBytes: sizeBytes,
          sha256: sha256,
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return StorageTarget(
      fileId: d.fileId,
      url: d.upload.url,
      fields: d.upload.fields,
    );
  }

  /// Step 2: the bytes to storage (with retries, see [DioStorageTransport]).
  Future<void> put(
    StorageTarget target,
    UploadBody body, {
    required String mime,
    String filename = 'file',
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    String? taskId,
    StorageTransport? transport,
  }) =>
      (transport ?? _transport).post(
        target,
        body,
        filename: filename,
        mime: mime,
        onProgress: onProgress,
        cancel: cancel,
        taskId: taskId,
      );

  /// Step 3: storage has it — the server starts the scan.
  Future<api.ScanStatus> confirm(String fileId) async =>
      (await guardApiCall(() => _files.confirm(id: fileId))).data.scanStatus;

  Future<api.ScanStatus> scanStatus(String fileId) async =>
      (await guardApiCall(() => _files.getFilesId(id: fileId))).data.scanStatus;

  /// Step 4: polls a pending scan; anything but clean is
  /// `FILE_NOT_ATTACHABLE`.
  Future<void> waitClean(
    String fileId, {
    required api.ScanStatus status,
    int? maxPolls,
  }) async {
    var s = status;
    for (var i = 0;
        s == api.ScanStatus.pending && i < (maxPolls ?? scanMaxPolls);
        i++) {
      await Future<void>.delayed(scanPoll);
      s = await scanStatus(fileId);
    }
    if (s != api.ScanStatus.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
  }

  /// All four steps; returns the clean file's id.
  Future<String> upload({
    required api.FilePurpose purpose,
    required UploadBody body,
    required String mime,
    String filename = 'file',
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    int? scanMaxPolls,
    StorageTransport? transport,
    String? taskId,
  }) async {
    final target = await presign(
      purpose: purpose,
      mime: mime,
      sizeBytes: await body.length(),
      sha256: await body.sha256Hex(),
    );
    await put(
      target,
      body,
      mime: mime,
      filename: filename,
      onProgress: onProgress,
      cancel: cancel,
      transport: transport,
      taskId: taskId,
    );
    await waitClean(
      target.fileId,
      status: await confirm(target.fileId),
      maxPolls: scanMaxPolls,
    );
    return target.fileId;
  }
}
