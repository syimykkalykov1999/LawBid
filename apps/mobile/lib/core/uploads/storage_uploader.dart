import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';
import 'package:lawbid/core/transfers/transfer_limits.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Where one file goes: the presigned upload of `POST /files/presign`.
///
/// Owner 2026-10-24 (public media on Cloudflare R2): private files and old
/// servers answer a presigned S3 POST (multipart [fields]); public media
/// stored in R2 answers a presigned PUT (the raw file as the body, with
/// exactly [headers]). The app handles both by what the API returns.
class StorageTarget {
  const StorageTarget({
    required this.fileId,
    required this.url,
    required this.fields,
    this.method = 'POST',
    this.headers = const {},
  });

  /// A target kept in a queue job; null when the shape is not one.
  static StorageTarget? fromJson(Object? json) {
    if (json is! Map) return null;
    final m = json.cast<String, Object?>();
    final fileId = m['fileId'];
    final url = m['url'];
    if (fileId is! String || url is! String) return null;
    return StorageTarget(
      fileId: fileId,
      url: url,
      fields: (m['fields'] as Map?)?.cast<String, String>() ?? const {},
      method: m['method'] as String? ?? 'POST',
      headers: (m['headers'] as Map?)?.cast<String, String>() ?? const {},
    );
  }

  Map<String, Object?> toJson() => {
    'fileId': fileId,
    'url': url,
    'fields': fields,
    'method': method,
    'headers': headers,
  };

  final String fileId;
  final String url;

  /// The policy fields; the file part always goes LAST (S3 POST policy).
  /// Empty for a PUT.
  final Map<String, String> fields;

  /// `POST` (multipart form) or `PUT` (raw body).
  final String method;

  /// Headers a PUT must send as given (Content-Type, Cache-Control).
  final Map<String, String> headers;

  bool get isPut => method.toUpperCase() == 'PUT';
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
    return ClientTuning.outboxBackoff(failures);
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
    for (var failures = 0; ; failures++) {
      try {
        if (target.isPut) {
          // R2: the raw bytes with the signed headers; a fresh stream per
          // attempt (a retried PUT cannot reuse a consumed one).
          await _storage.put<void>(
            target.url,
            data: body.open(),
            options: Options(
              headers: {
                ...target.headers,
                Headers.contentLengthHeader: await body.length(),
              },
            ),
            cancelToken: cancel,
            onSendProgress: (sent, total) {
              if (total > 0) onProgress?.call(sent / total);
            },
          );
          return;
        }
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

/// R-251: whether a queued file may go in parts right now, and the moment it
/// must stop (the app left the screen). See core/uploads/foreground_parts.dart.
abstract interface class PartsGate {
  /// Parts may start for the queue job [taskId].
  Future<bool> allows(String taskId);

  /// Completes when parts running now must stop.
  Future<void> get whenLeft;
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
    Dio? storageDio,
    Future<void> Function(String taskId)? forgetTransfer,
    Duration Function(int failures)? partBackoff,
    PartsGate? partsGate,
    AdaptiveLimiter? limiter,
  }) : _files = api.FilesClient(apiDio),
       _transport = transport,
       _forgetTransfer = forgetTransfer,
       _storageDio = storageDio,
       _partBackoff = partBackoff ?? DioStorageTransport.defaultBackoff,
       _partsGate = partsGate,
       _limiter = limiter ?? TransferLimits.uploads;

  /// The usual pair: the API's Dio and the plain storage Dio.
  factory StorageUploader.dio(
    Dio apiDio,
    Dio storageDio, {
    Duration scanPoll = const Duration(milliseconds: 700),
    int scanMaxPolls = 40,
  }) => StorageUploader(
    apiDio: apiDio,
    transport: DioStorageTransport(storageDio),
    scanPoll: scanPoll,
    scanMaxPolls: scanMaxPolls,
    storageDio: storageDio,
  );

  final api.FilesClient _files;
  final StorageTransport _transport;
  final Dio? _storageDio;
  final Future<void> Function(String taskId)? _forgetTransfer;
  final Duration Function(int failures) _partBackoff;
  final PartsGate? _partsGate;
  final AdaptiveLimiter _limiter;

  /// Files at least this big go in parts that can be continued after an
  /// interruption (server flag `files_multipart`; mirrors the server's
  /// MIN_MULTIPART_BYTES).
  static const resumableThresholdBytes = 16 * 1024 * 1024;

  /// R-251 / R-253: the most parts in flight at once, the default of AWS's
  /// own uploader (`queueSize` in @aws-sdk/lib-storage, Apache-2.0), which is
  /// the model of the loop in [putResumable]. The real number comes from
  /// [AdaptiveLimiter]: the admin's `client.uploads_at_once`, less on mobile
  /// data, a weak phone or after a failure. A file body streams each part
  /// from disk, so this does not grow the phone's memory.
  static const partsAtOnce = 4;
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
          // Owner 2026-10-24: this app can do a presigned PUT (R2).
          supportsPut: true,
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    )).data;
    return StorageTarget(
      fileId: d.fileId,
      url: d.upload.url,
      fields: d.upload.fields,
      method: d.upload.method?.name.toUpperCase() ?? 'POST',
      headers: d.upload.headers ?? const {},
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
  }) => (transport ?? _transport).post(
    target,
    body,
    filename: filename,
    mime: mime,
    onProgress: onProgress,
    cancel: cancel,
    taskId: taskId,
  );

  /// Resumable step 2 for a big file (checklist reconciliation 2026-11-01):
  /// the file goes to storage in parts, each to its own link. After a lost
  /// connection the plan is asked for again and only the parts storage does
  /// not have yet are sent, so a 300 MB video never restarts from byte 0.
  ///
  /// Returns false when the server does not offer it (flag off, file too
  /// small, no storage client): the caller then uses [put]. The caller still
  /// calls [confirm] afterwards, exactly as for a single-request upload.
  Future<bool> putResumable(
    String fileId,
    UploadBody body, {
    void Function(double progress)? onProgress,
    CancelToken? cancel,
  }) async {
    final storage = _storageDio;
    if (storage == null) return false;
    final total = await body.length();
    if (total < resumableThresholdBytes) return false;
    await TransferLimits.checkDevice();
    _limiter.restoreIfIdle();

    Future<api.MultipartPlanDto> plan() async =>
        (await guardApiCall(() => _files.multipartPlan(id: fileId))).data;

    api.MultipartPlanDto current;
    try {
      current = await plan();
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.featureDisabled ||
          e.code == ApiErrorCodes.validationError ||
          e.statusCode == 404) {
        return false;
      }
      rethrow;
    }

    // Three rounds: an expired part link is fixed by asking for a new plan.
    for (var round = 0; round < 3 && current.parts.isNotEmpty; round++) {
      await _putParts(
        storage,
        current,
        body,
        total,
        onProgress: onProgress,
        cancel: cancel,
      );
      current = await plan();
    }
    await guardApiCall(() => _files.multipartComplete(id: fileId));
    return true;
  }

  /// The parts of one plan, [partsAtOnce] at a time: workers pull the next
  /// part from one shared list, as `__doConcurrentUpload` does in
  /// @aws-sdk/lib-storage. The first failure stops the others, and is the
  /// error the caller sees.
  Future<void> _putParts(
    Dio storage,
    api.MultipartPlanDto plan,
    UploadBody body,
    int total, {
    void Function(double progress)? onProgress,
    CancelToken? cancel,
  }) async {
    final partSize = plan.partSizeBytes.toInt();
    final next = plan.parts.iterator;
    final inFlight = <int, int>{};
    var finished = plan.uploadedParts.length * partSize;
    void report() {
      final moving = inFlight.values.fold<int>(0, (a, b) => a + b);
      onProgress?.call(((finished + moving) / total).clamp(0, 1));
    }

    // One token for the workers: the caller's cancel stops them all, and so
    // does the first failure.
    final stop = CancelToken();
    unawaited(
      cancel?.whenCancel.then((_) {
        if (!stop.isCancelled) stop.cancel('cancelled');
      }),
    );

    Future<void> worker() async {
      while (!stop.isCancelled && next.moveNext()) {
        final number = next.current.partNumber.toInt();
        final start = (number - 1) * partSize;
        final end = (start + partSize).clamp(0, total);
        try {
          await _putPart(
            storage,
            next.current.url,
            body,
            start,
            end,
            cancel: stop,
            onBytes: (n) {
              inFlight[number] = n;
              report();
            },
          );
        } on Object {
          if (!stop.isCancelled) stop.cancel('another part failed');
          rethrow;
        }
        inFlight.remove(number);
        finished += end - start;
        report();
      }
    }

    await Future.wait([
      for (var i = 0; i < math.min(partsAtOnce, plan.parts.length); i++)
        worker(),
    ]);
    // The caller's cancel while the last part was finishing still counts.
    if (cancel?.isCancelled ?? false) {
      throw DioException.requestCancelled(
        requestOptions: RequestOptions(),
        reason: 'cancelled',
      );
    }
  }

  /// One part: the raw bytes to its link, retried on a lost connection or a
  /// busy storage (a 4xx such as an expired link is not retried).
  Future<void> _putPart(
    Dio storage,
    String url,
    UploadBody body,
    int start,
    int end, {
    CancelToken? cancel,
    void Function(int sent)? onBytes,
    int attempts = 4,
  }) async {
    for (var failures = 0; ; failures++) {
      try {
        await _limiter.run(
          () => storage.put<void>(
            url,
            data: body.openRange(start, end),
            options: Options(
              headers: {Headers.contentLengthHeader: end - start},
            ),
            cancelToken: cancel,
            onSendProgress: (sent, _) => onBytes?.call(sent),
          ),
        );
        return;
      } on DioException catch (e) {
        if (CancelToken.isCancel(e)) rethrow;
        final c = e.response?.statusCode;
        final temporary = c == null || c == 408 || c == 429 || c >= 500;
        if (!temporary || failures + 1 >= attempts) throw storageError(e);
        // A bad network: fewer parts at once, for this file and the others.
        final wait = ClientTuning.partRetryWait(
          c,
          e.response?.headers['retry-after'],
          _partBackoff(failures + 1),
        );
        _limiter.rateLimit(wait);
        await Future<void>.delayed(wait);
        if (cancel?.isCancelled ?? false) rethrow;
      }
    }
  }

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
    for (
      var i = 0;
      s == api.ScanStatus.pending && i < (maxPolls ?? scanMaxPolls);
      i++
    ) {
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
    StorageTarget? savedTarget,
    Future<void> Function(StorageTarget target)? onTarget,
    String? resumeFileId,
    void Function(String fileId)? onPartsFileId,
  }) async {
    if (transport == null &&
        taskId != null &&
        savedTarget == null &&
        _partsGate != null) {
      final done = await _partsWhileOpen(
        _partsGate,
        purpose: purpose,
        body: body,
        mime: mime,
        taskId: taskId,
        resumeFileId: resumeFileId,
        onFileId: onPartsFileId,
        onProgress: onProgress,
        cancel: cancel,
        scanMaxPolls: scanMaxPolls,
      );
      if (done != null) return done;
    }
    // The OS transfer of a queue job outlives the app, and the file it sends
    // has the id of ITS presign. So the target is saved in the job before the
    // transfer starts and used again after a restart; a new presign here
    // would confirm a file nobody uploaded, and the job would be refused for
    // good. If storage still has nothing for that target (it expired, or the
    // record is of an older try), one fresh start, with the old record gone
    // (a finished record makes the transport send nothing).
    var saved = savedTarget;
    for (var attempt = 0; ; attempt++) {
      final target =
          saved ??
          await presign(
            purpose: purpose,
            mime: mime,
            sizeBytes: await body.length(),
            sha256: await body.sha256Hex(),
          );
      if (saved == null) await onTarget?.call(target);
      try {
        return await _sendAndConfirm(
          target,
          body,
          mime: mime,
          filename: filename,
          onProgress: onProgress,
          cancel: cancel,
          scanMaxPolls: scanMaxPolls,
          transport: transport,
          taskId: taskId,
        );
      } on ApiException catch (e) {
        final forget = _forgetTransfer;
        final nothingThere =
            e.code == ApiErrorCodes.fileNotUploaded ||
            e.code == ApiErrorCodes.notFound;
        if (!nothingThere || attempt > 0 || taskId == null || forget == null) {
          rethrow;
        }
        await forget(taskId);
        saved = null;
      }
    }
  }

  Future<String> _sendAndConfirm(
    StorageTarget target,
    UploadBody body, {
    required String mime,
    required String filename,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    int? scanMaxPolls,
    StorageTransport? transport,
    String? taskId,
  }) async {
    // A big file goes in resumable parts when the server offers it (and the
    // caller did not pick its own transport, e.g. the background queue).
    final resumed =
        transport == null &&
        _partsGate == null &&
        await putResumable(
          target.fileId,
          body,
          onProgress: onProgress,
          cancel: cancel,
        );
    if (!resumed) {
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
    }
    await waitClean(
      target.fileId,
      status: await confirm(target.fileId),
      maxPolls: scanMaxPolls,
    );
    return target.fileId;
  }

  /// R-251: a queued big file in parallel parts while the app is on screen.
  /// Returns the clean file's id, or null when the file goes the usual way:
  /// parts not allowed or not offered, or the app left the screen mid-way
  /// (then the whole file goes to the OS transfer, which a closed app does
  /// not stop). A new link is taken for that, the first may have expired.
  ///
  /// The parts' file id is saved by the caller, so a retry or a restart sends
  /// only what storage does not have yet.
  Future<String?> _partsWhileOpen(
    PartsGate gate, {
    required api.FilePurpose purpose,
    required UploadBody body,
    required String mime,
    required String taskId,
    String? resumeFileId,
    void Function(String fileId)? onFileId,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    int? scanMaxPolls,
  }) async {
    if (await body.length() < resumableThresholdBytes) return null;
    if (!await gate.allows(taskId)) return null;

    final stop = CancelToken();
    void halt(String why) {
      if (!stop.isCancelled) stop.cancel(why);
    }

    var left = false;
    unawaited(
      gate.whenLeft.then((_) {
        left = true;
        halt('left the screen');
      }),
    );
    unawaited(cancel?.whenCancel.then((_) => halt('cancelled')));

    var fileId = resumeFileId;
    try {
      var offered = false;
      if (fileId != null) {
        try {
          offered = await putResumable(
            fileId,
            body,
            onProgress: onProgress,
            cancel: stop,
          );
        } on ApiException catch (e) {
          // The server answered: that upload is over (assembled before a lost
          // reply, or expired). A lost connection is tried again later.
          if (e.isNetworkError || e.statusCode == null) rethrow;
          fileId = null;
        }
      }
      if (fileId == null) {
        final target = await presign(
          purpose: purpose,
          mime: mime,
          sizeBytes: await body.length(),
          sha256: await body.sha256Hex(),
        );
        fileId = target.fileId;
        onFileId?.call(target.fileId);
        offered = await putResumable(
          target.fileId,
          body,
          onProgress: onProgress,
          cancel: stop,
        );
      }
      if (!offered) return null;
    } on DioException catch (e) {
      if (left && CancelToken.isCancel(e)) return null;
      rethrow;
    }
    await waitClean(
      fileId,
      status: await confirm(fileId),
      maxPolls: scanMaxPolls,
    );
    return fileId;
  }
}
